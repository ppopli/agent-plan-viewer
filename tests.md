# Agent Plan Viewer - Acceptance Criteria & Test Scenarios Matrix (`tests.md`)

**Last Executed**: 2026-10-16 11:37:30 UTC+05:30  
**Test Suite Status**: **PASS (All Tests Passing - 22 Unit/Integration + 1 Lifecycle E2E + 6 Puppeteer E2E Scenarios + 6 Delete/Deselect E2E + 5 Skill/Multi-Version/No-Diagram E2E)**  
**Target Application**: `http://localhost:4100`  
**Automated Harnesses**:
- `scripts/run-e2e-harness.ts`
- `scripts/test-delete-and-deselect.ts`
- `scripts/test-skill-versions-and-nodiagram.ts`
- `tests/e2e/review-flow.test.ts`  

---

## 1. Acceptance Criteria & Test Matrix

| ID | Test Category | Scenario / Path | Expected Behavior | Last Run | Status | Observations |
|---|---|---|---|---|---|---|
| **AC-01** | **Target Scope** | Inline Goal Title & Description Edit | Editing Target Title or Scope automatically appends a timestamped log to `Agent Instructions & Direct Feedback` | 2026-10-16 | **PASS** | Captured `[16:07] Updated plan goal title: "..."` on blur/done editing |
| **AC-02** | **Task Feedback** | Task Checklist Toggle & Renaming | Toggling checkboxes, renaming titles, or reordering appends timestamped logs to Agent Feedback | 2026-10-16 | **PASS** | `[16:07] Completed task: "..."` and rename logs captured without duplicates |
| **AC-03** | **Task Notes** | Inline Sticky Note Comments | Adding inline note on task creates note pill and appends instruction note | 2026-10-16 | **PASS** | Saved `Ensure Redis distributed lock TTL is set to 3000ms.` |
| **AC-04** | **Data Models** | Database Schema Code Viewer | SQL and data model markdown blocks render with IDE syntax highlighting, copy button, and line numbers | 2026-10-16 | **PASS** | Schema tables (`orders`, `order_items`, `inventory_reservations`) rendered cleanly |
| **AC-05** | **Diagram Canvas** | 4-Way Boundary Linking | Handles rendered on Top, Right, Bottom, Left of every node box, allowing any-point connections | 2026-10-16 | **PASS** | Multi-handle target and source ports active and responsive |
| **AC-06.1**| **Diagram Canvas** | Edge Selection & Click-Outside Deselect | Clicking an edge selects it and enables "Delete Connection". Clicking outside anywhere (canvas pane, top toolbar, page) deselects the edge and disables the Delete button. | 2026-10-16 | **PASS** | Initial state: `Delete` disabled (`opacity-40`). Edge clicked: `Delete Connection` enabled. Clicked pane/outside: `Delete` disabled (`opacity-40`). |
| **AC-06.2**| **Diagram Canvas** | Toolbar Delete Button (Edge) | Clicking the Delete button when an edge is selected deletes the connection, logs to instructions, and disables the Delete button. | 2026-10-16 | **PASS** | Edge deleted (count 5 -> 4), `[14:30] Removed diagram connection: "Client Browser" -> "API Gateway"` logged to feedback, button returned to disabled. |
| **AC-06.3**| **Diagram Canvas** | Node Selection & Toolbar Delete Button | Clicking a node selects it (emerald ring) and changes Delete button to "Delete Component". Clicking the button deletes the node and removes all connected edges. | 2026-10-16 | **PASS** | Node deleted (count 6 -> 5), connected edges cascaded, `[14:30] Removed diagram component: "RabbitMQ Events" (queue)` logged, button disabled. |
| **AC-06.4**| **Diagram Canvas** | Keyboard Delete / Backspace on Nodes & Edges | Pressing `Delete` or `Backspace` on selected node or edge removes it and updates audit instructions. Backspace while editing node title does NOT delete node. | 2026-10-16 | **PASS** | Delete key cleanly delegates to `handleDeleteNode` / `handleDeleteEdge`; input keydown stops propagation. |
| **AC-07** | **Diagram Canvas** | Live Split Mermaid Syntax | 2-way live Mermaid code viewer updates dynamically as canvas changes occur | 2026-10-16 | **PASS** | Live Mermaid code drawer displays synced Mermaid syntax in real-time |
| **AC-08** | **Diagram Feedback** | Component Operations Logging | Adding, renaming, rewiring, or deleting diagram components logs to Agent Feedback audit stream | 2026-10-16 | **PASS** | All component and connection deletions captured in real-time |
| **AC-09** | **Flow Simulator** | Multi-Scenario Directory | Multiple scenarios (Happy path, downstream failure, timeouts) switchable via carousel and searchable slide-over drawer | 2026-10-16 | **PASS** | 5 distinct scenarios browsable in scrollable directory drawer |
| **AC-10** | **Flow Simulator** | Step-by-Step Payload Simulation | Stepping through sequence highlights nodes, shows payloads/responses, and failure rollbacks | 2026-10-16 | **PASS** | Active step animations and failure callout cards render as expected |
| **AC-11** | **History System** | Two-Tier History (Undo/Redo + Baselines) | Tier 1 (10 action-level undo/redo via ⌘Z/⌘⇧Z) and Tier 2 (10 saved baselines checkpoints) work together | 2026-10-16 | **PASS** | Both tiers operate independently without conflict; baselines cap at 10 |
| **AC-12** | **Diff & Prompt** | Rendered Markdown Reader & Terminal Diff | Plan Modifications diff card details task, diagram, and goal changes; agent prompt rendered in styled HTML | 2026-10-16 | **PASS** | Formatted HTML typography with instant toggle to raw terminal monospace |
| **AC-13** | **Persistence** | Strict Non-Autosave & Explicit Submit | File on disk stays untouched during edits; only writes upon explicit "Save Draft" or "Approve & Submit" | 2026-10-16 | **PASS** | Verified via disk fs check before and after explicit API save |
| **AC-14** | **Skill Packaging** | Single-Command Skill Installer (`install-skill`) | Running `npx agent-plan-viewer install-skill` installs `SKILL.md` for Antigravity & Claude Code, `.mdc` rules for Cursor, and updates `AGENTS.md`, `CLAUDE.md`, `.cursorrules` | 2026-10-16 | **PASS** | Verified idempotent installation in isolated temporary workspace |
| **AC-15** | **Skill Execution** | Blocking CLI Review (`review --json`) | Running `review <plan.md> --json` blocks terminal until user clicks "Approve & Submit" or "Request Changes", then exits `0` with structured JSON diff & prompt | 2026-10-16 | **PASS** | Verified blocking process exits `0` with `status: "APPROVED"`, `diff`, and `agentPrompt` |
| **AC-16** | **Multi-Version & Sidebar** | 3 User Version Saves (`v0`..`v3`), Undo/Redo, and Sidebar Revert | Creating `Draft #1`, `Draft #2`, `Draft #3` renders 4 version cards (`v0`..`v3`) in `BaselinesDrawer` with task/diagram stats; reverting to `v1` restores state and pushes to Undo stack | 2026-10-16 | **PASS** | Verified 4 versions (`v3` active, `v2`, `v1`, `v0`), 2x Undo + 1x Redo, and Revert to `v1` + Undo back to `v3` |
| **AC-17** | **No-Diagram Plan** | Text-Only Plan with 0 Diagrams | Loading a markdown plan with no Mermaid blocks shows "Text-Only Plan Mode — No Diagrams Found in Plan" with a `+ Initialize Architecture Diagram` CTA that creates a 3-node starter graph and appends `## System Architecture` on save | 2026-10-16 | **PASS** | Verified empty states in Diagram Canvas & Flow Stepper, 1-click diagram initialization, and markdown serialization |
| **AC-18** | **No-Flow Diagram** | Static Diagram with 0 Connections (`edges.length === 0`) | Loading a diagram that has nodes but 0 edges renders nodes on Diagram Canvas and shows "Static Component Diagram (N Components, 0 Connections)" guidance in Flow Stepper; connecting nodes live-builds flow scenarios | 2026-10-16 | **PASS** | Verified `buildDefaultScenarios` returns `[]` for 0-edge diagrams and `FlowSimulator` displays static component guidance |

