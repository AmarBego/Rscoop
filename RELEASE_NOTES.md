### Release Notes 1.8.1

This release focuses on reliability: safer cleanup, more accurate operation status, better cancellation, and fresher package data after installs, updates, and scans.

The biggest internal change is the move to Execra, an Apache-2.0-licensed Rust crate maintained as part of the rScoop project. Execra now handles the long-running jobs behind installs, updates, cleanup, and VirusTotal scans, so rScoop can track real process state instead of relying on custom PowerShell plumbing. For users, that means fewer stale UI states, clearer warnings, and cancellation that actually stops the underlying work.

#### Safer cache cleanup
- Doctor's "Outdated Cache" cleanup now removes only stale cache downloads: packages that are no longer installed, or cached versions that do not match the installed version.
- Cache Manager still supports selected-file and full safe-cache deletion, but Doctor cleanup no longer behaves like "clear everything".
- Cleanup output is now streamed into the operation log with deleted-file counts and explicit per-file failures instead of silently swallowing partial errors.
- Automatic cleanup now uses the same version-aware cache cleanup path as Doctor, so background cleanup and manual cleanup behave consistently.

#### Better operation handling
- rScoop now runs Scoop, cleanup, update, and VirusTotal jobs through Execra, the new Rust runtime behind background operations.
- Running operations now carry their real job id, so cancelling an active install/update/scan kills the underlying process instead of only updating frontend state.
- Operation results now have a status: `success`, `warning`, or `error`. This lets the UI distinguish "completed, but pay attention" from a clean success.
- Scoop's "Running process detected, skip updating" case is now surfaced as a warning instead of a successful update. The operation bar, modal, completed history, and background toast all use the warning state.
- VirusTotal scans now use the same operation pipeline as other jobs, with exit-code mapping for detections and missing API keys.

#### Faster, less stale package data
- Search now caches parsed manifests and binary aliases, not just manifest paths. Warm searches avoid re-reading and re-parsing every JSON file.
- Manifest cache invalidation now uses the configured Scoop path instead of a fallback path, so bucket changes refresh the right cache.
- Installed-package refresh after operations now reloads package data, holds, updates, and versioned package state together without forcing the heavier cold-start refetch path.
- Cold-start readiness events were simplified to global events with shorter retry timing, reducing duplicate listener work during launch.

#### Bucket and scheduler fixes
- Bucket install/update/remove now resolve paths from the app's configured Scoop path.
- Adding or removing buckets immediately refreshes the search manifest cache.
- The background bucket updater now uses the same configured app state and records per-bucket output in the operation log.
- Automatic package updates now run through the same Scoop operation path as manual updates, including auto-cleanup afterward.

#### UI polish
- Operation warnings now render with warning icons and warning-colored status text in the operation bar, modal, hover history, and log viewer footer.
- The installed page status button now shows a neutral state before any status check, success when everything is OK, and warning when Scoop reports issues.
- Long package names in the installed grid truncate cleanly instead of crowding action icons.

#### Internal cleanup
- Removed the old PowerShell command wrapper and update helper modules after moving process execution to Execra.
- Updated Rust/Tauri dependency versions and registered the Execra Tauri plugin in the backend.
