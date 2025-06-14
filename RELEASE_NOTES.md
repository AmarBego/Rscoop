### Release Notes

#### 🚀 Features

*   **Update Checking:** Implemented a new "About" section in the settings page with robust update functionality powered by Tauri's updater. This includes:
    *   Automatic, silent update checks when opening the settings page.
    *   Manual update checks with user feedback.
    *   Update notifications with release notes.
    *   Download progress tracking for updates.

#### ✨ Improvements

*   **Settings Page Refactor:** The settings page has been broken down into smaller, more manageable components for better organization and maintainability.
*   **Shared Operation Hooks:** Centralized package operations (like install, uninstall, update) into shared `usePackageOperations` and `usePackageInfo` hooks. This reduces code duplication and improves consistency across the application.

#### 🐛 Bug Fixes

*   **NONE**