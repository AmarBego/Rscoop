---
layout: default
title: Overview
nav_order: 1
permalink: /
---

# Rscoop

Rscoop is a desktop GUI for [Scoop](https://scoop.sh). It doesn't replace Scoop, it gives you an interface for it. Search across all your buckets, install and update packages, manage buckets, clean up disk space, and optionally scan downloads through VirusTotal. All from one window.

Built with Rust and SolidJS on [Tauri 2](https://v2.tauri.app). Sits in your system tray when you're not using it.

![Installed packages](assets/images/installed.png)

## What you get

- **Search** across every added bucket at once. Results show the bucket, version, and whether you already have it installed.
- **Install, update, hold, uninstall, or switch versions** of packages with live progress output.
- **Bucket discovery.** Browse your current buckets or search GitHub for community ones. Add and remove from the UI.
- **System Doctor.** Checks for missing Git, 7-Zip, broken shims, and other common Scoop issues. One-click cleanup for old versions and stale caches.
- **VirusTotal scanning.** Paste your API key in settings and Rscoop scans packages before install. Configurable threat threshold.
- **System tray.** Minimize to tray, launch installed Scoop apps from the tray menu.
- **Auto-updates.** Background bucket and package updates on a schedule you pick (1h, 6h, 24h, 7d, or custom).

## Requirements

- Windows 10 version 2004 or newer
- [Scoop](https://scoop.sh) installed and working
- For development: Node.js 18+, Rust stable, Visual Studio Build Tools

## Get started

Head to [Getting Started](getting-started.md) for install instructions, or jump into the [User Guide](user-guide/index.md) to see what each page does.

If you're a developer, check the [Architecture](architecture.md) and [Developer Guide](developer-guide.md).
