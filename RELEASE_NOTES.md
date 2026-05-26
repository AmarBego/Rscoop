### Release Notes 1.9.1

#### Feature
- rScoop can now launch minimized to the tray from Windows startup.

#### Fixes
- Auto bucket updates now skip themselves while another operation is running.
- Scheduled update timing is recorded after work finishes, so the next run is based on real completion time.
- Auto cleanup now keeps the configured number of recent versions and always protects the active version.
- Package and cache state are refreshed before cleanup decisions, reducing stale cleanup behavior.
- Tray setup now logs failures, avoids icon unwraps, and keeps shortcut menu state consistent if rebuilds fail.

#### Improvements
- System Doctor checks can now offer direct fixes for missing packages, the main bucket, and relevant Windows Settings pages.
- Tray menu editing now uses the same settings card pattern as the rest of Settings.
- The app selector and tray preview share the same height, with overflow handled inside the selector.
