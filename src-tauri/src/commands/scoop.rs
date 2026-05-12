use execra::tauri::ExecraExt;
use execra::{Context, ExitCode, Interpreter, InterpreterEvent, Line, Outcome};
use tauri::AppHandle;

use crate::operations;

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn scoop_cmd<I, S>(args: I) -> execra::Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args = args
        .into_iter()
        .map(|arg| ps_quote(arg.as_ref()))
        .collect::<Vec<_>>()
        .join(" ");
    let inner = format!(
        "Import-Module Microsoft.PowerShell.Utility -EA SilentlyContinue; scoop {} 2>&1",
        args
    );
    execra::Command::new("powershell")
        .args(["-NoLogo", "-NoProfile", "-Command", &inner])
        .tags(["scoop".to_string()])
}

#[derive(Default)]
pub struct ScoopInterpreter {
    last_error: Option<String>,
}

impl Interpreter for ScoopInterpreter {
    fn on_line(&mut self, _ctx: &Context, line: &Line) -> Vec<InterpreterEvent> {
        let lower = line.text.to_lowercase();
        if lower.contains("completed successfully") || lower.contains("was uninstalled") {
            return vec![];
        }
        if lower.contains("error") || lower.contains("failed") {
            self.last_error = Some(line.text.clone());
            return vec![InterpreterEvent::KnownError {
                code: "scoop.command_error".into(),
                message: line.text.clone(),
            }];
        }
        if lower.contains("downloading") {
            return vec![InterpreterEvent::Progress {
                progress: execra::Progress::indeterminate("downloading"),
            }];
        }
        if lower.contains("extracting") {
            return vec![InterpreterEvent::Progress {
                progress: execra::Progress::indeterminate("extracting"),
            }];
        }
        vec![]
    }

    fn on_exit(&mut self, _ctx: &Context, exit: &ExitCode) -> Vec<InterpreterEvent> {
        if exit.is_success() {
            return vec![];
        }
        self.last_error
            .take()
            .map(|message| {
                vec![InterpreterEvent::KnownError {
                    code: "scoop.command_error".into(),
                    message,
                }]
            })
            .unwrap_or_default()
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
/// awaiting the outcome.
pub async fn run_operation(app: AppHandle, command: execra::Command) -> Result<Outcome, String> {
    let outcome = app
        .execra()
        .task(command)
        .on_created(|app, job| operations::set_current_job(app, Some(job)))
        .on_output(|app, stream, line| {
            operations::append_output(app, line.to_string(), stream.as_str());
        })
        .on_interpreter_error(|_app, interpreter, error, line| {
            log::warn!(
                "Execra interpreter error in {}: {} ({:?})",
                interpreter,
                error,
                line
            );
        })
        .on_finalized(|app, _outcome| operations::set_current_job(app, None))
        .await;
    Ok(outcome)
}

pub async fn execute_scoop_outcome(
    app: AppHandle,
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<Outcome, String> {
    let args = build_scoop_args(op, package, bucket)?;
    let label = operation_name(op, package)?;
    run_operation(
        app,
        scoop_cmd(args)
            .label(label)
            .interpreter(ScoopInterpreter::default()),
    )
    .await
}

/// Run a scoop operation, mapping outcome to a flat Result.
pub async fn execute_scoop(
    app: AppHandle,
    op: ScoopOp,
    package: Option<&str>,
    bucket: Option<&str>,
) -> Result<(), String> {
    let label = operation_name(op, package)?;
    let outcome = execute_scoop_outcome(app, op, package, bucket).await?;
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
    run_operation(
        app,
        scoop_cmd(args)
            .label(label.into())
            .interpreter(ScoopInterpreter::default()),
    )
    .await
}
