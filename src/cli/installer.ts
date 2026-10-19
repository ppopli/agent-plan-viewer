import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InstallSkillOptions {
  target?: 'all' | 'agy' | 'claude' | 'cursor';
  global?: boolean;
  dryRun?: boolean;
  skipRules?: boolean;
}

export function getSkillContent(): string {
  // Try reading from workspace skills/ folder first
  const possiblePaths = [
    path.resolve(__dirname, '../../skills/agent-plan-viewer/SKILL.md'),
    path.resolve(__dirname, '../../../skills/agent-plan-viewer/SKILL.md'),
    path.resolve(process.cwd(), 'skills/agent-plan-viewer/SKILL.md'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }

  // Fallback bundled template
  return `---
name: agent-plan-viewer
description: Launches an interactive visual plan and markdown viewer/editor for the user to review, edit any line or section inline, manage tasks, adjust diagrams, and simulate request flows before execution.
---

# Interactive Plan & Markdown Review Skill

Whenever you formulate or update an implementation plan (or when the user asks to visually inspect/edit any Markdown document), **DO NOT merely present raw markdown on the terminal or ask for approval via text.**
Instead, launch the interactive visual environment using \`agent-plan-viewer\` so the developer can inspect, edit any line or section inline, toggle/add tasks, drag/modify diagrams, and simulate request flows.

## Key Capabilities & Lifecycle Behavior

1. **Auto-Close on Submit / Approve**:
   - When the user clicks **"Approve & Submit"** or **"Request Changes"**, the viewer automatically dispatches the structured JSON diff + feedback to the CLI, closes the browser tab, and terminates the local server.
2. **Live Auto-Reload & Browser Re-Open on File Changes**:
   - While a viewer session is active, a file watcher monitors the target \`.md\` file on disk. Any external modification to the Markdown document automatically hot-reloads the open browser tab over WebSocket, or automatically re-opens the browser window if all tabs were closed.
3. **Universal Markdown Viewer & Inline Line / Section Editor**:
   - Works with **any Markdown (\`.md\`) file** — even documents without tasks or Mermaid diagrams.
   - Users can switch between **Structured & Section Editor**, **Line-by-Line Inline Editor (\`L1\`–\`LN\`)**, and **Raw Markdown Source**, clicking any section or individual line to edit inline with full Undo/Redo (\`⌘Z\` / \`⌘⇧Z\`) and automatic audit logging.
4. **Hierarchical Task Checklist & Cascade Completion**:
   - Marking a parent task (or milestone phase header) completed automatically cascades down to complete all nested subtasks. Unchecking or toggling maintains upward hierarchical consistency, automatically synchronizing changes back to raw markdown.
5. **Plan-Driven Request Flow Simulation**:
   - Flow scenarios in the Flow Simulator are extracted directly from the plan document (scenario headings, failure mode lists, tables, and Mermaid \`alt\`/\`else\` sequence branches) or fallback strictly to the primary diagram flow—eliminating hardcoded scenarios.

## Prerequisites

Before executing this skill, ensure the following requirements are met:
1. **Node.js**: \`v18.0.0\` or higher (\`node -v\`).
2. **npm / npx**: Available in system \`PATH\` (\`npx -v\`).
3. **Port & Display**: Port 4100 must be accessible (or pass \`-p <port>\`). In headless environments, pass \`--no-open\`.

## Instructions for Agents

### Step 1: Write or Update Your Plan / Markdown File on Disk
Write your comprehensive implementation plan or architecture design to a markdown file (e.g., \`./plan.md\`). Include:
- Execution Goal & Overview
- Checklist tasks (\`- [ ] ...\`)
- Proposed file changes (\`[NEW]\`, \`[MODIFY]\`, \`[DELETE]\`)
- Mermaid diagrams (fenced with \`\`\`mermaid ... \`\`\`)

### Step 2: Launch the Interactive Review Tool
Run the CLI review command and await its completion:

\`\`\`bash
npx agent-plan-viewer review <path-to-plan.md> --json
\`\`\`

### Step 3: Wait Synchronously for User Approval
The command starts a local server, opens the developer's browser, watches the file for live changes, and blocks until the developer explicitly finishes their review in the browser.

### Step 4: Ingest the Output & Proceed (or Re-Open on Revision)
When the command exits with code \`0\`, parse the structured JSON from stdout:
- **If \`status === "APPROVED"\`**:
  1. Re-read the updated plan/markdown file from disk.
  2. Adhere to any \`userInstructions\`.
  3. Proceed with executing the code changes!
- **If \`status === "CHANGES_REQUESTED"\`**:
  1. Inspect \`userInstructions\` and \`diff\`.
  2. Revise your plan accordingly and re-run \`npx agent-plan-viewer review <plan-path> --json\`.
`;
}

const AGENT_RULE_TEXT = `
## Interactive Plan Review Protocol (agent-plan-viewer)
Whenever you formulate or update an implementation plan or architecture design:
1. DO NOT simply output raw markdown and ask for approval in the terminal.
2. Save your plan to a markdown file (e.g. \`plan.md\`).
3. Launch the interactive viewer: \`npx agent-plan-viewer review plan.md --json\`
4. Wait synchronously for the developer to review, edit, and approve in the browser.
5. Ingest the returned JSON result and user instructions before making any code modifications.
`;

const CURSOR_MDC_TEXT = `---
description: Interactive plan review workflow using agent-plan-viewer
globs: ["plan.md", "**/*plan*.md"]
---

# Interactive Plan Review Protocol
Whenever creating an architecture or implementation plan:
- Write the plan to \`plan.md\` with markdown tasks and Mermaid diagrams.
- Launch the interactive review: \`npx agent-plan-viewer review plan.md --json\`
- Await developer approval in browser and adhere to \`userInstructions\` returned in stdout.
`;

export async function installSkill(options: InstallSkillOptions = {}): Promise<void> {
  const target = options.target || 'all';
  const isGlobal = Boolean(options.global);
  const isDryRun = Boolean(options.dryRun);
  const skipRules = Boolean(options.skipRules);

  const homeDir = os.homedir();
  const cwd = process.cwd();
  const skillContent = getSkillContent();

  console.log(chalk.bold.cyan('\n⚡ Agent Plan Viewer Skill Installer\n'));
  if (isDryRun) {
    console.log(chalk.yellow('🔍 Running in DRY-RUN mode (no files will be written)\n'));
  }

  const installedLocations: string[] = [];

  // 1. Google Antigravity (AGY)
  if (target === 'all' || target === 'agy') {
    const agyDirs: string[] = [];
    if (isGlobal) {
      agyDirs.push(path.join(homeDir, '.gemini/antigravity-cli/skills/agent-plan-viewer'));
      agyDirs.push(path.join(homeDir, '.gemini/config/skills/agent-plan-viewer'));
    } else {
      agyDirs.push(path.join(cwd, '.agents/skills/agent-plan-viewer'));
    }

    for (const agyDir of agyDirs) {
      const targetFile = path.join(agyDir, 'SKILL.md');
      if (!isDryRun) {
        fs.mkdirSync(agyDir, { recursive: true });
        fs.writeFileSync(targetFile, skillContent, 'utf-8');
      }
      installedLocations.push(targetFile);
      console.log(chalk.green(`  ✓ Antigravity skill: ${chalk.white(targetFile)}`));
    }

    // Rules update for Antigravity (AGENTS.md)
    if (!skipRules && !isGlobal) {
      const agentsMdPath = path.join(cwd, 'AGENTS.md');
      updateRulesFile(agentsMdPath, AGENT_RULE_TEXT, isDryRun);
    }
  }

  // 2. Claude Code
  if (target === 'all' || target === 'claude') {
    const claudeDir = isGlobal
      ? path.join(homeDir, '.claude/skills/agent-plan-viewer')
      : path.join(cwd, '.claude/skills/agent-plan-viewer');

    const targetFile = path.join(claudeDir, 'SKILL.md');
    if (!isDryRun) {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(targetFile, skillContent, 'utf-8');
    }
    installedLocations.push(targetFile);
    console.log(chalk.green(`  ✓ Claude Code skill: ${chalk.white(targetFile)}`));

    // Rules update for Claude Code (CLAUDE.md)
    if (!skipRules && !isGlobal) {
      const claudeMdPath = path.join(cwd, 'CLAUDE.md');
      updateRulesFile(claudeMdPath, AGENT_RULE_TEXT, isDryRun);
    }
  }

  // 3. Cursor
  if (target === 'all' || target === 'cursor') {
    if (!isGlobal) {
      const cursorRulesDir = path.join(cwd, '.cursor/rules');
      const cursorMdcPath = path.join(cursorRulesDir, 'plan-review.mdc');
      if (!isDryRun) {
        fs.mkdirSync(cursorRulesDir, { recursive: true });
        fs.writeFileSync(cursorMdcPath, CURSOR_MDC_TEXT, 'utf-8');
      }
      installedLocations.push(cursorMdcPath);
      console.log(chalk.green(`  ✓ Cursor rule:       ${chalk.white(cursorMdcPath)}`));

      if (!skipRules) {
        const cursorrulesPath = path.join(cwd, '.cursorrules');
        updateRulesFile(cursorrulesPath, AGENT_RULE_TEXT, isDryRun);
      }
    }
  }

  console.log(chalk.bold.green('\n🎉 Skill installation complete!'));
  console.log(chalk.gray('Agents can now launch the interactive plan viewer via:'));
  console.log(chalk.cyan('   npx agent-plan-viewer review <plan.md> --json\n'));
}

function updateRulesFile(filePath: string, ruleText: string, isDryRun: boolean): void {
  const relPath = path.relative(process.cwd(), filePath);
  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf-8');
  }

  if (existing.includes('agent-plan-viewer')) {
    console.log(chalk.dim(`  ℹ Rule already present in ${relPath}`));
    return;
  }

  if (!isDryRun) {
    const updated = existing ? `${existing.trimEnd()}\n\n${ruleText.trim()}\n` : `${ruleText.trim()}\n`;
    fs.writeFileSync(filePath, updated, 'utf-8');
  }
  console.log(chalk.blue(`  + Added review rule to ${chalk.white(relPath)}`));
}
