import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface BucketInstallOptions {
  name: string;
  url: string;
  force: boolean;
}

export interface BucketInstallResult {
  success: boolean;
  message: string;
  bucket_name: string;
  bucket_path?: string;
  manifest_count?: number;
}

export interface BucketInstallState {
  isInstalling: boolean;
  isRemoving: boolean;
  isValidating: boolean;
  error: string | null;
  lastResult: BucketInstallResult | null;
  installingBuckets: Set<string>; // Track which buckets are being installed
  removingBuckets: Set<string>; // Track which buckets are being removed
}

export function useBucketInstall() {
  const [state, setState] = createSignal<BucketInstallState>({
    isInstalling: false,
    isRemoving: false,
    isValidating: false,
    error: null,
    lastResult: null,
    installingBuckets: new Set(),
    removingBuckets: new Set(),
  });

  // Helper to update specific bucket operation state
  const updateBucketState = (bucketName: string, operation: 'install' | 'remove', isActive: boolean) => {
    setState(prev => {
      const newState = { ...prev };
      if (operation === 'install') {
        const newSet = new Set(prev.installingBuckets);
        if (isActive) {
          newSet.add(bucketName);
        } else {
          newSet.delete(bucketName);
        }
        newState.installingBuckets = newSet;
        newState.isInstalling = newSet.size > 0;
      } else {
        const newSet = new Set(prev.removingBuckets);
        if (isActive) {
          newSet.add(bucketName);
        } else {
          newSet.delete(bucketName);
        }
        newState.removingBuckets = newSet;
        newState.isRemoving = newSet.size > 0;
      }
      return newState;
    });
  };

  const validateBucketInstall = async (name: string, url: string): Promise<BucketInstallResult> => {
    setState(prev => ({ ...prev, isValidating: true, error: null }));
    
    try {
      const result = await invoke<BucketInstallResult>("validate_bucket_install", {
        name,
        url,
      });
      
      setState(prev => ({
        ...prev,
        isValidating: false,
        lastResult: result,
        error: result.success ? null : result.message,
      }));
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Validation failed";
      setState(prev => ({
        ...prev,
        isValidating: false,
        error: errorMsg,
        lastResult: null,
      }));
      throw error;
    }
  };

  const installBucket = async (options: BucketInstallOptions): Promise<BucketInstallResult> => {
    const bucketName = options.name || extractBucketNameFromUrl(options.url);
    updateBucketState(bucketName, 'install', true);
    setState(prev => ({ ...prev, error: null }));
    
    try {
      console.log(`Starting installation of bucket: ${bucketName} from ${options.url}`);
      const result = await invoke<BucketInstallResult>("install_bucket", {
        options,
      });
      
      console.log(`Installation result for ${bucketName}:`, result);
      
      setState(prev => ({
        ...prev,
        lastResult: result,
        error: result.success ? null : result.message,
      }));
      
      updateBucketState(bucketName, 'install', false);
      
      if (result.success) {
        console.log(`✅ Successfully installed bucket: ${bucketName}`);
      }
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Installation failed";
      console.error(`❌ Installation failed for ${bucketName}:`, errorMsg);
      setState(prev => ({
        ...prev,
        error: errorMsg,
        lastResult: null,
      }));
      updateBucketState(bucketName, 'install', false);
      throw error;
    }
  };

  const removeBucket = async (bucketName: string): Promise<BucketInstallResult> => {
    updateBucketState(bucketName, 'remove', true);
    setState(prev => ({ ...prev, error: null }));
    
    try {
      console.log(`Starting removal of bucket: ${bucketName}`);
      const result = await invoke<BucketInstallResult>("remove_bucket", {
        bucketName,
      });
      
      console.log(`Removal result for ${bucketName}:`, result);
      
      setState(prev => ({
        ...prev,
        lastResult: result,
        error: result.success ? null : result.message,
      }));
      
      updateBucketState(bucketName, 'remove', false);
      
      if (result.success) {
        console.log(`✅ Successfully removed bucket: ${bucketName}`);
      }
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Removal failed";
      console.error(`❌ Removal failed for ${bucketName}:`, errorMsg);
      setState(prev => ({
        ...prev,
        error: errorMsg,
        lastResult: null,
      }));
      updateBucketState(bucketName, 'remove', false);
      throw error;
    }
  };

  // Helper function to extract bucket name from URL (similar to Rust implementation)
  const extractBucketNameFromUrl = (url: string): string => {
    // Handle GitHub shorthand like "user/repo"
    if (url.includes('/') && !url.includes('://')) {
      const parts = url.split('/');
      if (parts.length === 2) {
        return parts[1].toLowerCase().replace(/^scoop-/, '').replace(/^Scoop-/, '');
      }
    }
    
    // Handle full URLs
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        const repoName = pathParts[1].replace(/\.git$/, '');
        return repoName.toLowerCase().replace(/^scoop-/, '').replace(/^Scoop-/, '');
      }
    } catch {
      // Fallback: extract from the end of the URL
      const parts = url.replace(/\.git$/, '').split('/');
      const lastPart = parts[parts.length - 1];
      return lastPart.toLowerCase().replace(/^scoop-/, '').replace(/^Scoop-/, '');
    }
    
    return url.toLowerCase();
  };

  // Helper to check if a specific bucket is being installed
  const isBucketInstalling = (bucketName: string): boolean => {
    return state().installingBuckets.has(bucketName);
  };

  // Helper to check if a specific bucket is being removed
  const isBucketRemoving = (bucketName: string): boolean => {
    return state().removingBuckets.has(bucketName);
  };

  // Helper to check if a specific bucket has any pending operation
  const isBucketBusy = (bucketName: string): boolean => {
    return isBucketInstalling(bucketName) || isBucketRemoving(bucketName);
  };

  return {
    state,
    validateBucketInstall,
    installBucket,
    removeBucket,
    isBucketInstalling,
    isBucketRemoving,
    isBucketBusy,
    extractBucketNameFromUrl,
  };
}