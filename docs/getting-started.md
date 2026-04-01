---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started

## 1. Install Scoop first

Rscoop wraps the Scoop CLI, so you need Scoop installed before anything else. Head to [scoop.sh](https://scoop.sh) and run the install command from PowerShell.

## 2. Download Rscoop

1. Go to [Releases](https://github.com/AmarBego/rscoop/releases) and grab the latest `.msi` installer or portable `.exe`.
2. Run it. Windows SmartScreen might warn you. Click **More info** then **Run anyway**.

## 3. First launch

1. Open Rscoop from the Start Menu or run the portable exe.
2. On the first run, Rscoop caches your bucket metadata and package info. Let this finish before closing the app. You'll see a loading state while it works.
3. Once the tray icon shows up, you can close the window. Rscoop stays in the tray unless you turn that off in Settings.
4. If you didn't install through Scoop, the built-in updater checks for new versions automatically.

## 4. Optional: set up VirusTotal

If you have a VirusTotal API key, go to **Settings > Security** and paste it in. Rscoop will scan packages before installing them and block anything above your configured threat threshold.

## 5. Updating

- **Installed via Scoop?** Run `scoop update rscoop` from PowerShell.
- **Standalone installer?** Rscoop shows a banner when a new version is available. Click it to update.

## Next

- [User Guide](user-guide/index.md), tour of every page
- [Settings](user-guide/settings.md), configure VirusTotal, themes, auto-updates, and more
