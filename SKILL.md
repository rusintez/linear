# Linear CLI Skill

CLI tool for interacting with Linear issue tracker via GraphQL API. Supports multiple workspaces.

**Human-friendly inputs:** Use names instead of UUIDs everywhere - team names/keys, state names, user names/emails, label names.

## Running

```bash
linear <command>     # Globally linked
```

## Workspace Configuration

Configure workspaces with `linear config`:

```bash
linear config add work <api-key>
linear config add personal <api-key>
linear config default work
```

Switch with `-w <workspace>`:

```bash
linear -w personal issues
```

## Quick Reference

### Get Context

```bash
linear me                    # Who am I
linear teams                 # List teams
linear states                # All workflow states
linear states -t MyTeam      # States for specific team (by name!)
linear users                 # List users
linear labels                # List labels
linear project MyProject     # Project details + links + milestones
linear milestones MyProject  # Project milestones
```

### Read Issues

```bash
linear my                    # Issues assigned to me (quick!)
linear issues                # Recent issues across all teams
linear issues -t MyTeam      # By team NAME
linear issues -t ABC         # By team KEY
linear issues -a me          # By assignee (me)
linear issues -a "John Doe"  # By assignee (name)
linear issues -n 20          # Limit results
linear issue ABC-123         # Full issue details
linear search "keyword"      # Search by title/description
```

### Create/Update (human-friendly!)

```bash
# Create - use names, not UUIDs!
linear create-issue -t MyTeam --title "New bug" -p 2
linear create-issue -t MyTeam --title "Task" -s "In Progress" -a me
linear create-issue -t ABC --title "Bug" -a "user@example.com" -l "Bug,Blocker"

# Update - use state NAME
linear update-issue ABC-40 -s Done
linear update-issue ABC-40 -s "In Progress"
linear update-issue ABC-123 -a "John Doe"

# Comment
linear comment ABC-40 "Comment in **markdown**"
```

### Accepted Input Formats

| Field            | Accepts                                     |
| ---------------- | ------------------------------------------- |
| `-t, --team`     | Team name (`MyTeam`), key (`ABC`), or UUID  |
| `-s, --state`    | State name (`Done`, `In Progress`), or UUID |
| `-a, --assignee` | `me`, user name (`John`), email, or UUID    |
| `-l, --labels`   | Label names (`Bug,Feature`) or UUIDs        |
| `<project>`      | Project name (`MyProject`) or UUID          |

### Error Messages

Invalid inputs show available options:

```
Team "invalid" not found. Available: ABC (MyTeam)
State "invalid" not found. Available: Todo, Done, Backlog, In Progress...
User "invalid" not found. Available: John Doe <john@example.com>
```

### Raw GraphQL (full API power)

```bash
linear gql '{ viewer { id } }'
linear gql 'query($id: String!) { issue(id: $id) { title } }' -v '{"id":"ABC-123"}'
linear gql 'mutation { issueArchive(id: "ABC-123") { success } }'
```

## Output Formats

| Flag         | Format        | Use Case               |
| ------------ | ------------- | ---------------------- |
| (default)    | Markdown      | Human readable, tables |
| `-f json`    | JSON          | Parsing, scripting     |
| `-f minimal` | Tab-separated | Simple line processing |

## Inbox (Notifications)

```bash
linear inbox                  # Unread notifications
linear inbox --all            # Include read
linear inbox-count            # Unread count (number only)
linear inbox-read <id>        # Mark single as read
linear inbox-read             # Mark ALL as read
linear inbox-snooze <id>      # Snooze 4 hours
linear inbox-archive <id>     # Archive notification
```

## Priority Values

| Value | Meaning     |
| ----- | ----------- |
| 0     | No priority |
| 1     | Urgent      |
| 2     | High        |
| 3     | Medium      |
| 4     | Low         |

## Sync (Local Data Cache)

Sync Linear data to local JSON files for offline access, searching, and AI tooling.

```bash
linear sync                  # Incremental sync all workspaces (default)
linear sync --full           # Full sync (re-fetch everything, detect deletions)
linear sync -w work          # Sync specific workspace only
linear sync -c issues,projects  # Sync specific collections only
```

### Sync Status

```bash
linear sync-status           # Show sync status for all workspaces
linear sync-status runcible  # Status for specific workspace
linear sync-reset runcible   # Reset sync state (next sync = full)
```

### Data Location

```
~/.local/share/linear/{workspace}/
├── organization.json
├── teams/{id}.json
├── users/{id}.json
├── issues/{id}.json
├── projects/{id}.json
├── milestones/{id}.json
├── cycles/{id}.json
├── workflowStates/{id}.json
├── labels/{id}.json
├── notifications/{id}.json
└── .sync-state.json
```

### Collections

| Collection | Description |
|------------|-------------|
| teams | Teams with name, key, color |
| users | Workspace members |
| issues | All issues with state, assignee, labels |
| projects | Projects with progress, dates |
| milestones | Project milestones |
| cycles | Sprints/iterations |
| workflowStates | Todo, In Progress, Done, etc. |
| labels | Issue labels |
| notifications | Inbox notifications |

See `schema.md` for full field documentation.

## Notes

- Config: `~/.config/linear-cli/config.json`
- Sync data: `~/.local/share/linear/`
- Markdown supported in descriptions and comments
- Issue IDs: UUID or identifier (`ABC-123`)
