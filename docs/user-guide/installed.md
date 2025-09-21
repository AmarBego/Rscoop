---
layout: default
title: Installed
parent: User Guide
nav_order: 2
---

# Installed

The **Installed** view gives you control over everything Scoop is currently managing on your system.

![Installed List](../assets/images/installed.png)

## Overview

- **Dynamic filters:** narrow the list by bucket, switch between grid and list layouts, and filter by name with the search box.
- **Update awareness:** the header shows how many packages have updates available. Use **Update All** or update packages individually.
- **Version control:** if a package is versioned, you can switch releases or lock a package by holding it at the current version.
- **Operation tracking:** installing, updating, holding, and uninstalling all surface the operation modal with streaming CLI output.

## Scoop Status Modal

Select **Check Scoop Status** to run the built-in diagnostics. Results include Git and 7-Zip availability, bucket health, and other common Scoop issues. You can trigger helper installs directly from the modal.

## Package Details

Open any package to see:

- Metadata from the Scoop manifest, including description, homepage, notes, and architecture support.
- Cache usage stats and the option to clear cached installers.
- Shim details and file locations exposed through the Rust backend.

When you close the details modal, Rscoop refreshes the package list so the UI always matches Scoop's state.

## Related Pages

- [Buckets](buckets.md) - Add more packages by installing additional buckets.
- [System Health](system-health.md) - Run diagnostics to ensure Scoop is healthy.