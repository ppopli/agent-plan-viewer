# Interactive Plan Review Protocol (agent-plan-viewer)

Whenever you formulate or update an implementation plan or architecture design:
1. DO NOT simply output raw markdown and ask for approval in the terminal.
2. Save your plan to a markdown file (e.g. `plan.md`). Ensure the plan includes fenced ```mermaid``` diagrams (`flowchart TD`/`LR`, `sequenceDiagram`, or `erDiagram`); if a plan lacks Mermaid diagrams, generate and embed them in Mermaid format first.
3. Launch the interactive viewer: `agent-plan-viewer review plan.md --json` (or `npx agent-plan-viewer review plan.md --json`).
4. Wait synchronously for the developer to review, edit, and approve in the browser.
5. Re-read the updated plan file from disk, accept any component, position, or edge changes made in the Diagram Viewer (`diff.diagramChanges` and `%% @apv-layout` metadata) as-is, update only the Mermaid diagram and plan sections in the markdown file (do not edit code during plan review) so the diagram renders updated on next view, and follow `userInstructions` before making code modifications.
