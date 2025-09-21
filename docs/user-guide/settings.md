---
layout: default
title: Settings
parent: User Guide
nav_order: 5
---

# Settings

Customize how Rscoop behaves and how it integrates with Scoop from the Settings page.

## Scoop Configuration

- Review the detected Scoop root path and override it if you keep Scoop somewhere non-standard.
- Saving a new path updates the backend store; restart Rscoop so every command picks up the change.

## Window Behavior

- Toggle whether closing the window sends Rscoop to the system tray instead of exiting.
- Reset the first-time tray notification if you want to show the reminder again on the next close event.

## Security

- Provide a VirusTotal API key to enable pre-install scanning.
- Configure the maximum threat score Rscoop will tolerate before cancelling an install.
- Decide whether the app should stop and wait for your confirmation when a scan is still pending.

## Held Packages

- Review every package currently marked as held.
- Remove holds directly from the list or jump to the Installed view for additional actions.

## About & Logs

- See the current Rscoop version, release channel, and log directory.
- Enable verbose logging when you are troubleshooting backend issues.

## Related Pages

- [Getting Started](../../getting-started.md) - Initial setup and configuration.
- [User Guide](index.md) - Overview of all user guide sections.