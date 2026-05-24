//! Tauri command surface for the OperationManager.
use crate::operations::{self, EnqueueAction, OperationStateSnapshot};
use tauri::AppHandle;

#[tauri::command]
pub async fn enqueue_operation(app: AppHandle, action: EnqueueAction) -> Result<String, String> {
    let id = operations::enqueue(&app, action);
    Ok(id)
}

#[tauri::command]
pub async fn get_operation_state(app: AppHandle) -> Result<OperationStateSnapshot, String> {
    Ok(operations::snapshot(&app))
}

#[tauri::command]
pub async fn cancel_current_operation(app: AppHandle) -> Result<bool, String> {
    let cancelled = operations::cancel_current_job(&app)?;
    if cancelled {
        Ok(true)
    } else {
        Ok(crate::commands::bucket_install::cancel_bucket_install())
    }
}

#[tauri::command]
pub async fn clear_completed_operations(app: AppHandle) -> Result<(), String> {
    operations::clear_completed(&app);
    Ok(())
}

#[tauri::command]
pub async fn dismiss_current_operation(app: AppHandle) -> Result<(), String> {
    operations::dismiss_current_result(&app);
    Ok(())
}

#[tauri::command]
pub async fn confirm_install_anyway(app: AppHandle) -> Result<(), String> {
    operations::confirm_install_anyway(&app)
}

#[tauri::command]
pub async fn run_pending_chain(app: AppHandle) -> Result<(), String> {
    operations::run_pending_chain(&app)
}
