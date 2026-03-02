// Resolver utilities - convert human-friendly names to IDs
import { graphql } from "./api.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUE_ID_REGEX = /^[A-Z]+-\d+$/;

export function isUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

export function isIssueIdentifier(str: string): boolean {
  return ISSUE_ID_REGEX.test(str);
}

// Cache for resolved values within a session
const cache: Record<string, Record<string, string>> = {
  teams: {},
  states: {},
  users: {},
  labels: {},
  projects: {},
};

// ============================================================================
// TEAM RESOLVER
// ============================================================================
export async function resolveTeam(apiKey: string, input: string): Promise<string> {
  if (isUUID(input)) return input;
  
  const cacheKey = `${apiKey}:${input.toLowerCase()}`;
  if (cache.teams[cacheKey]) return cache.teams[cacheKey];

  const result = await graphql(apiKey, `{ teams { nodes { id name key } } }`);
  const teams = (result.data as { teams: { nodes: Array<{ id: string; name: string; key: string }> } })?.teams?.nodes;
  
  if (!teams) throw new Error("Failed to fetch teams");

  const match = teams.find(
    (t) => t.name.toLowerCase() === input.toLowerCase() || t.key.toLowerCase() === input.toLowerCase()
  );

  if (!match) {
    const available = teams.map((t) => `${t.key} (${t.name})`).join(", ");
    throw new Error(`Team "${input}" not found. Available: ${available}`);
  }

  cache.teams[cacheKey] = match.id;
  return match.id;
}

// ============================================================================
// STATE RESOLVER
// ============================================================================
export async function resolveState(
  apiKey: string,
  input: string,
  teamId?: string
): Promise<string> {
  if (isUUID(input)) return input;

  const cacheKey = `${apiKey}:${teamId || "all"}:${input.toLowerCase()}`;
  if (cache.states[cacheKey]) return cache.states[cacheKey];

  const result = await graphql(apiKey, `{ workflowStates { nodes { id name type team { id name } } } }`);
  const states = (result.data as { workflowStates: { nodes: Array<{ id: string; name: string; type: string; team: { id: string; name: string } }> } })?.workflowStates?.nodes;

  if (!states) throw new Error("Failed to fetch workflow states");

  // Filter by team if provided
  let filtered = states;
  if (teamId) {
    filtered = states.filter((s) => s.team.id === teamId);
  }

  // Match by name (case-insensitive) or type
  const match = filtered.find(
    (s) => s.name.toLowerCase() === input.toLowerCase() || s.type.toLowerCase() === input.toLowerCase()
  );

  if (!match) {
    const available = [...new Set(filtered.map((s) => s.name))].join(", ");
    throw new Error(`State "${input}" not found. Available: ${available}`);
  }

  cache.states[cacheKey] = match.id;
  return match.id;
}

// ============================================================================
// USER RESOLVER
// ============================================================================
export async function resolveUser(apiKey: string, input: string): Promise<string> {
  if (isUUID(input)) return input;
  if (input.toLowerCase() === "me") {
    const result = await graphql(apiKey, `{ viewer { id } }`);
    return (result.data as { viewer: { id: string } })?.viewer?.id;
  }

  const cacheKey = `${apiKey}:${input.toLowerCase()}`;
  if (cache.users[cacheKey]) return cache.users[cacheKey];

  const result = await graphql(apiKey, `{ users { nodes { id name email } } }`);
  const users = (result.data as { users: { nodes: Array<{ id: string; name: string; email: string }> } })?.users?.nodes;

  if (!users) throw new Error("Failed to fetch users");

  const match = users.find(
    (u) =>
      u.name.toLowerCase() === input.toLowerCase() ||
      u.email.toLowerCase() === input.toLowerCase() ||
      u.name.toLowerCase().includes(input.toLowerCase()) ||
      u.email.toLowerCase().includes(input.toLowerCase())
  );

  if (!match) {
    const available = users.map((u) => `${u.name} <${u.email}>`).join(", ");
    throw new Error(`User "${input}" not found. Available: ${available}`);
  }

  cache.users[cacheKey] = match.id;
  return match.id;
}

// ============================================================================
// LABEL RESOLVER
// ============================================================================
export async function resolveLabels(apiKey: string, input: string): Promise<string[]> {
  const inputs = input.split(",").map((s) => s.trim());
  const ids: string[] = [];

  for (const inp of inputs) {
    if (isUUID(inp)) {
      ids.push(inp);
      continue;
    }

    const cacheKey = `${apiKey}:${inp.toLowerCase()}`;
    if (cache.labels[cacheKey]) {
      ids.push(cache.labels[cacheKey]);
      continue;
    }

    const result = await graphql(apiKey, `{ issueLabels { nodes { id name } } }`);
    const labels = (result.data as { issueLabels: { nodes: Array<{ id: string; name: string }> } })?.issueLabels?.nodes;

    if (!labels) throw new Error("Failed to fetch labels");

    const match = labels.find((l) => l.name.toLowerCase() === inp.toLowerCase());
    if (!match) {
      const available = labels.map((l) => l.name).join(", ");
      throw new Error(`Label "${inp}" not found. Available: ${available}`);
    }

    cache.labels[cacheKey] = match.id;
    ids.push(match.id);
  }

  return ids;
}

// ============================================================================
// PROJECT RESOLVER
// ============================================================================
export async function resolveProject(apiKey: string, input: string): Promise<string> {
  if (isUUID(input)) return input;

  const cacheKey = `${apiKey}:${input.toLowerCase()}`;
  if (cache.projects[cacheKey]) return cache.projects[cacheKey];

  const result = await graphql(apiKey, `{ projects { nodes { id name slugId } } }`);
  const projects = (result.data as { projects: { nodes: Array<{ id: string; name: string; slugId: string }> } })?.projects?.nodes;

  if (!projects) throw new Error("Failed to fetch projects");

  const match = projects.find(
    (p) =>
      p.name.toLowerCase() === input.toLowerCase() ||
      p.slugId?.toLowerCase() === input.toLowerCase()
  );

  if (!match) {
    const available = projects.map((p) => p.name).join(", ");
    throw new Error(`Project "${input}" not found. Available: ${available}`);
  }

  cache.projects[cacheKey] = match.id;
  return match.id;
}

// ============================================================================
// CYCLE RESOLVER
// ============================================================================
export async function resolveCycle(
  apiKey: string,
  input: string,
  teamId?: string
): Promise<string> {
  if (isUUID(input)) return input;

  // Could be cycle number
  const cycleNum = parseInt(input, 10);
  
  let query = `{ cycles { nodes { id number name team { id } } } }`;
  const result = await graphql(apiKey, query);
  const cycles = (result.data as { cycles: { nodes: Array<{ id: string; number: number; name: string; team: { id: string } }> } })?.cycles?.nodes;

  if (!cycles) throw new Error("Failed to fetch cycles");

  let filtered = cycles;
  if (teamId) {
    filtered = cycles.filter((c) => c.team.id === teamId);
  }

  const match = filtered.find(
    (c) =>
      c.number === cycleNum ||
      c.name?.toLowerCase() === input.toLowerCase()
  );

  if (!match) {
    const available = filtered.map((c) => `#${c.number}${c.name ? ` (${c.name})` : ""}`).join(", ");
    throw new Error(`Cycle "${input}" not found. Available: ${available}`);
  }

  return match.id;
}
