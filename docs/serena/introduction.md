# About Serena

**Serena** (`oraios/serena`) is an open-source **coding agent toolkit** designed to act as an "IDE for your AI coding agent." Instead of relying on raw text-based searches (like `grep`) or simple culling (which are often error-prone in large, complex codebases), Serena provides AI agents with deep, symbol-level semantic understanding of code repositories.

---

## 🌟 The Philosophy: Agent-First Design

Unlike traditional developer tools created for human visual interfaces, Serena is built from the ground up for **AI agents** (such as Claude Code, Cursor, Codex, or Gemini CLI) communicating over the **Model Context Protocol (MCP)**. 

By exposing structured APIs that represent code relationships rather than just textual arrays, Serena allows agents to:
1. Navigate code symbol-by-symbol (classes, methods, interfaces, types) instead of relying on line numbers.
2. Make atomic, multi-file refactors with compiler-level confidence.
3. Save up to **70% in token overhead** by reading only the specific, related code blocks instead of sending entire directories in prompts.

---

## 🧬 Semantic Symbol-Level Operations

Serena interfaces with standard **Language Server Protocol (LSP)** servers (like `typescript-language-server` or `vtsls` for TypeScript) to give agents IDE-like superpowers:

*   **Go-to-Definition**: Resolves where a class, enum, or function is declared instantly.
*   **Find All References**: Locates all files and lines referencing a particular code symbol across the repository.
*   **Symbol-Level Refactoring**: Performs structured edits—such as renaming a method or moving an interface—safely across all files that import it.
*   **Type Diagnostics**: Runs compiler checks (like `tsc`) semantically and relays compile errors directly to the agent in a structured diagnostic format.
