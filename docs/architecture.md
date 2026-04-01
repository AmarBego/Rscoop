---
layout: default
title: Architecture
nav_order: 5
---

# Architecture

Rscoop is a Tauri 2 app — Rust backend, SolidJS frontend, talking to each other over Tauri's IPC bridge.

## Rust backend

The backend lives in `src-tauri/src/`. Here's how it's organized:

- **`lib.rs`** — entry point. Wires up all Tauri plugins, resolves the Scoop root path, and creates the shared `AppState` (cached packages, Scoop directory).
- **`commands/`** — 30+ Tauri commands grouped by domain: search, install, update, uninstall, buckets, doctor, VirusTotal, settings, shims, cache, version switching, and more. These are what the frontend calls.
- **`cold_start.rs`** — runs on first launch to preload Scoop metadata. Emits `cold-start-finished` and `scoop-ready` events that the frontend waits for before rendering.
- **`utils.rs`** — shared helpers for running PowerShell, parsing manifests, caching bucket metadata, and working with shims/shortcuts.
- **`tray.rs`** — builds the system tray menu from installed Scoop apps. Handles show/hide and app launching.
- **`scheduler.rs`** — background loop for auto-updating buckets and packages on a configurable interval.

## SolidJS frontend

The frontend lives in `src/`. Five pages, each with its own components:

- **`App.tsx`** — root component. Listens for backend lifecycle events, manages the update banner, handles routing.
- **`pages/`** — SearchPage, InstalledPage, BucketPage, DoctorPage, SettingsPage.
- **`hooks/`** — wraps Tauri command calls. `useInstalledPackages` handles refreshes, `useBucketSearch` does paginated discovery, `usePackageOperations` orchestrates install/update flows.
- **`stores/`** — reactive state shared across components. Installed packages cache, held packages, view preferences.
- **`components/page/`** — mirrors the page structure. Each page has its own subfolder of components.

## How data flows

1. User clicks something (e.g. "Install").
2. A hook calls the matching Rust command via `@tauri-apps/api/core.invoke`.
3. The Rust command runs the Scoop CLI (or a native helper like git2), streams logs through `tauri-plugin-log`, and returns results.
4. The hook updates SolidJS signals/stores, which re-renders the UI. Completion triggers follow-up refreshes (e.g. reloading the package list).

## Caching

- **In-memory**: installed packages and bucket metadata are cached in `AppState` to avoid hammering Scoop on every render. Invalidated by a fingerprint check (did the apps directory change?).
- **On-disk**: the expanded bucket search index is saved locally so discovery works offline. You control when to refresh it.
- **localStorage**: view preferences (selected tab, layout mode) persist across restarts via `createStoredSignal`.
