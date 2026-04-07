import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { graphql, QUERIES } from "./api.js";

// Types
interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface SyncState {
  lastSyncAt: string | null;
  cursors: Record<string, string | null>;
  syncedIds: Record<string, Set<string>>;
}

interface SyncProgress {
  collection: string;
  fetched: number;
  total?: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

// Collections to sync
const COLLECTIONS = [
  "teams",
  "users",
  "labels",
  "workflowStates",
  "cycles",
  "projects",
  "milestones",
  "documents",
  "issues",
  "notifications",
] as const;

type Collection = (typeof COLLECTIONS)[number];

// Query mapping
const SYNC_QUERIES: Record<Collection, string> = {
  issues: QUERIES.syncIssues,
  projects: QUERIES.syncProjects,
  teams: QUERIES.syncTeams,
  users: QUERIES.syncUsers,
  labels: QUERIES.syncLabels,
  cycles: QUERIES.syncCycles,
  workflowStates: QUERIES.syncWorkflowStates,
  milestones: QUERIES.syncMilestones,
  documents: QUERIES.syncDocuments,
  notifications: QUERIES.syncNotifications,
};

// Response field mapping
const RESPONSE_FIELDS: Record<Collection, string> = {
  issues: "issues",
  projects: "projects",
  teams: "teams",
  users: "users",
  labels: "issueLabels",
  cycles: "cycles",
  workflowStates: "workflowStates",
  milestones: "projectMilestones",
  documents: "documents",
  notifications: "notifications",
};

// Get data directory
function getDataDir(workspaceName: string): string {
  return join(homedir(), ".local", "share", "linear", workspaceName);
}

// Get state file path
function getStateFile(workspaceName: string): string {
  return join(getDataDir(workspaceName), ".sync-state.json");
}

// Ensure directory exists
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Load sync state
function loadSyncState(workspaceName: string): SyncState {
  const stateFile = getStateFile(workspaceName);
  if (!existsSync(stateFile)) {
    return {
      lastSyncAt: null,
      cursors: {},
      syncedIds: {},
    };
  }
  try {
    const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
    // Convert syncedIds arrays back to Sets
    const syncedIds: Record<string, Set<string>> = {};
    for (const [key, val] of Object.entries(raw.syncedIds || {})) {
      syncedIds[key] = new Set(val as string[]);
    }
    return { ...raw, syncedIds };
  } catch {
    return { lastSyncAt: null, cursors: {}, syncedIds: {} };
  }
}

// Save sync state
function saveSyncState(workspaceName: string, state: SyncState): void {
  const stateFile = getStateFile(workspaceName);
  ensureDir(getDataDir(workspaceName));
  // Convert Sets to arrays for JSON serialization
  const serializable = {
    ...state,
    syncedIds: Object.fromEntries(
      Object.entries(state.syncedIds).map(([k, v]) => [k, [...v]]),
    ),
  };
  writeFileSync(stateFile, JSON.stringify(serializable, null, 2));
}

// Write resource to file
function writeResource(
  workspaceName: string,
  collection: string,
  resource: { id: string },
): void {
  const dir = join(getDataDir(workspaceName), collection);
  ensureDir(dir);
  const filePath = join(dir, `${resource.id}.json`);
  writeFileSync(filePath, JSON.stringify(resource, null, 2));
}

// Remove resource file (for archived/deleted items)
function removeResource(
  workspaceName: string,
  collection: string,
  id: string,
): boolean {
  const filePath = join(getDataDir(workspaceName), collection, `${id}.json`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    return true;
  }
  return false;
}

// Get existing resource IDs from disk
function getExistingIds(workspaceName: string, collection: string): Set<string> {
  const dir = join(getDataDir(workspaceName), collection);
  if (!existsSync(dir)) return new Set();
  try {
    return new Set(
      readdirSync(dir)
        .filter((f) => f.endsWith(".json") && !f.startsWith("."))
        .map((f) => f.replace(".json", "")),
    );
  } catch {
    return new Set();
  }
}

// Fetch organization info
async function fetchOrganization(
  apiKey: string,
): Promise<{ id: string; name: string; urlKey: string }> {
  const result = await graphql<{
    organization: { id: string; name: string; urlKey: string };
  }>(apiKey, QUERIES.syncOrganization);
  if (!result.data?.organization) {
    throw new Error("Failed to fetch organization");
  }
  return result.data.organization;
}

// Paginated fetch for a collection
async function* fetchCollection(
  apiKey: string,
  collection: Collection,
  cursor: string | null,
): AsyncGenerator<{ nodes: Array<{ id: string }>; pageInfo: PageInfo }> {
  const query = SYNC_QUERIES[collection];
  const responseField = RESPONSE_FIELDS[collection];

  let currentCursor = cursor;
  let hasMore = true;

  while (hasMore) {
    const variables: Record<string, unknown> = {
      first: 100,
      after: currentCursor,
    };

    const result = await graphql<{
      [key: string]: { nodes: Array<{ id: string }>; pageInfo: PageInfo };
    }>(apiKey, query, variables);

    if (result.errors?.length) {
      throw new Error(
        `GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    const data = result.data?.[responseField];
    if (!data) {
      throw new Error(`No data returned for ${collection}`);
    }

    yield { nodes: data.nodes, pageInfo: data.pageInfo };

    hasMore = data.pageInfo.hasNextPage;
    currentCursor = data.pageInfo.endCursor;
  }
}

// Sync options
export interface SyncOptions {
  workspaceName?: string;
  collections?: Collection[];
  full?: boolean;
  onProgress?: ProgressCallback;
}

// Main sync function
export async function sync(
  apiKey: string,
  options: SyncOptions = {},
): Promise<{
  workspaceName: string;
  synced: Record<string, number>;
  removed: Record<string, number>;
}> {
  // Fetch organization to get workspace name
  const org = await fetchOrganization(apiKey);
  const workspaceName = options.workspaceName || org.urlKey;

  options.onProgress?.({ collection: "organization", fetched: 1 });

  // Write organization info
  ensureDir(getDataDir(workspaceName));
  writeFileSync(
    join(getDataDir(workspaceName), "organization.json"),
    JSON.stringify(org, null, 2),
  );

  // Load existing sync state
  const state = loadSyncState(workspaceName);
  const collectionsToSync = options.collections || [...COLLECTIONS];

  // For full sync, we'll clean up removed items
  const isFullSync = options.full || state.lastSyncAt === null;

  const synced: Record<string, number> = {};
  const removed: Record<string, number> = {};

  for (const collection of collectionsToSync) {
    synced[collection] = 0;
    removed[collection] = 0;

    // For incremental sync, track what we see
    const seenIds = new Set<string>();

    // Resume from cursor if available (for interrupted syncs)
    const cursor = state.cursors[collection] || null;

    try {
      for await (const batch of fetchCollection(
        apiKey,
        collection,
        cursor,
      )) {
        for (const node of batch.nodes) {
          writeResource(workspaceName, collection, node);
          seenIds.add(node.id);
          synced[collection]++;
        }

        // Update cursor for resume capability
        state.cursors[collection] = batch.pageInfo.endCursor;
        saveSyncState(workspaceName, state);

        options.onProgress?.({
          collection,
          fetched: synced[collection],
        });
      }

      // Clear cursor on successful completion
      state.cursors[collection] = null;

      // For full sync, remove resources that no longer exist
      if (isFullSync) {
        const existingIds = getExistingIds(workspaceName, collection);
        for (const id of existingIds) {
          if (!seenIds.has(id)) {
            if (removeResource(workspaceName, collection, id)) {
              removed[collection]++;
            }
          }
        }
      }

      // Track synced IDs
      state.syncedIds[collection] = seenIds;
    } catch (error) {
      // Save state on error for resume
      saveSyncState(workspaceName, state);
      throw error;
    }
  }

  // Update last sync timestamp
  state.lastSyncAt = new Date().toISOString();
  saveSyncState(workspaceName, state);

  return { workspaceName, synced, removed };
}

// Get sync status
export function getSyncStatus(workspaceName: string): {
  dataDir: string;
  lastSyncAt: string | null;
  collections: Record<string, { count: number; resumeCursor: string | null }>;
} {
  const dataDir = getDataDir(workspaceName);
  const state = loadSyncState(workspaceName);

  const collections: Record<
    string,
    { count: number; resumeCursor: string | null }
  > = {};
  for (const collection of COLLECTIONS) {
    const ids = getExistingIds(workspaceName, collection);
    collections[collection] = {
      count: ids.size,
      resumeCursor: state.cursors[collection] || null,
    };
  }

  return {
    dataDir,
    lastSyncAt: state.lastSyncAt,
    collections,
  };
}

// Reset sync state (for fresh sync)
export function resetSyncState(workspaceName: string): void {
  const stateFile = getStateFile(workspaceName);
  if (existsSync(stateFile)) {
    unlinkSync(stateFile);
  }
}

// List synced workspaces
export function listSyncedWorkspaces(): string[] {
  const baseDir = join(homedir(), ".local", "share", "linear");
  if (!existsSync(baseDir)) return [];
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export { COLLECTIONS };
export type { Collection };
