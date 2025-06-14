import { ScoopPackage, ScoopInfo } from "./scoop";

export interface OperationNextStep {
    buttonLabel: string;
    onNext: () => void;
}

export interface ModalState {
    operationTitle: string | null;
    operationNextStep: OperationNextStep | null;
    isScanning?: boolean;
}

export interface PackageInfoModalState {
    selectedPackage: ScoopPackage | null;
    info: ScoopInfo | null;
    loading: boolean;
    error: string | null;
} 