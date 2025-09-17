import { For, Show, createMemo, Switch, Match } from "solid-js";
import { BucketInfo } from "../hooks/useBuckets";
import { SearchableBucket } from "../hooks/useBucketSearch";
import { useBucketInstall } from "../hooks/useBucketInstall";
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github-dark.css';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import { MoreHorizontal, GitBranch, ExternalLink, Download, Trash2, Loader2 } from "lucide-solid";
import { openUrl, openPath } from '@tauri-apps/plugin-opener';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);

interface BucketInfoModalProps {
  bucket: BucketInfo | null;
  manifests: string[];
  manifestsLoading: boolean;
  error: string | null;
  description?: string; // Optional description for external/search buckets
  searchBucket?: SearchableBucket; // For external buckets from search
  isInstalled?: boolean; // Whether this bucket is currently installed
  installedBuckets?: BucketInfo[]; // List of installed buckets to check against
  onClose: () => void;
  onPackageClick?: (packageName: string, bucketName: string) => void;
  onBucketInstalled?: () => void; // Callback when bucket is installed/removed
  onFetchManifests?: (bucketName: string) => Promise<void>; // Callback to fetch manifests for newly installed bucket
}

// Component to render bucket detail values
function DetailValue(props: { value: string | number | undefined }) {
  const displayValue = () => {
    if (props.value === undefined || props.value === null) return "Unknown";
    return String(props.value);
  };

  return <span class="break-words">{displayValue()}</span>;
}

