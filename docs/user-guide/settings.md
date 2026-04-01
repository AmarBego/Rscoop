---
layout: default
title: Settings
parent: User Guide
nav_order: 5
---

# Settings

Settings are split into five tabs.

## Automation

### Auto Cleanup
- Toggle automatic cleanup after bulk operations
- Set how many previous versions of each package to keep
- Toggle removal of outdated caches
- Clear cache on uninstall: automatically removes cached installers when a package is uninstalled

### Background Operations
- Toggle to run all installs/updates/uninstalls in the background by default
- Operations show progress in a bar at the bottom of the screen
- VT scans still open the modal since they need your input

### Bucket Auto Updater
- Pick an update interval: off, 1h, 6h, 24h, 7d, or a custom interval in seconds
- Optionally auto-update packages after bucket updates finish
- The scheduler persists across restarts. If enough time passed while Rscoop was closed, it runs immediately on launch
- Debug mode (see Window & UI tab) unlocks rapid test intervals like 10 seconds

## Management

### Scoop Configuration
- Shows the detected Scoop root path
- Override it if you use a non-standard install location

### Held Packages
- Lists packages you've locked to a specific version
- Remove holds directly from here

## Security

### VirusTotal Integration
- Enter your VirusTotal API key to enable pre-install scanning
- Toggle auto-scan: when enabled, Rscoop scans first and only proceeds if clean
- Set a threat tolerance (max detection count). Anything above gets blocked

## Window & UI

### Theme
- Switch between light and dark themes (uses daisyUI themes under the hood)

### Window Behavior
- Toggle close-to-tray vs. actually exiting when you close the window

### Startup
- Enable or disable starting Rscoop automatically on Windows boot

### Default Launch Page
- Pick which page Rscoop opens to (Search, Installed, Buckets, Doctor, or Settings)

### Debug Mode
- Shows a debug button with cache state and system info
- Unlocks rapid test intervals for the auto-update scheduler

## About

- Current Rscoop version and links to GitHub
- Manual update check (skipped if you installed via Scoop)
- Release notes for available updates
- Log viewer
