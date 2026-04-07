# Linear Schema Reference

This document describes all collections synced by `linear sync` and their field semantics.

Data is stored at `~/.local/share/linear/{workspace_name}/{collection}/{id}.json`

---

## Organization

**File:** `organization.json`

The Linear workspace/organization metadata.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | Organization display name |
| `urlKey` | string | URL-safe slug used in Linear URLs (e.g., `acme` in `linear.app/acme`) |

---

## Teams

**Directory:** `teams/`

Teams are the primary organizational unit in Linear. Issues belong to exactly one team.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | Team display name (e.g., "Engineering") |
| `key` | string | Short prefix for issue identifiers (e.g., "ENG" produces "ENG-123") |
| `description` | string? | Optional team description |
| `color` | string | Hex color code for team branding |
| `icon` | string | Emoji or icon identifier |
| `private` | boolean | Whether team is visible only to members |
| `createdAt` | datetime | When the team was created |
| `updatedAt` | datetime | Last modification timestamp |
| `archivedAt` | datetime? | When archived (null if active) |

---

## Users

**Directory:** `users/`

Workspace members who can be assigned to issues, mentioned, etc.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | Full name |
| `displayName` | string | Preferred display name |
| `email` | string | Email address |
| `avatarUrl` | string? | Profile picture URL |
| `active` | boolean | Whether user account is active |
| `admin` | boolean | Whether user has admin privileges |
| `guest` | boolean | Whether user is a guest (limited access) |
| `createdAt` | datetime | Account creation time |
| `updatedAt` | datetime | Last profile update |
| `archivedAt` | datetime? | When deactivated (null if active) |

---

## Issues

**Directory:** `issues/`

The core work item in Linear. Issues track bugs, features, tasks, etc.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `identifier` | string | Human-readable ID (e.g., "ENG-123") |
| `title` | string | Issue title/summary |
| `description` | string? | Markdown description body |
| `priority` | number | Priority level: 0=none, 1=urgent, 2=high, 3=medium, 4=low |
| `estimate` | number? | Story points or time estimate |
| `dueDate` | date? | Target completion date (YYYY-MM-DD) |
| `state` | object | Current workflow state (see below) |
| `state.id` | string | State UUID |
| `state.name` | string | State name (e.g., "In Progress") |
| `state.type` | string | State category: `backlog`, `unstarted`, `started`, `completed`, `canceled` |
| `assignee` | object? | Assigned user |
| `assignee.id` | string | User UUID |
| `assignee.name` | string | User name |
| `team` | object | Owning team |
| `team.id` | string | Team UUID |
| `team.name` | string | Team name |
| `team.key` | string | Team key prefix |
| `project` | object? | Parent project (if any) |
| `project.id` | string | Project UUID |
| `project.name` | string | Project name |
| `cycle` | object? | Sprint/cycle (if any) |
| `cycle.id` | string | Cycle UUID |
| `cycle.number` | number | Cycle number within team |
| `parent` | object? | Parent issue for sub-issues |
| `parent.id` | string | Parent issue UUID |
| `parent.identifier` | string | Parent issue identifier |
| `labels` | object | Issue labels |
| `labels.nodes` | array | Array of label objects |
| `createdAt` | datetime | When issue was created |
| `updatedAt` | datetime | Last modification time |
| `archivedAt` | datetime? | When archived |
| `completedAt` | datetime? | When moved to completed state |

### Priority Values

| Value | Meaning |
|-------|---------|
| 0 | No priority |
| 1 | Urgent |
| 2 | High |
| 3 | Medium |
| 4 | Low |

### State Types

| Type | Description |
|------|-------------|
| `backlog` | Not yet planned for work |
| `unstarted` | Planned but not started (e.g., "Todo") |
| `started` | Work in progress (e.g., "In Progress", "In Review") |
| `completed` | Successfully finished (e.g., "Done") |
| `canceled` | Closed without completion |

---

## Projects

**Directory:** `projects/`

Projects group related issues toward a larger goal with timelines and progress tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | Project name |
| `description` | string? | Short description |
| `state` | string | Status: `planned`, `started`, `paused`, `completed`, `canceled` |
| `progress` | number | Completion percentage (0.0 to 1.0) |
| `url` | string | Linear web URL |
| `startDate` | date? | Planned start date |
| `targetDate` | date? | Target completion date |
| `lead` | object? | Project lead user |
| `lead.id` | string | User UUID |
| `lead.name` | string | User name |
| `teams` | object | Associated teams |
| `teams.nodes` | array | Array of team objects |
| `createdAt` | datetime | Creation time |
| `updatedAt` | datetime | Last update |
| `archivedAt` | datetime? | When archived |

### Project States

| State | Description |
|-------|-------------|
| `planned` | Not yet started |
| `started` | Active work in progress |
| `paused` | Temporarily on hold |
| `completed` | Successfully finished |
| `canceled` | Abandoned |

---

## Milestones

**Directory:** `milestones/`

Project milestones mark significant checkpoints within a project.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | Milestone name |
| `description` | string? | Milestone description |
| `targetDate` | date? | Target completion date |
| `sortOrder` | number | Display order within project |
| `project` | object | Parent project |
| `project.id` | string | Project UUID |
| `project.name` | string | Project name |
| `createdAt` | datetime | Creation time |
| `updatedAt` | datetime | Last update |
| `archivedAt` | datetime? | When archived |

---

## Documents

**Directory:** `documents/`

