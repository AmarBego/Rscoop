### Release Notes

#### Added
- **MSI Installation Support**: The app now detects when you install via the Windows .msi installer and shows a helpful notice with simple instructions to relaunch for full functionality.
- **Proper App Close**: Fixed the app close button to work reliably.

#### Improved
- **Cleaner Logging**: Simplified backend logging for easier troubleshooting.
- **Faster Startup**: Optimized the cold-start initialization process.
- **Better User Experience**: App no longer attempts to run in a limited state—just ask you to restart, which takes about a second.

#### Fixed
- **MSI Installation Issue**: When you install Rscoop via the .msi installer, Windows temporarily runs it in a restricted mode. The app now detects this and politely asks you to close and reopen it from the Start Menu for normal functionality.

#### Documentation
- Updated guides to reflect the improved .msi installation experience.
- Cleaned up outdated notes about restart requirements.
