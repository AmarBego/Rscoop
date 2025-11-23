use csv::{ReaderBuilder, WriterBuilder};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;

use super::bucket_search::SearchableBucket;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketFilterOptions {
    pub disable_chinese_buckets: bool,
    pub minimum_stars: u32,
}

impl Default for BucketFilterOptions {
    fn default() -> Self {
        Self {
            disable_chinese_buckets: false,
            minimum_stars: 2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BucketCsvRecord {
    pub name: String,
    pub full_name: String,
    pub description: String,
    pub url: String,
    pub apps: u32,
    pub stars: u32,
    pub forks: u32,
    pub last_updated: String,
}

// Global HashMap to cache parsed buckets
static BUCKET_CACHE: Lazy<tokio::sync::RwLock<HashMap<String, SearchableBucket>>> =
    Lazy::new(|| tokio::sync::RwLock::new(HashMap::new()));

// Get the cache file path in the app data directory
fn get_cache_file_path() -> Result<PathBuf, String> {
    let app_data_dir = dirs::data_dir()
        .ok_or("Failed to get app data directory")?
        .join("rscoop")
        .join("cache");

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;

    Ok(app_data_dir.join("bucket_cache.csv"))
}

// Save bucket cache to disk
async fn save_cache_to_disk(buckets: &HashMap<String, SearchableBucket>) -> Result<(), String> {
    let cache_file = get_cache_file_path()?;

    log::info!(
        "Saving {} buckets to cache file: {:?}",
        buckets.len(),
        cache_file
    );

    // Convert HashMap to Vec for CSV serialization
    let bucket_list: Vec<&SearchableBucket> = buckets.values().collect();

    // Create CSV writer
    let mut csv_data = Vec::new();
    {
        let mut writer = WriterBuilder::new()
            .has_headers(true)
            .from_writer(&mut csv_data);

        for bucket in &bucket_list {
            writer
                .serialize(bucket)
                .map_err(|e| format!("Failed to serialize bucket to CSV: {}", e))?;
        }

        writer
            .flush()
            .map_err(|e| format!("Failed to flush CSV writer: {}", e))?;
    }

    let mut file = fs::File::create(&cache_file)
        .await
        .map_err(|e| format!("Failed to create cache file: {}", e))?;

    file.write_all(&csv_data)
        .await
        .map_err(|e| format!("Failed to write cache file: {}", e))?;

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush cache file: {}", e))?;

    // Calculate and log file size
    let metadata = fs::metadata(&cache_file)
        .await
        .map_err(|e| format!("Failed to get cache file metadata: {}", e))?;

    let size_mb = metadata.len() as f64 / (1024.0 * 1024.0);
    log::info!("Cache saved successfully: {:.2} MB", size_mb);

    Ok(())
}

// Load bucket cache from disk
async fn load_cache_from_disk() -> Result<HashMap<String, SearchableBucket>, String> {
    let cache_file = get_cache_file_path()?;

    if !cache_file.exists() {
        log::info!("No cache file found at: {:?}", cache_file);
        return Ok(HashMap::new());
    }

    log::info!("Loading cache from: {:?}", cache_file);

    let csv_data = fs::read_to_string(&cache_file)
        .await
        .map_err(|e| format!("Failed to read cache file: {}", e))?;

    // Parse CSV data
    let mut reader = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(csv_data.as_bytes());

    let mut buckets = HashMap::new();
    for result in reader.deserialize() {
        let bucket: SearchableBucket =
            result.map_err(|e| format!("Failed to deserialize bucket from CSV: {}", e))?;
        buckets.insert(bucket.full_name.clone(), bucket);
    }

    log::info!("Loaded {} buckets from cache", buckets.len());

    Ok(buckets)
}

// Convert markdown table to CSV format with file cleanup
pub async fn fetch_and_parse_bucket_directory(
    filters: Option<BucketFilterOptions>,
) -> Result<HashMap<String, SearchableBucket>, String> {
    let filters = filters.unwrap_or_default();
    let url = "https://github.com/rasa/scoop-directory/raw/refs/heads/master/by-stars.md";

    log::info!("Fetching bucket directory from: {}", url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch bucket directory: {}", e))?;

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let original_size_mb = content.len() as f64 / (1024.0 * 1024.0);
    log::info!(
        "Downloaded {:.2} MB, parsing markdown table...",
        original_size_mb
    );

    let buckets = parse_markdown_to_buckets(&content)?;

    log::info!("Parsed {} buckets from directory", buckets.len());

    // Convert to HashMap keyed by full_name (owner/repo) to avoid deduplication of bucket names
    let mut bucket_map = HashMap::new();
    let mut filtered_count = 0;
    let original_count = buckets.len();

    for bucket in buckets {
        if apply_bucket_filters(&bucket, &filters) {
            bucket_map.insert(bucket.full_name.clone(), bucket);
        } else {
            filtered_count += 1;
        }
    }

    log::info!(
        "Applied filters: {} buckets filtered out, {} remaining (original: {})",
        filtered_count,
        bucket_map.len(),
        original_count
    );
    if filters.disable_chinese_buckets {
        log::info!("Chinese bucket filtering was enabled");
    }
    if filters.minimum_stars > 0 {
        log::info!("Minimum star filter: {} stars", filters.minimum_stars);
    }

    // Save optimized cache to disk
    save_cache_to_disk(&bucket_map).await?;

    // The original markdown content is now dropped and will be garbage collected
    log::info!(
        "Original {:.2} MB markdown file processed and cleaned up from memory",
        original_size_mb
    );

    Ok(bucket_map)
}

static COMPLEX_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"\|\s*<a[^>]*>.*?</a>\[\d+\.\]\([^)]*\)\|\s*\[__([^/]+)/([^_]+)__\]\(([^)]+)\):\s*\*([^*]*)\*\|\s*\[(\d+)\]\([^)]*\)\|\s*\[(\d+)\]\([^)]*\)\|\s*\[(\d+)\]\([^)]*\)\|\s*\[([^\]]*)\]\([^)]*"#
    ).expect("Failed to compile complex regex")
});

static SIMPLE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"\|\s*\[([^\]]+)\]\(([^)]*)\)\s*\|\s*\[([^\]]*)\]\([^)]*(?:bucket/)?([^./\s)]+)(?:\.json)?[^)]*\)\s*\|\s*([^|]*?)\s*\|\s*(?:\[([^\]]*)\]\([^)]*\)|([^|]*?))\s*\|"#
    ).expect("Failed to compile simple regex")
});

