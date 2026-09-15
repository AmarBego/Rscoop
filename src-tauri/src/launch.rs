//! Recover the desktop user's launch context after an installer starts Rscoop.

use std::env;
use std::ffi::OsString;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows::core::{Interface, BSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, IDispatch, IServiceProvider,
    CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{
    IShellBrowser, IShellDispatch2, IShellFolderViewDual, IShellWindows, SID_STopLevelBrowser,
    ShellWindows, CSIDL_DESKTOP, SVGIO_BACKGROUND, SWC_DESKTOP, SWFO_NEEDDISPATCH,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// Run before Tauri, its single-instance lock, or any background threads start.
/// Changing CWD or spawning a child directly retains the installer's environment
/// and token. Ask the existing desktop Explorer to launch us as the desktop user.
pub(crate) fn ensure_correct_cwd_and_launch() -> Result<(), String> {
    if cfg!(debug_assertions) || !crate::utils::is_cwd_mismatch() {
        return Ok(());
    }

    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or("Executable has no parent directory")?;
    let args = env::args_os().skip(1).collect::<Vec<_>>();

    match launch_from_explorer(&exe_path, &args, exe_dir, SW_SHOWNORMAL.0) {
        Ok(()) => std::process::exit(0),
        Err(error) => {
            // Keep the app usable if Explorer is unavailable, and report the
            // failed handoff once logging has started. Do not spawn another
            // child with the same broken installer context.
            let cwd_result = env::set_current_dir(exe_dir);
            Err(format!(
                "Could not relaunch through desktop Explorer: {error}; CWD fallback: {cwd_result:?}"
            ))
        }
    }
}

struct ComApartment;

impl Drop for ComApartment {
    fn drop(&mut self) {
        // All COM interfaces below are dropped before this apartment guard.
        unsafe { CoUninitialize() };
    }
}

fn launch_from_explorer(
    exe: &Path,
    args: &[OsString],
    cwd: &Path,
    show: i32,
) -> windows::core::Result<()> {
    // This runs on the main thread before Tauri initializes COM. S_FALSE is
    // also success and still needs a matching CoUninitialize.
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()? };
    let _apartment = ComApartment;

    // Obtain the shell object hosted by the *existing desktop*. Creating a new
    // Shell.Application or calling ShellExecuteW ourselves can retain the MSI
    // context. This is Microsoft's desktop automation handoff:
    // https://devblogs.microsoft.com/oldnewthing/20131118-00/?p=2643
    unsafe {
        let shell_windows: IShellWindows =
            CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER)?;
        let empty = VARIANT::default();
        let location = VARIANT::from(CSIDL_DESKTOP as i32);
        let mut hwnd = 0;
        let desktop = shell_windows.FindWindowSW(
            &location,
            &empty,
            SWC_DESKTOP,
            &mut hwnd,
            SWFO_NEEDDISPATCH,
        )?;
        let provider: IServiceProvider = desktop.cast()?;
        let browser: IShellBrowser = provider.QueryService(&SID_STopLevelBrowser)?;
        let view = browser.QueryActiveShellView()?;
        let background: IDispatch = view.GetItemObject(SVGIO_BACKGROUND)?;
        let folder: IShellFolderViewDual = background.cast()?;
        let shell: IShellDispatch2 = folder.Application()?.cast()?;

        // An explicit directory makes the next launch pass the CWD check, so
        // no shared temp-file sentinel or persistent restart argument is needed.
        // Preserve all arguments, including --rscoop-start-minimized.
        shell.ShellExecute(
            &BSTR::from_wide(&exe.as_os_str().encode_wide().collect::<Vec<_>>()),
            &VARIANT::from(BSTR::from_wide(&quote_arguments(args))),
            &VARIANT::from(BSTR::from_wide(
                &cwd.as_os_str().encode_wide().collect::<Vec<_>>(),
            )),
            &VARIANT::from("open"),
            &VARIANT::from(show),
        )
    }
}

/// ShellExecute takes a command line, not an argument array. Use Windows argv
/// quoting: backslashes must be doubled before quotes and the closing quote.
/// Work in UTF-16 to preserve Windows paths without lossy Unicode conversion.
fn quote_arguments(args: &[OsString]) -> Vec<u16> {
    let mut command_line = Vec::new();
    for (index, arg) in args.iter().enumerate() {
        if index > 0 {
            command_line.push(b' ' as u16);
        }
        command_line.push(b'"' as u16);
        let mut backslashes = 0;
        for ch in arg.encode_wide() {
            if ch == b'\\' as u16 {
                backslashes += 1;
                continue;
            }
            let count = if ch == b'"' as u16 {
                backslashes * 2 + 1
            } else {
                backslashes
            };
            command_line.extend(std::iter::repeat_n(b'\\' as u16, count));
            command_line.push(ch);
            backslashes = 0;
        }
        command_line.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2));
        command_line.push(b'"' as u16);
    }
    command_line
}

#[cfg(test)]
mod tests {
    use super::quote_arguments;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::UI::Shell::CommandLineToArgvW;

