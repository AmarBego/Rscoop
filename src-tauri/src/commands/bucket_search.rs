use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use super::bucket_parser::{self, BucketFilterOptions};

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
fn get_verified_buckets() -> Vec<SearchableBucket> {
    vec![
        SearchableBucket {
            name: "main".to_string(),
            full_name: "ScoopInstaller/Main".to_string(),
            description: "📦 The default bucket for Scoop. (scoop's built-in bucket 'main')".to_string(),
            url: "https://github.com/ScoopInstaller/Main".to_string(),
            stars: 1733,
            forks: 1069,
            apps: 1402,
            last_updated: "2025-09-16".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "extras".to_string(),
            full_name: "ScoopInstaller/Extras".to_string(),
            description: "📦 The Extras bucket for Scoop. (scoop's built-in bucket 'extras')".to_string(),
            url: "https://github.com/ScoopInstaller/Extras".to_string(),
            stars: 1958,
            forks: 1511,
            apps: 2183,
            last_updated: "2025-09-16".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "games".to_string(),
            full_name: "Calinou/scoop-games".to_string(),
            description: "Scoop bucket for open source/freeware games and game-related tools (scoop's built-in bucket 'games')".to_string(),
            url: "https://github.com/Calinou/scoop-games".to_string(),
            stars: 321,
            forks: 172,
            apps: 360,
            last_updated: "2025-09-16".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "nerd-fonts".to_string(),
            full_name: "matthewjberger/scoop-nerd-fonts".to_string(),
            description: "A scoop bucket for installing nerd fonts (scoop's built-in bucket 'nerd-fonts')".to_string(),
            url: "https://github.com/matthewjberger/scoop-nerd-fonts".to_string(),
            stars: 418,
            forks: 45,
            apps: 367,
            last_updated: "2025-09-13".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "sysinternals".to_string(),
            full_name: "niheaven/scoop-sysinternals".to_string(),
            description: "A Scoop bucket for Windows Sysinternals utilities".to_string(),
            url: "https://github.com/niheaven/scoop-sysinternals".to_string(),
            stars: 80,
            forks: 15,
            apps: 70,
            last_updated: "2025-09-10".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "java".to_string(),
            full_name: "ScoopInstaller/Java".to_string(),
            description: "📦 A bucket for Scoop, for Oracle Java, OpenJDK, Eclipse Temurin, IBM Semeru, Zulu, ojdkbuild, Amazon Corretto, BellSoft Liberica, SapMachine and Microsoft JDK. (scoop's built-in bucket 'java')".to_string(),
            url: "https://github.com/ScoopInstaller/Java".to_string(),
            stars: 288,
            forks: 100,
            apps: 299,
            last_updated: "2025-09-16".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "nirsoft".to_string(),
            full_name: "ScoopInstaller/Nirsoft".to_string(),
            description: "A Scoop bucket of useful NirSoft utilities (scoop's built-in bucket 'nirsoft')".to_string(),
            url: "https://github.com/ScoopInstaller/Nirsoft".to_string(),
            stars: 143,
            forks: 43,
            apps: 276,
            last_updated: "2025-09-15".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "nonportable".to_string(),
            full_name: "ScoopInstaller/Nonportable".to_string(),
            description: "A bucket for Scoop containing non-portable applications".to_string(),
            url: "https://github.com/ScoopInstaller/Nonportable".to_string(),
            stars: 120,
            forks: 80,
            apps: 200,
            last_updated: "2025-09-15".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "php".to_string(),
            full_name: "ScoopInstaller/PHP".to_string(),
            description: "A bucket for PHP versions for Scoop".to_string(),
            url: "https://github.com/ScoopInstaller/PHP".to_string(),
            stars: 85,
            forks: 30,
            apps: 25,
            last_updated: "2025-09-12".to_string(),
            is_verified: true,
        },
        SearchableBucket {
            name: "versions".to_string(),
            full_name: "ScoopInstaller/Versions".to_string(),
            description: "📦 A Scoop bucket for alternative versions of apps. (scoop's built-in bucket 'versions')".to_string(),
            url: "https://github.com/ScoopInstaller/Versions".to_string(),
            stars: 240,
            forks: 234,
            apps: 510,
            last_updated: "2025-09-16".to_string(),
            is_verified: true,
        },
    ]
}

// Parse the massive bucket list from GitHub using efficient parser
async fn fetch_expanded_bucket_list(filters: Option<BucketFilterOptions>) -> Result<Vec<SearchableBucket>, String> {
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
    let mut scored_buckets = Vec::new();
    
    for bucket in buckets {
        let mut score = 0.0;
        
        // Primary search: Bucket name (heavily weighted)
        if bucket.name.to_lowercase() == query_lower {
            score += 1000.0; // Exact bucket name match gets highest priority
        } else if bucket.name.to_lowercase().starts_with(&query_lower) {
            score += 500.0; // Name starts with query gets very high priority
        } else if bucket.name.to_lowercase().contains(&query_lower) {
            score += 250.0; // Name contains query gets high priority
        }
        
        // Secondary search: Repository name without "scoop-" prefix (medium weight)
        let repo_name = bucket.full_name.split('/').nth(1).unwrap_or("").to_lowercase();
        let clean_repo_name = repo_name.replace("scoop-", "").replace("scoop_", "");
        
        if score == 0.0 { // Only check repo name if bucket name didn't match
            if clean_repo_name == query_lower {
                score += 100.0;
            } else if clean_repo_name.starts_with(&query_lower) {
                score += 50.0;
            } else if clean_repo_name.contains(&query_lower) {
                score += 25.0;
            }
        }
        
        // Tertiary search: Full repository name (lower weight, only if no name matches)
        if score == 0.0 {
            if bucket.full_name.to_lowercase().contains(&query_lower) {
                score += 10.0;
            }
        }
        
        // Last resort: Description search (very low weight)
        if score == 0.0 {
            if bucket.description.to_lowercase().contains(&query_lower) {
                score += 1.0;
            }
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
        
        if score > 0.0 {
            scored_buckets.push((bucket.clone(), score));
        }
    }
    
    // Sort by score (descending)
    scored_buckets.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    scored_buckets.into_iter().map(|(bucket, _)| bucket).collect()
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
        let filters = if request.disable_chinese_buckets.unwrap_or(false) || request.minimum_stars.unwrap_or(0) > 0 {
            Some(BucketFilterOptions {
                disable_chinese_buckets: request.disable_chinese_buckets.unwrap_or(false),
                minimum_stars: request.minimum_stars.unwrap_or(2),
            })
        } else {
            None
        };
        
        if let Some(ref filter_opts) = filters {
            log::info!("Applying filters - Chinese buckets disabled: {}, Minimum stars: {}", 
                       filter_opts.disable_chinese_buckets, filter_opts.minimum_stars);
        }
        
        // Get verified buckets
        let verified_buckets = get_verified_buckets();
        let verified_names: std::collections::HashSet<String> = verified_buckets
            .iter()
            .map(|b| b.name.clone())
            .collect();
        
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
    
    log::info!("Returning {} buckets (total found: {})", buckets.len(), total_count);
    
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