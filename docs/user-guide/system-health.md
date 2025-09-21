---
layout: default
title: System Health
parent: User Guide
nav_order: 4
---

# System Health

The **System Doctor** consolidates every Scoop maintenance task into a single dashboard.

![Doctor page](/assets/images/doctor.png)

## Checkup

- Runs the sfsu diagnostics through the native 
un_scoop_checkup command.
- Highlights missing requirements such as Git, 7-Zip, or broken shims and lets you install helpers with one click.
- Updates automatically after each helper install so you can confirm the fix without reopening the modal.

## Cleanup

- **Clean up old app versions** runs scoop cleanup * in a safe wrapper to reclaim disk space.
- **Clean outdated cache** deletes stale installer archives without touching versioned installs.
- Long-running operations stream their progress into the shared operation modal.

## Cache Manager

- Lists every cached installer file with size information so you can target the files that matter.
- Remove entries individually or clear the entire cache using clear_cache.

## Shim Manager

- Surfaces every Scoop shim along with the file path it points to.
- Alter or remove shims directly, or add new shims that point to arbitrary executables.
- Backed by the Rust shim commands to avoid corrupting your Scoop installation.

## Related Pages

- [Installed](../installed.md) - View packages that may need maintenance.
- [Settings](../settings.md) - Adjust system health preferences.