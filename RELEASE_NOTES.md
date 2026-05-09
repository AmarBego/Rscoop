### Release Notes 1.8.0

The portable profile release. Export your entire setup, carry it to another machine, and pick up right where you left off.

#### Profile export & import
- New Settings > Management section: export your installed apps, buckets, held packages, Scoop config, and rScoop preferences to a portable JSON file. Import it on a fresh machine and everything comes back — buckets get cloned, apps queue in the background, settings merge in.
- Pluggable groups — full profile, Scoop-compatible (apps + buckets only for the CLI crowd), just preferences, or hand-pick exactly what travels.
- Import preview scans the file before you commit, tells you what's inside, and shows warnings if anything looks off. Import is strictly additive: nothing gets uninstalled.
- Profiles are plain versioned JSON. Diffable, stashable in dotfiles repos, safe to hand-edit.

#### Background operations now the default
- New installs have "run in background" turned on out of the box. Install something, keep browsing, the progress bar at the bottom keeps you posted. Manual toggle still available in Settings > Automation.

#### Reliability
- Bucket auto-update scheduler no longer silently resets to "off" after app restarts. Bucket and operations settings are now synced from localStorage to the Rust backend on every launch, so the scheduler always knows your interval.
- Removed unused code in the bucket parser. Build warning gone.
- Pinned the MSVC toolchain in `src-tauri/` to avoid a MinGW linker crash at the build stage.

#### Docs get the love they needed
- Every page in the user guide has been rewritten or refreshed: Settings now documents all six tabs, the tray launcher, export/import, and language picker. Architecture page covers the new profile flow and the operations queue. Getting Started has a migration section for new-machine setup.

#### Changes
- New Rust commands: `export_profile`, `inspect_profile`, `import_profile`, `save_profile_file`, `read_profile_file_at`
- Frontend: Export & Import modals, group picker component, file picker integration
- i18n: 50+ new English translation keys for the export/import UI
- Scheduler: startup sync for auto-update settings, Background operations default changed to true
- Docs: Updated settings page (all 6 tabs), added profile section, migration guide, tray menu, language settings
- Build: `rust-toolchain.toml` pins `x86_64-pc-windows-msvc`, removed unused struct
