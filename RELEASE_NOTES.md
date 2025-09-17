### Release Notes

#### 🚀 Features

* **Complete Bucket Management System**
    - Full bucket support with install, remove, and browse functionality
    - Browse and search through all available Scoop buckets
    - Install/remove buckets directly from the UI
    - View bucket manifests and package details
    - Search within specific buckets for packages

* **Expanded Bucket Search**
    - Search through thousands of community buckets beyond the default verified ones
    - Intelligent caching system that downloads ~14MB of bucket data and stores as optimized ~0.3-3MB cache
    - Lightning-fast offline search after initial download
    - Advanced filtering options (minimum stars, disable Chinese buckets, etc.)
    - Automatic persistence of expanded search settings across sessions

* **Enhanced Package Discovery**
    - Seamless integration between bucket browsing and package installation
    - Direct package installation from bucket views
    - Real-time installation state updates across all views
    - Improved package information modals with better navigation

#### ✨ Improvements

* **Workflow Enhancements**
    - Smooth search experience with proper input focus management
    - Debounced search with intelligent sorting (relevance vs stars)
    - Consistent state management across page navigation
    - Real-time updates when packages are installed/removed

* **User Interface Polish**
    - Better modal transitions and interactions
    - Improved responsive design for bucket and search interfaces
    - Enhanced loading states and error handling
    - Cleaner package and bucket card designs

* **Removed Update Detection native dialog popup**
    - Now only shows in the banner update notification and on manual check for updates
    - Removed unnecessary Notification toast inside Rscoop when closing the window

* **Tray workflow fixes**
    - Displays more information
    - Native dialog
    - Rust parsing Scoop Apps using LNK Crate for efficiency and no shell dependency

* **Minor text improvements**
#### 🐛 Bug Fixes

* **Fixed being able to open multiple instances**
* **Fixed weird transitions in package modals**
