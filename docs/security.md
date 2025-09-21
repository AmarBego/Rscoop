---
layout: default
title: Security & Privacy
nav_order: 4
---

# Security & Privacy

Rscoop takes security seriously while preserving the transparency of the Scoop ecosystem.

## VirusTotal Integration

- Optional scanning runs before every install when you provide an API key.
- The backend requests the hash report and blocks the operation if the detection ratio exceeds your threshold.
- Cancelling an install from the scan dialog leaves Scoop untouched and records the decision in the log.

## Code Signing

- Windows builds are signed through [SignPath.io](https://signpath.io) using a certificate issued by the SignPath Foundation.
- Signed installers reduce SmartScreen warnings and give you a verifiable chain of custody for each release.

## Trusted Operations

- Core package actions delegate to the official Scoop CLI, so Rscoop never reimplements package installation logic.
- Rust commands wrap Scoop invocations to provide progress updates, parse errors, and prevent destructive defaults.
- Logging is handled by tauri-plugin-log with outputs to both stdout and the per-user log directory for auditing.

## Privacy

Rscoop does not transmit telemetry or personal data. Network requests are limited to the services you explicitly use: Scoop buckets, VirusTotal (if configured), and release checks.