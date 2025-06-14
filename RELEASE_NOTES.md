### Release Notes

#### 🚀 Features

* **Scoop-Aware Updates:** Added intelligence to detect when rScoop is installed via Scoop and disable the built-in updater:
  * Automatically detects installation source at startup
  * Disables update notifications when installed through Scoop
  * Shows helpful guidance to use `scoop update rscoop` instead
  * Prevents update conflicts between Scoop and the built-in updater

#### ✨ Improvements

* **Smarter Update System:** Enhanced the update system to conditionally load only when appropriate:
  * The updater plugin is no longer loaded when running under Scoop
  * Improved startup performance for Scoop installations

#### 🐛 Bug Fixes

* **NONE**