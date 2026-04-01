### Release Notes 1.5.1

#### UI Overhaul
- **Settings pages tightened up across the board.** Inputs are smaller, alert boxes replaced with inline text, save buttons show "Saved" briefly instead of toast notifications. Consistent sizing and spacing everywhere.
- **VirusTotal settings**: API key input has a show/hide toggle, enters to save, no more label above the input.
- **Scoop Configuration**: same input treatment, removed the bulky alert boxes.
- **Held Packages**: shorter title, quieter empty state, tighter list rows.
- **Auto Cleanup**: replaced the full-width range slider with a compact +/- stepper for versions to keep. Sub-settings are flat rows instead of nested cards.
- **Bucket Auto Update**: replaced the three full-width radio cards with a segmented button group (Off / 24h / 7d / Custom). Custom interval is a single inline row. Auto-update packages toggle pulled into the same card.
- **About page**: tagline rewritten, update check is now a centered ghost button instead of a bordered card, link buttons (GitHub, Docs, Star) are small ghost buttons instead of loud outlined ones.

#### Doctor Page
- **System Cleanup**: buttons are outlined and smaller, not big colored blocks.
- **Cache Manager**: "Remove Selected" only appears when something is selected, action buttons are ghost-styled, filter input sized down, empty state is a one-liner.
- **Shim Manager**: same treatment — Add Shim button is ghost, filter input matches, empty state simplified.

#### Buckets Page
- **Bucket cards**: whole card is clickable (removed separate View button), git URL removed from cards, branch shown as plain text, Update button on the same line as the date.
- **Bucket updates don't flicker anymore**: refreshes after update are silent — no "Loading buckets..." spinner. The RefreshCw icon spins on the card being updated.
- **Green flash on new manifests**: after an update, cards that got new packages show a faint green overlay that waits until you scroll to it, then fades out.
- **Search result cards**: whole card clickable for details, Install/Remove buttons moved to the stats row (small, right-aligned), removed the date, removed the separate Details button.
- **Community buckets modal**: cut in half — one paragraph, two filter rows, smaller modal. Removed the redundant Note callout and stats box.
- **Grid header**: "Add Custom Bucket" → "Add Bucket", "Update All Git Buckets" → "Update All", both ghost-styled.

#### Debug Modal
- **Log viewer syntax coloring**: log lines are now color-coded by level (ERROR=red, WARN=yellow, INFO=green, DEBUG=blue, TRACE=gray, markers=purple). Auto-scrolls to bottom.
- **Fingerprint display**: the wall of `name:timestamp;` text is now rendered as individual pills with the app name in accent blue and timestamps dimmed.

#### Manifest Modal
- Code block fills the modal without causing double scrollbars.

#### Documentation
- Rewrote all 13 docs pages. Fixed wrong log paths, command names, settings references.
- Added custom CSS to the docs site (amber accents, tighter spacing, styled tables/blockquotes).
- Updated copyright to 2025-2026.
