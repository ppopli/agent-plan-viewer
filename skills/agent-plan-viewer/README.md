# Installing & Configuring the Agent Plan Viewer Skill 🛠️

This guide provides step-by-step instructions for installing and enabling the **`agent-plan-viewer`** skill across popular AI coding agents, including **Google Antigravity (AGY)**, **Claude Code**, **Cursor**, **OpenAI Codex**, and custom agent pipelines.

---

## ⚡ Single-Command Installation (Fastest)

You can install or update both the global `agent-plan-viewer` CLI binary and the agent skill files with a **single command from npm**:

### Global Machine-Wide Installation (Recommended):
```bash
npx agent-plan-viewer@latest install-skill --global
```
*Installs or updates the `agent-plan-viewer` CLI globally on your system, and installs/updates the skill and rules in `~/.gemini/` (`SKILL.md` + `GEMINI.md`) and `~/.claude/` (`SKILL.md` + `CLAUDE.md`) so all current and future projects can use it.*

### Workspace Installation (Current Project):
```bash
npx agent-plan-viewer@latest install-skill
```
*Installs or updates the global `agent-plan-viewer` CLI binary, installs the skill for all agents in your workspace (`.agents/skills/`, `.claude/skills/`, and `.cursor/rules/`), and updates review instructions in `AGENTS.md` / `CLAUDE.md`.*

### Target a Specific Agent Only:
```bash
# Only Antigravity (AGY)
npx agent-plan-viewer@latest install-skill --target agy

# Only Claude Code
npx agent-plan-viewer@latest install-skill --target claude

# Only Cursor
npx agent-plan-viewer@latest install-skill --target cursor
```

### Via One-Liner Shell Script:
```bash
# Workspace + global CLI install/update
curl -fsSL https://raw.githubusercontent.com/ppopli/agent-plan-viewer/main/scripts/install-skill.sh | bash

# Global skills/rules + global CLI install/update
curl -fsSL https://raw.githubusercontent.com/ppopli/agent-plan-viewer/main/scripts/install-skill.sh | bash -s -- --global
```

---

## 1. Prerequisites

Before installing the skill, ensure your machine satisfies:
- **Node.js**: `v18.0.0` or higher (`node -v`)
- **Package Manager**: `npm` (v9+) or `npx` (`npx -v`)
- **Browser**: Modern web browser (Chrome, Safari, Firefox, Edge) installed on the host OS.

---

## 2. CLI Package Installation

Choose one of three installation methods for the underlying CLI engine:

### Method A: Zero-Install via `npx` (Recommended for CI / Portable Use)
No installation needed! Your agent can invoke:
```bash
npx agent-plan-viewer review <path-to-plan.md> --json
```

### Method B: Global Installation via `npm`
Install once and make `agent-plan-viewer` globally accessible in all shells:
```bash
npm install -g agent-plan-viewer
```

### Method C: Local Workspace Clone & `npm link` (From Source)
If developing locally or working within this repository:
```bash
cd /path/to/agent-plan-viewer
npm install
npm run build      # Compiles both Vite web bundle (dist-web/) and CLI (dist/)
npm link           # Registers 'agent-plan-viewer' globally on your machine
```

---

## 3. Registering the Skill in AI Agents

### A. Google Antigravity (AGY)

#### Option 1: Workspace Installation (Project-Specific)
Place the skill inside the `.agents/skills/` directory at the root of your project:
```bash
mkdir -p .agents/skills/agent-plan-viewer
cp /path/to/agent-plan-viewer/skills/agent-plan-viewer/SKILL.md .agents/skills/agent-plan-viewer/SKILL.md
```

#### Option 2: Global Machine Installation (All Workspaces)
To make the skill automatically available across all projects on your machine:
```bash
mkdir -p ~/.gemini/antigravity-cli/skills/agent-plan-viewer
cp /path/to/agent-plan-viewer/skills/agent-plan-viewer/SKILL.md ~/.gemini/antigravity-cli/skills/agent-plan-viewer/SKILL.md
```

