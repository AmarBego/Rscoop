use crate::commands;
use crate::operations::{self, OperationKind};
use crate::state;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;

const INTERVAL_KEY: &str = "buckets.autoUpdateInterval";
const LAST_RUN_KEY: &str = "buckets.lastAutoUpdateTs";
const UPDATE_PACKAGES_KEY: &str = "buckets.autoUpdatePackagesEnabled";
const OFF_POLL_SECS: u64 = 30;
const BUSY_RETRY_SECS: u64 = 60;
const MAX_SLEEP_SECS: u64 = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AutoUpdateInterval {
    Off,
    Every(u64),
}

enum SchedulerRun {
    Ran,
    Busy,
}

pub fn start_background_tasks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let interval_raw = read_config_string(&app, INTERVAL_KEY, "off");
            let interval_secs = match parse_auto_update_interval(&interval_raw) {
                AutoUpdateInterval::Every(seconds) => seconds,
                AutoUpdateInterval::Off => {
                    if !interval_raw.trim().eq_ignore_ascii_case("off") {
                        log::warn!(
                            "Invalid auto bucket update interval '{}'; treating it as off",
                            interval_raw
                        );
                    }
                    log::trace!("[scheduler] interval='off' polling again in 30s");
                    sleep_secs(OFF_POLL_SECS).await;
                    continue;
                }
            };

            let now = unix_now_secs();
            let last_finished_at = read_config_u64(&app, LAST_RUN_KEY).unwrap_or(0);
            let wait_secs = seconds_until_due(last_finished_at, now, interval_secs);

            if wait_secs > 0 {
                let chunk = wait_secs.min(MAX_SLEEP_SECS);
                log::trace!(
                    "[scheduler] next run due in {}s, interval='{}', sleeping {}s",
                    wait_secs,
                    interval_raw,
                    chunk
                );
                sleep_secs(chunk).await;
                continue;
            }

            let elapsed = if last_finished_at == 0 {
                interval_secs
            } else {
                now.saturating_sub(last_finished_at)
            };

            match run_auto_bucket_update(&app, &interval_raw, interval_secs, elapsed).await {
                SchedulerRun::Ran => continue,
                SchedulerRun::Busy => sleep_secs(BUSY_RETRY_SECS).await,
            }
        }
    });
}

async fn run_auto_bucket_update(
    app: &AppHandle,
    interval_raw: &str,
    interval_secs: u64,
    elapsed_secs: u64,
) -> SchedulerRun {
    log::info!(
        "Auto bucket update task due (interval='{}', seconds={}, elapsed={})",
        interval_raw,
        interval_secs,
        elapsed_secs
    );

    if operations::start_synthetic(
        app,
        "Updating buckets".to_string(),
        OperationKind::AutoUpdate,
        None,
    )
    .is_none()
    {
        log::info!("Skipping auto bucket update because another operation is active or queued");
        return SchedulerRun::Busy;
    }

    operations::append_output(
        app,
        "Starting automatic bucket update...".to_string(),
        "stdout",
    );

    let mut should_update_packages = false;

    match commands::bucket_install::update_all_buckets(app.clone()).await {
        Ok(results) => {
            let successes = results.iter().filter(|r| r.success).count();
            let total = results.len();
            should_update_packages = successes > 0 && read_config_bool(app, UPDATE_PACKAGES_KEY);

            log::info!(
                "Auto bucket update completed: {} successes / {} total",
                successes,
                total
            );

            for result in &results {
                let (line, source) = if result.success {
                    (format!("Updated bucket: {}", result.bucket_name), "stdout")
                } else {
                    (
                        format!(
                            "Failed to update {}: {}",
                            result.bucket_name, result.message
                        ),
                        "stderr",
                    )
                };
                operations::append_output(app, line, source);
            }

            operations::finish_synthetic(
                app,
                successes == total,
                format!(
                    "Bucket update completed: {} of {} succeeded",
                    successes, total
                ),
            );

            if read_config_bool(app, UPDATE_PACKAGES_KEY) && successes == 0 {
                log::warn!("Skipping automatic package update because no bucket updated cleanly");
            }
        }
        Err(e) => {
            log::warn!("Auto bucket update failed: {}", e);
            operations::append_output(app, format!("Error: {}", e), "stderr");
            operations::finish_synthetic(app, false, format!("Bucket update failed: {}", e));
        }
    }

    if should_update_packages {
        run_auto_package_update(app).await;
    }

    mark_auto_update_finished(app);
    SchedulerRun::Ran
}

