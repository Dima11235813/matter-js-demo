# Installation & Configuration

This guide details how to install Serena, initialize it for your project repository, and configure your MCP (Model Context Protocol) clients.

---

## 📥 Installation

The official and recommended way to manage Serena is via **`uv`**, a fast Python package installer and tool runner.

### 1. Prerequisite
Ensure that [uv](https://docs.astral.sh/uv/) is installed on your system.

### 2. Installing Serena CLI
Run the following command to install Serena globally as a command-line tool:
```bash
uv tool install -p 3.13 serena-agent
```

### 3. Updating & Uninstalling
*   **Upgrade**: `uv tool upgrade serena-agent`
*   **Uninstall**: `uv tool uninstall serena-agent`

---

## 🚀 Project Initialization

To allow Serena to index and parse symbols in your workspace (such as TypeScript classes, models, and imports), run the following command in the root directory of your repository:

```bash
# Initialize for default Language Server (LSP) backends
serena init
```

*Note: For projects managed inside JetBrains IDEs, you can initialize using the JetBrains backend:*
```bash
serena init -b JetBrains
```

---

## ⚙️ MCP Client Configuration

Serena runs as an MCP server. You can configure it inside your favorite AI agent interfaces.

### 1. Claude Code (Terminal)
To add Serena to Claude Code, execute this command inside your project directory:

**macOS/Linux:**
```bash
claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context ide-assistant --project $(pwd)
```

**Windows (PowerShell/CMD):**
```powershell
claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context ide-assistant --project $PWD
```

### 2. Claude Desktop
Add the server definition to your `claude_desktop_config.json` configuration file:

```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
        "--context",
        "ide-assistant",
        "--project",
        "/absolute/path/to/your/project"
      ]
    }
  }
}
```

### 3. Cursor or other IDEs
Add an MCP server with the following properties:
*   **Type**: `command`
*   **Command**: `uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context ide-assistant --project /absolute/path/to/your/project`
