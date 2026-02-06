# onotion

A modern, full-featured Notion CLI.

## Installation

```bash
npm install -g onotion
```

## Setup

1. Create a Notion integration at https://www.notion.so/my-integrations
2. Copy your Internal Integration Token
3. Run:

```bash
onotion auth login
```

## Usage

### Authentication

```bash
onotion auth login          # Store API token
onotion auth logout         # Remove credentials
onotion auth whoami         # Show current user
```

### Search

```bash
onotion search "meeting notes"
onotion search "project" --type page
onotion search "tasks" --type database
```

### Databases

```bash
onotion db list                              # List all databases
onotion db query <database-id>               # Query database
onotion db query <id> --filter '{"property":"Status","select":{"equals":"Done"}}'
onotion db schema <database-id>              # Show database schema
onotion db create -p <parent-page-id> -t "My Database"
```

### Pages

```bash
onotion page get <page-id>                   # Get page details
onotion page get <page-id> --content         # Include page content
onotion page create -p <parent-id> -t "New Page"
onotion page create -p <db-id> --database -t "New Entry"
onotion page update <page-id> --icon "🚀"
onotion page append <page-id> -c "New paragraph"
onotion page append <page-id> --children-file blocks.json
onotion page delete <page-id>
```

### Blocks

```bash
onotion block get <block-id>
onotion block list <page-id>
onotion block append <block-id> -c "Content" --type heading_1
onotion block append <block-id> --children '[{"object":"block","type":"heading_2","heading_2":{"rich_text":[{"type":"text","text":{"content":"Hi"}}]}}]'
onotion block delete <block-id>
```

## Output Formats

All commands support four output formats:

```bash
onotion db list                    # Table (default)
onotion db list -o json            # JSON
onotion db list -o plain           # Plain text
onotion db list -o compact         # JSONL with flattened fields
```

Fields and streaming:

```bash
onotion db query <id> -o json --fields id,title,status
onotion db query <id> -o compact --fields id,title,status
onotion db query <id> -o compact --stream --limit 1000
```

Note: `--stream` is supported with `-o json` or `-o compact`.

## Configuration

Config is stored in `~/.config/onotion/config.json`.

## Releases

Publishing is handled by CI on every push to `main`. The pipeline auto-increments the patch version and publishes to npm, so do not manually tag or publish versions.

## License

MIT
