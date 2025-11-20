### Release Notes 1.4.3

#### Added
- **Settings Page Redesign**: Settings are now organized into clear tabs (Automation, Management, Security, Window & UI, About) for faster navigation.
- **Automatic Bucket & Package Updates**: Background scheduler with wall-clock persistence auto-updates buckets and optionally packages after bucket refresh. Supports custom intervals and short debug intervals.
- **Start on Boot**: New Startup toggle lets Rscoop launch automatically with Windows; integrates version-aware MSI mismatch handling.
- **Auto cleanup**: Automatically clean up old versions and cache on install/update and uninstall

#### Improved
- **Version-Aware Launch Behavior**: Updated builds trigger a mismatch notice even on auto-start to ensure a clean post-update relaunch.


#### Documentation
- Updated settings to reflect new changes

### 1.4.4 specific =>
#### Bug Fixes / Reliability
- **Startup Event Race**: Registered cold-start and readiness listeners before any asynchronous update/network checks to prevent missed backend events causing long (10s) spinner fallback.
- **Updater Timeout Stall**: Moved update check to deferred phase after readiness with a 4s timeout safeguard so a slow/failed request no longer blocks initial UI rendering.
- **Duplicate Emissions Reduced**: Added `is_cold_start_ready` backend command to allow future polling and reduce reliance on repeated multi-attempt event emission loops.
- **Loading Screen Variability**: Eliminated cases where loading screen persisted until fallback due to late listener registration; readiness now reflects actual cold-start completion promptly.
- **Resilience on Network Errors**: Gracefully logs updater failures without elevating severity or holding UI readiness state.
- **Debug logs**: Now rotate upon launch to not cause exhaustive debugs