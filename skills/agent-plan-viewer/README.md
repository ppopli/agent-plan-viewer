# Installing & Configuring the Agent Plan Viewer Skill 🛠️

This guide provides step-by-step instructions for installing and enabling the **`agent-plan-viewer`** skill for the supported AI coding tools: **Google Antigravity (AGY)**, **Claude Code**, **OpenAI Codex**, and **Cursor**.

---

## ⚡ Single-Command Installation (Fastest)

You can install or update both the `agent-plan-viewer` CLI binary and the agent skill files with a **single command from npm**:

### Local (User-Space) Installation — No Root (`sudo`) Permission Required:
```bash
npx agent-plan-viewer@latest install-skill
```
*Installs or updates `agent-plan-viewer` into your user space (`~/.local/bin/agent-plan-viewer`, automatically adding `~/.local/bin` to your shell `PATH`) **without requiring root (`sudo`) permission**, and installs/updates the workspace skills and rules for **Google Antigravity (AGY)**, **Claude Code**, **OpenAI Codex**, and **Cursor** (`.agents/skills/`, `.claude/skills/`, `.cursor/rules/`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`).*

### Global (System-Wide) Installation — Asks for Root (`sudo`) Permission:
```bash
npx agent-plan-viewer@latest install-skill --global
```
*Installs or updates the `agent-plan-viewer` CLI system-wide (**will ask for root/`sudo` permission** in the terminal if your system's global npm directory requires administrator privileges), and installs/updates global skills and rules in `~/.gemini/` (`SKILL.md` + `GEMINI.md`) and `~/.claude/` (`SKILL.md` + `CLAUDE.md`).*

### Target a Specific Supported Tool Only:
```bash
# Google Antigravity (AGY) & OpenAI Codex (.agents/skills + AGENTS.md)
npx agent-plan-viewer@latest install-skill --target agy

# Claude Code (.claude/skills + CLAUDE.md)
npx agent-plan-viewer@latest install-skill --target claude

# Cursor (.cursor/rules + .cursorrules)
npx agent-plan-viewer@latest install-skill --target cursor
```

### Via One-Liner Shell Script:
```bash
# Local (user-space) CLI + workspace skills install/update (no root/sudo permission required)
curl -fsSL https://raw.githubusercontent.com/ppopli/agent-plan-viewer/main/scripts/install-skill.sh | bash

# Global (system-wide) CLI + global skills/rules install/update (asks for root/sudo permission if needed)
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

### D. OpenAI Codex

OpenAI Codex reads workspace instructions from `AGENTS.md` and `.agents/skills/`:

1. **Install Skill File**:
   ```bash
   mkdir -p .agents/skills/agent-plan-viewer
   cp /path/to/agent-plan-viewer/skills/agent-plan-viewer/SKILL.md .agents/skills/agent-plan-viewer/SKILL.md
   ```

2. **Add Rule to `AGENTS.md`**:
   ```markdown
   ## Interactive Plan Review Protocol (agent-plan-viewer)
   Whenever you formulate or update an implementation plan or architecture design:
   1. DO NOT simply output raw markdown and ask for approval in the terminal.
   2. Save your plan to a markdown file (e.g. `plan.md`).
   3. Launch the interactive viewer: `agent-plan-viewer review plan.md --json` (or `npx agent-plan-viewer review plan.md --json`).
   4. Wait synchronously for the developer to review, edit, and approve in the browser.
   5. Ingest the returned JSON result and user instructions before making any code modifications.
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
