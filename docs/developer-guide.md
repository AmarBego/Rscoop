---
layout: default
title: Developer Guide
nav_order: 6
---

# Developer Guide

## Prerequisites

- Node.js 18 or newer
- Rust (stable channel)
- Scoop installed locally
- Visual Studio Build Tools or the Tauri prerequisites for Windows

## Project Setup

```bash
git clone https://github.com/AmarBego/rscoop.git
cd rscoop
npm install
```

Run the desktop app in development mode with hot reload:

```bash
npm run tauri dev
```

Need just the frontend for quick UI iteration? Launch Vite directly:

```bash
npm run dev
```

Build signed installers and portable binaries:

```bash
npm run tauri build
```

Artifacts land in src-tauri/target/release/bundle.

## Directory Layout

- src/ = SolidJS frontend, organised by feature pages and shared components.
- src-tauri/ = Rust backend, commands, and Tauri configuration.
- pics/ = UI screenshots used in documentation and the landing page.
- docs/ = GitHub Pages documentation (this site).

## Rust Backend Notes

- Commands live under src-tauri/src/commands. Group related logic in modules to keep the invoke handler readable.
- Use the helpers in utils.rs for running PowerShell, probing Scoop state, and interacting with the filesystem.
- Long-running tasks should log progress with log::info! / log::warn! so the frontend operation modal can display updates via tauri-plugin-log.

## Frontend Notes

- Hooks in src/hooks encapsulate backend calls and state. Prefer extending a hook rather than duplicating invoke logic inside components.
- The installedPackagesStore keeps the canonical list of installed apps. Use its 
efetch() helper after operations that modify Scoop.
- Tailwind + daisyUI components define the design system. Shared styles live in App.css.

## Diagnostics

- Enable verbose logging from **Settings ? About & Logs** or set the RUST_LOG environment variable when launching in development.
- The system tray exposes a **Refresh Apps** entry that reloads Scoop application shortcuts without restarting the app.

## Related Documentation

- [Architecture](architecture.md) - Dive deeper into the technical design of Rscoop.
- [Troubleshooting](troubleshooting.md) - Common issues and how to resolve them.
- [User Guide](../user-guide/index.md) - Understand the user-facing features.