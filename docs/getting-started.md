---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started

## 1. Install Scoop first

rScoop wraps the Scoop CLI, so you need Scoop installed before anything else. Head to [scoop.sh](https://scoop.sh) and run the install command from PowerShell.

## 2. Download rScoop

1. Go to [Releases](https://github.com/AmarBego/rscoop/releases) and grab the latest `.msi` installer or portable `.exe`.
2. Run it. Windows SmartScreen might warn you. Click **More info** then **Run anyway**.

## 3. First launch

1. Open rScoop from the Start Menu or run the portable exe.
2. On the first run, rScoop caches your bucket metadata and package info. Let this finish before closing the app. You'll see a loading state while it works.
3. Once the tray icon shows up, you can close the window. rScoop stays in the tray unless you turn that off in Settings.
4. If you didn't install through Scoop, the built-in updater checks for new versions automatically.

## 4. Optional: set up VirusTotal

If you have a VirusTotal API key, go to **Settings > Security** and paste it in. rScoop will scan packages before installing them and block anything above your configured threat threshold.

## 5. Migrating from another machine

If you already have rScoop set up on another PC, use profile export/import to rebuild the same setup:
1. On the source machine, go to **Settings > Management > Export profile** and save a Full profile to a JSON file.
2. Transfer the file to the new machine (USB, cloud, dotfiles repo).
3. On the new machine, go to **Settings > Management > Import profile**, open the file, and apply the groups you want.
4. rScoop clones buckets, queues apps for background install, and merges settings. It does not uninstall anything.

## 6. Updating

- **Installed via Scoop?** Run `scoop update rscoop` from PowerShell.
- **Standalone installer?** rScoop shows a banner when a new version is available. Click it to update.

## Next

- [User Guide](user-guide/index.md), tour of every page
- [Settings](user-guide/settings.md), configure themes, auto-updates, tray, and more
- [Security & Privacy](security.md), how VirusTotal and networking work