static BASIC_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"\|\s*\[([^\]]+)\]\(([^)]*)\)\s*\|\s*(?:\[([^\]]*)\]\([^)]*\)|([^|]*?))\s*\|\s*([^|]*?)\s*\|\s*(?:\[([^\]]*)\]\([^)]*\)|([^|]*?))\s*\|"#
    ).expect("Failed to compile basic regex")
});

fn try_parse_complex(line: &str) -> Option<SearchableBucket> {
    let captures = COMPLEX_REGEX.captures(line)?;
    let owner = captures.get(1).map_or("", |m| m.as_str()).trim();
    let repo = captures.get(2).map_or("", |m| m.as_str()).trim();
    let url = captures.get(3).map_or("", |m| m.as_str()).trim();
    let description = captures.get(4).map_or("", |m| m.as_str()).trim();
    let apps = captures
        .get(5)
        .map_or("0", |m| m.as_str())
        .parse::<u32>()
        .unwrap_or(0);
    let stars = captures
        .get(6)
        .map_or("0", |m| m.as_str())
        .parse::<u32>()
        .unwrap_or(0);
    let forks = captures
        .get(7)
        .map_or("0", |m| m.as_str())
        .parse::<u32>()
        .unwrap_or(0);
    let date_str = captures.get(8).map_or("Unknown", |m| m.as_str()).trim();

    if !owner.is_empty() && !repo.is_empty() {
        let bucket_name = extract_bucket_name(repo);
        let last_updated = parse_encoded_date(date_str);

        Some(SearchableBucket {
            name: bucket_name,
            full_name: format!("{}/{}", owner, repo),
            description: description.to_string(),
            url: url.to_string(),
            stars,
            forks,
            apps,
            last_updated,
            is_verified: false,
        })
    } else {
        None
    }
}

