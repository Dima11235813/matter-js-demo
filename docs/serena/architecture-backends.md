# Architecture & Backends

Serena operates by wrapping underlying language servers and exposing their semantic symbol trees to Model Context Protocol (MCP) clients.

---

## 🏗️ Backend System

Serena supports two primary backend options for indexing code:

1.  **Language Server Protocol (LSP) Backend (Default)**:
    *   Integrates directly with command-line language servers (e.g. `typescript-language-server`, `vtsls`, `pyright`, `rust-analyzer`).
    *   Supports over 30 languages out-of-the-box.
    *   **Auto-Installation**: When initialized, Serena attempts to auto-install the correct language server for your project using package managers like `npm`. Make sure `node` and `npm` are globally available on your system path.
2.  **JetBrains Backend**:
    *   Uses a dedicated JetBrains IDE plugin to hook into the IDE's deep semantic index.
    *   Excellent for developers working heavily within WebStorm, IntelliJ IDEA, or PyCharm.

---

## 🔍 Codebase Indexing

For optimal performance in large projects, you should index the workspace before running complex AI tasks. This allows the language server to warm up its caches and resolve symbol tables:

```bash
# Force background project indexing
uvx --from git+https://github.com/oraios/serena serena project index
```

---

## 📊 Monitoring & Dashboard

When the Serena MCP server starts up, it automatically spins up a local web dashboard to monitor connections, active files, and token savings metrics:

*   **URL**: `http://127.0.0.1:24282/dashboard/` (or check console startup logs for custom ports).
*   **Logs**: Shows full LSP request/response traces between the AI client and the language server.
*   **Memory / Context**: Displays symbol graphs currently cached in the agent's context window.

---

## 🤝 Project Onboarding

When starting to work on a new repository with Serena, you can prompt your AI assistant:
> *"Start Serena onboarding"*

This instructs the AI to query Serena's memory capabilities, index the project structure, locate entry points, and outline key files in your workspace.