// Component to render manifest lists in a compact, scrollable form
function ManifestsList(props: { manifests: string[]; loading: boolean; onPackageClick?: (packageName: string) => void }) {
  return (
    <Show when={!props.loading} fallback={
      <div class="flex items-center gap-2 py-4">
        <span class="loading loading-spinner loading-sm"></span>
        <span class="text-sm">Loading packages...</span>
      </div>
    }>
      <Show when={props.manifests.length > 0} fallback={
        <div class="text-center py-4">
          <p class="text-sm text-base-content/70">No packages found</p>
        </div>
      }>
        <div class="max-h-60 overflow-y-auto">
          <div class="grid grid-cols-2 gap-1 text-xs">
            <For each={props.manifests}>
              {(manifest) => {
                // Clean up manifest name (remove (root) suffix if present)
                const cleanName = manifest.replace(/ \(root\)$/, '');
                return (
                  <div 
                    class="hover:text-primary cursor-pointer py-0.5 px-1 rounded hover:bg-base-300 transition-colors"
                    onClick={() => props.onPackageClick?.(cleanName)}
                    title={`Click to view info for ${cleanName}`}
                  >
                    {manifest}
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </Show>
  );
}

function BucketInfoModal(props: BucketInfoModalProps) {
  const bucketInstall = useBucketInstall();
  
  const bucketName = () => props.bucket?.name || props.searchBucket?.name || '';
  const isExternalBucket = () => !props.bucket && !!props.searchBucket;
  
  // Properly check if bucket is installed
  const isInstalled = () => {
    const name = bucketName();
    
    // If explicitly provided, use that
    if (props.isInstalled !== undefined) {
      return props.isInstalled;
    }
    
    // If we have a bucket from local data (props.bucket), it's installed
    if (props.bucket && !props.searchBucket) {
      return true;
    }
    
    // If we have installed buckets list, check against it
    if (props.installedBuckets && name) {
      const installed = props.installedBuckets.some(installed => installed.name === name);
      return installed;
    }
    
    // Default: if it's a search bucket only, it's not installed
    return false;
  };

  // Handle bucket installation
  const handleInstallBucket = async () => {
    if (!props.searchBucket) return;
    
    try {
      const result = await bucketInstall.installBucket({
        name: props.searchBucket.name,
        url: props.searchBucket.url,
        force: false,
      });
      
      if (result.success) {
        console.log('Bucket installed successfully from modal, refreshing bucket list');
        
        // First refresh the bucket list
        props.onBucketInstalled?.();
        
        // Then fetch manifests for the newly installed bucket
        if (props.onFetchManifests) {
          console.log('Fetching manifests for newly installed bucket:', props.searchBucket.name);
          await props.onFetchManifests(props.searchBucket.name);
        }
      } else {
        console.error('Bucket installation failed:', result.message);
      }
    } catch (error) {
      console.error('Failed to install bucket:', error);
    }
  };

  // Handle bucket removal
  const handleRemoveBucket = async () => {
    const name = bucketName();
    if (!name) return;
    
    try {
      const result = await bucketInstall.removeBucket(name);
      
      if (result.success) {
        console.log('Bucket removed successfully from modal, refreshing bucket list');
        props.onBucketInstalled?.();
        // Close modal after successful removal
        props.onClose();
      } else {
        console.error('Bucket removal failed:', result.message);
      }
    } catch (error) {
      console.error('Failed to remove bucket:', error);
    }
  };
  const orderedDetails = createMemo(() => {
    if (!props.bucket) return [];

    const details: [string, string | number | undefined][] = [
      ['Name', props.bucket.name],
      ['Type', props.bucket.is_git_repo ? 'Git Repository' : 'Local Directory'],
      ['Manifests', props.bucket.manifest_count],
      ['Branch', props.bucket.git_branch],
      ['Last Updated', props.bucket.last_updated],
      ['Path', props.bucket.path],
    ];

    // Filter out undefined values
    return details.filter(([_, value]) => value !== undefined && value !== null);
  });

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Unknown";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString; // Return as-is if parsing fails
    }
  };

  return (
    <Show when={!!props.bucket || !!props.searchBucket}>
      <div class="modal modal-open backdrop-blur-sm" role="dialog" data-no-close-search>
        <div class="modal-box w-11/12 max-w-5xl bg-base-200 my-8">
          <div class="flex justify-between items-start">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-lg">
                Bucket: {props.bucket?.name || props.searchBucket?.name}
              </h3>
              <Show when={props.bucket?.is_git_repo}>
                <div class="badge badge-info badge-sm">
                  <GitBranch class="w-3 h-3 mr-1" />
                  Git
                </div>
              </Show>
              <Show when={isInstalled()}>
                <div class="badge badge-success badge-sm">
                  Installed
                </div>
              </Show>
              <Show when={isExternalBucket()}>
                <div class="badge badge-warning badge-sm">
                  External
                </div>
              </Show>
            </div>
            
            <div class="flex items-center gap-2">
              {/* More Actions Dropdown */}
              <div class="dropdown dropdown-end">
                <div tabindex="0" role="button" class="btn btn-ghost btn-sm btn-circle">
                  <MoreHorizontal class="w-5 h-5" />
                </div>
                <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-300 rounded-box w-52 z-[100]">
                  <Show when={props.bucket?.path}>
                    <li>
                      <button type="button" onClick={async (e) => { 
                        e.stopPropagation(); 
                        if (props.bucket?.path) {
                          try {
                            await openPath(props.bucket.path);
                          } catch (error) {
                            console.error('Failed to open path:', error);
                          }
                        }
                      }}>
                        <ExternalLink class="w-4 h-4 mr-2" />
                        Open in Explorer
                      </button>
                    </li>
                  </Show>
                  <Show when={isInstalled()}>
                    <li>
                      <button type="button" onClick={(e) => { e.stopPropagation(); /* TODO: Refresh Bucket */ }}>
                        Refresh Bucket
                      </button>
                    </li>
                  </Show>
                  <li>
                    <button 
                      type="button" 
                      onClick={async (e) => { 
                        e.stopPropagation(); 
                        const url = props.bucket?.git_url || props.searchBucket?.url;
                        if (url) {
                          try {
                            await openUrl(url);
                          } catch (error) {
                            console.error('Failed to open URL:', error);
                          }
                        }
                      }}
                      disabled={!props.bucket?.git_url && !props.searchBucket?.url}
                      class={(!props.bucket?.git_url && !props.searchBucket?.url) ? "text-base-content/50" : ""}
                    >
                      View on GitHub
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          <div class="py-4">
            <Show when={props.error}>
              <div role="alert" class="alert alert-error mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{props.error}</span>
              </div>
            </Show>
            <Show when={props.bucket || props.searchBucket}>
              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex-1">
                  <h4 class="text-lg font-medium mb-3 pb-2 border-b">Details</h4>
                  <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                    <Show 
                      when={props.bucket && isInstalled()}
                      fallback={
                        // Show basic info for external buckets
                        <Show when={props.searchBucket}>
                          <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                            <div class="font-semibold text-base-content/70 col-span-1">Name:</div>
                            <div class="col-span-2">{props.searchBucket!.name}</div>
                          </div>
                          <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                            <div class="font-semibold text-base-content/70 col-span-1">Type:</div>
                            <div class="col-span-2">Git Repository</div>
                          </div>
                          <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                            <div class="font-semibold text-base-content/70 col-span-1">Packages:</div>
                            <div class="col-span-2">
                              <div class="flex items-center gap-1">
                                <span class="font-bold text-primary">{props.searchBucket!.apps}</span>
                                <span class="text-xs text-base-content/70">packages</span>
                              </div>
                            </div>
                          </div>
                          <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                            <div class="font-semibold text-base-content/70 col-span-1">Repository:</div>
                            <div class="col-span-2">
                              <a 
                                href={props.searchBucket!.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                class="link link-primary break-all text-xs flex items-center gap-1"
                              >
                                <GitBranch class="w-3 h-3" />
                                {props.searchBucket!.url}
                              </a>
                            </div>
                          </div>
                          <Show when={props.searchBucket!.last_updated !== "Unknown"}>
                            <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                              <div class="font-semibold text-base-content/70 col-span-1">Last Updated:</div>
                              <div class="col-span-2">{formatDate(props.searchBucket!.last_updated)}</div>
                            </div>
                          </Show>
                        </Show>
                      }
                    >
                      {/* Show detailed info for installed buckets */}
                      <For each={orderedDetails()}>
                        {([key, value]) => (
                          <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                            <div class="font-semibold text-base-content/70 capitalize col-span-1">
                              {key.replace(/([A-Z])/g, ' $1')}:
                            </div>
                            <div class="col-span-2">
                              <Switch fallback={<DetailValue value={value} />}>
                                <Match when={key === 'Last Updated'}>
                                  {formatDate(value as string)}
                                </Match>
                                <Match when={key === 'Path'}>
                                  <div class="text-xs font-mono break-all">
                                    {value}
                                  </div>
                                </Match>
                                <Match when={key === 'Manifests'}>
                                  <div class="flex items-center gap-1">
                                    <span class="font-bold text-primary">{value}</span>
                                    <span class="text-xs text-base-content/70">packages</span>
                                  </div>
                                </Match>
                              </Switch>
                            </div>
                          </div>
                        )}
                      </For>
                      
                      <Show when={props.bucket?.git_url}>
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                          <div class="font-semibold text-base-content/70 col-span-1">Repository:</div>
                          <div class="col-span-2">
                            <a 
                              href={props.bucket!.git_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              class="link link-primary break-all text-xs flex items-center gap-1"
                            >
                              <GitBranch class="w-3 h-3" />
                              {props.bucket!.git_url}
                            </a>
                          </div>
                        </div>
                      </Show>
                    </Show>
                  </div>
                </div>
                
                <div class="flex-1">
                  <Show 
                    when={isInstalled() && (props.manifests.length > 0 || props.manifestsLoading)} 
                    fallback={
                      // Show description when bucket is not installed or no manifests available
                      <Show when={props.description && !isInstalled()}>
                        <h4 class="text-lg font-medium mb-3 border-b pb-2">Description</h4>
                        <div class="bg-base-100 rounded-lg p-4">
                          <p class="text-sm text-base-content/80 leading-relaxed">
                            {props.description}
                          </p>
                          <div class="mt-4 p-3 bg-info/10 rounded-lg border border-info/20">
                            <p class="text-xs text-info-content/70">
                              <strong>Note:</strong> This bucket is not currently installed. 
                              Install it to view available packages.
                            </p>
                          </div>
                        </div>
                      </Show>
                    }
                  >
                    <h4 class="text-lg font-medium mb-3 border-b pb-2 flex items-center gap-2">
                      Available Packages ({props.manifests.length})
                    </h4>
                    <div class="bg-base-100 rounded-lg p-3">
                      <ManifestsList 
                        manifests={props.manifests} 
                        loading={props.manifestsLoading}
                        onPackageClick={(packageName) => props.onPackageClick?.(packageName, props.bucket?.name ?? bucketName())}
                      />
                    </div>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
          
          <div class="modal-action">
            <form method="dialog">
              <Show when={!isInstalled() && props.searchBucket}>
                <button 
                  type="button"
                  class="btn btn-primary mr-2"
                  onClick={handleInstallBucket}
                  disabled={bucketInstall.isBucketBusy(bucketName())}
                >
                  <Show 
                    when={bucketInstall.isBucketInstalling(bucketName())}
                    fallback={
                      <>
                        <Download class="w-4 h-4 mr-2" />
                        Install
                      </>
                    }
                  >
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                    Installing...
                  </Show>
                </button>
              </Show>
              <Show when={isInstalled()}>
                <button
                  type="button"
                  class="btn btn-error mr-2"
                  onClick={handleRemoveBucket}
                  disabled={bucketInstall.isBucketBusy(bucketName())}
                >
                  <Show 
                    when={bucketInstall.isBucketRemoving(bucketName())}
                    fallback={
                      <>
                        <Trash2 class="w-4 h-4 mr-2" />
                        Remove
                      </>
                    }
                  >
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                    Removing...
                  </Show>
                </button>
              </Show>
              <button class="btn" onClick={props.onClose}>Close</button>
            </form>
          </div>
        </div>
        <div class="modal-backdrop" onClick={props.onClose}></div>
      </div>
    </Show>
  );
}

export default BucketInfoModal;