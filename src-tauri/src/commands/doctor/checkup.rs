use serde::Serialize;
use crate::commands::powershell;

#[derive(Serialize, Debug, Clone)]
pub struct CheckupItem {
    pub status: bool, // true for success (✅), false for failure (❌)
    pub text: String,
    pub suggestion: Option<String>,
}

#[tauri::command]
pub async fn run_sfsu_checkup() -> Result<Vec<CheckupItem>, String> {
    log::info!("Running sfsu checkup");
    let output = powershell::execute_command("sfsu checkup").await.map_err(|e| e.to_string())?;

    // sfsu checkup can return a non-zero exit code if checks fail,
    // but we still want to parse the stdout. We'll only error out if stdout is empty.
    if !output.status.success() && output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        log::error!("sfsu checkup command failed: {}", stderr);
        return Err(format!("sfsu checkup failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut items: Vec<CheckupItem> = vec![];
    let mut lines = stdout.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() {
            continue;
        }

        let (status, text) = if let Some(text) = trimmed_line.strip_prefix('✅') {
            (true, text.trim().to_string())
        } else if let Some(text) = trimmed_line.strip_prefix('❌') {
            (false, text.trim().to_string())
        } else {
            // This isn't a checkup line, so we skip it.
            continue;
        };

        // The suggestion line is indented on the next line.
        let suggestion = if let Some(next_line) = lines.peek() {
            if next_line.starts_with("  ") || next_line.starts_with('\t') {
                // Consume the line since we're using it
                lines.next().map(|s| s.trim().to_string())
            } else {
                None
            }
        } else {
            None
        };
        
        items.push(CheckupItem {
            status,
            text,
            suggestion,
        });
    }

    Ok(items)
} 