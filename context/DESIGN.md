# Design Decisions & Architecture: Agent Plan Viewer

## 1. Problem Statement & Motivation
Modern AI coding agents (Claude Code, Antigravity/AGY, OpenAI Codex, Cursor, etc.) generate implementation plans as static, lengthy Markdown files. Developers typically skim these documents, missing critical architectural flaws, unintended dependency changes, or subtle logic holes.
Furthermore:
- Manually editing markdown checklist tasks or raw ASCII/Mermaid text is tedious.
- Developers cannot easily visualize service interactions or manipulate system diagrams visually.
- There is no synchronous feedback loop where human edits are automatically ingested back into the agent's active planning loop.

Agent Plan Viewer solves this by converting static agent plan markdowns into an interactive, visual web environment with:
1. Two-way document editing (tasks, checklists, risk notes).
2. Visual canvas diagram editing (React Flow) with bidirectional Mermaid translation.
3. Two-Tier History Engine with depth 10 action undo/redo and depth 10 saved baseline checkpoints.
4. Phase 2 Request Flow Stepper animating packet flows and system hops.
5. Synchronous Agent Skill protocol halting agent execution until human approval.

---

## 2. Two-Tier History Engine

```
+-------------------------------------------------------------------------+
|                  TIER 1: Action Undo/Redo (Depth 10)                    |
|   Past Stack [10]  <== Undo / Redo ==>  Present Working Draft           |
|                                         (In-memory, dirty flag = true)  |
+-------------------------------------------------------------------------+
                                    │
                                    │ Explicit User Click: "Save Draft"
                                    ▼
+-------------------------------------------------------------------------+
|              TIER 2: Baseline Checkpoints History (Depth 10)            |
|   Baseline #0 (Initial)  ==>  Baseline #1 (Draft 1) ==> Baseline #N     |
|   * Stored persistently; user can revert present state to any baseline   |
+-------------------------------------------------------------------------+
```

### Rationale
- **No Autosave on Keystrokes or Movement**: Writing to disk on every node drag or character typed causes unnecessary disk I/O, corrupts agent watchers, and prevents deliberate human review before committing changes.
- **Tier 1 (Granular Actions)**:
  - Bounded at a strict depth of 10.
  - When user performs an action (e.g. drags node, edits task text, adds component), previous state is pushed to `past`. If `past.length > 10`, oldest snapshot is discarded.
  - Future stack is wiped whenever a new action is recorded.
- **Tier 2 (Saved Checkpoints)**:
  - Bounded at a strict depth of 10.
  - When user clicks **"Save Draft"**, the server writes the current draft to disk, stamps a new `BaselineCheckpoint`, and appends it to the baselines list (purging beyond 10).
  - User can browse historical baselines in a drawer and click **"Revert to this Baseline"**, seamlessly swapping the working draft back to that saved state.

---

## 3. Visual Diagram & Bidirectional Mermaid Bridge

### Supported Mermaid Constructs
1. **Flowcharts**: `flowchart TD/LR` and `graph TD/LR`:
   - Node shapes:
     - `[Text]` (Rectangle / Service)
     - `[(Text)]` (Cylinder / Database)
     - `(Text)` (Rounded / Gateway)
     - `[[Text]]` (Subroutine / Queue)
     - `{{Text}}` (Hexagon / Actor)
   - Directed edges: `-->`, `-.->`, `==>`, with optional labels `-->|label|`.
2. **Sequence Diagrams**: `sequenceDiagram`:
   - `participant A`, `actor B`
   - Messages: `A->>B: message`, `B-->>A: response`

### React Flow Canvas
- Custom node components provide styled representations for Microservices, Databases, Gateways, Queues, and Actors.
- Canvas supports dragging, adding nodes via toolbar, drawing new edges between handles, and deleting nodes.
- When explicitly saved or submitted, the React Flow graph is re-serialized into clean, idiomatic Mermaid syntax and inserted back into the Markdown document.

---

## 4. Phase 2: Request Flow Simulator

### Concept
System architecture and sequence diagrams represent execution sequences. The Request Flow Simulator parses the sequence of hops (or derives them from sequence messages / flow edges):
- Each hop has: `stepNumber`, `sourceId`, `targetId`, `actionLabel`, `payload`, `status`.
- Controller provides:
  - `Play` / `Pause`
  - `Next` / `Prev` / `Reset`
  - Speed (`0.5x`, `1x`, `2x`)
- Animation:
  - An animated pulsing packet traverses the active edge.
  - Active source and destination nodes illuminate with a glowing halo ring.
  - An inspector panel presents step details, mock request payloads, and potential error/edge cases.

---

## 5. Agent Skill & CLI Review Protocol

1. Agent creates/updates plan markdown.
2. Agent executes: `npx agent-plan-viewer review <plan-path>`.
3. CLI launches Express + WebSocket server on an available port (default 4100), opens the browser, and halts/awaits a resolution promise.
4. User interacts with plan, edits tasks, adjusts diagrams, simulates request flows.
5. User clicks **"Approve & Submit"** (or **"Request Changes"**).
6. Server writes the approved markdown to disk, resolves the CLI promise, prints JSON output to `stdout`:
   ```json
   {
     "status": "APPROVED",
     "planPath": "/path/to/plan.md",
     "diff": {
       "tasksAdded": ["Implement Redis TTL"],
       "tasksModified": [],
       "diagramChanges": ["Added node 'Redis Cache' between 'Gateway' and 'DB'"]
     },
     "userInstructions": "Ensure cache TTL is 300s."
   }
   ```
7. CLI exits with code 0.
8. Agent receives stdout output, ingests changes, and proceeds autonomously!
