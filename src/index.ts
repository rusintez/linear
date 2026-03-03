#!/usr/bin/env npx tsx
import { Command, Option } from "@commander-js/extra-typings";
import { readFileSync } from "node:fs";
import {
  addWorkspace,
  getDefaultWorkspaceName,
  getWorkspace,
  listWorkspaces,
  removeWorkspace,
  setDefaultWorkspace,
} from "./config.js";
import { graphql, MUTATIONS, QUERIES } from "./api.js";
import { formatOutput, type OutputFormat, printError } from "./output.js";
import {
  resolveTeam,
  resolveState,
  resolveUser,
  resolveLabels,
  resolveProject,
} from "./resolve.js";
import {
  sync,
  getSyncStatus,
  resetSyncState,
  listSyncedWorkspaces,
  COLLECTIONS,
  type Collection,
} from "./sync.js";

const program = new Command()
  .name("linear")
  .description(
    "CLI wrapper for Linear GraphQL API - supports multiple workspaces",
  )
  .version("1.0.0")
  .option(
    "-w, --workspace <name>",
    "workspace to use (defaults to default workspace)",
  )
  .addOption(
    new Option("-f, --format <format>", "output format")
      .choices(["md", "json", "minimal"] as const)
      .default("md" as const),
  );

// Helper to get API key from options or env
function getApiKey(workspace?: string): string {
  // Check env first (useful for one-off commands)
  const envKey = process.env.LINEAR_API_KEY;
  if (envKey && !workspace) return envKey;

  const ws = getWorkspace(workspace);
  if (!ws) {
    console.error(
      "No workspace configured. Run: linear config add <name> <api-key>",
    );
    process.exit(1);
  }
  return ws.apiKey;
}

// ============================================================================
// CONFIG COMMANDS
// ============================================================================
const configCmd = program
  .command("config")
  .description("manage workspaces and API keys");

configCmd
  .command("add")
  .description("add or update a workspace")
  .argument("<name>", "workspace name")
  .argument("<api-key>", "Linear API key")
  .action((name, apiKey) => {
    addWorkspace(name, apiKey);
    console.log(`Workspace "${name}" added.`);
  });

configCmd
  .command("remove")
  .description("remove a workspace")
  .argument("<name>", "workspace name")
  .action((name) => {
    if (removeWorkspace(name)) {
      console.log(`Workspace "${name}" removed.`);
    } else {
      console.error(`Workspace "${name}" not found.`);
    }
  });

configCmd
  .command("list")
  .description("list all workspaces")
  .action(() => {
    const workspaces = listWorkspaces();
    const defaultName = getDefaultWorkspaceName();
    if (workspaces.length === 0) {
      console.log("No workspaces configured.");
      return;
    }
    for (const ws of workspaces) {
      const marker = ws.name === defaultName ? " (default)" : "";
      console.log(`${ws.name}${marker}`);
    }
  });

configCmd
  .command("default")
  .description("set default workspace")
  .argument("<name>", "workspace name")
  .action((name) => {
    if (setDefaultWorkspace(name)) {
      console.log(`Default workspace set to "${name}".`);
    } else {
      console.error(`Workspace "${name}" not found.`);
    }
  });

