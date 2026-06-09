### Release Notes 1.9.5

  #### Feature

- Added hidden `shell.pwshEnabled` support to run Scoop commands through PowerShell 7+ (`pwsh`) instead of Windows
  PowerShell 5.x. Enable it by adding `"shell.pwshEnabled": true` to `%APPDATA%\com.rscoop.app\store.json`. Thanks
  @hetima for [PR #55](https://github.com/AmarBego/Rscoop/pull/55).

- Added a PowerShell setup script export from the profile exporter, so users can bootstrap buckets, apps, holds, and Scoop config on another machine.