fn try_parse_simple(line: &str) -> Option<SearchableBucket> {
    let captures = SIMPLE_REGEX.captures(line)?;
    let package_name = captures.get(1).map_or("", |m| m.as_str()).trim();
    let package_url = captures.get(2).map_or("", |m| m.as_str()).trim();
    let bucket_name = captures.get(4).map_or("", |m| m.as_str()).trim();
    let description = captures.get(5).map_or("", |m| m.as_str()).trim();

    if !bucket_name.is_empty() && !package_name.is_empty() {
        let (owner, repo_name, repo_url) = if package_url.contains("github.com") {
            let parts: Vec<&str> = package_url.split('/').collect();
            if parts.len() >= 5 {
                (
                    parts[3].to_string(),
                    parts[4].to_string(),
                    package_url.to_string(),
                )
            } else {
                (
                    "unknown".to_string(),
                    bucket_name.to_string(),
                    package_url.to_string(),
                )
            }
        } else {
            (
                "unknown".to_string(),
                bucket_name.to_string(),
                package_url.to_string(),
            )
        };

        let clean_bucket_name = extract_bucket_name(&bucket_name);

        Some(SearchableBucket {
            name: clean_bucket_name,
            full_name: format!("{}/{}", owner, repo_name),
            description: description.to_string(),
            url: repo_url,
            stars: 0,
            forks: 0,
            apps: 1,
            last_updated: "Unknown".to_string(),
            is_verified: false,
        })
    } else {
        None
    }
}

fn try_parse_basic(line: &str) -> Option<SearchableBucket> {
    let captures = BASIC_REGEX.captures(line)?;
    let package_name = captures.get(1).map_or("", |m| m.as_str()).trim();
    let package_url = captures.get(2).map_or("", |m| m.as_str()).trim();
    let description = captures.get(5).map_or("", |m| m.as_str()).trim();

    if !package_name.is_empty() {
        let (owner, repo_name, repo_url) = if package_url.contains("github.com") {
            let parts: Vec<&str> = package_url.split('/').collect();
            if parts.len() >= 5 {
                (
                    parts[3].to_string(),
                    parts[4].to_string(),
                    package_url.to_string(),
                )
            } else {
                (
                    "unknown".to_string(),
                    package_name.to_string(),
                    package_url.to_string(),
                )
            }
        } else {
            (
                "unknown".to_string(),
                package_name.to_string(),
                package_url.to_string(),
            )
        };

        let clean_bucket_name = extract_bucket_name(&repo_name);

        Some(SearchableBucket {
            name: clean_bucket_name,
            full_name: format!("{}/{}", owner, repo_name),
            description: description.to_string(),
            url: repo_url,
            stars: 0,
            forks: 0,
            apps: 1,
            last_updated: "Unknown".to_string(),
            is_verified: false,
        })
    } else {
        None
    }
}

fn parse_markdown_to_buckets(content: &str) -> Result<Vec<SearchableBucket>, String> {
    let mut buckets = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        if let Some(bucket) = try_parse_complex(line) {
            buckets.push(bucket);
            continue;
        }

        if let Some(bucket) = try_parse_simple(line) {
            buckets.push(bucket);
            continue;
        }

        if let Some(bucket) = try_parse_basic(line) {
            buckets.push(bucket);
            continue;
        }

        // Log lines that don't match any format for debugging
        if line.contains("[") && line.contains("]") && line.contains("|") {
            log::debug!("Line {} didn't match any regex: {}", line_num, line.trim());
        }
    }

    Ok(buckets)
}

fn extract_bucket_name(repo: &str) -> String {
    // Remove common prefixes and convert to lowercase
    repo.replace("scoop-", "")
        .replace("Scoop-", "")
        .replace("scoop_", "")
        .to_lowercase()
}

// Check if text contains Chinese characters
fn contains_chinese_characters(text: &str) -> bool {
    text.chars().any(|c| {
        // Check for CJK Unified Ideographs (common Chinese characters)
        matches!(c,
            '\u{4E00}'..='\u{9FFF}' |  // CJK Unified Ideographs
            '\u{3400}'..='\u{4DBF}' |  // CJK Extension A
            '\u{20000}'..='\u{2A6DF}' | // CJK Extension B
            '\u{2A700}'..='\u{2B73F}' | // CJK Extension C
            '\u{2B740}'..='\u{2B81F}' | // CJK Extension D
            '\u{2B820}'..='\u{2CEAF}' | // CJK Extension E
            '\u{F900}'..='\u{FAFF}' |  // CJK Compatibility Ideographs
            '\u{2F800}'..='\u{2FA1F}'  // CJK Compatibility Supplement
        )
    })
}

