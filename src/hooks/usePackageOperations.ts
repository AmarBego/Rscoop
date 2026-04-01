import { ScoopPackage } from "../types/scoop";
import operationsStore from "../stores/operations";

export function usePackageOperations() {
    const handleInstall = (pkg: ScoopPackage, version?: string) => {
        operationsStore.queueInstall(pkg, version);
    };

    const handleInstallConfirm = () => {
        operationsStore.handleInstallConfirm();
    };

    const handleUninstall = (pkg: ScoopPackage) => {
        operationsStore.queueUninstall(pkg);
    };

    const handleUpdate = (pkg: ScoopPackage) => {
        operationsStore.queueUpdate(pkg);
    };

    const handleUpdateAll = () => {
        operationsStore.queueUpdateAll();
    };

    return {
        handleInstall,
        handleInstallConfirm,
        handleUninstall,
        handleUpdate,
        handleUpdateAll,
    };
}
