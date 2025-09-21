---
layout: default
title: Architecture
nav_order: 5
---

# Architecture

Rscoop is built as a Tauri desktop application that combines a Rust backend with a SolidJS frontend. The diagram below outlines the major layers.

## Rust Backend

- **Entrypoint (src-tauri/src/lib.rs)** wires plugins, resolves the Scoop root path, and creates the shared AppState containing cached installed packages and the resolved Scoop directory.
- **Commands (src-tauri/src/commands)** expose Scoop operations to the UI through tauri::invoke_handler. Functionality is grouped by domain: search, installed packages, bucket management, VirusTotal, system doctor, and more.
- **Cold start (cold_start.rs)** preloads Scoop metadata on launch and emits cold-start-finished / scoop-ready events consumed by the frontend before the main UI renders.
- **Utils (utils.rs)** handles PowerShell execution, manifest parsing, caching bucket metadata, and working with Scoop shims and shortcuts. Many commands reuse these helpers to keep logic centralised.
- **System tray (tray.rs)** builds a dynamic tray menu populated with installed Scoop app shortcuts and listens for menu actions to show/hide the main window or launch apps.

## SolidJS Frontend

- The root component (src/App.tsx) listens for backend lifecycle events, manages update banners, and routes between feature pages.
- Dedicated hooks (src/hooks) wrap command invocations. Examples include useInstalledPackages for periodic refreshes, useBucketSearch for paginated discovery, and usePackageOperations for install/update orchestration.
- Shared stores (src/stores) keep frequently accessed data reactive across the app, such as the installed packages cache and persisted view preferences.
- Component folders under src/components/page mirror the page structure, making it easy to locate UI logic for Search, Installed, Buckets, System Doctor, and Settings.

## Data Flow

1. UI triggers an action (for example, **Install package**) through a hook.
2. The hook calls the matching Rust command using @tauri-apps/api/core.invoke.
3. The command wraps the Scoop CLI or native helper, streams logs via tauri-plugin-log, and returns structured results.
4. Hooks update Solid signals/stores, which causes the UI to re-render. Completion events trigger follow-up refreshes (for example, reloading the installed package list).

## Caching Strategy

- Installed packages and bucket metadata are stored in memory inside AppState to avoid redundant Scoop calls.
- Bucket search can persist an expanded index to disk, allowing offline discovery while giving the user explicit control over when to refresh the cache.
- Frontend createStoredSignal persists view preferences (such as the selected tab) to localStorage so the experience survives restarts.

This layered approach keeps Scoop interactions safe in Rust while giving the UI the responsiveness of a modern web app.

## Related Documentation

- [Developer Guide](developer-guide.md) - Learn how to set up the development environment and contribute to Rscoop.
- [User Guide](../user-guide/index.md) - Explore the features and workflows of Rscoop.