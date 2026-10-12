# Capability & Architecture Index

This index routes AI models and developers to the right architecture and specification documents for **Agent Plan Viewer**. **Always read this first before making structural modifications.**

| Document | Purpose | Read when... |
|---|---|---|
| [DESIGN.md](./DESIGN.md) | High-level architecture, design decisions, two-tier history engine, and interaction models | Understanding architectural rationale, history depth management, or diagram state sync |
| [SPEC.md](./SPEC.md) | Technical specs, REST/WebSocket APIs, Graph AST, CLI protocol, and Skill definition | Implementing endpoints, updating schemas, writing CLI runners, or modifying skills |
| [TESTS.md](./TESTS.md) | Acceptance criteria matrix, E2E test scenarios, regression harness, and execution results | Verifying features, running regressions, asserting edge cases, or reviewing visual evidence |

## Core Principles
1. **Never Autosave on User Movement**: Plan files on disk are immutable until the user explicitly hits **"Save Draft"** or **"Approve & Submit"**.
2. **Two-Tier History (Depth 10)**:
   - **Tier 1**: Granular in-memory undo/redo (`⌘Z` / `⌘⇧Z`) for individual node moves and text edits (bounded at 10 items).
   - **Tier 2**: Checkpoint baseline history (up to 10 stored drafts), allowing user to inspect and revert to any saved baseline.
3. **Bi-directional Diagram Sync**: Mermaid flowchart/sequence syntax parses to React Flow interactive nodes/edges and re-serializes back without loss.
4. **Blocking Agent Review Protocol**: When an agent invokes the review skill/command, the CLI blocks and only exits when the human resolves the review session, returning structured feedback to the agent.
