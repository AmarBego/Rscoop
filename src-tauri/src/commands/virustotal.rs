//! VirusTotal scan runner. Scans are normal Execra jobs with a small
//! interpreter that maps scoop-virustotal's documented exit codes into the
//! shared Outcome shape.

use crate::commands::scoop::{run_operation, scoop_cmd};
use execra::{
    Context, ExitCode, FailureReason, Finding, Interpreter, InterpreterEvent, Line, Outcome,
};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanWarning {
    pub detections_found: bool,
    pub is_api_key_missing: bool,
    pub message: String,
}

pub struct VirusTotalInterpreter;

impl Interpreter for VirusTotalInterpreter {
    fn on_line(&mut self, _ctx: &Context, _line: &Line) -> Vec<InterpreterEvent> {
        vec![]
    }

    fn on_exit(&mut self, _ctx: &Context, exit: &ExitCode) -> Vec<InterpreterEvent> {
        match exit.code {
            Some(0) => vec![InterpreterEvent::Summary {
                text: "No VirusTotal detections".to_string(),
            }],
            Some(1) | Some(2) => vec![InterpreterEvent::Finding {
                finding: Finding::warning(
                    "vt.detections_found",
                    "VirusTotal found one or more detections or warnings.",
                ),
            }],
            Some(16) => vec![InterpreterEvent::KnownError {
                code: "vt.api_key_missing".to_string(),
                message: "VirusTotal API key is not configured.".to_string(),
            }],
            _ => vec![],
        }
    }
}

pub async fn run_scan(
    app: AppHandle,
    package_name: &str,
    bucket: Option<&str>,
) -> Result<Outcome, String> {
    let target = match bucket {
        Some(b) => format!("{}/{}", b, package_name),
        None => package_name.to_string(),
    };

    let cmd = scoop_cmd(app.clone(), ["virustotal".to_string(), target]);
    run_operation(
        app,
        cmd.label(format!("Scanning {} with VirusTotal", package_name))
            .interpreter(VirusTotalInterpreter),
    )
    .await
}

pub fn scan_warning(outcome: &Outcome) -> Option<ScanWarning> {
    if outcome.is_success() {
        return None;
    }

    let code = nonzero_exit_code(outcome);
    if code == Some(1) || code == Some(2) {
        return Some(ScanWarning {
            detections_found: true,
            is_api_key_missing: false,
            message: "VirusTotal found one or more detections or warnings.".to_string(),
        });
    }

    if known_error_code(outcome, "vt.api_key_missing") || code == Some(16) {
        return Some(ScanWarning {
            detections_found: false,
            is_api_key_missing: true,
            message: "VirusTotal API key is not configured.".to_string(),
        });
    }

    Some(ScanWarning {
        detections_found: true,
        is_api_key_missing: false,
        message: format!(
            "Scan failed with an unexpected error ({}). Please check the output.",
            outcome.message()
        ),
    })
}

fn nonzero_exit_code(outcome: &Outcome) -> Option<i32> {
    match outcome {
        Outcome::Failed {
            reason: FailureReason::NonZeroExit { code },
            ..
        } => Some(*code),
        _ => None,
    }
}

fn known_error_code(outcome: &Outcome, expected: &str) -> bool {
    matches!(
        outcome,
        Outcome::Failed {
            reason: FailureReason::KnownError { code, .. },
            ..
        } if code == expected
    )
}