// ============================================================================
// GRAPHQL COMMAND - The core command for direct API access
// ============================================================================
program
  .command("gql")
  .alias("graphql")
  .description("execute raw GraphQL query/mutation")
  .argument("<query>", "GraphQL query string or @filename to read from file")
  .option("-v, --variables <json>", "variables as JSON string or @filename")
  .action(async (query, opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);

    // Handle @filename syntax
    let queryStr = query;
    if (query.startsWith("@")) {
      queryStr = readFileSync(query.slice(1), "utf-8");
    }

    let variables: Record<string, unknown> | undefined;
    if (opts.variables) {
      if (opts.variables.startsWith("@")) {
        variables = JSON.parse(readFileSync(opts.variables.slice(1), "utf-8"));
      } else {
        variables = JSON.parse(opts.variables);
      }
    }

    try {
      const result = await graphql(apiKey, queryStr, variables);
      console.log(formatOutput(result, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// SHORTCUT COMMANDS - Common operations with simpler syntax
// ============================================================================

// --- Viewer ---
program
  .command("me")
  .description("get current user info")
  .action(async (_, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.viewer);
      const data = (result.data as { viewer: unknown })?.viewer;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Teams ---
program
  .command("teams")
  .description("list all teams")
  .action(async (_, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.teams);
      const data = (result.data as { teams: { nodes: unknown[] } })?.teams
        ?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- My Issues (assigned to me) ---
program
  .command("my")
  .description("list issues assigned to me")
  .option("-n, --limit <number>", "max issues to return", "50")
  .action(async (opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.myIssues, {
        first: parseInt(opts.limit, 10),
      });
      const data = (
        result.data as { viewer: { assignedIssues: { nodes: unknown[] } } }
      )?.viewer?.assignedIssues?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Issues ---
program
  .command("issues")
  .description("list issues")
  .option("-t, --team <team>", "filter by team name, key, or ID")
  .option("-a, --assignee <user>", "filter by assignee (use 'me' for self)")
  .option("-n, --limit <number>", "max issues to return", "50")
  .action(async (opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      let teamId: string | undefined;
      let assigneeId: string | undefined;

      if (opts.team) {
        teamId = await resolveTeam(apiKey, opts.team);
      }
      if (opts.assignee) {
        assigneeId = await resolveUser(apiKey, opts.assignee);
      }

      const variables: Record<string, unknown> = {
        first: parseInt(opts.limit, 10),
      };
      let query: string;

      if (assigneeId) {
        query = QUERIES.issuesByAssignee;
        variables.assigneeId = assigneeId;
      } else if (teamId) {
        query = QUERIES.issuesByTeam;
        variables.teamId = teamId;
      } else {
        query = QUERIES.issuesAll;
      }

      const result = await graphql(apiKey, query, variables);
      const data = (result.data as { issues: { nodes: unknown[] } })?.issues
        ?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Issue (single) ---
program
  .command("issue")
  .description("get issue by ID (e.g., ABC-123)")
  .argument("<id>", "issue identifier")
  .action(async (id, _, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.issue, { id });
      const data = (result.data as { issue: unknown })?.issue;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Search ---
program
  .command("search")
  .description("search issues")
  .argument("<query>", "search query")
  .option("-n, --limit <number>", "max results", "25")
  .action(async (query, opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.search, {
        query,
        first: parseInt(opts.limit, 10),
      });
      const data = (result.data as { issues: { nodes: unknown[] } })?.issues
        ?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Create Issue ---
program
  .command("create-issue")
  .description("create a new issue")
  .requiredOption("-t, --team <team>", "team name, key, or ID")
  .requiredOption("--title <title>", "issue title")
  .option("-d, --description <desc>", "issue description (markdown)")
  .option("-s, --state <state>", "workflow state name or ID")
  .option(
    "-a, --assignee <user>",
    "assignee name, email, or ID (use 'me' for self)",
  )
  .option(
    "-p, --priority <priority>",
    "priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)",
  )
  .option("-l, --labels <labels>", "comma-separated label names or IDs")
  .option("-e, --estimate <points>", "estimate points")
  .action(async (opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);

    try {
      // Resolve team
      const teamId = await resolveTeam(apiKey, opts.team);

      const input: Record<string, unknown> = {
        teamId,
        title: opts.title,
      };

      if (opts.description) input.description = opts.description;
      if (opts.state)
        input.stateId = await resolveState(apiKey, opts.state, teamId);
      if (opts.assignee)
        input.assigneeId = await resolveUser(apiKey, opts.assignee);
      if (opts.priority) input.priority = parseInt(opts.priority, 10);
      if (opts.labels)
        input.labelIds = await resolveLabels(apiKey, opts.labels);
      if (opts.estimate) input.estimate = parseInt(opts.estimate, 10);

      const result = await graphql(apiKey, MUTATIONS.createIssue, { input });
      const data = (result.data as { issueCreate: { issue: unknown } })
        ?.issueCreate?.issue;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Update Issue ---
program
  .command("update-issue")
  .description("update an issue")
  .argument("<id>", "issue identifier (e.g., ABC-123)")
  .option("--title <title>", "new title")
  .option("-d, --description <desc>", "new description")
  .option(
    "-s, --state <state>",
    "new state name or ID (e.g., 'Done', 'In Progress')",
  )
  .option(
    "-a, --assignee <user>",
    "new assignee name, email, or ID (use 'me' for self)",
  )
  .option("-p, --priority <priority>", "new priority")
  .option("-e, --estimate <points>", "new estimate")
  .action(async (id, opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);

    try {
      const input: Record<string, unknown> = {};
      if (opts.title) input.title = opts.title;
      if (opts.description) input.description = opts.description;
      if (opts.state) input.stateId = await resolveState(apiKey, opts.state);
      if (opts.assignee)
        input.assigneeId = await resolveUser(apiKey, opts.assignee);
      if (opts.priority) input.priority = parseInt(opts.priority, 10);
      if (opts.estimate) input.estimate = parseInt(opts.estimate, 10);

      if (Object.keys(input).length === 0) {
        console.error("No updates provided.");
        process.exit(1);
      }

      const result = await graphql(apiKey, MUTATIONS.updateIssue, {
        id,
        input,
      });
      const data = (result.data as { issueUpdate: { issue: unknown } })
        ?.issueUpdate?.issue;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Comment ---
program
  .command("comment")
  .description("add comment to issue")
  .argument("<issue-id>", "issue identifier")
  .argument("<body>", "comment body (markdown)")
  .action(async (issueId, body, _, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, MUTATIONS.createComment, {
        issueId,
        body,
      });
      const data = (result.data as { commentCreate: { comment: unknown } })
        ?.commentCreate?.comment;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Projects ---
program
  .command("projects")
  .description("list all projects")
  .action(async (_, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.projects);
      const data = (result.data as { projects: { nodes: unknown[] } })?.projects
        ?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Project (single) ---
program
  .command("project")
  .description("get project details by ID or name")
  .argument("<id>", "project ID or name")
  .option("-c, --content", "include full project document content")
  .action(async (idOrName, opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      // If not a UUID, search by name first
      let projectId = idOrName;
      if (!idOrName.match(/^[0-9a-f-]{36}$/i)) {
        const listResult = await graphql(apiKey, QUERIES.projects);
        const projects = (
          listResult.data as {
            projects: { nodes: Array<{ id: string; name: string }> };
          }
        )?.projects?.nodes;
        const found = projects?.find(
          (p) => p.name.toLowerCase() === idOrName.toLowerCase(),
        );
        if (!found) {
          console.error(`Project "${idOrName}" not found`);
          process.exit(1);
        }
        projectId = found.id;
      }

      const query = opts.content ? QUERIES.projectWithContent : QUERIES.project;
      const result = await graphql(apiKey, query, { id: projectId });
      const project = (result.data as { project: Record<string, unknown> })
        ?.project;

      if (format === "json") {
        console.log(formatOutput(project, format as OutputFormat));
        return;
      }

      // Nice markdown output
      const lines: string[] = [];
      lines.push(`# ${project.name}`);
      lines.push("");
      if (project.description) {
        lines.push(String(project.description));
        lines.push("");
      }
      lines.push(`**State:** ${project.state}`);
      if (project.progress !== undefined) {
        lines.push(
          `**Progress:** ${Math.round((project.progress as number) * 100)}%`,
        );
      }
      if (project.startDate) lines.push(`**Start:** ${project.startDate}`);
      if (project.targetDate) lines.push(`**Target:** ${project.targetDate}`);

      const lead = project.lead as { name?: string } | undefined;
      if (lead?.name) lines.push(`**Lead:** ${lead.name}`);

      const members = project.members as
        | { nodes?: Array<{ name: string }> }
        | undefined;
      if (members?.nodes?.length) {
        lines.push(
          `**Members:** ${members.nodes.map((m) => m.name).join(", ")}`,
        );
      }

      const teams = project.teams as
        | { nodes?: Array<{ name: string }> }
        | undefined;
      if (teams?.nodes?.length) {
        lines.push(`**Teams:** ${teams.nodes.map((t) => t.name).join(", ")}`);
      }

      if (project.url) lines.push(`**URL:** ${project.url}`);

      // External links
      const links = project.externalLinks as
        | { nodes?: Array<{ label: string; url: string }> }
        | undefined;
      if (links?.nodes?.length) {
        lines.push("");
        lines.push("## Links");
        lines.push("");
        for (const link of links.nodes) {
          lines.push(`- [${link.label}](${link.url})`);
        }
      }

      // Milestones
      const milestones = project.projectMilestones as
        | {
            nodes?: Array<{
              id: string;
              name: string;
              targetDate?: string;
              status?: string;
              progress?: number;
            }>;
          }
        | undefined;
      if (milestones?.nodes?.length) {
        lines.push("");
        lines.push("## Milestones");
        lines.push("");
        for (const m of milestones.nodes) {
          const progress =
            m.progress !== undefined ? ` (${Math.round(m.progress)}%)` : "";
          const target = m.targetDate ? ` - ${m.targetDate}` : "";
          const status = m.status ? ` [${m.status}]` : "";
          lines.push(`- **${m.name}**${progress}${status}${target}`);
        }
      }

      // Full content doc if requested
      if (opts.content && project.content) {
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push("## Project Document");
        lines.push("");
        lines.push(String(project.content));
      }

      console.log(lines.join("\n"));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Milestones ---
program
  .command("milestones")
  .description("list project milestones")
  .argument("<project>", "project ID or name")
  .action(async (projectArg, _, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      // Resolve project name to ID if needed
      let projectId = projectArg;
      let projectName = projectArg;
      if (!projectArg.match(/^[0-9a-f-]{36}$/i)) {
        const listResult = await graphql(apiKey, QUERIES.projects);
        const projects = (
          listResult.data as {
            projects: { nodes: Array<{ id: string; name: string }> };
          }
        )?.projects?.nodes;
        const found = projects?.find(
          (p) => p.name.toLowerCase() === projectArg.toLowerCase(),
        );
        if (!found) {
          console.error(`Project "${projectArg}" not found`);
          process.exit(1);
        }
        projectId = found.id;
        projectName = found.name;
      }

      // Use inline filter since GraphQL variables don't work well with nested filters
      const query = `query { projectMilestones(filter: { project: { id: { eq: "${projectId}" } } }) {
        nodes { id name description targetDate status progress }
      }}`;
      const result = await graphql(apiKey, query);
      const data = (result.data as { projectMilestones: { nodes: unknown[] } })
        ?.projectMilestones?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Milestone (single) ---
program
  .command("milestone")
  .description("get milestone details with issues")
  .argument("<id>", "milestone ID")
  .action(async (id, _, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.milestone, { id });
      const milestone = (
        result.data as { projectMilestone: Record<string, unknown> }
      )?.projectMilestone;

      if (format === "json") {
        console.log(formatOutput(milestone, format as OutputFormat));
        return;
      }

      // Nice markdown output
      const lines: string[] = [];
      lines.push(`# ${milestone.name}`);
      lines.push("");
      if (milestone.description) {
        lines.push(String(milestone.description));
        lines.push("");
      }

      const project = milestone.project as { name?: string } | undefined;
      if (project?.name) lines.push(`**Project:** ${project.name}`);
      if (milestone.status) lines.push(`**Status:** ${milestone.status}`);
      if (milestone.progress !== undefined) {
        lines.push(
          `**Progress:** ${Math.round(milestone.progress as number)}%`,
        );
      }
      if (milestone.targetDate)
        lines.push(`**Target:** ${milestone.targetDate}`);

      const issues = milestone.issues as
        | {
            nodes?: Array<{
              identifier: string;
              title: string;
              state?: { name: string };
            }>;
          }
        | undefined;
      if (issues?.nodes?.length) {
        lines.push("");
        lines.push("## Issues");
        lines.push("");
        for (const issue of issues.nodes) {
          const state = issue.state?.name ? ` [${issue.state.name}]` : "";
          lines.push(`- **${issue.identifier}:** ${issue.title}${state}`);
        }
      }

      console.log(lines.join("\n"));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Users ---
program
  .command("users")
  .description("list all users")
  .action(async (_, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.users);
      const data = (result.data as { users: { nodes: unknown[] } })?.users
        ?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Workflow States ---
program
  .command("states")
  .description("list workflow states")
  .option("-t, --team <team>", "filter by team name, key, or ID")
  .action(async (opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      let teamId: string | undefined;
      if (opts.team) {
        teamId = await resolveTeam(apiKey, opts.team);
      }
      const query = teamId
        ? QUERIES.workflowStatesByTeam
        : QUERIES.workflowStatesAll;
      const variables = teamId ? { teamId } : undefined;
      const result = await graphql(apiKey, query, variables);
      const data = (result.data as { workflowStates: { nodes: unknown[] } })
        ?.workflowStates?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Labels ---
program
  .command("labels")
  .description("list all labels")
  .action(async (_, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.labels);
      const data = (result.data as { issueLabels: { nodes: unknown[] } })
        ?.issueLabels?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Cycles ---
program
  .command("cycles")
  .description("list cycles (sprints)")
  .option("-t, --team <team>", "filter by team name, key, or ID")
  .action(async (opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      let teamId: string | undefined;
      if (opts.team) {
        teamId = await resolveTeam(apiKey, opts.team);
      }
      const query = teamId ? QUERIES.cyclesByTeam : QUERIES.cyclesAll;
      const variables = teamId ? { teamId } : undefined;
      const result = await graphql(apiKey, query, variables);
      const data = (result.data as { cycles: { nodes: unknown[] } })?.cycles
        ?.nodes;
      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// INBOX / NOTIFICATIONS
// ============================================================================

// --- Inbox ---
program
  .command("inbox")
  .description("list notifications (inbox)")
  .option("-a, --all", "include read notifications")
  .option("-n, --limit <number>", "max notifications", "20")
  .action(async (opts, cmd) => {
    const { workspace, format } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.inbox, {
        first: parseInt(opts.limit, 10),
      });
      let data = (result.data as { notifications: { nodes: unknown[] } })
        ?.notifications?.nodes;

      // Filter unread unless --all
      if (!opts.all && Array.isArray(data)) {
        data = data.filter((n: unknown) => !(n as { readAt?: string }).readAt);
      }

      // Flatten for better display
      if (format !== "json" && Array.isArray(data)) {
        data = data.map((n: unknown) => {
          const notif = n as Record<string, unknown>;
          const issue = notif.issue as
            | { identifier?: string; title?: string }
            | undefined;
          const project = notif.project as { name?: string } | undefined;
          return {
            type: notif.type,
            issue: issue ? `${issue.identifier}: ${issue.title}` : undefined,
            project: project?.name,
            createdAt: notif.createdAt,
            read: notif.readAt ? "yes" : "no",
            snoozed: notif.snoozedUntilAt ? "yes" : "no",
            id: notif.id,
          };
        });
      }

      console.log(formatOutput(data, format as OutputFormat));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Inbox unread count ---
program
  .command("inbox-count")
  .description("get unread notification count")
  .action(async (_, cmd) => {
    const { workspace } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, QUERIES.inboxUnread);
      const count = (result.data as { notificationsUnreadCount: number })
        ?.notificationsUnreadCount;
      console.log(count);
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Mark notification read ---
program
  .command("inbox-read")
  .description("mark notification(s) as read")
  .argument("[id]", "notification ID (omit to mark all read)")
  .action(async (id, _, cmd) => {
    const { workspace } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      if (id) {
        // Mark single notification read
        const mutation = `mutation { notificationUpdate(id: "${id}", input: { readAt: "${new Date().toISOString()}" }) { success } }`;
        const result = await graphql(apiKey, mutation);
        const success = (
          result.data as { notificationUpdate: { success: boolean } }
        )?.notificationUpdate?.success;
        console.log(success ? "Marked as read" : "Failed");
      } else {
        // Mark all read
        const result = await graphql(apiKey, MUTATIONS.markAllRead);
        const success = (
          result.data as { notificationMarkReadAll: { success: boolean } }
        )?.notificationMarkReadAll?.success;
        console.log(success ? "All marked as read" : "Failed");
      }
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Snooze notification ---
program
  .command("inbox-snooze")
  .description("snooze a notification")
  .argument("<id>", "notification ID")
  .option("-d, --duration <hours>", "hours to snooze", "4")
  .action(async (id, opts, cmd) => {
    const { workspace } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const hours = parseInt(opts.duration, 10);
      const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const mutation = `mutation { notificationUpdate(id: "${id}", input: { snoozedUntilAt: "${until}" }) { success } }`;
      const result = await graphql(apiKey, mutation);
      const success = (
        result.data as { notificationUpdate: { success: boolean } }
      )?.notificationUpdate?.success;
      console.log(success ? `Snoozed for ${hours} hours` : "Failed");
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// --- Archive notification ---
program
  .command("inbox-archive")
  .description("archive a notification")
  .argument("<id>", "notification ID")
  .action(async (id, _, cmd) => {
    const { workspace } = cmd.optsWithGlobals();
    const apiKey = getApiKey(workspace);
    try {
      const result = await graphql(apiKey, MUTATIONS.archiveNotification, {
        id,
      });
      const success = (
        result.data as { notificationArchive: { success: boolean } }
      )?.notificationArchive?.success;
      console.log(success ? "Archived" : "Failed");
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

// ============================================================================
// SYNC COMMANDS
// ============================================================================

program
  .command("sync")
  .description("sync Linear data to local JSON files (~/.local/share/linear/)")
  .option("--full", "full sync (re-fetch everything, remove deleted items)")
  .option(
    "-c, --collections <collections>",
    `collections to sync (comma-separated: ${COLLECTIONS.join(",")})`,
  )
  .action(async (opts, cmd) => {
    const { workspace } = cmd.optsWithGlobals();

    // Parse collections
    let collections: Collection[] | undefined;
    if (opts.collections) {
      collections = opts.collections.split(",").map((c: string) => c.trim()) as Collection[];
      const invalid = collections.filter((c) => !COLLECTIONS.includes(c));
      if (invalid.length) {
        console.error(`Invalid collections: ${invalid.join(", ")}`);
        console.error(`Valid collections: ${COLLECTIONS.join(", ")}`);
        process.exit(1);
      }
    }

    // Get workspaces to sync
    const workspaces = workspace
      ? [getWorkspace(workspace)].filter(Boolean) as { name: string; apiKey: string }[]
      : listWorkspaces();

    if (workspaces.length === 0) {
      console.error("No workspaces configured. Run: linear config add <name> <api-key>");
      process.exit(1);
    }

    const startTime = Date.now();

    // Track progress per workspace
    const progress: Record<string, { collection: string; fetched: number }> = {};
    const renderProgress = () => {
      const lines = Object.entries(progress)
        .map(([ws, p]) => `  ${ws}: ${p.collection} (${p.fetched})`)
        .join("\n");
      process.stdout.write(`\r\x1b[K${lines}`);
    };

    console.log(`Syncing ${workspaces.length} workspace(s) concurrently...\n`);

    // Sync all workspaces concurrently
    const results = await Promise.allSettled(
      workspaces.map(async (ws) => {
        progress[ws.name] = { collection: "starting", fetched: 0 };

        const result = await sync(ws.apiKey, {
          full: opts.full,
          collections,
          onProgress: (p) => {
            progress[ws.name] = { collection: p.collection, fetched: p.fetched };
            renderProgress();
          },
        });

        progress[ws.name] = { collection: "done", fetched: 0 };
        return {
          workspace: result.workspaceName,
          synced: result.synced,
          removed: result.removed,
        };
      }),
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\nSync complete in ${elapsed}s\n`);

    // Summary
    console.log("Summary:");
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const wsName = workspaces[i].name;
      if (result.status === "fulfilled") {
        const totalSynced = Object.values(result.value.synced).reduce((a, b) => a + b, 0);
        const totalRemoved = Object.values(result.value.removed).reduce((a, b) => a + b, 0);
        const removedStr = totalRemoved > 0 ? `, ${totalRemoved} removed` : "";
        console.log(`  ${result.value.workspace}: ${totalSynced} items${removedStr}`);
      } else {
        console.error(`  ${wsName}: ERROR - ${result.reason?.message || result.reason}`);
      }
    }
  });

program
  .command("sync-status")
  .description("show sync status for a workspace")
  .argument("[workspace]", "workspace name (uses default if not specified)")
  .action(async (workspaceArg, _, cmd) => {
    // Get workspace name from config or argument
    let workspaceName = workspaceArg;
    if (!workspaceName) {
      const { workspace } = cmd.optsWithGlobals();
      const ws = getWorkspace(workspace);
      if (ws) {
        // Need to fetch org to get urlKey
        const apiKey = ws.apiKey;
        try {
          const result = await graphql(apiKey, QUERIES.syncOrganization);
          workspaceName = (
            result.data as { organization: { urlKey: string } }
          )?.organization?.urlKey;
        } catch {
          // Fall back to workspace config name
          workspaceName = ws.name;
        }
      }
    }

    if (!workspaceName) {
      // List all synced workspaces
      const workspaces = listSyncedWorkspaces();
      if (workspaces.length === 0) {
        console.log("No synced workspaces found.");
        console.log("Run: linear sync");
        return;
      }
      console.log("Synced workspaces:");
      for (const ws of workspaces) {
        console.log(`  ${ws}`);
      }
      return;
    }

    const status = getSyncStatus(workspaceName);
    console.log(`Workspace: ${workspaceName}`);
    console.log(`Data directory: ${status.dataDir}`);
    console.log(
      `Last sync: ${status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "never"}`,
    );
    console.log("\nCollections:");
    for (const [name, info] of Object.entries(status.collections)) {
      const resumeInfo = info.resumeCursor ? " (interrupted)" : "";
      console.log(`  ${name}: ${info.count} items${resumeInfo}`);
    }
  });

program
  .command("sync-reset")
  .description("reset sync state (next sync will be full)")
  .argument("<workspace>", "workspace name")
  .action((workspaceName) => {
    resetSyncState(workspaceName);
    console.log(`Sync state reset for "${workspaceName}".`);
    console.log("Next sync will fetch all data from scratch.");
  });

program.parse();
