use execra::tauri::ExecraExt;
use execra::Outcome;
use tauri::AppHandle;

use crate::commands::scoop_interpreter::{is_creep_phase, phase_range, scoop_interpreter};
use crate::commands::settings::is_pwsh_enabled;
use crate::operations::{self, OperationWarning};

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

const UTF8_OUTPUT_PREAMBLE: &str =
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);";

pub fn scoop_cmd<I, S>(app: AppHandle, args: I) -> execra::Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args = args
        .into_iter()
        .map(|arg| ps_quote(arg.as_ref()))
        .collect::<Vec<_>>()
        .join(" ");
    // Execra decodes process pipes as UTF-8. PowerShell can otherwise write
    // redirected output using the active console code page, which corrupts
    // localized Scoop output (for example, GBK on a Chinese system).
    let inner = format!(
        "{} Import-Module Microsoft.PowerShell.Utility -EA SilentlyContinue; scoop {}",
        UTF8_OUTPUT_PREAMBLE, args
    );
    if is_pwsh_enabled(app) {
        execra::Command::pwsh(inner).tags(["scoop".to_string()])
    } else {
        execra::Command::powershell(inner).tags(["scoop".to_string()])
    }
}

/// Supported Scoop operations.
#[derive(Debug, Clone, Copy)]
pub enum ScoopOp {
    Install,
    Uninstall,
    Update,
    ClearCache,
    UpdateAll,
}

