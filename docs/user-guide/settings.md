---
layout: default
title: Settings
parent: User Guide
nav_order: 5
---

# Settings

The Settings page is organized into tabbed categories for clarity. Each tab groups related controls you can tune to customize Rscoop's behavior.

## 1. Automation

Tools that keep Scoop and packages clean & current without manual intervention.

### Auto Cleanup
Manages disk usage and stale artifacts:
- Set how many previous versions of each package to retain.
- Toggle removal of outdated caches and stale downloads.
- Runs automatically after bulk updates or can be triggered manually.

### Bucket Auto Updater
Ensures bucket manifests stay current:
- Choose an interval (e.g. 24h, 7d, or custom). Debug mode allows very short test intervals.
- Scheduler persists across restarts: if Rscoop was closed and enough wall‑clock time passed, it will run immediately on launch.
- When enabled packages can auto-update right after buckets finish (toggle: "Auto update packages after bucket refresh").
- Background runs stream status to a modal so you can see progress if Rscoop is open; otherwise they log quietly.

## 2. Management

Configuration of Scoop’s location and version locks.

### Scoop Configuration
- Shows detected Scoop root; override if you use a non‑standard path.
- Save the new path and restart Rscoop so all commands use it.

### Held Packages
- Displays packages locked ("held") to specific versions.
- Remove a hold directly, or navigate to Installed view for deeper actions.

## 3. Security

Integrity and threat scanning integrations.

### VirusTotal Integration
- Enter your VirusTotal API key to enable pre‑install scanning.
- Optional auto‑scan on install: if enabled, Rscoop scans first and only proceeds automatically if clean; otherwise prompts you when detections or missing key states occur.
- Configure threat tolerance (maximum detection count or score) and behavior on pending scans.

## 4. Window & UI

Application behavior and developer tools.

### Window Behavior
- Close to tray vs. exit (toggle).

### Startup Settings
- Enable or disable starting Rscoop automatically on Windows boot.

### Debug Mode
- When enabled, shows a Debug button with system info & logs.
- Unlocks rapid test intervals (e.g. 10s) for the bucket/package auto‑update scheduler.

## 5. About

Informational metadata and update controls.

### Application Info
- Current Rscoop version and links (GitHub repository, issues, etc.).
- Manual update check button (skipped if installed via Scoop and external updates are disabled).

## Related Pages

- [Getting Started](../../getting-started.md) – Initial setup and configuration.
- [User Guide](index.md) – Overview of all user guide sections.