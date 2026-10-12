---
name: agent-plan-viewer
description: Launches an interactive visual plan viewer and editor for the user to review, edit tasks, adjust diagrams, and simulate request flows before plan execution.
---

# Interactive Plan Review Skill

Whenever you formulate or update an implementation plan, **DO NOT merely present raw markdown on the terminal or ask for approval via text.**
Instead, launch the interactive visual environment using `agent-plan-viewer` so the developer can inspect, edit tasks, drag/modify diagrams, and simulate request flows.

## Instructions for Agents

### Step 1: Write Your Plan to Disk
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
This command will start a local server, open the developer's browser, and block until the developer explicitly finishes their review:
- The user can toggle and add tasks.
- The user can visually edit diagrams (drag nodes, add services/databases, reconnect flows).
- The user can test execution with the Phase 2 Request Flow Stepper.
- The user can undo/redo changes (Tier 1 depth 10) and inspect saved baselines (Tier 2 depth 10).
- The user will explicitly click **"Approve & Submit"** or **"Request Changes"**.

### Step 4: Ingest the Output & Proceed
When the command exits with code `0`, it outputs a structured JSON result to `stdout`:

```json
{
  "status": "APPROVED",
  "planPath": "/path/to/plan.md",
  "diff": {
    "tasksAdded": ["Add Redis cache layer"],
    "tasksRemoved": [],
    "tasksModified": [],
    "diagramChanges": ["Added component 'Redis Cache' (database)", "Connected 'API Gateway' -> 'Redis Cache'"]
  },
  "userInstructions": "Make sure to set cache TTL to 300s.",
  "updatedMarkdown": "..."
}
```

- **If `status === "APPROVED"`**:
  1. Re-read the updated plan file from disk (it now includes all human edits and updated Mermaid diagrams).
  2. Adhere to any `userInstructions`.
  3. Proceed with executing the code changes!

- **If `status === "CHANGES_REQUESTED"`**:
  1. Inspect `userInstructions` and `diff`.
  2. Revise your plan accordingly and re-run `agent-plan-viewer review <plan-path>`.
