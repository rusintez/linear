# linear-cli

Simple CLI wrapper for Linear GraphQL API. Supports multiple workspaces. Markdown I/O by default.

## Install

```bash
# No build needed - runs TypeScript directly via tsx
cd linear-cli
npm install

# Run directly
npx tsx src/index.ts --help

# Or link globally
npm link
linear --help
```

## Setup

Add your Linear API keys (get from Linear > Settings > Security & access):

```bash
linear config add work <api-key-1>
linear config add personal <api-key-2>
linear config add client <api-key-3>
linear config default work
```

Or use env var for one-off commands:
```bash
LINEAR_API_KEY=lin_api_xxx linear me
```

## Usage

### Config Management

```bash
linear config list              # List all workspaces
linear config add <name> <key>  # Add/update workspace
linear config remove <name>     # Remove workspace
linear config default <name>    # Set default workspace
```

### Direct GraphQL (full API access)

```bash
# Inline query
linear gql '{ viewer { id name email } }'

# With variables
linear gql 'query($id: String!) { issue(id: $id) { title } }' -v '{"id":"ABC-123"}'

# From file
linear gql @query.graphql -v @vars.json

# Different workspace
linear -w personal gql '{ teams { nodes { name } } }'

# Any mutation
linear gql 'mutation { issueArchive(id: "ABC-123") { success } }'
```

### Shortcuts

```bash
# Info
linear me                       # Current user
linear teams                    # List teams  
linear users                    # List users
linear projects                 # List projects
linear labels                   # List labels
linear states                   # List workflow states
linear states -t <teamId>       # States for specific team
linear cycles -t <teamId>       # List cycles/sprints

# Issues
linear issues                   # List issues (most recent)
linear issues -t <teamId>       # Issues for team
linear issues -n 100            # Limit results
linear issue ABC-123            # Get single issue (full detail)
linear search "bug login"       # Search issues by title/description

# Create/Update
linear create-issue -t <teamId> --title "Bug: Login broken" -d "Details here" -p 2
linear update-issue ABC-123 -s <stateId>
linear update-issue ABC-123 --title "New title" -a <userId>
linear comment ABC-123 "This is a comment"
```

### Output Formats

```bash
linear teams              # Markdown table (default) - readable
linear teams -f json      # JSON - best for parsing/scripting
linear teams -f minimal   # Minimal - one item per line, tab-separated
```

### Multi-workspace

```bash
linear -w work issues          # Use 'work' workspace
linear -w personal me          # Use 'personal' workspace
linear -w client projects      # Use 'client' workspace
```

## Output

- **Markdown** (default): Tables for lists, formatted objects for details
- **JSON** (`-f json`): Machine-readable, ideal for scripting
- **Minimal** (`-f minimal`): Tab-separated, one item per line
- Errors go to stderr with exit code 1

## Config Location

`~/.config/linear-cli/config.json`
