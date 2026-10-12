# Technical Specifications: Agent Plan Viewer

## 1. REST API Specification

### `GET /api/plan`
Returns current plan data parsed from disk or initial server load.
- **Response**:
  ```json
  {
    "rawMarkdown": "string",
    "goal": { "title": "string", "description": "string" },
    "tasks": [
      {
        "id": "task-1",
        "title": "string",
        "completed": false,
        "indent": 0,
        "notes": "Optional inline note attached by user"
      }
    ],
    "fileChanges": [
      { "path": "string", "type": "NEW" | "MODIFY" | "DELETE", "summary": "string" }
    ],
    "diagrams": [
      {
        "id": "diag-1",
        "type": "flowchart" | "sequence",
        "rawMermaid": "string",
        "nodes": [
          {
            "id": "A",
            "type": "service" | "database" | "queue" | "gateway" | "actor",
            "label": "API Gateway",
            "x": 100,
            "y": 150,
            "shape": "box" | "cylinder" | "rounded" | "circle" | "subroutine"
          }
        ],
        "edges": [
          {
            "id": "e-1",
            "source": "A",
            "target": "B",
            "sourceHandle": "right-src",
            "targetHandle": "left-tgt",
            "label": "HTTP",
            "style": "solid" | "dashed" | "thick"
          }
        ],
        "flowSteps": [
          {
            "stepNumber": 1,
            "source": "A",
            "target": "B",
            "label": "Authorize",
            "payload": "{}",
            "response": "{}",
            "status": "success" | "failure"
          }
        ],
        "scenarios": [
          {
            "id": "scen-1",
            "name": "Happy Path: Standard Request Flow",
            "type": "success" | "failure" | "edge_case",
            "description": "Standard execution where all components succeed",
            "steps": [ ... ],
            "touchedComponents": ["A", "B"]
          }
        ]
      }
    ],
    "userInstructions": "string",
    "baselines": [
      { "id": "base-0", "timestamp": 1728734000000, "label": "Initial Plan", "snapshot": { ... } }
    ]
  }
  ```

### `POST /api/save`
Explicit user save action (does NOT close review session).
- **Request Body**: `{ "planState": PlanState, "label": "Draft #N" }`
- **Behavior**:
  1. Serializes `planState` back to Markdown.
  2. Writes updated markdown to plan file on disk.
  3. Appends new `BaselineCheckpoint` to server baselines list (capped at depth 10).
- **Response**: `{ "success": true, "savedAt": 1728734100000, "baselineId": "base-1", "baselinesCount": 2 }`

### `GET /api/baselines`
Returns list of all saved baselines (up to 10).
- **Response**: `{ "baselines": BaselineCheckpoint[] }`

### `POST /api/approve`
Explicit user approval action (closes review session).
- **Request Body**: `{ "planState": PlanState, "userInstructions": "string" }`
- **Behavior**:
  1. Serializes `planState` back to Markdown.
  2. Writes final approved markdown to plan file on disk.
  3. Formulates structured diff and agent instructions.
  4. Resolves CLI blocking promise with `{ status: "APPROVED", diff: ..., userInstructions: ... }`.
  5. Shuts down server gracefully.
- **Response**: `{ "success": true, "status": "APPROVED", "result": ReviewResult }`

### `POST /api/request-changes`
Explicit request changes action (closes review session).
- **Request Body**: `{ "planState": PlanState, "userFeedback": "string" }`
- **Behavior**:
  1. Formulates diff and user requested changes.
  2. Resolves CLI blocking promise with `{ status: "CHANGES_REQUESTED", feedback: ... }`.
  3. Shuts down server gracefully.
- **Response**: `{ "success": true, "status": "CHANGES_REQUESTED", "result": ReviewResult }`

---

## 2. CLI Review Protocol

```bash
agent-plan-viewer review <file-path> [--port <number>] [--no-open] [--json]
```
- **Exit Code 0**: Review session completed (either approved or changes requested). Outputs JSON result payload to `stdout`.
- **Exit Code 1**: Error reading file, port conflict, or unhandled exception.
- **Signal Handling**: SIGINT/SIGTERM cleanly shuts down HTTP & WebSocket server without corrupting disk file.

---

## 3. Verification & Acceptance Criteria Matrix

All formal Acceptance Criteria (AC-01 through AC-08) and comprehensive test scenarios (Happy Paths HP-01 to HP-15, Negative Paths NEG-01 to NEG-05, and Edge Cases EDGE-01 to EDGE-05) are specified with execution results, timestamps, and pass/fail observations in:
👉 **[`context/TESTS.md`](file:///Users/pulkitpopli/pulkit/workspace/agentic-system-design/agent-plan-viewer/context/TESTS.md)**

