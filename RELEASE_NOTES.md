# Version 1.1.1

This release introduces key improvements to data handling and the user interface, focusing on reliability and a smoother user experience.

✨ **Features & Improvements**

*   **Enhanced Search Experience**: The search functionality on the "Installed" page has been significantly improved.
    *   An active search will no longer be dismissed when clicking on package names, context menus, or modals.
    *   Fixed a bug where the search filter was not applied to the list view.
    *   Corrected UI issues with the context menu in list view to prevent overflow and scrolling problems.

*   **Improved Data Integrity**: To ensure data is always fresh, cache invalidation has been added for installed packages and manifests. This triggers after an install or uninstall operation, preventing stale data.

*   **Smoother App Initialization**: The core application event handling for startup has been refactored for a more robust and smooth initialization process.