# project-tools-mcp

MCP server providing project utility tools for Cursor.

## Tools

| Tool | Description |
|------|-------------|
| `file_stats` | Count files and lines of code grouped by language |
| `todo_scan` | Find TODO, FIXME, HACK comments across the project |
| `dep_check` | List dependencies from package.json, go.mod, or requirements.txt |
| `git_summary` | Show branch, recent commits, and working tree status |

## Setup

1. Clone the repo:

```bash
git clone https://github.com/HaiderManzoor/project-tools-mcp.git ~/.project-tools-mcp
```

2. Install dependencies:

```bash
cd ~/.project-tools-mcp && npm install
```

3. Add to your Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "project-tools": {
      "command": "node",
      "args": ["~/.project-tools-mcp/server.js"]
    }
  }
}
```

4. Reload Cursor — the tools will appear in your tool list.

## Usage

Once configured, you can ask Cursor things like:

- "How many lines of code are in this project?"
- "Are there any TODOs I should address?"
- "What dependencies does this project use?"
- "Show me the recent git history"

## Changelog

### v1.1.0
- Added WARN and DEPRECATED to todo_scan patterns
- Excluded `dist/` and `build/` from file walks
- Increased exec timeout for large repos

### v1.0.0
- Initial release with file_stats, todo_scan, dep_check, git_summary

## License

MIT
