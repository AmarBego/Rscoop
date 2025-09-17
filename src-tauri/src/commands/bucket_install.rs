use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};
use tauri::command;
use url::Url;
use git2::{Repository, RemoteCallbacks, FetchOptions, Cred, CredentialType};
use regex::Regex;
use once_cell::sync::Lazy;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketInstallOptions {
    pub name: String,
    pub url: String,
    pub force: bool, // Force reinstall if bucket already exists
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketInstallResult {
    pub success: bool,
    pub message: String,
    pub bucket_name: String,
    pub bucket_path: Option<String>,
    pub manifest_count: Option<u32>,
}

// Regex to validate and normalize Git URLs
static GIT_URL_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(?:https?://)?(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/([^/]+)/([^/]+?)(?:\.git)?/?$").unwrap()
});

// Get the buckets directory path
fn get_buckets_dir() -> Result<PathBuf, String> {
    // Use fallback method to get scoop directory
    let scoop_dir = get_scoop_dir_fallback()?;
    Ok(scoop_dir.join("buckets"))
}

// Helper function to get scoop directory using fallback method
fn get_scoop_dir_fallback() -> Result<PathBuf, String> {
    use std::env;
    
    // Try environment variable first
    if let Ok(scoop_path) = env::var("SCOOP") {
        let path = PathBuf::from(scoop_path);
        if path.exists() {
            return Ok(path);
        }
    }

    // Try default user profile location
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let scoop_path = PathBuf::from(user_profile).join("scoop");
        if scoop_path.exists() {
            return Ok(scoop_path);
        }
    }

    // Try system-wide location
    let program_data = PathBuf::from("C:\\ProgramData\\scoop");
    if program_data.exists() {
        return Ok(program_data);
    }

    Err("Unable to determine Scoop root directory".to_string())
}

// Validate and normalize repository URL
fn validate_and_normalize_url(url: &str) -> Result<String, String> {
    // Handle common URL formats
    let normalized_url = if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else if url.contains("github.com") || url.contains("gitlab.com") || url.contains("bitbucket.org") {
        if url.starts_with("git@") {
            // Convert SSH format to HTTPS
            if let Some(captures) = Regex::new(r"git@([^:]+):([^/]+)/(.+?)(?:\.git)?$").unwrap().captures(url) {
                let host = &captures[1];
                let user = &captures[2];
                let repo = &captures[3];
                format!("https://{}/{}/{}.git", host, user, repo)
            } else {
                return Err("Invalid SSH Git URL format".to_string());
            }
        } else {
            // Assume it's a GitHub shorthand like "user/repo"
            if url.split('/').count() == 2 && !url.contains('.') {
                format!("https://github.com/{}.git", url)
            } else {
                format!("https://{}", url.trim_start_matches("www."))
            }
        }
    } else {
        return Err("URL must be a valid Git repository (GitHub, GitLab, or Bitbucket)".to_string());
    };

    // Ensure .git extension for consistency
    let final_url = if !normalized_url.ends_with(".git") && (normalized_url.contains("github.com") || normalized_url.contains("gitlab.com") || normalized_url.contains("bitbucket.org")) {
        format!("{}.git", normalized_url)
    } else {
        normalized_url
    };

    // Validate URL format
    match Url::parse(&final_url) {
        Ok(_) => Ok(final_url),
        Err(_) => Err("Invalid URL format".to_string()),
    }
}

// Extract bucket name from URL or use provided name
fn extract_bucket_name_from_url(url: &str, provided_name: Option<&str>) -> Result<String, String> {
    if let Some(name) = provided_name {
        if !name.is_empty() {
            return Ok(name.to_lowercase().trim().to_string());
        }
    }

    // Try to extract from URL
    if let Some(captures) = GIT_URL_REGEX.captures(url) {
        let repo_name = captures.get(2).unwrap().as_str();
        // Remove common prefixes and clean up
        let clean_name = repo_name
            .replace("scoop-", "")
            .replace("Scoop-", "")
            .replace("scoop_", "")
            .to_lowercase();
        
        if clean_name.is_empty() {
            return Err("Could not extract valid bucket name from URL".to_string());
        }
        
        Ok(clean_name)
    } else {
        Err("Could not extract bucket name from URL. Please provide a name.".to_string())
    }
}

// Check if bucket already exists
fn bucket_exists(bucket_name: &str) -> Result<bool, String> {
    let buckets_dir = get_buckets_dir()?;
    let bucket_path = buckets_dir.join(bucket_name);
    Ok(bucket_path.exists())
}

