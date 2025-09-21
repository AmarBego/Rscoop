---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started

Follow the steps below to install Rscoop and take care of the basic first-run tasks.

## 1. Install Scoop (if you have not already)

Rscoop wraps the official Scoop CLI. Make sure Scoop is installed and initialized before launching Rscoop. Visit [scoop.sh](https://scoop.sh) for the installation command and run it from an elevated PowerShell prompt.

## 2. Download Rscoop

1. Go to the [GitHub Releases page](https://github.com/AmarBego/rscoop/releases).
2. Pick the latest release and download either the signed .msi installer or the portable .exe build.
3. Run the installer. Windows SmartScreen might warn about the download. select **More info > Run anyway** to continue.

> **Tip:** After installing from the .msi, restart Rscoop once to ensure the Scoop backend initializes correctly.

## 3. First Launch Checklist

1. Start Rscoop from the Start Menu or the portable executable.
2. The app detects whether it was installed via Scoop. If not, Rscoop will check for updates using the built-in updater plugin.
3. On the very first launch a welcome banner appears while Scoop buckets and package metadata are cached locally. Let the cold-start process finish before closing the app.
4. When the tray icon appears you can safely close the window; Rscoop will minimize to the tray unless you disable that behavior in settings.

## 4. Optional: Configure VirusTotal

If you have a VirusTotal API key, open **Settings ? Security** and paste the key. Rscoop will automatically scan packages before installation and block downloads that score above your configured threat threshold.

## 5. Updating Rscoop

- **Installed via Scoop:** updates are managed through Scoop itself. Use scoop update rscoop from PowerShell.
- **Standalone installer:** when a new version is available Rscoop displays an in-app banner. Click **Install Now** to apply the update and restart the app.

Ready to explore the UI? Head over to the **User Guide** for a tour of the major pages and workflows.

## Next Steps

- [User Guide](user-guide/index.md) - Learn how to use Rscoop's features.
- [Settings](user-guide/settings.md) - Configure VirusTotal and other options.