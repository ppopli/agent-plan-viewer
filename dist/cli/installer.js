import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function getSkillContent() {
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
agent-plan-viewer review <path-to-plan.md> --json
\`\`\`

(Or via \`npx agent-plan-viewer review <path-to-plan.md> --json\`.)

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
  2. Revise your plan accordingly and re-run \`agent-plan-viewer review <plan-path> --json\`.
`;
}
const AGENT_RULE_TEXT = `
## Interactive Plan Review Protocol (agent-plan-viewer)
Whenever you formulate or update an implementation plan or architecture design:
1. DO NOT simply output raw markdown and ask for approval in the terminal.
2. Save your plan to a markdown file (e.g. \`plan.md\`).
3. Launch the interactive viewer: \`agent-plan-viewer review plan.md --json\` (or \`npx agent-plan-viewer review plan.md --json\`).
4. Wait synchronously for the developer to review, edit, and approve in the browser.
5. Ingest the returned JSON result and user instructions before making any code modifications.
`;
const GLOBAL_AGY_RULE_TEXT = `
## Plan review with agent-plan-viewer (enabled)

Whenever you write or update an implementation plan or design document (including the \`/plan\` flow and any plan artifact), you MUST:

1. Read \`~/.gemini/config/skills/agent-plan-viewer/SKILL.md\` if you haven't in this conversation.
2. Run \`agent-plan-viewer review <path-to-plan.md> --json\` as a background task. It blocks until the user clicks Approve & Submit or Request Changes.
3. Do not ask for approval via chat text instead of the viewer.
4. On \`APPROVED\`, re-read the plan file and follow any \`userInstructions\`. On \`CHANGES_REQUESTED\`, revise the plan and re-run the viewer.
`;
const CURSOR_MDC_TEXT = `---
description: Interactive plan review workflow using agent-plan-viewer
globs: ["plan.md", "**/*plan*.md"]
---

# Interactive Plan Review Protocol
Whenever creating an architecture or implementation plan:
- Write the plan to \`plan.md\` with markdown tasks and Mermaid diagrams.
- Launch the interactive review: \`agent-plan-viewer review plan.md --json\` (or \`npx agent-plan-viewer review plan.md --json\`)
- Await developer approval in browser and adhere to \`userInstructions\` returned in stdout.
`;
function defaultExec(cmd) {
    const cleanEnv = { ...process.env };
    // Strip transient npm/npx environment variables so child `npm install -g` runs cleanly
    for (const key of Object.keys(cleanEnv)) {
        if (key.startsWith('npm_config_') ||
            key.startsWith('npm_lifecycle_') ||
            key === 'npm_command' ||
            key === 'npm_package_json' ||
            key === 'npm_execpath') {
            delete cleanEnv[key];
        }
    }
    // Strip temporary `_npx` cache directories and local `node_modules/.bin` from PATH
    // so `agent-plan-viewer --version` checks the real system-wide installation.
    if (cleanEnv.PATH) {
        cleanEnv.PATH = cleanEnv.PATH
            .split(path.delimiter)
            .filter((segment) => !segment.includes('_npx') &&
            !segment.endsWith(`node_modules${path.sep}.bin`))
            .join(path.delimiter);
    }
    return execSync(cmd, {
        encoding: 'utf-8',
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}
export function ensureGlobalCliInstalled(options) {
    const run = options.execCommand || defaultExec;
    const isDryRun = Boolean(options.dryRun);
    let existingVersion = null;
    try {
        const out = run('agent-plan-viewer --version');
        if (out) {
            existingVersion = out.trim();
        }
    }
    catch {
        existingVersion = null;
    }
    const isInstalled = existingVersion !== null;
    if (isDryRun) {
        if (isInstalled) {
            console.log(chalk.yellow(`  ↻ System CLI:        Would update global agent-plan-viewer (currently v${existingVersion})`));
            return { action: 'updated', version: existingVersion || undefined };
        }
        else {
            console.log(chalk.green(`  + System CLI:        Would install agent-plan-viewer globally via npm`));
            return { action: 'installed' };
        }
    }
    const installCommands = [
        'npm install -g agent-plan-viewer@latest',
        'npm install -g github:ppopli/agent-plan-viewer',
    ];
    let installedOk = false;
    let lastError = null;
    for (const cmd of installCommands) {
        try {
            run(cmd);
            installedOk = true;
            break;
        }
        catch (err) {
            lastError = err;
        }
    }
    if (!installedOk) {
        const msg = lastError instanceof Error ? lastError.message : String(lastError);
        console.warn(chalk.yellow(`  ⚠ Could not install/update global CLI automatically (${msg.split('\n')[0]}). You may need: sudo npm install -g agent-plan-viewer`));
        return { action: 'skipped' };
    }
    let newVersion = existingVersion || 'latest';
    try {
        const out = run('agent-plan-viewer --version');
        if (out)
            newVersion = out.trim();
    }
    catch {
        // ignore
    }
    if (isInstalled) {
        console.log(chalk.yellow(`  ↻ Updated system CLI: ${chalk.white(`agent-plan-viewer (v${existingVersion} -> v${newVersion})`)}`));
        return { action: 'updated', version: newVersion };
    }
    else {
        console.log(chalk.green(`  + Installed system CLI: ${chalk.white(`agent-plan-viewer (v${newVersion})`)}`));
        return { action: 'installed', version: newVersion };
    }
}
export async function installSkill(options = {}) {
    const target = options.target || 'all';
    const isGlobal = Boolean(options.global);
    const isDryRun = Boolean(options.dryRun);
    const skipRules = Boolean(options.skipRules);
    const skipCli = Boolean(options.skipCli);
    const homeDir = options.homeDir || os.homedir();
    const cwd = options.cwd || process.cwd();
    const skillContent = getSkillContent();
    console.log(chalk.bold.cyan('\n⚡ Agent Plan Viewer CLI & Skill Installer\n'));
    if (isDryRun) {
        console.log(chalk.yellow('🔍 Running in DRY-RUN mode (no files or packages will be modified)\n'));
    }
    // 0. Install or update the global `agent-plan-viewer` CLI binary
    if (!skipCli) {
        ensureGlobalCliInstalled({
            dryRun: isDryRun,
            execCommand: options.execCommand,
        });
    }
    // 1. Google Antigravity (AGY)
    if (target === 'all' || target === 'agy') {
        const agyDirs = [];
        if (isGlobal) {
            agyDirs.push(path.join(homeDir, '.gemini/antigravity-cli/skills/agent-plan-viewer'));
            agyDirs.push(path.join(homeDir, '.gemini/config/skills/agent-plan-viewer'));
            agyDirs.push(path.join(homeDir, '.gemini/skills/agent-plan-viewer'));
        }
        else {
            agyDirs.push(path.join(cwd, '.agents/skills/agent-plan-viewer'));
        }
        for (const agyDir of agyDirs) {
            const targetFile = path.join(agyDir, 'SKILL.md');
            upsertSkillFile(targetFile, skillContent, 'Antigravity skill', isDryRun);
        }
        if (!skipRules) {
            if (isGlobal) {
                const geminiMdPath = path.join(homeDir, '.gemini/GEMINI.md');
                upsertRulesFile(geminiMdPath, GLOBAL_AGY_RULE_TEXT, isDryRun, homeDir, '# Global Rules');
            }
            else {
                const agentsMdPath = path.join(cwd, 'AGENTS.md');
                upsertRulesFile(agentsMdPath, AGENT_RULE_TEXT, isDryRun, cwd);
            }
        }
    }
    // 2. Claude Code
    if (target === 'all' || target === 'claude') {
        const claudeDir = isGlobal
            ? path.join(homeDir, '.claude/skills/agent-plan-viewer')
            : path.join(cwd, '.claude/skills/agent-plan-viewer');
        const targetFile = path.join(claudeDir, 'SKILL.md');
        upsertSkillFile(targetFile, skillContent, 'Claude Code skill', isDryRun);
        if (!skipRules) {
            const claudeMdPath = isGlobal
                ? path.join(homeDir, '.claude/CLAUDE.md')
                : path.join(cwd, 'CLAUDE.md');
            upsertRulesFile(claudeMdPath, AGENT_RULE_TEXT, isDryRun, isGlobal ? homeDir : cwd);
        }
    }
    // 3. Cursor
    if (target === 'all' || target === 'cursor') {
        if (!isGlobal) {
            const cursorRulesDir = path.join(cwd, '.cursor/rules');
            const cursorMdcPath = path.join(cursorRulesDir, 'plan-review.mdc');
            upsertSkillFile(cursorMdcPath, CURSOR_MDC_TEXT, 'Cursor rule', isDryRun);
            if (!skipRules) {
                const cursorrulesPath = path.join(cwd, '.cursorrules');
                upsertRulesFile(cursorrulesPath, AGENT_RULE_TEXT, isDryRun, cwd);
            }
        }
    }
    console.log(chalk.bold.green('\n🎉 Installation & update complete!'));
    console.log(chalk.gray('Agents and users can now launch the interactive plan viewer directly via:'));
    console.log(chalk.cyan('   agent-plan-viewer review <plan.md> --json'));
    console.log(chalk.gray('or via npx:'));
    console.log(chalk.cyan('   npx agent-plan-viewer review <plan.md> --json\n'));
}
function upsertSkillFile(targetFile, content, label, isDryRun) {
    const existed = fs.existsSync(targetFile);
    if (!isDryRun) {
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.writeFileSync(targetFile, content, 'utf-8');
    }
    const paddedLabel = `${label}:`.padEnd(20, ' ');
    if (existed) {
        console.log(chalk.yellow(`  ↻ Updated ${paddedLabel}${chalk.white(targetFile)}`));
    }
    else {
        console.log(chalk.green(`  + Installed ${paddedLabel}${chalk.white(targetFile)}`));
    }
}
function upsertRulesFile(filePath, ruleText, isDryRun, baseDir, defaultFileHeader) {
    const relPath = path.relative(baseDir, filePath) || path.basename(filePath);
    const displayPath = relPath.startsWith('..') ? filePath : relPath;
    const existed = fs.existsSync(filePath);
    const existing = existed ? fs.readFileSync(filePath, 'utf-8') : '';
    const sectionRegex = /(?:^|\n)## [^\n]*agent-plan-viewer[^\n]*\n[\s\S]*?(?=\n## |\s*$)/i;
    const hasExistingRule = sectionRegex.test(existing) || existing.includes('agent-plan-viewer');
    if (!isDryRun) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        let updated;
        if (sectionRegex.test(existing)) {
            const replaced = existing.replace(sectionRegex, `\n${ruleText.trim()}\n`);
            updated = `${replaced.trim()}\n`;
        }
        else if (existing.trim().length > 0) {
            updated = `${existing.trimEnd()}\n\n${ruleText.trim()}\n`;
        }
        else if (defaultFileHeader) {
            updated = `${defaultFileHeader}\n\n${ruleText.trim()}\n`;
        }
        else {
            updated = `${ruleText.trim()}\n`;
        }
        fs.writeFileSync(filePath, updated, 'utf-8');
    }
    if (hasExistingRule) {
        console.log(chalk.yellow(`  ↻ Updated review rule in ${chalk.white(displayPath)}`));
    }
    else {
        console.log(chalk.green(`  + Installed review rule in ${chalk.white(displayPath)}`));
    }
}