// Get bucket directory path
fn get_bucket_path(bucket_name: &str) -> Result<PathBuf, String> {
    let buckets_dir = get_buckets_dir()?;
    Ok(buckets_dir.join(bucket_name))
}

// Count manifests in bucket
fn count_bucket_manifests(bucket_path: &Path) -> Result<u32, String> {
    let mut count = 0;
    
    // Check main directory for .json files
    if let Ok(entries) = fs::read_dir(bucket_path) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "json" {
                    count += 1;
                }
            }
        }
    }
    
    // Check bucket subdirectory if it exists
    let bucket_subdir = bucket_path.join("bucket");
    if bucket_subdir.exists() {
        if let Ok(entries) = fs::read_dir(&bucket_subdir) {
            for entry in entries.flatten() {
                if let Some(ext) = entry.path().extension() {
                    if ext == "json" {
                        count += 1;
                    }
                }
            }
        }
    }
    
    Ok(count)
}

// Clone repository with progress callback
fn clone_repository(url: &str, target_path: &Path) -> Result<Repository, String> {
    log::info!("Cloning repository {} to {:?}", url, target_path);
    
    // Create parent directory if it doesn't exist
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }
    
    // Set up remote callbacks for authentication and progress
    let mut remote_callbacks = RemoteCallbacks::new();
    
    // Handle authentication (for private repos)
    remote_callbacks.credentials(|_url, username_from_url, allowed_types| {
        if allowed_types.contains(CredentialType::USERNAME) {
            Cred::username("git")
        } else if allowed_types.contains(CredentialType::SSH_KEY) {
            let username = username_from_url.unwrap_or("git");
            Cred::ssh_key_from_agent(username)
        } else if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
            // For HTTPS, use default credentials
            Cred::default()
        } else {
            Cred::default()
        }
    });
    
    // Progress callback for logging
    remote_callbacks.pack_progress(|_stage, current, total| {
        if total > 0 {
            let percentage = (current * 100) / total;
            log::debug!("Clone progress: {}% ({}/{})", percentage, current, total);
        }
    });
    
    // Set up fetch options
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(remote_callbacks);
    
    // Clone the repository
    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_options);
    
    let repo = builder.clone(url, target_path)
        .map_err(|e| format!("Failed to clone repository: {}", e))?;
    
    log::info!("Successfully cloned repository to {:?}", target_path);
    Ok(repo)
}

// Remove bucket directory (cleanup on failure)
fn remove_bucket_directory(bucket_path: &Path) -> Result<(), String> {
    if bucket_path.exists() {
        fs::remove_dir_all(bucket_path)
            .map_err(|e| format!("Failed to remove bucket directory: {}", e))?;
    }
    Ok(())
}

// Main function to install a bucket
async fn install_bucket_internal(options: BucketInstallOptions) -> Result<BucketInstallResult, String> {
    let BucketInstallOptions { name, url, force } = options;
    
    // Validate and normalize URL
    let normalized_url = validate_and_normalize_url(&url)?;
    
    // Extract or validate bucket name
    let bucket_name = if name.is_empty() {
        extract_bucket_name_from_url(&normalized_url, None)?
    } else {
        extract_bucket_name_from_url(&normalized_url, Some(&name))?
    };
    
    // Check if bucket already exists
    if bucket_exists(&bucket_name)? && !force {
        return Ok(BucketInstallResult {
            success: false,
            message: format!("Bucket '{}' already exists. Use force=true to reinstall.", bucket_name),
            bucket_name: bucket_name.clone(),
            bucket_path: Some(get_bucket_path(&bucket_name)?.to_string_lossy().to_string()),
            manifest_count: None,
        });
    }
    
    let bucket_path = get_bucket_path(&bucket_name)?;
    
    // If force is true and bucket exists, remove it first
    if force && bucket_path.exists() {
        log::info!("Force reinstall: removing existing bucket '{}'", bucket_name);
        remove_bucket_directory(&bucket_path)?;
    }
    
    // Clone the repository
    match clone_repository(&normalized_url, &bucket_path) {
        Ok(_repo) => {
            // Count manifests
            let manifest_count = count_bucket_manifests(&bucket_path)?;
            
            log::info!("Successfully installed bucket '{}' with {} manifests", bucket_name, manifest_count);
            
            Ok(BucketInstallResult {
                success: true,
                message: format!("Successfully installed bucket '{}' with {} manifests", bucket_name, manifest_count),
                bucket_name: bucket_name.clone(),
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: Some(manifest_count),
            })
        }
        Err(e) => {
            // Clean up on failure
            let _ = remove_bucket_directory(&bucket_path);
            
            Err(format!("Failed to install bucket '{}': {}", bucket_name, e))
        }
    }
}

