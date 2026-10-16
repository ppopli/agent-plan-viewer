---
name: agent-plan-viewer
description: Launches an interactive visual plan and markdown viewer/editor for the user to review, edit any line or section inline, manage tasks, adjust diagrams, and simulate request flows before execution.
---

# Interactive Plan & Markdown Review Skill

Whenever you formulate or update an implementation plan (or when the user asks to visually inspect/edit any Markdown document), **DO NOT merely present raw markdown on the terminal or ask for approval via text.**
Instead, launch the interactive visual environment using `agent-plan-viewer` so the developer can inspect, edit any line or section inline, toggle/add tasks, drag/modify diagrams, and simulate request flows.

## Key Capabilities & Lifecycle Behavior

1. **Auto-Close on Submit / Approve**:
   - When the user clicks **"Approve & Submit"** or **"Request Changes"**, the viewer automatically dispatches the structured JSON diff + feedback to the CLI, closes the browser tab, and terminates the local server.
2. **Live Auto-Reload & Browser Re-Open on File Changes**:
   - While a viewer session is active, a file watcher monitors the target `.md` file on disk. Any external modification to the Markdown document automatically hot-reloads the open browser tab over WebSocket (and creates a new Baseline Checkpoint), or automatically re-opens the browser window if all tabs were closed.
   - Whenever you (the agent) modify a plan document after `CHANGES_REQUESTED` or during an iterative planning loop, **always re-run** `npx agent-plan-viewer review <plan-path> --json` so the updated document opens in the browser.
3. **Universal Markdown Viewer & Inline Line / Section Editor**:
   - Works with **any Markdown (`.md`) file** — even documents without tasks or Mermaid diagrams (e.g., `README.md`, RFCs, system design specs, ADRs).
   - Users can switch between **Structured & Section Editor**, **Line-by-Line Inline Editor (`L1`–`LN`)**, and **Raw Markdown Source**, clicking any section or individual line to edit inline with full Undo/Redo (`⌘Z` / `⌘⇧Z`) and automatic audit logging.

## Prerequisites

Before executing this skill, ensure the following requirements are met:

1. **Runtime & CLI Environment**:
   - **Node.js**: `v18.0.0` or higher (`node -v`).
   - **npm / npx**: Available in system `PATH` (`npx -v`).

2. **Package Setup & Availability**:
   - **Option A (Published / Global via npx)**:
     - Ready to run directly with `npx agent-plan-viewer review <plan-path> --json`.
   - **Option B (Local Repository / Workspace clone)**:
     - Dependencies must be installed and built:
       ```bash
       npm install
       npm run build    # Compiles dist-web/ (Vite frontend) and dist/ (CLI)
       ```
     - Then invoke using `./bin/cli.js review <plan-path> --json` or `node <repo-path>/bin/cli.js review <plan-path> --json`.
     - Alternatively, run `npm link` inside the project to expose `agent-plan-viewer` globally.

3. **Port & Display Access**:
   - **Default Port**: Port `4100` must be accessible. If occupied, specify an alternate port with `-p <port>` (e.g. `-p 4200`).
   - **Browser / Remote Environments**: A modern browser (Chrome, Safari, Brave, Arc, Edge, Firefox) is launched automatically and closed automatically upon submission. In headless environments (Docker, SSH, Cloud VMs, CI), supply the `--no-open` flag.

4. **Markdown / Plan File Requirements**:
   - The target file must exist on disk as a readable and writable UTF-8 Markdown file (`.md`).
   - Supports both structured agent plans (`# <Title>`, `## Goal Description`, `- [ ]` tasks, ````mermaid```` diagrams) and any general Markdown document.

## Instructions for Agents

### Step 1: Write or Update Your Plan / Markdown File on Disk
Write your comprehensive implementation plan or architecture design to a markdown file (e.g., `./plan.md` or your current workspace plan file). Include:
- Execution Goal & Overview
- Checklist tasks (`- [ ] ...`)
- Proposed file changes (`[NEW]`, `[MODIFY]`, `[DELETE]`)
- Mermaid diagrams (fenced with ````mermaid ... ```` for flowcharts or sequence diagrams)

### Step 2: Launch the Interactive Review Tool
Run the CLI review command and await its completion:

```bash
npx agent-plan-viewer review <path-to-plan.md> --json
```

Or if installed locally:
```bash
node ./bin/cli.js review <path-to-plan.md> --json
```

### Step 3: Wait Synchronously for User Approval
This command starts a local server, opens the developer's browser, watches the file for live changes, and blocks until the developer explicitly finishes their review:
- The user can edit **any section or any individual line (`L1`–`LN`) inline**.
- The user can toggle, reorder, annotate, and add tasks.
- The user can visually edit diagrams (drag nodes, add services/databases, reconnect flows).
- The user can test execution with the Request Flow Stepper.
- The user can undo/redo changes (Tier 1 depth 10) and inspect saved baselines (Tier 2 depth 10).
- When the user clicks **"Approve & Submit"** or **"Request Changes"**, the browser tab closes automatically and the CLI resolves.

### Step 4: Ingest the Output & Proceed (or Re-Open on Revision)
When the command exits with code `0`, it outputs a structured JSON result to `stdout`:

```json
{
  "status": "APPROVED",
  "planPath": "/path/to/plan.md",
  "diff": {
    "tasksAdded": ["Add Redis cache layer"],
    "tasksRemoved": [],
    "tasksModified": [],
    "diagramChanges": ["Added component 'Redis Cache' (database)", "Connected 'API Gateway' -> 'Redis Cache'"],
    "goalChanges": ["Modified section \"Key System Specifications & Sizing\""]
  },
  "userInstructions": "[18:10] Edited line L42 in \"Key System Specifications & Sizing\": \"| Max Throughput | 25,000 msgs/sec |\"",
  "updatedMarkdown": "..."
}
```

- **If `status === "APPROVED"`**:
  1. Re-read the updated markdown file from disk (it now includes all inline line/section edits, task updates, and Mermaid diagram changes).
  2. Adhere to any `userInstructions`.
  3. Proceed with executing the code changes!

- **If `status === "CHANGES_REQUESTED"`** (or whenever you update the plan file):
  1. Inspect `userInstructions` and `diff`.
  2. Revise the plan markdown file on disk accordingly.
  3. **Immediately re-launch** `npx agent-plan-viewer review <plan-path> --json` so the updated plan opens in the browser again for the user.

---

> 📖 **Installation & Configuration Reference**: For detailed setup guides across Google Antigravity, Claude Code, Cursor, Codex, and custom frameworks, see [`skills/agent-plan-viewer/README.md`](./README.md).
