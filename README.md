# Rscoop - Your Scoop Companion

![Installed Packages Grid View](pics/installedpackages.png)

Rscoop is a native desktop interface for [Scoop](https://scoop.sh), the popular command‑line package manager for Windows. Rather than replacing scoop, Rscoop builds on top of it: a Rust back‑end and SolidJS front‑end provide a responsive, modern UI that makes discovering, installing and maintaining software feel effortless.

## Why another Scoop tool?

If you've ever fumbled through long lists of scoop search results or forgotten which bucket a package lives in, you know how the command line can slow you down. Rscoop takes the pain out of package management by giving you the visibility and control you'd expect from a native app:

- **Blazing‑fast search:** type a few characters and see matches from every bucket in milliseconds thanks to a native Rust search engine and smart caching. You can even work offline once your buckets are cached.

- **Visual package details:** click on a result to see the manifest, release notes, version history, install size and more. One click queues the install and streams Scoop output in real time.

- **Complete package management:** update, hold, uninstall or switch between versions from the Installed page. Dynamic filters help narrow the list by bucket or name, and a status header highlights packages with updates available.

- **Advanced bucket discovery:** browse the buckets you already have, see when they were last updated, or search GitHub for thousands of community buckets filtered by stars, forks or language. You decide which sources to trust and can install or remove buckets with a guided wizard.

- **System doctor & cleanup:** diagnose missing dependencies (Git, 7‑Zip, broken shims) and install helpers with one click. Clear out old versions or stale caches to reclaim disk space and manage shims safely.

- **Security built‑in:** optional VirusTotal integration scans packages before installation and blocks downloads that exceed your chosen threat threshold. Rscoop doesn't reimplement scoop; it delegates core actions to the official CLI and logs everything for auditing.

- **Modern experience:** dark/light themes, tray integration to keep Rscoop running in the background, and a settings panel that lets you tune automation, security, window behaviour and more.

## Getting started

Ready to try it out? Installing Rscoop is straightforward:

1. **Install Scoop** (if you haven't already). Rscoop wraps the official Scoop CLI, so you need Scoop installed and initialized first. Follow the instructions on [scoop.sh](https://scoop.sh) from an elevated PowerShell prompt.

2. **Download Rscoop.** Head over to the [GitHub releases page](https://github.com/amarbego/rscoop/releases) and grab either the signed `.msi` installer or the portable `.exe`. Run it. Windows SmartScreen may prompt you to confirm the download. Choose More info → Run anyway to proceed.

3. **First launch.** On first run Rscoop will cache your buckets and package metadata. A welcome banner lets you know when the cold‑start process is finished. Be sure to use the doctor page first if you're a new-comer to scoop! When the tray icon appears you can close the window Rscoop will minimize to the tray unless you disable that in settings.

4. **Optional: configure VirusTotal.** If you have an API key, open Settings → Security and paste the key. Rscoop will automatically scan packages before installation and block any that exceed your threat threshold.

## Learn more

This README only scratches the surface of what Rscoop can do. The official documentation provides a full user guide, architecture notes and troubleshooting tips. Check out:

- [**User Guide:**](https://amarbego.github.io/Rscoop/user-guide/) detailed walkthroughs for search, installed packages, buckets, system health and settings.
- [**Architecture:**](https://amarbego.github.io/Rscoop/architecture.html) high‑level overview of the Rust commands and SolidJS components that make Rscoop feel snappy.
- [**Developer guide:**](https://amarbego.github.io/Rscoop/developer-guide.html) set up a development environment and learn how to contribute.

## Under the hood

Rscoop is a Tauri application written in Rust (backend) and SolidJS with TypeScript (frontend). Rust commands wrap scoop operations and expose them to the UI through Tauri's invoke system. The frontend uses Solid's reactive stores and custom hooks to drive dynamic pages for search, installed packages, buckets and system doctor. Caching strategies minimize repeated Scoop calls and persist view preferences so Rscoop starts quickly and remembers your settings.

## Contributing

Contributions are welcome! Whether you're fixing a bug, polishing the UI or adding a new feature, we'd love your help. Please read the developer guide for setup instructions and open an issue or pull request on GitHub to discuss your ideas.

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/AmarBego/Rscoop?tab=MIT-1-ov-file#readme) file for details.