    #[test]
    fn shell_arguments_round_trip_through_windows_parser() {
        let args = vec![
            OsString::from(crate::commands::startup::START_MINIMIZED_ARG),
            OsString::from(""),
            OsString::from("two words\tand a tab"),
            OsString::from(r"C:\Scoop Apps\"),
            OsString::from(r#"embedded\"quote"#),
            OsString::from("Grüezi 日本語"),
            OsString::from_wide(&[0xd800]),
        ];
        let mut command_line = "rscoop.exe ".encode_utf16().collect::<Vec<_>>();
        command_line.extend(quote_arguments(&args));
        command_line.push(0);

        unsafe {
            let mut argc = 0;
            let argv = CommandLineToArgvW(command_line.as_ptr(), &mut argc);
            assert!(!argv.is_null());
            let parsed = std::slice::from_raw_parts(argv, argc as usize)
                .iter()
                .skip(1)
                .map(|&arg| {
                    let mut len = 0;
                    while *arg.add(len) != 0 {
                        len += 1;
                    }
                    OsString::from_wide(std::slice::from_raw_parts(arg, len))
                })
                .collect::<Vec<_>>();
            LocalFree(argv.cast());
            assert_eq!(parsed, args);
        }
    }

    #[test]
    fn no_arguments_produces_an_empty_command_line() {
        assert!(quote_arguments(&[]).is_empty());
    }

    /// Opt-in because CI may not have an interactive Explorer desktop. Launches
    /// hidden test processes only; does not start Rscoop or run an installer.
    #[test]
    #[ignore = "requires the desktop user's Explorer process"]
    fn desktop_handoff_restores_environment_cwd_and_arguments() {
        use std::env;
        use std::fs;
        use std::os::windows::process::CommandExt;
        use std::path::PathBuf;
        use std::process::Command;
        use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
        use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

        const TEST: &str = "launch::tests::desktop_handoff_restores_environment_cwd_and_arguments";
        const MARKER: &str = "RSCOOP_TEST_INSTALLER_CONTEXT";
        const HANDOFF: &str = "rscoop-test-handoff=";
        const PROBE: &str = "rscoop-test-probe=";
        let args = env::args().collect::<Vec<_>>();

        if let Some(dir) = args.iter().find_map(|arg| arg.strip_prefix(PROBE)) {
            let report = serde_json::json!({
                "cwd": env::current_dir().unwrap(),
                "installer_environment": env::var_os(MARKER).is_some(),
                "args": args[1..],
            });
            fs::write(PathBuf::from(dir).join("report.json"), report.to_string()).unwrap();
            return;
        }

        if let Some(dir) = args.iter().find_map(|arg| arg.strip_prefix(HANDOFF)) {
            assert!(env::var_os(MARKER).is_some());
            let probe_args: Vec<OsString> = [
                "--exact".to_string(),
                TEST.to_string(),
                "--ignored".to_string(),
                "--skip".to_string(),
                format!("{PROBE}{dir}"),
                "--skip".to_string(),
                crate::commands::startup::START_MINIMIZED_ARG.to_string(),
                "--skip".to_string(),
                "spaces, \"quotes\", and trailing slash\\".to_string(),
            ]
            .into_iter()
            .map(OsString::from)
            .collect();
            super::launch_from_explorer(
                &env::current_exe().unwrap(),
                &probe_args,
                &PathBuf::from(dir),
                SW_HIDE.0,
            )
            .expect("handoff to desktop Explorer");
            return;
        }

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = env::temp_dir().join(format!(
            "rscoop launch 日本語 {}-{unique}",
            std::process::id()
        ));
        fs::create_dir(&dir).unwrap();
        // Only this child gets the simulated installer environment, avoiding
        // process-wide environment mutations in the test runner.
        let child = Command::new(env::current_exe().unwrap())
            .args(["--exact", TEST, "--ignored", "--nocapture", "--skip"])
            .arg(format!("{HANDOFF}{}", dir.display()))
            .env(MARKER, "installer-only")
            .current_dir(env::temp_dir())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .unwrap();
        assert!(
            child.status.success(),
            "handoff failed: {} {}",
            String::from_utf8_lossy(&child.stdout),
            String::from_utf8_lossy(&child.stderr)
        );

        let report_path = dir.join("report.json");
        let deadline = Instant::now() + Duration::from_secs(10);
        let report = loop {
            if let Ok(contents) = fs::read(&report_path) {
                if let Ok(report) = serde_json::from_slice::<serde_json::Value>(&contents) {
                    break report;
                }
            }
            assert!(
                Instant::now() < deadline,
                "no shell probe report at {}",
                report_path.display()
            );
            std::thread::sleep(Duration::from_millis(25));
        };
        assert_eq!(report["installer_environment"], false);
        assert_eq!(
            PathBuf::from(report["cwd"].as_str().unwrap())
                .canonicalize()
                .unwrap(),
            dir.canonicalize().unwrap()
        );
        let forwarded = report["args"].as_array().unwrap();
        assert_eq!(forwarded[4], format!("{PROBE}{}", dir.display()));
        assert_eq!(forwarded[6], crate::commands::startup::START_MINIMIZED_ARG);
        assert_eq!(forwarded[8], "spaces, \"quotes\", and trailing slash\\");
        fs::remove_dir_all(&dir).unwrap();
    }
}
