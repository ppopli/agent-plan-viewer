# Design Decisions & Architecture: Agent Plan Viewer

## 1. Problem Statement & Motivation
Modern AI coding agents (Claude Code, Antigravity/AGY, OpenAI Codex, Cursor, etc.) generate implementation plans as static, lengthy Markdown files. Developers typically skim these documents, missing critical architectural flaws, unintended dependency changes, or subtle logic holes.
Furthermore:
- Manually editing markdown checklist tasks or raw ASCII/Mermaid text is tedious.
- Developers cannot easily visualize service interactions or manipulate system diagrams visually.
- There is no synchronous feedback loop where human edits are automatically ingested back into the agent's active planning loop.

Agent Plan Viewer solves this by converting static agent plan markdowns into an interactive, visual web environment with:
1. Two-way document editing (tasks, checklists, risk notes, inline task annotations).
2. Clean HTML overview card without raw code or leaked Mermaid syntax.
3. Visual canvas diagram editing (React Flow) with 4-way boundary handles, edge re-mapping, node/edge deletion, and bidirectional Mermaid translation.
4. Two-Tier History Engine with depth 10 action undo/redo and depth 10 saved baseline checkpoints.
5. Phase 2 Request Flow Stepper with Multi-Scenario Simulation (Happy Path, Dependency Failure & Rollback, Auth Rejection, Play All / Stop All playlist controls).
6. Rich Markdown Reader for inspecting agent instructions before dispatch.
7. Synchronous Agent Skill protocol halting agent execution until human approval.

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

### React Flow Canvas & Boundary Manipulation
- **4-Way Boundary Handles**: Each node exposes handles on all 4 boundaries (Top, Right, Bottom, Left) acting as both source and target connection points, allowing natural connection from any side.
- **Edge Reconnect & Remap**: Edges support `reconnectable={true}`, allowing developers to drag existing edge endpoints directly to different nodes or boundary handles.
- **Node & Edge Deletion**:
  - Every node displays a dedicated trash button on hover/selection.
  - Selecting an edge reveals an inline "Delete Connection" toolbar button.
  - Keyboard shortcuts `Backspace` and `Delete` are supported canvas-wide.
- **Bidirectional Synchronization**: When explicitly saved or submitted, the visual canvas graph is re-serialized into clean, idiomatic Mermaid syntax and inserted back into the Markdown document.

---

## 4. Phase 2: Multi-Scenario Request Flow Stepper

### Concept
System architecture and sequence diagrams represent execution sequences. The Request Flow Simulator supports **Multiple Scenarios** to visualize both success and failure modes:

```
[ Execution Scenarios ]
├── 🟢 Happy Path: Standard Request Flow (all hops succeed 200 OK)
├── 🔴 Failure: Downstream Timeout & Rollback (simulates DB/service timeout with circuit breaker)
└── 🔴 Failure: Unauthorized / Invalid Token (simulates 401 rejection at Gateway)
```

### Key Capabilities
- **Scenario Selector**: Allows developers to pick which scenario to inspect with distinct status badges.
- **Components Touched Chips**: Dynamically displays the list of components involved in the chosen scenario.
- **Playlist Controller**:
  - `Play All Scenarios`: Sequentially executes Scenario 1, transitions to Scenario 2, and continues through all scenarios.
  - `Pause All` & `Stop All`: Master playlist controls.
  - Stepper Controls: `First`, `Prev`, `Play / Pause`, `Next`, `Reset` with speed settings (`0.5x`, `1x`, `2x`).
- **Visual Animation**:
  - Traveling pulse along the active edge (amber for success, red for failure).
  - Active sender and receiver nodes illuminate with glowing halos.
  - Failure steps highlight the failed component in a pulsing red alert ring.
- **Step Inspector HUD**: Displays mock HTTP/JSON payloads, expected responses, and failure mode verifications.

---

## 5. Document View & Auto-Populating Agent Feedback

- **Clean Execution Target Card**: Clean HTML view displaying the plan title and overview with an "Edit Target" toggle button, preventing raw code blocks from cluttering the overview.
- **Inline Task Annotations**: Sticky note button on each task item allows attaching specific notes directly to individual checklist steps.
- **Real-Time Auto-Population**: Toggling task completion, editing titles, adding tasks, or writing task notes automatically appends timestamped entries to the **Agent Instructions & Direct Feedback** section in real-time.
- **Freeform Instructions**: The developer can still write, format, and adjust overall guidelines in the feedback textarea.

---

## 6. Rich Markdown Reader & Agent Review Protocol

- **Dual-View Preview**: Diff & Agent Prompt preview offers a toggle between **"Rendered View"** (rich GitHub-style HTML typography powered by `marked`) and **"Raw Terminal"** (monospace code block).
- **Execution Protocol**:
  1. Agent creates/updates plan markdown.
  2. Agent executes: `npx agent-plan-viewer review <plan-path> --json`.
  3. CLI launches server, opens browser, and halts/awaits a resolution promise.
  4. User interacts with plan, edits tasks, adjusts diagrams, simulates request flows.
  5. User clicks **"Approve & Submit"** (or **"Request Changes"**).
  6. Server writes the approved markdown to disk, resolves the CLI promise, prints JSON output to `stdout`.
  7. CLI exits with code 0.
  8. Agent receives stdout output, ingests changes, and proceeds autonomously!