#### Option 3: Enable via Workspace Rules (`AGENTS.md` / `GEMINI.md`)
Add the following instruction to your project's `AGENTS.md` or `GEMINI.md`:
```markdown
## Plan Review Protocol
Whenever creating or updating an architecture or implementation plan:
1. Write the plan to a markdown file (`plan.md`).
2. Run `npx agent-plan-viewer review plan.md --json`.
3. Wait synchronously for user approval.
4. Ingest user feedback from the returned JSON output before editing codebase files.
```

---

### B. Claude Code

Claude Code discovers skills placed in the `.claude/skills/` directory:

1. **Install Skill File**:
   ```bash
   mkdir -p .claude/skills/agent-plan-viewer
   cp /path/to/agent-plan-viewer/skills/agent-plan-viewer/SKILL.md .claude/skills/agent-plan-viewer/SKILL.md
   ```

2. **Add Rule to `CLAUDE.md`**:
   Add this section to your workspace `CLAUDE.md`:
   ```markdown
   ## Implementation Plans
   DO NOT print raw markdown plans directly in the terminal asking for approval.
   Instead, launch the interactive reviewer:
   `npx agent-plan-viewer review <plan-path> --json`
   Read the returned JSON review result and proceed only after `status === "APPROVED"`.
   ```

---

### C. Cursor

For Cursor AI Agent and Composer:

1. Create or edit `.cursorrules` (or `.cursor/rules/plan-review.mdc` in Cursor 0.40+):
   ```markdown
   ---
   description: Interactive plan review workflow using agent-plan-viewer
   globs: ["**/*.md", "plan.md"]
   ---

   # Interactive Plan Review
   When presenting a solution or multi-file architectural plan:
   - Save the plan to `plan.md`.
   - Execute terminal command: `npx agent-plan-viewer review plan.md --json`
   - Wait for user feedback and read the updated markdown before writing code.
   ```

---

### D. Custom Agent Frameworks (Python / Node.js)

If using **LangChain**, **AutoGen**, **CrewAI**, or custom LLM agent scripts, you can execute `agent-plan-viewer` as a tool:

#### Python Example:
```python
import subprocess
import json

def review_plan_interactively(plan_path: str) -> dict:
    """Launches Agent Plan Viewer and blocks until developer submits feedback."""
    cmd = ["npx", "agent-plan-viewer", "review", plan_path, "--json"]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)

# Usage in agent tool loop:
review_data = review_plan_interactively("./plan.md")
if review_data["status"] == "APPROVED":
    print("Plan approved! User instructions:", review_data["userInstructions"])
    # Proceed with autonomous coding
```

---

## 4. Verifying the Installation

Test that your installation is working properly with the included sample plan:

```bash
# Test interactive review session (opens browser at http://localhost:4100)
agent-plan-viewer review ./examples/sample-plans/e-commerce-microservices.md

# Or in inspection / serve mode (non-blocking)
agent-plan-viewer serve ./examples/sample-plans/e-commerce-microservices.md --port 4100
```

1. Browser opens automatically to `http://localhost:4100`.
2. Inspect the **Tasks & Milestones**, **Database Schema**, and **Diagram Canvas**.
3. Click **"Approve & Submit"** or **"Request Changes"**.
4. Observe the clean JSON output in your terminal.

---

## 5. Troubleshooting & FAQs

### Port Already in Use (`EADDRINUSE: 4100`)
If another service is using port 4100, pass `-p <port>`:
```bash
agent-plan-viewer review ./plan.md --port 4200
```

### Running in Headless / Remote Environments (SSH / Docker / Cloud IDEs)
If running on a remote server without a local desktop display:
```bash
agent-plan-viewer review ./plan.md --no-open --port 4100
```
Then forward port `4100` via SSH or open the port in your container configuration and access it from your local browser at `http://localhost:4100`.

### Rebuilding After Source Modifications
If you modify source code in `agent-plan-viewer`, recompile before testing:
```bash
npm run build
```
