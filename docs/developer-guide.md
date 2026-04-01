---
layout: default
title: Developer Guide
nav_order: 6
---

# Developer Guide

## Prerequisites

- Node.js 18+
- Rust (stable channel)
- Scoop installed locally
- Visual Studio Build Tools (or the full [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Setup

```bash
git clone https://github.com/AmarBego/rscoop.git
cd rscoop
npm install
```

Run in dev mode with hot reload:

```bash
npm run tauri dev
```

Frontend only (just Vite, no Rust rebuild):

```bash
npm run dev
```

Build production installers:

```bash
npm run tauri build
```

Output goes to `src-tauri/target/release/bundle`.

## Directory layout

| Folder | What's in it |
|---|---|
| `src/` | SolidJS frontend — pages, components, hooks, stores |
| `src-tauri/` | Rust backend — commands, Tauri config, plugins |
| `pics/` | Screenshots for the README |
| `docs/` | This documentation site (GitHub Pages) |

## Backend notes

- Commands are in `src-tauri/src/commands/`, grouped by domain (search, install, buckets, doctor, etc.).
- Use `utils.rs` helpers for running PowerShell, probing Scoop state, and filesystem operations.
- Log progress with `log::info!` / `log::warn!` — the frontend operation modal picks these up through `tauri-plugin-log`.

## Frontend notes

- Hooks in `src/hooks/` wrap backend calls and manage state. Extend existing hooks instead of duplicating `invoke` calls in components.
- `installedPackagesStore` holds the canonical package list. Call its `refetch()` after any operation that changes Scoop state.
- UI is built with Tailwind + daisyUI. Shared styles are in `App.css`.

## Debugging

- Open **Settings > About** to see version info, check for updates, and read logs.
- Set the `RUST_LOG` environment variable for verbose output during development.
- The system tray has a **Refresh Apps** entry that reloads Scoop app shortcuts without restarting.
- Enable **Debug Mode** in **Settings > Window & UI** to unlock rapid test intervals for the auto-update scheduler and access a debug info panel.
