# Scoop Output Status Map

This document lists the **only** Scoop output lines that
`src-tauri/src/commands/scoop_interpreter.rs` classifies. Anything not on
this page is intentional raw transcript: visible to the user, but not
turned into semantic state.

Rule of inclusion: classify a line only if doing so changes what the UI
shows, what status/progress displays, or what action the user should
take. Decorative chatter stays raw.

Codes such as `scoop.download.failed` are stable identifiers emitted by
the interpreter. Source links point at the upstream Scoop files that own
the corresponding output.

## Sources

- [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1)
- [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1)
- [libexec/scoop-install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-install.ps1)
- [libexec/scoop-uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-uninstall.ps1)
- [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1)
- [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1)
- [libexec/scoop-cache.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-cache.ps1)
- [libexec/scoop-cleanup.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-cleanup.ps1)
- [bin/uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/bin/uninstall.ps1)

---

## Benign

Status lines that must **not** be classified as errors when PowerShell
routes them oddly.

| Pattern | Source |
| --- | --- |
| `The operation completed successfully.` | PowerShell runtime status |
| `done.` | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1) |
| `ok.` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |

---

## Progress / Phases

Phases are sequential: entering a new phase auto-exits the previous one.
Granular sub-phases such as `pre_install`, `post_install`, `linking`,
`shimming`, and `persisting` stay raw transcript.

Each phase occupies an approximate fraction range of the overall job
progress. See `phase_range` in `scoop_interpreter.rs`.

| Phase name | Range | Notes |
| --- | --- | --- |
| `install` / `update` | `0.00 -> 0.05` | Creeps until download starts. |
| `download` | `0.05 -> 0.50` | Byte progress lerps within this slice. |
| `verify` | `0.50 -> 0.65` | Creeps while hashing large artifacts. |
| `extract` | `0.65 -> 0.95` | Creeps while unpacking. |
| `uninstall` | `0.00 -> 0.95` | One broad block; creeps. |
| `scoop_update` | `0.00 -> 0.20` | Self-update stage 1; creeps. |
| `buckets` | `0.20 -> 0.70` | Self-update stage 2; creeps. |
| `cache` | `0.70 -> 0.95` | Self-update stage 3; creeps. |

Phases marked **"creeps"** have no determinate signal of their own —
the `start_creep` ticker in `operations.rs` bumps the bar by 5% of the
remaining distance every 300 ms (capped at 95% of the slice) so the
user sees motion even on lines that emit nothing.

### Top-Level Intent

| Pattern | Phase name | Label | Source |
| --- | --- | --- | --- |
| `Installing '<app>'` | `install` | `Installing <app>` | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1), [libexec/scoop-install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-install.ps1) |
| `Uninstalling '<app>'` | `uninstall` | `Uninstalling <app>` | [libexec/scoop-uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-uninstall.ps1), [bin/uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/bin/uninstall.ps1) |
| `Updating '<app>'` | `update` | `Updating <app>` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |

### Scoop Self-Update

| Pattern | Phase name | Label | Source |
| --- | --- | --- | --- |
| `Updating Scoop...` | `scoop_update` | `Updating Scoop` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `Updating Buckets...` | `buckets` | `Updating buckets` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `Updating cache...` | `cache` | `Updating cache` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |

### Download / Extract Pipeline

| Pattern | Phase name | Label | Source |
| --- | --- | --- | --- |
| `Downloading '<app>'` | `download` | `Downloading <app>` | [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `Downloading ...` | `download` | `Downloading` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `Checking hash ...` | `verify` | `Verifying download` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `Extracting <file>...` | `extract` | `Extracting <file>` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1), [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1) |
| `Extracting ...` | `extract` | `Extracting` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1), [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1) |

### Single-Line Progress Hints

| Pattern | Hint | Source |
| --- | --- | --- |
| `Removing <path>...` | `removing_cache` | [libexec/scoop-cache.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-cache.ps1), [libexec/scoop-cleanup.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-cleanup.ps1) |

---

## Byte Progress

Drives the determinate fill in the bottom status bar.

| Pattern | Action | Source |
| --- | --- | --- |
| `<done> MB / <total> MB` | emits scaled `Progress::fraction` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |

---

## Warnings

Partial-success conditions or situations that imply user action.