fn build_scoop_args(
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<Vec<String>, String> {
    match op {
        ScoopOp::Install => {
            let pkg = package.ok_or("A package name is required to install.")?;
            let target = match bucket {
                Some(b) => format!("{}/{}", b, pkg),
                None => pkg.to_string(),
            };
            Ok(vec!["install".into(), target])
        }
        ScoopOp::Uninstall => {
            let pkg = package.ok_or("A package name is required to uninstall.")?;
            Ok(vec!["uninstall".into(), pkg.into()])
        }
        ScoopOp::Update => {
            let pkg = package.ok_or("A package name is required to update.")?;
            Ok(vec!["update".into(), pkg.into()])
        }
        ScoopOp::ClearCache => {
            let pkg = package.ok_or("A package name is required to clear the cache.")?;
            Ok(vec!["cache".into(), "rm".into(), pkg.into()])
        }
        ScoopOp::UpdateAll => Ok(vec!["update".into(), "*".into()]),
    }
}

fn operation_name(op: ScoopOp, package: Option<&str>) -> Result<String, String> {
    match (op, package) {
        (ScoopOp::Install, Some(pkg)) => Ok(format!("Installing {}", pkg)),
        (ScoopOp::Uninstall, Some(pkg)) => Ok(format!("Uninstalling {}", pkg)),
        (ScoopOp::Update, Some(pkg)) => Ok(format!("Updating {}", pkg)),
        (ScoopOp::ClearCache, Some(pkg)) => Ok(format!("Clearing cache for {}", pkg)),
        (ScoopOp::UpdateAll, _) => Ok("Updating all packages".into()),
        _ => Err("Invalid operation or missing package name.".into()),
    }
}

/// Spawn a scoop command and stream its output through `OperationManager`,
/// awaiting the outcome. Interpreter-emitted semantic events (warnings,
/// known errors, summary) are routed into the operation state via
/// `.observe(...)` so the frontend renders status from semantics rather than
/// from per-line coloring.
pub async fn run_operation(app: AppHandle, command: execra::Command) -> Result<Outcome, String> {
    let outcome = app
        .execra()
        .task(command)
        // Phases with no determinate signal of their own creep toward
        // their slice end so the bar shows motion. Phases with a real
        // signal (download → byte progress) return `None` so the ticker
        // stays out of the way.
        .creep(|name| {
            if is_creep_phase(name) {
                phase_range(name)
            } else {
                None
            }
        })
        .on_created(|app, job| operations::set_current_job(app, Some(job)))
        .on_output(|app, stream, line| {
            operations::append_output(app, line.to_string(), stream.as_str());
        })
        .observe(|app, event| match event {
            execra::Event::WarningDetected { code, message, .. } => {
                operations::push_operation_warning(
                    app,
                    OperationWarning {
                        code: code.clone().unwrap_or_else(|| "interpreter.warning".into()),
                        message: message.clone(),
                    },
                );
            }
            execra::Event::KnownErrorDetected { message, .. } => {
                operations::set_known_error(app, message.clone());
            }
            execra::Event::ProgressUpdated { progress, .. } => match progress {
                execra::Progress::Indeterminate { hint: Some(hint) } => {
                    operations::set_current_phase(app, Some(hint.clone()));
                    // Indeterminate hints don't speak to overall fill —
                    // the phase pipeline drives that. Leave the bar
                    // wherever the last determinate signal left it.
                }
                execra::Progress::Determinate(_) => {
                    operations::set_progress_fraction(app, progress.as_fraction());
                }
                _ => {}
            },
            execra::Event::PhaseEntered { label, name, .. } => {
                // The interpreter has already emitted a boundary
                // Progress(start-of-this-phase) event right after this
                // PhaseEntered, so we deliberately don't clear the
                // fraction here — that would cause a 0%→start flicker.
                // The creep ticker is driven by `TaskBuilder::creep`
                // (it emits synthetic ProgressUpdated handled above), so
                // there's nothing phase-specific to do here beyond the
                // breadcrumb.
                operations::push_phase(app, label.clone().unwrap_or_else(|| name.clone()));
            }
            execra::Event::PhaseUpdated { label, .. } => {
                operations::update_top_phase(app, label.clone());
            }
            execra::Event::PhaseExited { .. } => {
                // Same reasoning: a Progress(end-of-prev-phase) event
                // precedes this in the stream. Execra's creep ticker
                // self-cancels on PhaseExited.
                operations::pop_phase(app);
            }
            execra::Event::FindingEmitted { finding, .. } => {
                operations::push_finding(app, finding.clone());
            }
            _ => {}
        })
        .on_interpreter_error(|_app, interpreter, error, line| {
            log::warn!(
                "Execra interpreter error in {}: {} ({:?})",
                interpreter,
                error,
                line
            );
        })
        .on_finalized(|app, outcome| {
            if let Some(summary) = outcome_summary(outcome) {
                operations::set_summary(app, summary);
            }
            // Op is done — drop the live phase indicator + progress bar.
            // (Execra's creep ticker self-cancels on Finalized.)
            operations::set_current_phase(app, None);
            operations::set_progress_fraction(app, None);
            operations::set_current_job(app, None);
        })
        .await;
    Ok(outcome)
}

fn outcome_summary(outcome: &Outcome) -> Option<String> {
    match outcome {
        Outcome::Succeeded { summary, .. } | Outcome::Failed { summary, .. } => summary.clone(),
        Outcome::Cancelled { .. } => None,
    }
}

async fn execute_scoop_labeled_outcome(
    app: AppHandle,
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<(Outcome, String), String> {
    let args = build_scoop_args(op, package, bucket)?;
    let label = operation_name(op, package)?;
    let cmd = scoop_cmd(app.clone(), args)
        .label(label.clone())
        .interpreter(scoop_interpreter());
    let outcome = run_operation(app, cmd).await?;
    Ok((outcome, label))
}

pub async fn execute_scoop_outcome(
    app: AppHandle,
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<Outcome, String> {
    execute_scoop_labeled_outcome(app, op, package, bucket)
        .await
        .map(|(outcome, _)| outcome)
}

/// Run a scoop operation, mapping outcome to a flat Result.
pub async fn execute_scoop(
    app: AppHandle,
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<(), String> {
    let (outcome, label) = execute_scoop_labeled_outcome(app, op, package, bucket).await?;
    if outcome.is_success() {
        Ok(())
    } else {
        Err(format!("{} failed: {}", label, outcome.message()))
    }
}

pub async fn run_scoop_operation(
    app: AppHandle,
    args: Vec<String>,
    label: impl Into<String>,
) -> Result<Outcome, String> {
    let cmd = scoop_cmd(app.clone(), args)
        .label(label.into())
        .interpreter(scoop_interpreter());
    run_operation(app, cmd).await
}
