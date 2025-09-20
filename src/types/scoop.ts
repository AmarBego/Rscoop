export interface ScoopPackage {
  name: string;
  version: string;
  source: string;
  updated: string;
  is_installed: boolean;
  info: string;
  match_source: "name" | "binary" | "none" | "path";
  available_version?: string;
  is_versioned_install?: boolean;
}

export interface ScoopInfo {
  details: [string, string][];
  notes: string | null;
}

export interface UpdatablePackage {
  name: string;
  current: string;
  available: string;
}

export interface VirustotalResult {
  detections_found: boolean;
  is_api_key_missing: boolean;
  message: string;
}

export interface PackageVersion {
  version: string;
  is_current: boolean;
  install_path: string;
}

export interface VersionedPackageInfo {
  name: string;
  current_version: string;
  available_versions: PackageVersion[];
}

export type View = "search" | "installed" | "bucket" | "settings" | "doctor"; 