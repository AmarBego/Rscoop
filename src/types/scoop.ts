export interface ScoopPackage {
  name: string;
  version: string;
  source: string;
  updated: string;
  is_installed: boolean;
  info: string;
}

export interface ScoopInfo {
  details: [string, string][];
  notes: string | null;
} 

export type View = "search" | "installed" | "settings"; 