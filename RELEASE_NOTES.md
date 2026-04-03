### Release Notes 1.6.1

#### Internationalization
- Full i18n support. Every user-facing string in the app goes through a translation system.
- German translation included out of the box.
- Language picker in Settings > Window & UI.
- Community translations via [Crowdin](https://crowdin.com/project/rscoop). No coding needed to contribute a translation.

#### Bug Fixes
- Fixed Scoop installation detection. The app now correctly detects whether it was installed via Scoop and disables the built-in updater accordingly. Previously this check was always false.
