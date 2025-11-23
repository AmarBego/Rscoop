use super::bucket_parser::{self, BucketFilterOptions};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchableBucket {
    pub name: String,
    pub full_name: String, // owner/repo format
    pub description: String,
    pub url: String,
    pub stars: u32,
    pub forks: u32,
    pub apps: u32,
    pub last_updated: String,
    pub is_verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BucketSearchRequest {
    pub query: Option<String>,
    pub include_expanded: bool,
    pub max_results: Option<usize>,
    pub sort_by: Option<String>, // "stars", "apps", "name", "relevance"
    pub disable_chinese_buckets: Option<bool>,
    pub minimum_stars: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BucketSearchResponse {
    pub buckets: Vec<SearchableBucket>,
    pub total_count: usize,
    pub is_expanded_search: bool,
    pub expanded_list_size_mb: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExpandedSearchInfo {
    pub estimated_size_mb: f64,
    pub total_buckets: usize,
    pub description: String,
}

// Default verified buckets - these show automatically
static VERIFIED_BUCKETS_DATA: &[(&str, &str, &str, &str, u32, u32, u32, &str)] = &[
    (
        "main",
        "ScoopInstaller/Main",
        "📦 The default bucket for Scoop. (scoop's built-in bucket 'main')",
        "https://github.com/ScoopInstaller/Main",
        1733,
        1069,
        1402,
        "2025-09-16",
    ),
    (
        "extras",
        "ScoopInstaller/Extras",
        "📦 The Extras bucket for Scoop. (scoop's built-in bucket 'extras')",
        "https://github.com/ScoopInstaller/Extras",
        1958,
        1511,
        2183,
        "2025-09-16",
    ),
    (
        "games",
        "Calinou/scoop-games",
        "Scoop bucket for open source/freeware games and game-related tools (scoop's built-in bucket 'games')",
        "https://github.com/Calinou/scoop-games",
        321,
        172,
        360,
        "2025-09-16",
    ),
    (
        "nerd-fonts",
        "matthewjberger/scoop-nerd-fonts",
        "A scoop bucket for installing nerd fonts (scoop's built-in bucket 'nerd-fonts')",
        "https://github.com/matthewjberger/scoop-nerd-fonts",
        418,
        45,
        367,
        "2025-09-13",
    ),
    (
        "sysinternals",
        "niheaven/scoop-sysinternals",
        "A Scoop bucket for Windows Sysinternals utilities",
        "https://github.com/niheaven/scoop-sysinternals",
        80,
        15,
        70,
        "2025-09-10",
    ),
    (
        "java",
        "ScoopInstaller/Java",
        "📦 A bucket for Scoop, for Oracle Java, OpenJDK, Eclipse Temurin, IBM Semeru, Zulu, ojdkbuild, Amazon Corretto, BellSoft Liberica, SapMachine and Microsoft JDK. (scoop's built-in bucket 'java')",
        "https://github.com/ScoopInstaller/Java",
        288,
        100,
        299,
        "2025-09-16",
    ),
    (
        "nirsoft",
        "ScoopInstaller/Nirsoft",
        "A Scoop bucket of useful NirSoft utilities (scoop's built-in bucket 'nirsoft')",
        "https://github.com/ScoopInstaller/Nirsoft",
        143,
        43,
        276,
        "2025-09-15",
    ),
    (
        "nonportable",
        "ScoopInstaller/Nonportable",
        "A bucket for Scoop containing non-portable applications",
        "https://github.com/ScoopInstaller/Nonportable",
        120,
        80,
        200,
        "2025-09-15",
    ),
    (
        "php",
        "ScoopInstaller/PHP",
        "A bucket for PHP versions for Scoop",
        "https://github.com/ScoopInstaller/PHP",
        85,
        30,
        25,
        "2025-09-12",
    ),
    (
        "versions",
        "ScoopInstaller/Versions",
        "📦 A Scoop bucket for alternative versions of apps. (scoop's built-in bucket 'versions')",
        "https://github.com/ScoopInstaller/Versions",
        240,
        234,
        510,
        "2025-09-16",
    ),
];

fn get_verified_buckets() -> Vec<SearchableBucket> {
    VERIFIED_BUCKETS_DATA
        .iter()
        .map(
            |&(name, full_name, description, url, stars, forks, apps, last_updated)| {
                SearchableBucket {
                    name: name.to_string(),
                    full_name: full_name.to_string(),
                    description: description.to_string(),
                    url: url.to_string(),
                    stars,
                    forks,
                    apps,
                    last_updated: last_updated.to_string(),
                    is_verified: true,
                }
            },
        )
        .collect()
}

// Parse the massive bucket list from GitHub using efficient parser
async fn fetch_expanded_bucket_list(
    filters: Option<BucketFilterOptions>,
) -> Result<Vec<SearchableBucket>, String> {
    log::info!("Fetching expanded bucket list using efficient parser...");

    let bucket_map = bucket_parser::get_cached_buckets(filters).await?;
    let buckets: Vec<SearchableBucket> = bucket_map.into_values().collect();

    log::info!("Retrieved {} buckets from cache/parser", buckets.len());
    Ok(buckets)
}

fn filter_buckets(buckets: &[SearchableBucket], query: &str) -> Vec<SearchableBucket> {
    if query.is_empty() {
        return buckets.to_vec();
    }

    let query_lower = query.to_lowercase();
    let mut scored_buckets: Vec<(SearchableBucket, f64)> = buckets
        .iter()
        .filter_map(|bucket| {
            let score = calculate_bucket_score(bucket, &query_lower);
            if score > 0.0 {
                Some((bucket.clone(), score))
            } else {
                None
            }
        })
        .collect();

    scored_buckets.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    scored_buckets
        .into_iter()
        .map(|(bucket, _)| bucket)
        .collect()
}

fn sort_buckets(buckets: &mut [SearchableBucket], sort_by: &str) {
    match sort_by {
        "stars" => buckets.sort_by(|a, b| b.stars.cmp(&a.stars)),
        "apps" => buckets.sort_by(|a, b| b.apps.cmp(&a.apps)),
        "name" => buckets.sort_by(|a, b| a.name.cmp(&b.name)),
        "forks" => buckets.sort_by(|a, b| b.forks.cmp(&a.forks)),
        _ => {} // "relevance" or default - already sorted by relevance in filter_buckets
    }
}

#[tauri::command]
pub async fn search_buckets(
    request: BucketSearchRequest,
    _state: State<'_, AppState>,
) -> Result<BucketSearchResponse, String> {
    let mut buckets = if request.include_expanded {
        log::info!("Performing expanded search including all community buckets");

        // Create filter options from request
        let filters = if request.disable_chinese_buckets.unwrap_or(false)
            || request.minimum_stars.unwrap_or(0) > 0
        {
            Some(BucketFilterOptions {
                disable_chinese_buckets: request.disable_chinese_buckets.unwrap_or(false),
                minimum_stars: request.minimum_stars.unwrap_or(2),
            })
        } else {
            None
        };

        if let Some(ref filter_opts) = filters {
            log::info!(
                "Applying filters - Chinese buckets disabled: {}, Minimum stars: {}",
                filter_opts.disable_chinese_buckets,
                filter_opts.minimum_stars
            );
        }

        // Get verified buckets
        let verified_buckets = get_verified_buckets();
        let verified_names: std::collections::HashSet<String> =
            verified_buckets.iter().map(|b| b.name.clone()).collect();

        // Get expanded buckets from cache/parser with filters
        let mut expanded_buckets = fetch_expanded_bucket_list(filters).await?;

        // Mark verified buckets in the expanded list
        for bucket in &mut expanded_buckets {
            if verified_names.contains(&bucket.name) {
                bucket.is_verified = true;
            }
        }

        // Combine: prioritize verified buckets, then add non-verified ones
        let mut all_buckets = verified_buckets;
        for bucket in expanded_buckets {
            if !verified_names.contains(&bucket.name) {
                all_buckets.push(bucket);
            }
        }

        all_buckets
    } else {
        log::info!("Performing default search with verified buckets only");
        // Only return verified buckets for default search
        get_verified_buckets()
    };

    // Apply search filter if query is provided
    if let Some(ref query) = request.query {
        log::debug!("Filtering buckets with query: '{}'", query);
        buckets = filter_buckets(&buckets, query);
    }

    // Apply sorting
    if let Some(ref sort_by) = request.sort_by {
        log::debug!("Sorting buckets by: {}", sort_by);
        sort_buckets(&mut buckets, sort_by);
    } else if request.query.is_none() {
        // Default sort by stars when no query
        sort_buckets(&mut buckets, "stars");
    }

    // Apply result limit
    let total_count = buckets.len();
    if let Some(max_results) = request.max_results {
        buckets.truncate(max_results);
        log::debug!("Limited results to {} buckets", max_results);
    }

    // Calculate expanded list size (rough estimate)
    let expanded_size_mb = if request.include_expanded {
        Some(14.0) // Approximate size as mentioned in the request
    } else {
        None
    };

    log::info!(
        "Returning {} buckets (total found: {})",
        buckets.len(),
        total_count
    );

    Ok(BucketSearchResponse {
        buckets,
        total_count,
        is_expanded_search: request.include_expanded,
        expanded_list_size_mb: expanded_size_mb,
    })
}

#[tauri::command]
pub async fn get_expanded_search_info() -> Result<ExpandedSearchInfo, String> {
    Ok(ExpandedSearchInfo {
        estimated_size_mb: 14.0,
        total_buckets: 54000, // Rough estimate
        description: "This will download and search through the complete Scoop bucket directory maintained by the community. This includes thousands of buckets with various quality levels.".to_string(),
    })
}

#[tauri::command]
pub async fn get_default_buckets() -> Result<Vec<SearchableBucket>, String> {
    let mut buckets = get_verified_buckets();
    sort_buckets(&mut buckets, "stars"); // Sort by stars by default
    Ok(buckets)
}

#[tauri::command]
pub async fn clear_bucket_cache() -> Result<(), String> {
    log::info!("Clearing bucket cache as requested");
    bucket_parser::clear_cache().await;
    Ok(())
}

#[tauri::command]
pub async fn check_bucket_cache_exists() -> Result<bool, String> {
    match bucket_parser::cache_exists().await {
        Ok(exists) => {
            log::debug!("Bucket cache exists: {}", exists);
            Ok(exists)
        }
        Err(e) => {
            log::warn!("Failed to check cache status: {}", e);
            Ok(false) // Default to false if we can't check
        }
    }
}

fn calculate_bucket_score(bucket: &SearchableBucket, query_lower: &str) -> f64 {
    let mut score = 0.0;

    // Primary search: Bucket name (heavily weighted)
    if bucket.name.to_lowercase() == query_lower {
        score += 1000.0; // Exact bucket name match gets highest priority
    } else if bucket.name.to_lowercase().starts_with(query_lower) {
        score += 500.0; // Name starts with query gets very high priority
    } else if bucket.name.to_lowercase().contains(query_lower) {
        score += 250.0; // Name contains query gets high priority
    }

    // Secondary search: Repository name without "scoop-" prefix (medium weight)
    if score == 0.0 {
        let repo_name = bucket
            .full_name
            .split('/')
            .nth(1)
            .unwrap_or("")
            .to_lowercase();
        let clean_repo_name = repo_name.replace("scoop-", "").replace("scoop_", "");

        if clean_repo_name == query_lower {
            score += 100.0;
        } else if clean_repo_name.starts_with(query_lower) {
            score += 50.0;
        } else if clean_repo_name.contains(query_lower) {
            score += 25.0;
        }
    }

    // Tertiary search: Full repository name (lower weight, only if no name matches)
    if score == 0.0 && bucket.full_name.to_lowercase().contains(query_lower) {
        score += 10.0;
    }

    // Last resort: Description search (very low weight)
    if score == 0.0 && bucket.description.to_lowercase().contains(query_lower) {
        score += 1.0;
    }

    // Apply bonuses only if there's already a match
    if score > 0.0 {
        // Bonus for verified buckets
        if bucket.is_verified {
            score += 50.0;
        }

        // Small bonus based on popularity (much smaller impact)
        score += (bucket.stars as f64 * 0.001) + (bucket.apps as f64 * 0.002);
    }

    score
}
