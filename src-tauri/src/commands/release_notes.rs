//! Exposes the bundled RELEASE_NOTES.md contents, parsed into per-version
//! sections. The frontend uses this to render a "What's new" modal after
//! an update.

const RELEASE_NOTES: &str = include_str!("../../../RELEASE_NOTES.md");

/// Returns the body (markdown) of the section for the given version, without
/// the `### Release Notes X.Y.Z` heading. `None` if no matching section.
#[tauri::command]
pub fn get_release_notes(version: String) -> Option<String> {
    let target = format!("### Release Notes {}", version.trim());
    let mut in_section = false;
    let mut out = String::new();

    for line in RELEASE_NOTES.lines() {
        if line.starts_with("### Release Notes ") {
            if in_section {
                break; // next version's section starts — stop
            }
            in_section = line.starts_with(&target);
            continue;
        }
        if in_section {
            out.push_str(line);
            out.push('\n');
        }
    }

    let trimmed = out.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}
