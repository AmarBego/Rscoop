# Installer theming assets

BMP files used by the WiX (MSI) and NSIS installer wizards. Paths are
referenced from `tauri.conf.json` under `bundle.windows.{wix,nsis}`.

**Format matters.** Both WiX's `light.exe` and NSIS's MUI require
**24-bit uncompressed BMP** (Windows 3.x, no alpha). PNG is *not* accepted —
NSIS emits `warning 5040: Unsupported format` and falls back to defaults.
If you replace any of these files, keep the extension `.bmp` and make sure
ImageMagick is invoked with `-alpha off -type TrueColor BMP3:...`.

## Files

| File | Size | Where it's shown |
|---|---|---|
| `wix-banner.bmp` | 493 × 58 | Top strip on every MSI wizard page (except Welcome/Finish) |
| `wix-dialog.bmp` | 493 × 312 | Background of the MSI Welcome & Finish dialogs. The right ~60% gets Setup text overlaid by Windows, so keep that side subtle |
| `nsis-header.bmp` | 150 × 57 | Top strip on NSIS dialogs (smaller version of the WiX banner) |
| `nsis-sidebar.bmp` | 164 × 314 | Left panel on the NSIS Welcome & Finish dialogs |

## Current design

**Constraint:** WiX and NSIS both overlay page titles and body text on top
of these images in **black**, and recoloring that text requires bundling a
custom WixUI fragment (not worth it). So the art is designed around that:
wherever text lands, the background is white.

- **Banners/header** (`wix-banner`, `nsis-header`): white field so the
  overlaid page title is readable. The app icon lives at the far right
  where no title fits. Thin orange (`#d14a2e`) accent along the bottom.
- **WiX dialog** (Welcome/Finish): navy-to-white horizontal gradient. Left
  ~18% is solid navy (`#142434`) and holds a small icon + orange "rScoop"
  wordmark; the gradient blends over ~22%, and the rest is white so the
  black title/body text that Windows overlays on the right half stays
  legible.
- **NSIS sidebar**: fully dark art (navy gradient, icon + wordmark, orange
  bottom accent). NSIS renders the Welcome/Finish text *outside* this
  image, so it can stay dark without readability issues.

## Regenerating with ImageMagick

Run from the repo root. Requires ImageMagick 7+ on `PATH`.

```bash
# wix-banner (493×58) — white field, icon far right, orange bottom accent
magick -size 493x58 xc:'#ffffff' \
  \( -size 493x3 xc:'#d14a2e' \) -gravity South -composite \
  \( src-tauri/icons/icon.png -resize 42x42 \) -gravity East -geometry +10+0 -composite \
  -alpha off -depth 8 -type TrueColor \
  BMP3:src-tauri/windows/installer-assets/wix-banner.bmp

# nsis-header (150×57) — same style, smaller
magick -size 150x57 xc:'#ffffff' \
  \( -size 150x2 xc:'#d14a2e' \) -gravity South -composite \
  \( src-tauri/icons/icon.png -resize 40x40 \) -gravity East -geometry +6+0 -composite \
  -alpha off -depth 8 -type TrueColor \
  BMP3:src-tauri/windows/installer-assets/nsis-header.bmp

# wix-dialog (493×312) — navy column on left (icon + wordmark), gradient to
# white for the black text WiX overlays on the right half.
# Layout: 0–90px solid navy, 90–200px gradient, 200–493px pure white.
magick -size 493x312 xc:'#ffffff' \
  \( -size 312x110 gradient:'#142434-#ffffff' -rotate -90 \) -gravity NorthWest -geometry +90+0 -composite \
  \( -size 90x312 xc:'#142434' \) -gravity NorthWest -geometry +0+0 -composite \
  \( src-tauri/icons/icon.png -resize 56x56 \) -gravity NorthWest -geometry +17+75 -composite \
  -font Arial-Bold -pointsize 18 -fill '#d14a2e' -gravity NorthWest -annotate +10+155 "rScoop" \
  -alpha off -depth 8 -type TrueColor \
  BMP3:src-tauri/windows/installer-assets/wix-dialog.bmp

# nsis-sidebar (164×314) — full dark art panel; NSIS doesn't overlay text on it
magick -size 164x314 gradient:'#1a2d42-#0a1420' \
  \( src-tauri/icons/icon.png -resize 110x110 \) -gravity North -geometry +0+40 -composite \
  -font Arial-Bold -pointsize 22 -fill '#ffffff' -gravity North -annotate +0+170 "rScoop" \
  \( -size 164x3 xc:'#d14a2e' \) -gravity South -composite \
  -alpha off -depth 8 -type TrueColor \
  BMP3:src-tauri/windows/installer-assets/nsis-sidebar.bmp
```

## Preview without rebuilding the installer

BMPs aren't convenient to eyeball on Windows — convert to PNG first:

```bash
magick src-tauri/windows/installer-assets/wix-dialog.bmp /tmp/preview.png
```

## If you want to redesign

- The right ~65% of `wix-dialog` and the left ~75% of `wix-banner` get
  **black** page text overlaid by Windows. Those regions must be light
  (ideally pure white) for the text to be legible. Recoloring the overlay
  text to white is possible but requires shipping a custom WixUI fragment,
  which defeats the point of Tauri's default bundling.
- NSIS header has the same overlaid-text problem as the WiX banner.
- NSIS sidebar has no text overlay, so it can be fully dark art.
- Avoid transparency and RGBA — MUI treats alpha inconsistently. Export
  flat 24-bit BMP (`-alpha off -type TrueColor BMP3:...` in ImageMagick).