async fn run_auto_package_update(app: &AppHandle) {
    log::info!("Auto package update task running after bucket refresh");

    if operations::start_synthetic(
        app,
        "Updating packages".to_string(),
        OperationKind::AutoUpdate,
        None,
    )
    .is_none()
    {
        log::info!("Skipping auto package update because another operation is active or queued");
        return;
    }

    operations::append_output(
        app,
        "Starting automatic package update...".to_string(),
        "stdout",
    );

    let state = app.state::<state::AppState>();
    let update_outcome = commands::scoop::execute_scoop_outcome(
        app.clone(),
        commands::scoop::ScoopOp::UpdateAll,
        None,
        None,
    )
    .await;

    match update_outcome {
        Ok(outcome) if outcome.is_success() => {
            commands::search::invalidate_manifest_cache(&state.scoop_path()).await;
            commands::installed::invalidate_installed_cache(state.clone()).await;
            commands::auto_cleanup::trigger_auto_cleanup(app.clone(), state).await;

            operations::append_output(
                app,
                "Package update completed successfully.".to_string(),
                "stdout",
            );
            operations::finish_synthetic(
                app,
                true,
                "Automatic package update completed successfully".to_string(),
            );
        }
        Ok(outcome) => {
            let message = outcome.message();
            log::warn!("Auto package update failed: {}", message);
            operations::append_output(app, format!("Error: {}", message), "stderr");
            operations::finish_synthetic(
                app,
                false,
                format!("Automatic package update failed: {}", message),
            );
        }
        Err(e) => {
            log::warn!("Auto package update failed: {}", e);
            operations::append_output(app, format!("Error: {}", e), "stderr");
            operations::finish_synthetic(
                app,
                false,
                format!("Automatic package update failed: {}", e),
            );
        }
    }
}

fn parse_auto_update_interval(raw: &str) -> AutoUpdateInterval {
    let trimmed = raw.trim();
    match trimmed {
        "24h" | "1d" => AutoUpdateInterval::Every(86_400),
        "7d" | "1w" => AutoUpdateInterval::Every(604_800),
        "1h" => AutoUpdateInterval::Every(3_600),
        "6h" => AutoUpdateInterval::Every(21_600),
        off if off.eq_ignore_ascii_case("off") => AutoUpdateInterval::Off,
        custom if custom.starts_with("custom:") => parse_positive_seconds(&custom[7..])
            .map(AutoUpdateInterval::Every)
            .unwrap_or(AutoUpdateInterval::Off),
        numeric => parse_positive_seconds(numeric)
            .map(AutoUpdateInterval::Every)
            .unwrap_or(AutoUpdateInterval::Off),
    }
}

fn parse_positive_seconds(raw: &str) -> Option<u64> {
    raw.parse::<u64>().ok().filter(|seconds| *seconds > 0)
}

fn seconds_until_due(last_finished_at: u64, now: u64, interval_secs: u64) -> u64 {
    if last_finished_at == 0 {
        return 0;
    }

    interval_secs.saturating_sub(now.saturating_sub(last_finished_at))
}

fn read_config_string(app: &AppHandle, key: &str, default: &str) -> String {
    commands::settings::get_config_value(app.clone(), key.to_string())
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| default.to_string())
}

fn read_config_u64(app: &AppHandle, key: &str) -> Option<u64> {
    commands::settings::get_config_value(app.clone(), key.to_string())
        .ok()
        .flatten()
        .and_then(|value| value.as_u64())
}

fn read_config_bool(app: &AppHandle, key: &str) -> bool {
    commands::settings::get_config_value(app.clone(), key.to_string())
        .ok()
        .flatten()
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn mark_auto_update_finished(app: &AppHandle) {
    let finished_at = unix_now_secs();
    let _ = commands::settings::set_config_value(
        app.clone(),
        LAST_RUN_KEY.to_string(),
        serde_json::json!(finished_at),
    );
}

fn unix_now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

async fn sleep_secs(seconds: u64) {
    tokio::time::sleep(Duration::from_secs(seconds)).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_auto_update_intervals() {
        assert_eq!(parse_auto_update_interval("off"), AutoUpdateInterval::Off);
        assert_eq!(
            parse_auto_update_interval("24h"),
            AutoUpdateInterval::Every(86_400)
        );
        assert_eq!(
            parse_auto_update_interval("7d"),
            AutoUpdateInterval::Every(604_800)
        );
        assert_eq!(
            parse_auto_update_interval("custom:300"),
            AutoUpdateInterval::Every(300)
        );
        assert_eq!(
            parse_auto_update_interval("120"),
            AutoUpdateInterval::Every(120)
        );
    }

    #[test]
    fn rejects_zero_and_invalid_intervals() {
        assert_eq!(
            parse_auto_update_interval("custom:0"),
            AutoUpdateInterval::Off
        );
        assert_eq!(parse_auto_update_interval("0"), AutoUpdateInterval::Off);
        assert_eq!(
            parse_auto_update_interval("custom:nope"),
            AutoUpdateInterval::Off
        );
    }

    #[test]
    fn computes_due_time_from_finished_timestamp() {
        assert_eq!(seconds_until_due(0, 1_000, 3_600), 0);
        assert_eq!(seconds_until_due(1_000, 4_600, 3_600), 0);
        assert_eq!(seconds_until_due(1_000, 2_000, 3_600), 2_600);
        assert_eq!(seconds_until_due(5_000, 4_000, 3_600), 3_600);
    }
}
