---
layout: default
title: Manifest Editing
parent: User Guide
nav_order: 6
---

# Manifest Editing

Read and edit a package's Scoop manifest without leaving rScoop, or open it in your text editor or IDE.

## Edit in rScoop

1. Open a package from Search, Installed, or Buckets.
2. Go to the **Manifest** tab and click **Edit**.
3. Make your changes. Syntax highlighting stays on, and the view stays where you were reading.
4. Click **Save** or press **Ctrl+S**. rScoop saves the actual file and keeps a backup of its previous contents.

The JSON must be valid and have a non-empty `version` string before you can save. This doesn't check whether your URLs, hashes, or install scripts are correct.

Click **Cancel**, then **Discard changes** to return to the saved version. Choose **Keep editing** if you want to keep your draft.

## Use your own editor

Open the three-dot menu in the Manifest tab:

- **Open in editor** uses your saved editor, or asks you to pick one the first time.
- **Choose another editor** lets you pick a different editor's `.exe` and remembers it for next time.
- **Open with default app** uses the app Windows has set for JSON files.

Save or discard your in-app draft first. rScoop makes a backup before opening the file in an editor. Save your changes there, then return to rScoop. The tab refreshes when you return, or you can use **Reload from disk**.

If the file changes while you have an unsaved draft in rScoop, the draft stays in place and a warning appears. Copy anything you want to keep, then reload before saving.

## Backups and file details

Use **Restore latest backup** in the three-dot menu to bring back the previous contents. The current file gets its own backup before the restore, so you can undo that too. Save or discard any draft first.

**File details** shows the manifest path and latest backup path. Backups sit next to the manifest as `.bak` files, so Scoop doesn't list them as packages.

Usually you're editing the file in the package's bucket. If that file isn't available, rScoop may show the **Installed manifest copy** instead. This is the installed package's saved copy, not the bucket's install instructions. A package update can replace it.

## When a bucket updates

Local edits stay in place when upstream changes other files. If upstream changes the file you edited and Git can't update it without overwriting your changes, the whole bucket's update is blocked. This also applies to Scoop's own pulls during installs and `scoop update *`.

The Manifest tab shows **Upstream changed** when there's a change to review. A **Review** action in update results or a notification opens the same tab.

1. Click **Review** and switch between **Your version** and **Upstream** to read both.
2. To accept the bucket's version, click **Use upstream in editor**. This only loads a draft; it doesn't save yet.
3. Click **Save**, then retry the bucket update.

If you want to keep your custom changes, copy them first. Accept upstream and update the bucket, then reapply your changes to the new manifest. Keeping the conflicting version leaves the bucket update blocked.

This checks changes to the file, not just the package version. A fix to a URL or install script can need review too. If the manifest was removed upstream, rScoop keeps your file and asks you to resolve that change in the bucket.
