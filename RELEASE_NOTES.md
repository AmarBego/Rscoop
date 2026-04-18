### Release Notes 1.7.0

Big quality-of-life release. The theme: rscoop does more for you when the window isn't even open.

#### Tray menu you can actually customize
- New Settings > Tray Menu tab. Pin your favorite Scoop apps to the top, hide the ones you never launch from the tray, and see a live preview of the result.
- Apps show their real icons pulled from the exe, so your tray reads like a proper launcher instead of a wall of text.
- Right-clicking the tray and hitting "Edit Tray Menu..." jumps you straight to that settings tab. Works even if rscoop is fully minimized.
- Full details: [#38](https://github.com/AmarBego/Rscoop/pull/38)

#### Operations keep running in the background
- Start an install or update, close the window, walk away. The UI tears down when you close to tray (freeing 100+ MB of WebView memory), but your install queue, current operation, and output history live in Rust now, so they survive the window going away. Queue up five installs, minimize, come back later and find them all done.
- Desktop notifications are new. When an operation finishes while rscoop isn't visible, Windows tells you. Toasts carry contextual action buttons: "Clear Cache" after uninstalls (when auto-clear is off), "Install Anyway" when a VirusTotal scan flags something. You can respond without reopening the app.
- If you have close-to-tray disabled and hit X while an install is running, you now get a confirmation dialog instead of silently killing the operation.
- Full details: [#37](https://github.com/AmarBego/Rscoop/pull/37)

#### Translations
- rscoop is now on Crowdin. If you use it in a non-English language and something reads awkwardly, you can fix it yourself at [crowdin.com/project/rscoop](https://crowdin.com/project/rscoop).
- Thanks to [@Kwensiu](https://github.com/Kwensiu), Simplified Chinese is newly available in the language picker.

### Release Notes 1.7.1

- Patch new version banner