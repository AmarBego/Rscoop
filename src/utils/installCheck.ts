import { invoke } from "@tauri-apps/api/core";

/**
 * Checks if the current working directory mismatches the installation directory.
 * This typically indicates an MSI installation issue where the app was launched
 * from a temporary directory instead of its actual installation location.
 * 
 * @returns true if there's a CWD mismatch (indicating MSI installation issue)
 */
export async function checkCwdMismatch(): Promise<boolean> {
    try {
        return await invoke<boolean>("is_cwd_mismatch");
    } catch (e) {
        console.error("Failed to check CWD mismatch:", e);
        return false;
    }
}
