---
layout: default
title: Security & Privacy
nav_order: 4
---

# Security & Privacy

## VirusTotal

This is optional. If you add your API key in **Settings > Security**, Rscoop will request the hash report for a package before installing it. If the detection count exceeds your configured threshold, the install gets blocked. Cancel at any point and Scoop stays untouched.

## How Rscoop runs Scoop

Rscoop doesn't reimplement package logic. Every install, update, and uninstall delegates to the official Scoop CLI. The Rust backend wraps these calls to parse output, track progress, and surface errors — but the actual package operations are Scoop's.

Logging goes through `tauri-plugin-log` to both stdout and a log file at `%LOCALAPPDATA%\rscoop\logs\rscoop.log`.

## Privacy

Rscoop doesn't send telemetry or collect personal data. The only network requests it makes are:

- **Scoop bucket operations** — fetching and updating bucket repos (same as Scoop itself)
- **VirusTotal** — only if you've configured an API key
- **Release checks** — checking GitHub for new Rscoop versions