| Code | Pattern | Source |
| --- | --- | --- |
| `scoop.update.running_process` | `running process detected ... skip updating` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.update.held` | `'<app>' is held to version` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.install.already_installed` | `'<app>' ... is already installed` | [libexec/scoop-install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-install.ps1), [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.outdated` | `Scoop is out of date.` | [libexec/scoop-install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-install.ps1), [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `scoop.install.added_to_path` | `Installer added '<path>' to system path` | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1) |
| `scoop.update.sourceforge` | `SourceForge.net is known for causing ...` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1), [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1), [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `scoop.download.cache_ignored` | `Cache is being ignored` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1), [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `scoop.download.token_misconfigured` | `Token might be misconfigured` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.download.no_hash_in_manifest` | `Warning: No hash in manifest. SHA256 for '<file>' is` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.download.hash_skipped` | `Skipping hash verification` | [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |

---

## Known Errors

Failures the user needs to act on. Emitted as
`InterpreterEvent::KnownError` and surfaced as the operation diagnostic
instead of a generic exit-code message.

| Code | Pattern | Source |
| --- | --- | --- |
| `scoop.hash_mismatch` | `Hash check failed` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.unknown_package` | `Couldn't find manifest for '<app>'` | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1), [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `scoop.no_manifest` | `No manifest available for '<app>'` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.unsupported_arch` | `'<app>' doesn't support current architecture` | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1), [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `scoop.admin_required` | `you need admin rights` | [libexec/scoop-install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-install.ps1), [libexec/scoop-uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-uninstall.ps1), [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1), [libexec/scoop-cleanup.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-cleanup.ps1), [bin/uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/bin/uninstall.ps1) |
| `scoop.powershell_too_old` | `PowerShell 5 or later is required` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.git_missing` | `Scoop uses Git to update itself` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.update_failed` | `Update failed.` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.update_failed` | `Scoop download failed` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.install_aborted` | `Installation aborted` | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1) |
| `scoop.folder_in_use` | `Folder in use` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `scoop.access_denied` | `Access denied: <path>.` | [libexec/scoop-uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-uninstall.ps1) |
| `scoop.download.failed` | `Download failed! (Error <code>) <reason>` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.download.failed` | `Download failed!` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.download.invalid_url` | `URL <url> is not valid` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1), [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `scoop.download.cache_missing` | `cached file not found` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.download.no_hash_in_manifest` | `Couldn't find hash in manifest for '<url>'` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.download.unsupported_hash` | `Hash type '<algo>' isn't supported` | [lib/download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/download.ps1) |
| `scoop.command_error` | `ERROR: <message>` | [libexec/scoop-install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-install.ps1), [libexec/scoop-uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-uninstall.ps1), [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1), [libexec/scoop-cleanup.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-cleanup.ps1) |

---

## Summaries

Terminal success lines that replace the generic
`<operation> completed successfully` status. Emitted as
`InterpreterEvent::Summary`.

| Message template | Pattern | Source |
| --- | --- | --- |
| `Installed <app> <version>` | `'<app>' (<version>) was installed successfully` | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1) |
| `Uninstalled <app>` | `'<app>' was uninstalled` | [libexec/scoop-uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-uninstall.ps1) |
| `Downloaded <app> <version>` | `'<app>' (<version>) was downloaded successfully` | [libexec/scoop-download.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-download.ps1) |
| `Scoop was updated successfully` | `Scoop was updated successfully` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `All apps are up to date` | `Latest versions for all apps are installed` | [libexec/scoop-update.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-update.ps1) |
| `Everything is clean` | `Everything is shiny now` | [libexec/scoop-cleanup.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/libexec/scoop-cleanup.ps1) |
| `Scoop has been uninstalled` | `Scoop has been uninstalled` | [bin/uninstall.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/bin/uninstall.ps1) |

---

## Findings

Structured notes attached to the operation via
`InterpreterEvent::Finding`. Surfaced as an info panel.

| Code | Source pattern | Source |
| --- | --- | --- |
| `scoop.notes` | `Notes` followed by a block, terminated by a blank line or process exit | [lib/install.ps1](https://github.com/ScoopInstaller/Scoop/blob/master/lib/install.ps1) |

---

## Fallback Behavior

When no rule matches but the process still fails, the interpreter
synthesizes a diagnostic from the best signal it has. This keeps the UI
informative for novel Scoop output without trying to catalogue every
line upstream can print.

- **No duplicate `KnownError` on exit.** If any rule emitted a
  `KnownError`, the on-exit fallback path is skipped.
- **First-`failed` fallback.** Unclassified lines containing `failed`
  are buffered, first mention wins. On non-zero exit, this becomes the
  `scoop.command_error` message.
- **Last-stderr fallback.** If no `failed` line was buffered, the most
  recent stderr line is used as the fallback message on non-zero exit.
- **No fallback on clean exit.** Stderr chatter on a successful run
  never becomes a `KnownError`.
- **Phase cleanup on exit.** Any open phase is closed via `ExitPhase`,
  and its end fraction is emitted if the phase has a range.
- **Notes flush on exit.** If the process exits mid-`Notes` block, the
  buffered lines flush as `Finding::info("scoop.notes", ...)`.
