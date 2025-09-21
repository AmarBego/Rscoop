---
layout: default
title: Search
parent: User Guide
nav_order: 1
---

# Search

The **Search** view is the quickest way to find applications across every bucket you have installed.

![Search results](/assets/images/search.png)

## Key Actions

- **Instant results:** typing in the search bar queries the native Rust search engine, returning matches from all buckets via the local cache.
- **Packages vs includes:** use the tabs above the results to switch between primary packages and binaries shipped inside those packages.
- **Package metadata:** select any result to open the package details modal with manifest data, release notes, install size, and Scoop commands ready to copy.
- **One-click install:** press **Install** on a result to queue the package installer. Progress and output stream into the operation modal so you can follow along.

## Tips

- Click the help icon next to the search input to see advanced tips like using quotes for exact matches.
- Toggle the manifest view in the modal to read the full Scoop manifest without leaving Rscoop.
- When VirusTotal scanning is enabled, packages display the scan result before the install begins.

## Next Steps

After installing packages, head to the **[Installed](installed.md)** page to manage them.