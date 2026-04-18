//! Icon extraction + caching for Scoop apps.
//!
//! We extract the small (16x16) icon from each app's target `.exe` or `.lnk`
//! via Win32 `ExtractIconExW`, convert the HICON into RGBA pixels, and cache
//! the result keyed by target path. The cache lives for the lifetime of the
//! process — `refresh_tray_apps_menu` clears it so users can force a rebuild
//! when the underlying binaries change.

use std::collections::HashMap;
use std::sync::Mutex;

/// A cached icon, ready to be fed either to a Tauri menu item (raw RGBA) or
/// to the webview (PNG bytes, base64-encoded inline as a data URL).
#[derive(Clone)]
pub struct CachedIcon {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub data_url: String,
}

pub struct IconCache {
    inner: Mutex<HashMap<String, Option<CachedIcon>>>,
}

impl IconCache {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }

    /// Lookup-or-extract. Returns None if extraction fails (e.g. target is
    /// missing or the exe has no embedded icon). Failures are cached as
    /// `None` so we don't re-attempt every tray build.
    pub fn get_or_extract(&self, target_path: &str) -> Option<CachedIcon> {
        {
            let cache = self.inner.lock().unwrap();
            if let Some(entry) = cache.get(target_path) {
                return entry.clone();
            }
        }

        let extracted = extract_icon(target_path);
        let mut cache = self.inner.lock().unwrap();
        cache.insert(target_path.to_string(), extracted.clone());
        extracted
    }

    pub fn clear(&self) {
        self.inner.lock().unwrap().clear();
    }
}

impl Default for IconCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
fn extract_icon(target_path: &str) -> Option<CachedIcon> {
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
    };
    use windows_sys::Win32::UI::Shell::ExtractIconExW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

    // Convert to wide string for Win32
    let wide: Vec<u16> = target_path.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        // Extract both large (~32x32) and small (~16x16) icons. We prefer
        // large for display quality (the settings UI shows 26px, the tray
        // menu accepts arbitrary sizes and lets the OS scale down).
        let mut large: HICON = std::ptr::null_mut();
        let mut small: HICON = std::ptr::null_mut();
        let extracted = ExtractIconExW(
            wide.as_ptr(),
            0,
            &mut large as *mut HICON,
            &mut small as *mut HICON,
            1,
        );
        if extracted == 0 {
            return None;
        }
        // Prefer the large icon; fall back to small if large wasn't provided.
        let chosen = if !large.is_null() { large } else { small };
        if chosen.is_null() {
            if !small.is_null() { DestroyIcon(small); }
            if !large.is_null() { DestroyIcon(large); }
            return None;
        }
        // Release the one we didn't pick.
        if chosen != small && !small.is_null() { DestroyIcon(small); }
        if chosen != large && !large.is_null() { DestroyIcon(large); }

        // Pull the color + mask bitmaps out of the HICON.
        let mut info: ICONINFO = std::mem::zeroed();
        if GetIconInfo(chosen, &mut info) == 0 {
            DestroyIcon(chosen);
            return None;
        }

        // Read the color bitmap dimensions.
        let mut bm: BITMAP = std::mem::zeroed();
        let bm_ok = GetObjectW(
            info.hbmColor as HGDIOBJ,
            size_of::<BITMAP>() as i32,
            &mut bm as *mut _ as *mut _,
        );
        if bm_ok == 0 {
            DeleteObject(info.hbmColor as HGDIOBJ);
            DeleteObject(info.hbmMask as HGDIOBJ);
            DestroyIcon(chosen);
            return None;
        }
        let width = bm.bmWidth as u32;
        let height = bm.bmHeight as u32;

        // GetDIBits reads in BGRA 32bpp top-down when biHeight is negative.
        let mut bi: BITMAPINFO = std::mem::zeroed();
        bi.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = width as i32;
        bi.bmiHeader.biHeight = -(height as i32);
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = BI_RGB as u32;

        let mut pixels: Vec<u8> = vec![0; (width * height * 4) as usize];
        let hdc = GetDC(std::ptr::null_mut() as HWND);
        let got = GetDIBits(
            hdc,
            info.hbmColor as HBITMAP,
            0,
            height,
            pixels.as_mut_ptr() as *mut _,
            &mut bi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(std::ptr::null_mut() as HWND, hdc);
        DeleteObject(info.hbmColor as HGDIOBJ);
        DeleteObject(info.hbmMask as HGDIOBJ);
        DestroyIcon(chosen);
        if got == 0 {
            return None;
        }

        // Some icons come back with alpha=0 everywhere (older icons, or where
        // the exe embeds an AND mask instead of per-pixel alpha). If every
        // alpha byte is zero, force fully opaque so the icon isn't invisible.
        let any_alpha = pixels.chunks_exact(4).any(|px| px[3] != 0);
        if !any_alpha {
            for px in pixels.chunks_exact_mut(4) {
                px[3] = 255;
            }
        }

        // Convert BGRA → RGBA
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
        }

        // Keep the OS-provided size — typically 32x32 for the "large" icon.
        // Tauri's menu accepts any size and the OS scales down to the menu
        // item height; the settings UI displays at 26-32px where a 32x32
        // source looks crisp.
        let data_url = encode_data_url(&pixels, width, height)?;

        Some(CachedIcon {
            rgba: pixels,
            width,
            height,
            data_url,
        })
    }
}

#[cfg(not(windows))]
fn extract_icon(_target_path: &str) -> Option<CachedIcon> {
    None
}

fn encode_data_url(rgba: &[u8], width: u32, height: u32) -> Option<String> {
    let mut png_bytes: Vec<u8> = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(format!(
        "data:image/png;base64,{}",
        base64_encode(&png_bytes)
    ))
}

/// Minimal base64 encoder — avoids pulling in another dep just for this.
fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | (data[i + 2] as u32);
        out.push(ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push(ALPHABET[((n >> 6) & 0x3F) as usize] as char);
        out.push(ALPHABET[(n & 0x3F) as usize] as char);
        i += 3;
    }
    let rem = data.len() - i;
    if rem == 1 {
        let n = (data[i] as u32) << 16;
        out.push(ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
        out.push(ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        out.push(ALPHABET[((n >> 6) & 0x3F) as usize] as char);
        out.push('=');
    }
    out
}
