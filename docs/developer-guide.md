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

## Release requirements

Release builds run from tags that match the app version, for example `v1.9.1`.
The release workflow verifies that `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` all use the same version before publishing artifacts.

The GitHub `release` environment must provide these secrets for Tauri updater signing:

- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for Tauri updater signatures.

Optional Windows Authenticode signing secrets:

- `WINDOWS_CERTIFICATE`, a base64-encoded Windows code-signing `.pfx`.
- `WINDOWS_CERTIFICATE_PASSWORD`, the `.pfx` password.

If one Windows certificate secret is set, both must be set. If neither is set, the release still builds unsigned Windows artifacts while preserving Tauri updater signatures.

Optional environment variable for Authenticode signing:

- `WINDOWS_TIMESTAMP_URL`, defaulting to `http://timestamp.digicert.com` when unset.

Keep the release environment protected with required reviewers. If the Tauri updater private key ever needs rotation, ship a bridge release signed by the old key that updates the public key in `tauri.conf.json`, then sign later releases with the new key.

## Directory layout

| Folder | What's in it |
|---|---|
| `src/` | SolidJS frontend. Pages, components, hooks, stores. |
| `src-tauri/` | Rust backend. Commands, Tauri config, plugins. |
| `pics/` | Screenshots for the README |
| `docs/` | This documentation site (GitHub Pages) |

## Backend notes

- Commands are in `src-tauri/src/commands/`, grouped by domain (search, install, buckets, doctor, profile, etc.).
- `operations.rs` manages the background install/update/uninstall queue. Use `EnqueueAction` to push work; the queue processes FIFO via Tokio tasks.
- Execra is the runtime for long-running jobs. Use it for process execution, cancellation, streamed output, and structured operation status instead of adding new ad-hoc process wrappers.
- `tray.rs` builds the tray menu from installed Scoop apps, extracting real exe icons and supporting pinned/hidden app preferences.
- Use the existing Rust helpers for probing Scoop state, parsing manifests, cache cleanup, shim/shortcut inspection, and filesystem operations. rScoop delegates core package actions to Scoop, but most surrounding app logic should stay in Rust for speed and predictable error handling.
- Log progress with `log::info!` / `log::warn!`. The frontend operation modal picks these up through `tauri-plugin-log`.

## Frontend notes

- Hooks in `src/hooks/` wrap backend calls and manage state. Extend existing hooks instead of duplicating `invoke` calls in components.
- `installedPackagesStore` holds the canonical package list. Call its `refetch()` after any operation that changes Scoop state.
- Settings store in `src/stores/` uses `tauri-plugin-store` for persistence.
- UI is built with Tailwind + daisyUI. Shared styles are in `App.css`.

## Debugging

- Open **Settings > About** to see version info, check for updates, and read logs.
- Set the `RUST_LOG` environment variable for verbose output during development.
- The system tray has a **Refresh Apps** entry that reloads Scoop app shortcuts without restarting.
- Enable **Debug Mode** in **Settings > Window** to unlock rapid test intervals for the auto-update scheduler and access a debug info panel.
