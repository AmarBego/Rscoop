### Release Notes

#### Added
- **Debug mode** with floating debug button for accessing system information, logs, and troubleshooting tools (toggle in Settings).
- New debug commands (`get_debug_info`, `get_app_logs`, `read_app_log_file`) for detailed system diagnostics.

#### Improved
- **Drastically reduced log volume** through intelligent caching and debouncing:
  - Cold-start now logs efficiently with early-break optimization (no retry spam).
  - Installed packages scan uses fingerprint-based caching with 1-second debouncing to eliminate rapid re-scans.
  - Held packages lookup includes memoization checks to prevent redundant filesystem walks.
  - Linker version enumeration uses package version cache to avoid directory walking on every call.
  - LNK shortcut parsing reduced from per-file logging to single summary line.
  - External crate logging (`lnk`, `reqwest`, `tauri_plugin_updater`) now gated at appropriate levels.
- Cold-start initialization now parallel-prefetches installed packages and manifest cache **without blocking delays**.
- App state refactored with encapsulated `scoop_path()` getter/setter and refresh-time tracking for debouncing.
- Package versions cache architecture similar to installed packages cache, tied to installed packages fingerprint.
- Eliminated blocking retry loops during cold-start; .msi symlink settling is handled gracefully via fallback to latest version directory.
- Manifest cache warming during cold start ensures first search is instant without re-scanning buckets.
- Search command now reports cache status and timing information for better observability.
- **Cold-start now completes faster** by removing synchronous sleep delays that were blocking the parallel package scan.

#### Documentation
- Removed a README notice describing the known update/fresh-install bug (as its now fixed on .msi installers).
- Comprehensive troubleshooting guide for debug information and log inspection.
