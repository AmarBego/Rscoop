import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface BucketInfo {
  name: string;
  path: string;
  manifest_count: number;
  is_git_repo: boolean;
  git_url?: string;
  git_branch?: string;
  last_updated?: string;
}

export function useBuckets() {
  const [buckets, setBuckets] = createSignal<BucketInfo[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const fetchBuckets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await invoke<BucketInfo[]>("get_buckets");
      setBuckets(result);
    } catch (err) {
      console.error("Failed to fetch buckets:", err);
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const getBucketInfo = async (bucketName: string): Promise<BucketInfo | null> => {
    try {
      return await invoke<BucketInfo>("get_bucket_info", { bucketName });
    } catch (err) {
      console.error(`Failed to get info for bucket ${bucketName}:`, err);
      return null;
    }
  };

  const getBucketManifests = async (bucketName: string): Promise<string[]> => {
    try {
      return await invoke<string[]>("get_bucket_manifests", { bucketName });
    } catch (err) {
      console.error(`Failed to get manifests for bucket ${bucketName}:`, err);
      return [];
    }
  };

  return {
    buckets,
    loading,
    error,
    fetchBuckets,
    getBucketInfo,
    getBucketManifests,
  };
}