---

## 2. Test Execution Harness Details

### Running Unit & Integration Tests:
```bash
npm test
```
- Tests Mermaid parser, graph builder, 0-edge static diagrams, `rebuildDiagramFlows`, auto-layout, plan serializer, text-only plan initialization, markdown parser, and server REST endpoints.
- Total tests: 22 passed.

### Running End-to-End Lifecycle & Persistence Tests:
```bash
npx vitest run tests/e2e
```
- Tests disk immutability before save, explicit draft saves, baseline rotation up to depth 10, goal title/description disk syncing, diagram serialization, and final approval callbacks.
- Total tests: 1 passed.

### Running Automated Puppeteer Visual Regression Harnesses:
```bash
npx tsx scripts/run-e2e-harness.ts
npx tsx scripts/test-delete-and-deselect.ts
npx tsx scripts/test-skill-versions-and-nodiagram.ts
```
- Total paths: 6 paths + 6 delete/deselect checks + 5 skill/multi-version/no-diagram verification checks (100% pass rate).

---

## 3. Evidence Artifacts
- `verify_01_undo_redo_and_header_state.png`: Header bar with both `Undo (5)` and `Redo (1)` active alongside `Baselines 4/10` and `3 / 9 completed (33%)`.
- `verify_02_sidebar_versions_list.png`: Saved Baselines History sidebar listing `v3 (Draft #3 - Active)`, `v2 (Draft #2)`, `v1 (Draft #1)`, and `v0 (Initial Agent Plan)` with task/diagram metrics and instruction previews.
- `verify_03_no_diagram_canvas_empty_state.png`: Diagram Canvas empty state for a text-only plan (`No Diagrams Found in Plan`) with `+ Initialize Architecture Diagram` CTA.
- `verify_04_no_diagram_flow_empty_state.png`: Flow Stepper empty state for a text-only plan (`No Architecture / Sequence Diagram`).
- `verify_05_initialized_diagram_from_empty_plan.png`: Starter 3-node architecture diagram initialized with 1 click from a text-only plan.
- `verify_06_diagram_with_no_flow_edges.png`: Flow Stepper state when a diagram has components but 0 connections (`Static Component Diagram (3 Components, 0 Connections)`).
- `test_edge_selected_delete_enabled.png`: Edge selected with amber highlight and enabled "Delete Connection" toolbar button.
- `test_edge_deselected_delete_disabled.png`: Clicked outside anywhere: edge deselected and Delete button disabled.
- `test_node_selected_delete_enabled.png`: Node selected with emerald highlight and enabled "Delete Component" toolbar button.
- `test_final_audit_feedback_after_deletions.png`: Audit stream capturing both edge and node removals automatically with timestamps.
- `01_document_tasks_schema.png`: Database Schema card and task search filtering.
- `02_inline_note_prefill_feedback.png`: Target Title inline edit, task completion, and auto-populated timestamped Agent Feedback stream.
- `03_diagram_canvas_handles_split_mermaid.png`: 4-way boundary handles on custom nodes and 2-way split Mermaid syntax code drawer.
- `04_flow_scenarios_directory_failure.png`: Slide-over multi-scenario directory list view and downstream timeout rollback failure sequence.
- `05_baselines_drawer_checkpoints.png`: Two-tier baseline checkpoints drawer showing historical snapshots and restore buttons.
- `06_diff_rendered_markdown_reader.png`: Modifications diff card (Target, Tasks, Diagram) and formatted HTML Markdown agent prompt reader.
