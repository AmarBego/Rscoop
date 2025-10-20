---
layout: default
title: Troubleshooting
nav_order: 7
---

# Troubleshooting

Having issues? Start with the checks below.

## Known Issues

- **Missing Scoop dependencies** run the System Doctor checkup to install Git, 7-Zip, or other helpers automatically.

## Scoop Path Problems

1. Open **Settings ? Scoop Configuration** and confirm the path matches your environment.
2. If the path is empty, Rscoop will default to C:\scoop. Update the value and restart the app if you use a custom location.

## Bucket Search Fails

- Clear the cached bucket index from the discovery panel and try again.
- Verify your network access to GitHub if the expanded search download stalls.

## Operation Failures

- Check the operation modal for the last Scoop command issued.
- View the log file from **Settings ? Enable Logs** for additional output. Logs live under %APPDATA%\rscoop\logs.

## Still Stuck?

Open an issue on [GitHub](https://github.com/AmarBego/rscoop/issues) with the log excerpts and the Scoop command that fails. Mention whether the app was installed through Scoop or the standalone installer.

## Related Documentation

- [Developer Guide](developer-guide.md) - For developers troubleshooting build or runtime issues.
- [Getting Started](getting-started.md) - Revisit installation steps if problems persist.
- [User Guide](../user-guide/index.md) - Check specific feature guides for common workflows.