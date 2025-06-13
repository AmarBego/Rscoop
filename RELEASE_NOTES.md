### Release Notes

#### 🐛 Bug Fixes

*   **Fixed VirusTotal API Key Integration:** The VirusTotal API key is now correctly saved to Scoop's `config.json` file (located at `%USERPROFILE%\.config\scoop\config.json`). Previously, it was being saved to the wrong location, which prevented the feature from working. The settings page now properly reads and writes the key to the correct file, making the VirusTotal integration fully functional.