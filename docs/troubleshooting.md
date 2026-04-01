---
layout: default
title: Troubleshooting
nav_order: 7
---

# Troubleshooting

## Missing Scoop dependencies

Open the **Doctor** page and run the checkup. It detects missing Git, 7-Zip, and other helpers and lets you install them with one click.

## Scoop path not found

Go to **Settings > Management > Scoop Configuration** and check the detected path. If you installed Scoop somewhere non-standard, set the correct path there and restart Rscoop.

## Bucket search not working

- Clear the cached bucket index from the discovery panel and try again.
- If the expanded search download stalls, check your network access to GitHub.

## An operation failed

- The operation modal shows the last Scoop command that ran. Check its output for errors.
- For more detail, open the log file at `%LOCALAPPDATA%\rscoop\logs\rscoop.log`.
- You can also view logs from **Settings > About**.

## Still stuck?

Open an issue on [GitHub](https://github.com/AmarBego/rscoop/issues) with the relevant log output and mention whether you installed Rscoop through Scoop or the standalone installer.
