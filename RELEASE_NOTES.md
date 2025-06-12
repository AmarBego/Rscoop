# What's New

This release focuses on a major internal refactoring to improve performance, reduce log spam, and modernize the application's core architecture. While many of these changes are under the hood, they result in a faster and more reliable experience.

✨ Features & Improvements

Centralized State Management: Introduced a shared AppState to manage the Scoop path and cache installed packages. This eliminates redundant filesystem lookups and improves overall performance.

Faster Commands: The installed, hold, and updates commands have been refactored to use the new shared state, making them significantly faster and more efficient. 

Reduced Log Spam: By caching data and removing redundant operations, we've cleaned up the application logs, making it easier to debug and monitor.

Improved Cold Start: The application now warms the manifest cache during the cold start process, ensuring that the first search is faster and more responsive.

Modernized Architecture: The state initialization now uses the .setup() hook, aligning with the latest Tauri best practices and making the codebase cleaner and more maintainable.

These changes lay the groundwork for future features and ensure that Rscoop remains fast and reliable as it grows.