Documents (pages) are rich-text content pages in Linear, used for specs, PRDs, and general documentation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `title` | string | Document title |
| `slugId` | string | Short hex slug used in URLs (e.g., `4a64dbbffb28`) |
| `icon` | string? | Icon name or emoji |
| `color` | string? | Hex color code |
| `content` | string | Full markdown body |
| `creator` | object? | User who created the document |
| `creator.id` | string | User UUID |
| `creator.name` | string | User name |
| `updatedBy` | object? | User who last edited |
| `updatedBy.id` | string | User UUID |
| `updatedBy.name` | string | User name |
| `project` | object? | Associated project (if any) |
| `project.id` | string | Project UUID |
| `project.name` | string | Project name |
| `createdAt` | datetime | Creation time |
| `updatedAt` | datetime | Last update |
| `archivedAt` | datetime? | When archived |

### URL Format

Linear document URLs follow the pattern:
`https://linear.app/{org}/document/{title-slug}-{slugId}`

The `slugId` field can be used to look up a document from its URL.

---

## Cycles

**Directory:** `cycles/`

Cycles (sprints) are time-boxed iterations for teams practicing agile/scrum.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `number` | number | Cycle number within the team (1, 2, 3...) |
| `name` | string? | Optional cycle name |
| `description` | string? | Cycle description/goals |
| `startsAt` | datetime | Cycle start date |
| `endsAt` | datetime | Cycle end date |
| `progress` | number | Completion percentage (0.0 to 1.0) |
| `team` | object | Owning team |
| `team.id` | string | Team UUID |
| `team.name` | string | Team name |
| `team.key` | string | Team key |
| `createdAt` | datetime | Creation time |
| `updatedAt` | datetime | Last update |
| `archivedAt` | datetime? | When archived |

---

## Workflow States

**Directory:** `workflowStates/`

Workflow states define the stages issues move through (e.g., Todo -> In Progress -> Done).

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | State name (e.g., "In Progress") |
| `type` | string | Category: `backlog`, `unstarted`, `started`, `completed`, `canceled` |
| `color` | string | Hex color for UI display |
| `description` | string? | State description |
| `position` | number | Sort order in workflow |
| `team` | object | Owning team |
| `team.id` | string | Team UUID |
| `team.name` | string | Team name |
| `team.key` | string | Team key |
| `createdAt` | datetime | Creation time |
| `updatedAt` | datetime | Last update |
| `archivedAt` | datetime? | When archived |

---

## Labels

**Directory:** `labels/`

Labels are tags for categorizing issues (e.g., "bug", "feature", "documentation").

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | Label name |
| `color` | string | Hex color code |
| `description` | string? | Label description |
| `team` | object? | Owning team (null for workspace-wide labels) |
| `team.id` | string | Team UUID |
| `team.name` | string | Team name |
| `createdAt` | datetime | Creation time |
| `updatedAt` | datetime | Last update |
| `archivedAt` | datetime? | When archived |

---

## Notifications

**Directory:** `notifications/`

Inbox notifications for mentions, assignments, comments, etc.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `type` | string | Notification type (see below) |
| `createdAt` | datetime | When notification was created |
| `readAt` | datetime? | When marked as read (null if unread) |
| `snoozedUntilAt` | datetime? | Snooze expiration (null if not snoozed) |
| `archivedAt` | datetime? | When archived |
| `actor` | object? | User who triggered the notification |
| `actor.id` | string | User UUID |
| `actor.name` | string | User name |

### Issue Notifications

Additional fields for issue-related notifications:

| Field | Type | Description |
|-------|------|-------------|
| `issue` | object | Related issue |
| `issue.id` | string | Issue UUID |
| `issue.identifier` | string | Issue identifier (e.g., "ENG-123") |
| `issue.title` | string | Issue title |
| `comment` | object? | Related comment (if comment notification) |
| `comment.id` | string | Comment UUID |
| `comment.body` | string | Comment body text |

### Project Notifications

Additional fields for project-related notifications:

| Field | Type | Description |
|-------|------|-------------|
| `project` | object | Related project |
| `project.id` | string | Project UUID |
| `project.name` | string | Project name |
| `projectUpdate` | object? | Related project update |
| `projectUpdate.id` | string | Update UUID |
| `projectUpdate.body` | string | Update body text |

### Notification Types

| Type | Description |
|------|-------------|
| `issueAssignedToYou` | Issue assigned to you |
| `issueMention` | Mentioned in issue description |
| `issueCommentMention` | Mentioned in a comment |
| `issueNewComment` | New comment on issue you're watching |
| `issueStatusChanged` | Issue state changed |
| `issuePriorityUrgent` | Issue marked as urgent |
| `projectUpdateCreated` | New project update posted |
| `projectUpdateMention` | Mentioned in project update |

---

## Sync State

**File:** `.sync-state.json`

Internal file tracking sync progress (not part of Linear schema).

| Field | Type | Description |
|-------|------|-------------|
| `lastSyncAt` | datetime? | Last successful sync completion time |
| `cursors` | object | Pagination cursors for resume (cleared on completion) |
| `syncedIds` | object | IDs seen in last sync (for cleanup detection) |

---

## Common Patterns

### Timestamps

All timestamps are ISO 8601 format in UTC: `2024-01-15T10:30:00.000Z`

### Nullable Fields

Fields marked with `?` may be `null` or absent. Always check before accessing.

### Archived Items

Most entities have `archivedAt` - when non-null, the item is soft-deleted and typically hidden in Linear UI.

### Relationships

Related entities include minimal data (id + key display fields). Use the ID to look up full details from the corresponding collection.