// Tauri command to install a bucket
#[command]
pub async fn install_bucket(options: BucketInstallOptions) -> Result<BucketInstallResult, String> {
    log::info!("Installing bucket: {} from {}", options.name, options.url);
    
    match install_bucket_internal(options).await {
        Ok(result) => {
            log::info!("Bucket installation result: {:?}", result);
            Ok(result)
        }
        Err(e) => {
            log::error!("Bucket installation failed: {}", e);
            Ok(BucketInstallResult {
                success: false,
                message: e,
                bucket_name: String::new(),
                bucket_path: None,
                manifest_count: None,
            })
        }
    }
}

// Command to check if a bucket can be installed (validation only)
#[command]
pub async fn validate_bucket_install(name: String, url: String) -> Result<BucketInstallResult, String> {
    log::info!("Validating bucket installation: {} from {}", name, url);
    
    // Validate URL
    let normalized_url = match validate_and_normalize_url(&url) {
        Ok(url) => url,
        Err(e) => return Ok(BucketInstallResult {
            success: false,
            message: format!("Invalid URL: {}", e),
            bucket_name: name,
            bucket_path: None,
            manifest_count: None,
        }),
    };
    
    // Extract bucket name
    let bucket_name = match extract_bucket_name_from_url(&normalized_url, if name.is_empty() { None } else { Some(&name) }) {
        Ok(name) => name,
        Err(e) => return Ok(BucketInstallResult {
            success: false,
            message: format!("Invalid bucket name: {}", e),
            bucket_name: name,
            bucket_path: None,
            manifest_count: None,
        }),
    };
    
    // Check if bucket already exists
    let already_exists = bucket_exists(&bucket_name).unwrap_or(false);
    
    let bucket_path = if already_exists { 
        Some(get_bucket_path(&bucket_name).unwrap().to_string_lossy().to_string()) 
    } else { 
        None 
    };
    
    Ok(BucketInstallResult {
        success: !already_exists,
        message: if already_exists {
            format!("Bucket '{}' already exists", bucket_name)
        } else {
            format!("Bucket '{}' can be installed from {}", bucket_name, normalized_url)
        },
        bucket_name,
        bucket_path,
        manifest_count: None,
    })
}

// Command to remove a bucket
#[command]
pub async fn remove_bucket(bucket_name: String) -> Result<BucketInstallResult, String> {
    log::info!("Removing bucket: {}", bucket_name);
    
    let bucket_path = get_bucket_path(&bucket_name)?;
    
    if !bucket_path.exists() {
        return Ok(BucketInstallResult {
            success: false,
            message: format!("Bucket '{}' does not exist", bucket_name),
            bucket_name,
            bucket_path: None,
            manifest_count: None,
        });
    }
    
    match remove_bucket_directory(&bucket_path) {
        Ok(_) => {
            log::info!("Successfully removed bucket '{}'", bucket_name);
            Ok(BucketInstallResult {
                success: true,
                message: format!("Successfully removed bucket '{}'", bucket_name),
                bucket_name,
                bucket_path: None,
                manifest_count: None,
            })
        }
        Err(e) => {
            log::error!("Failed to remove bucket '{}': {}", bucket_name, e);
            Ok(BucketInstallResult {
                success: false,
                message: format!("Failed to remove bucket '{}': {}", bucket_name, e),
                bucket_name,
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: None,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_and_normalize_url() {
        // Test GitHub shorthand
        assert_eq!(
            validate_and_normalize_url("chawyehsu/dorado").unwrap(),
            "https://github.com/chawyehsu/dorado.git"
        );
        
        // Test full GitHub URL
        assert_eq!(
            validate_and_normalize_url("https://github.com/chawyehsu/dorado").unwrap(),
            "https://github.com/chawyehsu/dorado.git"
        );
        
        // Test SSH format
        assert_eq!(
            validate_and_normalize_url("git@github.com:chawyehsu/dorado.git").unwrap(),
            "https://github.com/chawyehsu/dorado.git"
        );
    }

    #[test]
    fn test_extract_bucket_name_from_url() {
        assert_eq!(
            extract_bucket_name_from_url("https://github.com/chawyehsu/dorado.git", None).unwrap(),
            "dorado"
        );
        
        assert_eq!(
            extract_bucket_name_from_url("https://github.com/TheRandomLabs/Scoop-Spotify.git", None).unwrap(),
            "spotify"
        );
        
        // Test with provided name
        assert_eq!(
            extract_bucket_name_from_url("https://github.com/chawyehsu/dorado.git", Some("mydorado")).unwrap(),
            "mydorado"
        );
    }
}