### Release Notes 1.4.5

#### New Features
- **Native MSI Launch Fix**: Rscoop now automatically detects if it was launched in a restricted MSI context (common after fresh installs) and seamlessly relaunches itself with correct permissions and working directory. The "MSI Launch Notice" screen has been removed.
- **Enhanced Manifest Viewer**: The manifest viewer now features improved syntax highlighting (Atom One Dark), a copy-to-clipboard button, and a cleaner UI.

#### Improvements
- **Massive Backend Refactor**:
  - **Non-blocking Operations**: Heavy tasks like searching, status checks, and updates now run in non-blocking threads, keeping the UI responsive even during intensive operations.
  - **Modular Architecture**: Scheduler logic moved to a dedicated module; cleaner separation of concerns across commands.
  - **Robust Junction Handling**: The linker now uses multiple strategies (std fs, cmd, PowerShell) to reliably remove and create junctions, fixing issues with version switching.
- **State Management**: Package info modals now automatically update their state after operations (install/uninstall/update) without needing to close and reopen.
- **Performance**: Optimized file system scanning and modification time checks.
- **Packages without Buckets**: Packages without buckets display normally and warn the User the bucket is missing
- **Moved `View Manifest` Button**: Moved to the Modal itself for ease of access for power-users
- **Slight theming and consistency Improvements**: To unify it better text and colors have been slightly adjusted

#### Bug Fixes
- **Versioned Installs**: Fixed issues where `install.json` was missing or unreadable for versioned package installs.
- **Bucket Manifests**: Improved logic for locating and counting manifests within buckets, supporting both flat and nested structures.
- **Auto-Cleanup**: Ensure auto-cleanup is reliably triggered after uninstalling packages or clearing cache.
- **Search**: Fixed JSON parsing for `bin` fields in manifests to correctly identify binary matches.

#### Next Version
- **Light Mode**: Next version will include a light theme
- **Accent Colors**: Selectable accent colors
- **Got any ideas?**: Open an issue! 