// Apply filters to a bucket
fn apply_bucket_filters(bucket: &SearchableBucket, filters: &BucketFilterOptions) -> bool {
    // Filter by minimum stars
    if bucket.stars < filters.minimum_stars {
        return false;
    }

    // Filter Chinese buckets if requested
    if filters.disable_chinese_buckets {
        if contains_chinese_characters(&bucket.name)
            || contains_chinese_characters(&bucket.description)
            || contains_chinese_characters(&bucket.full_name)
        {
            return false;
        }
    }

    true
}

fn parse_encoded_date(date_str: &str) -> String {
    // Handle HTML encoded dates like: 25&#x2011;09&#x2011;16 (YY-MM-DD format)
    let cleaned = date_str
        .replace("&#x2011;", "-")
        .replace("&#x2013;", "-")
        .replace("&#x2014;", "-");

    // Handle the main format: YY-MM-DD (like "25-09-16" = 2025-09-16)
    if let Some(captures) = regex::Regex::new(r"^(\d{2})-(\d{1,2})-(\d{1,2})$")
        .unwrap()
        .captures(&cleaned)
    {
        let year_2digit: u32 = captures[1].parse().unwrap_or(0);
        let month: u32 = captures[2].parse().unwrap_or(1);
        let day: u32 = captures[3].parse().unwrap_or(1);

        // Convert 2-digit year to 4-digit (assume all are 20XX)
        let year = 2000 + year_2digit;

        if let Some(date) = chrono::NaiveDate::from_ymd_opt(year as i32, month, day) {
            return date.format("%Y-%m-%d").to_string();
        }
    }

    // Fallback for any other format or invalid dates
    "Unknown".to_string()
}

// Get cached buckets or fetch if not cached
pub async fn get_cached_buckets(
    filters: Option<BucketFilterOptions>,
) -> Result<HashMap<String, SearchableBucket>, String> {
    // First check memory cache
    {
        let cache = BUCKET_CACHE.read().await;
        if !cache.is_empty() {
            log::debug!("Returning {} cached buckets from memory", cache.len());
            return Ok(cache.clone());
        }
    }

    // Try to load from disk cache
    match load_cache_from_disk().await {
        Ok(disk_cache) if !disk_cache.is_empty() => {
            log::info!("Loaded {} buckets from disk cache", disk_cache.len());

            // If filters are provided, apply them to cached data
            let filtered_cache = if let Some(ref filter_opts) = filters {
                if filter_opts.disable_chinese_buckets || filter_opts.minimum_stars > 0 {
                    log::info!("Applying filters to cached data");
                    let mut filtered = HashMap::new();
                    let mut filtered_count = 0;
                    let original_count = disk_cache.len();

                    for (key, bucket) in disk_cache {
                        if apply_bucket_filters(&bucket, filter_opts) {
                            filtered.insert(key, bucket);
                        } else {
                            filtered_count += 1;
                        }
                    }

                    log::info!(
                        "Filtered cache: {} buckets filtered out, {} remaining (original: {})",
                        filtered_count,
                        filtered.len(),
                        original_count
                    );
                    filtered
                } else {
                    disk_cache
                }
            } else {
                disk_cache
            };

            // Update memory cache
            {
                let mut cache = BUCKET_CACHE.write().await;
                *cache = filtered_cache.clone();
            }

            return Ok(filtered_cache);
        }
        Ok(_) => log::info!("Disk cache is empty or doesn't exist"),
        Err(e) => log::warn!("Failed to load disk cache: {}", e),
    }

    log::info!("No cache found, fetching bucket directory...");
    let buckets = fetch_and_parse_bucket_directory(filters).await?;

    // Update memory cache
    {
        let mut cache = BUCKET_CACHE.write().await;
        *cache = buckets.clone();
    }

    Ok(buckets)
}

// Check if cache file exists
pub async fn cache_exists() -> Result<bool, String> {
    let cache_file = get_cache_file_path()?;
    Ok(cache_file.exists())
}

// Clear cache (useful for testing or forced refresh)
pub async fn clear_cache() {
    // Clear memory cache
    let mut cache = BUCKET_CACHE.write().await;
    cache.clear();

    // Clear disk cache
    if let Ok(cache_file) = get_cache_file_path() {
        if cache_file.exists() {
            if let Err(e) = fs::remove_file(&cache_file).await {
                log::warn!("Failed to remove cache file: {}", e);
            } else {
                log::info!("Disk cache file removed: {:?}", cache_file);
            }
        }
    }

    log::info!("Bucket cache cleared (memory and disk)");
}
