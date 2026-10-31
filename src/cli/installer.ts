import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ExecOptions {
  interactive?: boolean;
  cwd?: string;
}

export type SkillTarget =
  | 'all'
  | 'agy'
  | 'claude'
  | 'codex'
  | 'copilot'
  | 'hermes'
  | 'cursor'
  | 'windsurf'
  | 'openclaw'
  | 'cline';

export interface InstallSkillOptions {
  target?: SkillTarget;
  global?: boolean;
  dryRun?: boolean;
  skipRules?: boolean;
  skipCli?: boolean;
  execCommand?: (cmd: string, opts?: ExecOptions) => string;
  homeDir?: string;
  cwd?: string;
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
version: 1.0.6
license: MIT
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [Planning, Architecture, Mermaid, Diagram, Code Review]
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

### Step 1: Write or Update Your Plan / Markdown File on Disk (Must Include Mermaid Diagrams)
Write your comprehensive implementation plan or architecture design to a markdown file (e.g., \`./plan.md\`). Include:
- Execution Goal & Overview
- Checklist tasks (\`- [ ] ...\`)
- Proposed file changes (\`[NEW]\`, \`[MODIFY]\`, \`[DELETE]\`)
- **Mandatory Mermaid Diagrams**: Every plan MUST include fenced \`\`\`mermaid ... \`\`\` diagrams (\`flowchart TD\`/\`LR\`, \`sequenceDiagram\`, and/or \`erDiagram\`). If an existing plan does not have diagrams in Mermaid format (e.g., no diagrams or ASCII diagrams), you MUST generate them in Mermaid syntax and write them into the plan file BEFORE launching \`agent-plan-viewer review\`.

### Step 2: Launch the Interactive Review Tool
Run the CLI review command and await its completion:

\`\`\`bash
agent-plan-viewer review <path-to-plan.md> --json
\`\`\`

(Or via \`npx agent-plan-viewer review <path-to-plan.md> --json\`.)

### Step 3: Wait Synchronously for User Approval
The command starts a local server, opens the developer's browser, watches the file for live changes, and blocks until the developer explicitly finishes their review in the browser.

### Step 4: Ingest the Output, Accept UI Diagram Changes, & Update the Plan
When the command exits with code \`0\`, parse the structured JSON from stdout:
- **Crucial Diagram Sync Rule**: When the user adds, renames, moves, rewires, or deletes components/connections in the Diagram Viewer (\`diff.diagramChanges\`), **only update the plan markdown file** (never edit application/viewer code during plan review). Always re-read the updated plan file from disk (\`planPath\`) or use \`updatedMarkdown\` first so you never overwrite their visual diagram edits or \`%% @apv-layout\` position/edge-handle metadata. Preserve all node positions, edge connections, and \`%% @apv-layout\` comments as-is, update the \`\`\`mermaid\`\`\` diagram(s) and corresponding plan sections/tasks accordingly, and ensure the updated diagram renders accurately at the exact positions the next time the plan is viewed.
- **If \`status === "APPROVED"\`**:
  1. Re-read the updated plan/markdown file from disk (preserving all UI diagram, position, edge, task, and line edits).
  2. Sync any surrounding plan sections/tasks in the markdown file with \`diff.diagramChanges\` and \`userInstructions\`.
  3. Proceed with executing the code changes!
- **If \`status === "CHANGES_REQUESTED"\`**:
  1. Re-read the updated plan file from disk, accept all UI diagram, position, and edge changes (\`diff.diagramChanges\` and \`%% @apv-layout\`) as-is, and revise ONLY the plan markdown file and \`\`\`mermaid\`\`\` diagrams per \`userInstructions\`.
  2. Immediately re-run \`agent-plan-viewer review <plan-path> --json\` so the updated plan and diagram render in the browser.
`;
}

const AGENT_RULE_TEXT = `
## Interactive Plan Review Protocol (agent-plan-viewer)
Whenever you formulate or update an implementation plan or architecture design:
1. DO NOT simply output raw markdown and ask for approval in the terminal.
2. Save your plan to a markdown file (e.g. \`plan.md\`). Ensure the plan includes fenced \`\`\`mermaid\`\`\` diagrams (\`flowchart TD\`/\`LR\`, \`sequenceDiagram\`, or \`erDiagram\`); if a plan lacks Mermaid diagrams, generate and embed them in Mermaid format first.
3. Launch the interactive viewer: \`agent-plan-viewer review plan.md --json\` (or \`npx agent-plan-viewer review plan.md --json\`).
4. Wait synchronously for the developer to review, edit, and approve in the browser.
5. Re-read the updated plan file from disk, accept any component, position, or edge changes made in the Diagram Viewer (\`diff.diagramChanges\` and \`%% @apv-layout\` metadata) as-is, update only the Mermaid diagram and plan sections in the markdown file (do not edit code during plan review) so the diagram renders updated on next view, and follow \`userInstructions\` before making code modifications.
`;

const GLOBAL_AGY_RULE_TEXT = `
## Plan review with agent-plan-viewer (enabled)

Whenever you write or update an implementation plan or design document (including the \`/plan\` flow and any plan artifact), you MUST:

1. Read \`~/.gemini/config/skills/agent-plan-viewer/SKILL.md\` if you haven't in this conversation.
2. Ensure the plan contains fenced \`\`\`mermaid\`\`\` diagrams (\`flowchart TD\`/\`LR\`, \`sequenceDiagram\`, or \`erDiagram\`). If the plan does not have diagrams in Mermaid format, generate and add them in Mermaid syntax before launching the viewer.
3. Run \`agent-plan-viewer review <path-to-plan.md> --json\` as a background task. It blocks until the user clicks Approve & Submit or Request Changes.
4. Do not ask for approval via chat text instead of the viewer.
5. Always re-read the updated plan file from disk after the viewer exits, accept any component, position, or edge changes made in the diagram viewer (\`diff.diagramChanges\` and \`%% @apv-layout\` metadata) as-is, and update only the Mermaid diagram and plan markdown file (never edit code during plan review) so the next time the plan is viewed the diagram renders updated and at the exact positions. On \`APPROVED\`, follow any \`userInstructions\`. On \`CHANGES_REQUESTED\`, revise the plan markdown and re-run the viewer.
`;

const CURSOR_MDC_TEXT = `---
description: Interactive plan review workflow using agent-plan-viewer
globs: ["plan.md", "**/*plan*.md"]
---

# Interactive Plan Review Protocol
Whenever creating an architecture or implementation plan:
- Write the plan to \`plan.md\` with markdown tasks and fenced \`\`\`mermaid\`\`\` diagrams (if the plan lacks Mermaid diagrams, generate them in Mermaid format first).
- Launch the interactive review: \`agent-plan-viewer review plan.md --json\` (or \`npx agent-plan-viewer review plan.md --json\`)
- Await developer approval in browser, re-read \`plan.md\` from disk to preserve UI diagram changes (\`diff.diagramChanges\`), update the plan/diagram accordingly, and adhere to \`userInstructions\` returned in stdout.
`;

function defaultExec(cmd: string, opts?: ExecOptions): string {
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  // Strip transient npm/npx environment variables so child `npm install` runs cleanly
  for (const key of Object.keys(cleanEnv)) {
    if (
      key.startsWith('npm_config_') ||
      key.startsWith('npm_lifecycle_') ||
      key === 'npm_command' ||
      key === 'npm_package_json' ||
      key === 'npm_execpath'
    ) {
      delete cleanEnv[key];
    }
  }
  // Strip temporary `_npx` cache directories and local `node_modules/.bin` from PATH
  // so `agent-plan-viewer --version` checks the real system-wide installation.
  const pathKey = Object.keys(cleanEnv).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  if (cleanEnv[pathKey]) {
    cleanEnv[pathKey] = cleanEnv[pathKey]!
      .split(path.delimiter)
      .filter(
        (segment) =>
          !segment.includes('_npx') &&
          !segment.endsWith(`node_modules${path.sep}.bin`)
      )
      .join(path.delimiter);
  }
  if (opts?.interactive) {
    execSync(cmd, {
      cwd: opts.cwd,
      env: cleanEnv,
      stdio: 'inherit',
    });
    return '';
  }
  return execSync(cmd, {
    cwd: opts?.cwd,
    encoding: 'utf-8',
    env: cleanEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ensureUserBinInPath(homeDir: string, userBinDir: string, isDryRun: boolean): void {
  const currentPath = process.env.PATH || process.env.Path || '';
  const pathSegments = currentPath.split(path.delimiter);
  if (pathSegments.includes(userBinDir)) {
    return;
  }

  if (process.platform === 'win32' && !isDryRun) {
    try {
      execSync(
        `powershell -NoProfile -Command "$u = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($u -notlike '*${userBinDir}*') { [Environment]::SetEnvironmentVariable('Path', \\"$u;${userBinDir}\\", 'User') }"`,
        { stdio: 'ignore' }
      );
    } catch {
      // Ignore if PowerShell is restricted
    }
  }

  const exportLine = `export PATH="$HOME/.local/bin:$PATH"`;
  const rcCandidates = ['.zshrc', '.bashrc'].map((rc) => path.join(homeDir, rc));
  let updatedAny = false;

  for (const rcPath of rcCandidates) {
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf-8');
      if (!content.includes('.local/bin')) {
        if (!isDryRun) {
          fs.writeFileSync(rcPath, `${content.trimEnd()}\n\n# Added by agent-plan-viewer\n${exportLine}\n`, 'utf-8');
        }
        updatedAny = true;
      }
    }
  }

  if (!updatedAny) {
    const defaultRc = path.join(homeDir, process.platform === 'darwin' ? '.zshrc' : '.bashrc');
    if (!fs.existsSync(defaultRc)) {
      if (!isDryRun) {
        fs.mkdirSync(path.dirname(defaultRc), { recursive: true });
        fs.writeFileSync(defaultRc, `# Added by agent-plan-viewer\n${exportLine}\n`, 'utf-8');
      }
    }
  }
}

export function ensureCliInstalled(options: {
  global?: boolean;
  dryRun?: boolean;
  cwd?: string;
  homeDir?: string;
  execCommand?: (cmd: string, opts?: ExecOptions) => string;
}): {
  action: 'installed' | 'updated' | 'skipped';
  scope: 'global' | 'local';
  version?: string;
  usedSudo?: boolean;
  binPath?: string;
} {
  const run = options.execCommand || defaultExec;
  const isGlobal = Boolean(options.global);
  const isDryRun = Boolean(options.dryRun);
  const homeDir = options.homeDir || os.homedir();

  // =========================================================================
  // USER-SPACE ("LOCAL") INSTALL (~/.local/bin/agent-plan-viewer, no root/sudo)
  // =========================================================================
  if (!isGlobal) {
    const isWin = process.platform === 'win32';
    const userPrefix = path.join(homeDir, '.local');
    const userBinDir = isWin ? userPrefix : path.join(userPrefix, 'bin');
    const userBinPath = path.join(
      userBinDir,
      isWin ? 'agent-plan-viewer.cmd' : 'agent-plan-viewer'
    );
    const candidatePkgPaths = [
      path.join(userPrefix, 'lib/node_modules/agent-plan-viewer/package.json'),
      path.join(userPrefix, 'node_modules/agent-plan-viewer/package.json'),
    ];

    let existingVersion: string | null = null;
    for (const pkgPath of candidatePkgPaths) {
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg && typeof pkg.version === 'string') {
            existingVersion = pkg.version;
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    if (!existingVersion && fs.existsSync(userBinPath)) {
      try {
        const out = run(`"${userBinPath}" --version`);
        if (out) existingVersion = out.trim();
      } catch {
        // ignore
      }
    }

    const isInstalled = existingVersion !== null;

    if (isDryRun) {
      if (isInstalled) {
        console.log(
          chalk.yellow(
            `  ↻ User-space CLI:    Would update ${userBinPath} (currently v${existingVersion})`
          )
        );
        return { action: 'updated', scope: 'local', version: existingVersion || undefined, binPath: userBinPath };
      } else {
        console.log(
          chalk.green(
            `  + User-space CLI:    Would install agent-plan-viewer into user space (${userBinPath}, no root required)`
          )
        );
        return { action: 'installed', scope: 'local', binPath: userBinPath };
      }
    }

    fs.mkdirSync(userBinDir, { recursive: true });

    const userInstallCommands = [
      `npm install -g --prefix "${userPrefix}" agent-plan-viewer@latest`,
      `npm install -g --prefix "${userPrefix}" github:ppopli/agent-plan-viewer`,
    ];

    let installedOk = false;
    let lastError: unknown = null;
    for (const cmd of userInstallCommands) {
      try {
        run(cmd);
        installedOk = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!installedOk) {
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      console.warn(
        chalk.yellow(`  ⚠ Could not install user-space CLI automatically (${msg.split('\n')[0]}).`)
      );
      return { action: 'skipped', scope: 'local' };
    }

    ensureUserBinInPath(homeDir, userBinDir, isDryRun);

    let newVersion = existingVersion || 'latest';
    for (const pkgPath of candidatePkgPaths) {
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg && typeof pkg.version === 'string') {
            newVersion = pkg.version;
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    if (isInstalled) {
      console.log(
        chalk.yellow(
          `  ↻ Updated user-space CLI:   ${chalk.white(`${userBinPath} (v${existingVersion} -> v${newVersion})`)}`
        )
      );
      return { action: 'updated', scope: 'local', version: newVersion, binPath: userBinPath };
    } else {
      console.log(
        chalk.green(
          `  + Installed user-space CLI: ${chalk.white(`${userBinPath} (v${newVersion})`)}`
        )
      );
      return { action: 'installed', scope: 'local', version: newVersion, binPath: userBinPath };
    }
  }

  // =========================================================================
  // GLOBAL SYSTEM INSTALL (--global: prompts for sudo if permissions require)
  // =========================================================================
  let existingVersion: string | null = null;
  try {
    const out = run('agent-plan-viewer --version');
    if (out) {
      existingVersion = out.trim();
    }
  } catch {
    existingVersion = null;
  }

  const isInstalled = existingVersion !== null;

  if (isDryRun) {
    if (isInstalled) {
      console.log(
        chalk.yellow(`  ↻ System CLI:        Would update global agent-plan-viewer (currently v${existingVersion})`)
      );
      return { action: 'updated', scope: 'global', version: existingVersion || undefined };
    } else {
      console.log(
        chalk.green(`  + System CLI:        Would install agent-plan-viewer globally via npm (with sudo if required)`)
      );
      return { action: 'installed', scope: 'global' };
    }
  }

  const installCommands = [
    'npm install -g agent-plan-viewer@latest',
    'npm install -g github:ppopli/agent-plan-viewer',
  ];

  let installedOk = false;
  let usedSudo = false;
  let lastError: unknown = null;

  // 1. Try installing globally without sudo first (works on Homebrew / nvm / fnm / Volta)
  for (const cmd of installCommands) {
    try {
      run(cmd);
      installedOk = true;
      break;
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/EACCES|EPERM|permission denied/i.test(errMsg)) {
        break;
      }
    }
  }

  // 2. If global install failed due to permissions (or non-writable global prefix), prompt for sudo
  if (!installedOk && process.platform !== 'win32') {
    console.log(
      chalk.yellow(
        '  🔐 Global npm directory requires administrator privileges. Prompting for sudo password...'
      )
    );
    for (const cmd of installCommands) {
      try {
        run(`sudo ${cmd}`, { interactive: true });
        installedOk = true;
        usedSudo = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (!installedOk) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    console.warn(
      chalk.yellow(
        `  ⚠ Could not install/update global CLI automatically (${msg.split('\n')[0]}). Please run: sudo npm install -g agent-plan-viewer`
      )
    );
    return { action: 'skipped', scope: 'global' };
  }

  let newVersion = existingVersion || 'latest';
  try {
    const out = run('agent-plan-viewer --version');
    if (out) newVersion = out.trim();
  } catch {
    // ignore
  }

  if (isInstalled) {
    console.log(
      chalk.yellow(
        `  ↻ Updated system CLI: ${chalk.white(`agent-plan-viewer (v${existingVersion} -> v${newVersion})`)}`
      )
    );
    return { action: 'updated', scope: 'global', version: newVersion, usedSudo };
  } else {
    console.log(
      chalk.green(`  + Installed system CLI: ${chalk.white(`agent-plan-viewer (v${newVersion})`)}`)
    );
    return { action: 'installed', scope: 'global', version: newVersion, usedSudo };
  }
}

export function ensureGlobalCliInstalled(options: {
  dryRun?: boolean;
  execCommand?: (cmd: string, opts?: ExecOptions) => string;
}): { action: 'installed' | 'updated' | 'skipped'; version?: string; usedSudo?: boolean } {
  return ensureCliInstalled({ ...options, global: true });
}

export async function installSkill(options: InstallSkillOptions = {}): Promise<void> {
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

  // 0. Install or update the CLI binary (system-wide with sudo if --global, else in user space ~/.local/bin)
  if (!skipCli) {
    ensureCliInstalled({
      global: isGlobal,
      dryRun: isDryRun,
      cwd,
      homeDir,
      execCommand: options.execCommand,
    });
  }

  // Track already-written skill/rule paths in this run so shared paths (e.g. .agents/skills, AGENTS.md)
  // are only written once when target === 'all'.
  const writtenSkillPaths = new Set<string>();
  const writtenRulePaths = new Set<string>();

  const installSkillPath = (filePath: string, content: string, label: string) => {
    const norm = path.resolve(filePath);
    if (writtenSkillPaths.has(norm)) return;
    writtenSkillPaths.add(norm);
    upsertSkillFile(filePath, content, label, isDryRun);
  };

  const installRulePath = (
    filePath: string,
    ruleText: string,
    baseDir: string,
    defaultHeader?: string
  ) => {
    const norm = path.resolve(filePath);
    if (writtenRulePaths.has(norm)) return;
    writtenRulePaths.add(norm);
    upsertRulesFile(filePath, ruleText, isDryRun, baseDir, defaultHeader);
  };

  // 1. Google Antigravity (AGY)
  if (target === 'all' || target === 'agy') {
    const agyDirs: string[] = [];
    if (isGlobal) {
      agyDirs.push(path.join(homeDir, '.gemini/antigravity-cli/skills/agent-plan-viewer'));
      agyDirs.push(path.join(homeDir, '.gemini/config/skills/agent-plan-viewer'));
      agyDirs.push(path.join(homeDir, '.gemini/skills/agent-plan-viewer'));
    } else {
      agyDirs.push(path.join(cwd, '.agents/skills/agent-plan-viewer'));
    }

    for (const agyDir of agyDirs) {
      installSkillPath(path.join(agyDir, 'SKILL.md'), skillContent, 'Antigravity skill');
    }

    if (!skipRules) {
      if (isGlobal) {
        installRulePath(
          path.join(homeDir, '.gemini/GEMINI.md'),
          GLOBAL_AGY_RULE_TEXT,
          homeDir,
          '# Global Rules'
        );
      } else {
        installRulePath(path.join(cwd, 'AGENTS.md'), AGENT_RULE_TEXT, cwd);
      }
    }
  }

  // 2. Claude Code
  if (target === 'all' || target === 'claude') {
    const claudeDir = isGlobal
      ? path.join(homeDir, '.claude/skills/agent-plan-viewer')
      : path.join(cwd, '.claude/skills/agent-plan-viewer');

    installSkillPath(path.join(claudeDir, 'SKILL.md'), skillContent, 'Claude Code skill');

    if (!skipRules) {
      const claudeMdPath = isGlobal
        ? path.join(homeDir, '.claude/CLAUDE.md')
        : path.join(cwd, 'CLAUDE.md');
      installRulePath(claudeMdPath, AGENT_RULE_TEXT, isGlobal ? homeDir : cwd);
    }
  }

  // 3. OpenAI Codex
  if (target === 'all' || target === 'codex') {
    const codexDirs = isGlobal
      ? [
          path.join(homeDir, '.codex/skills/agent-plan-viewer'),
          path.join(homeDir, '.agents/skills/agent-plan-viewer'),
        ]
      : [
          path.join(cwd, '.codex/skills/agent-plan-viewer'),
          path.join(cwd, '.agents/skills/agent-plan-viewer'),
        ];

    for (const codexDir of codexDirs) {
      installSkillPath(path.join(codexDir, 'SKILL.md'), skillContent, 'OpenAI Codex skill');
    }

    if (!skipRules) {
      const codexRulePath = isGlobal
        ? path.join(homeDir, '.codex/AGENTS.md')
        : path.join(cwd, 'AGENTS.md');
      installRulePath(codexRulePath, AGENT_RULE_TEXT, isGlobal ? homeDir : cwd);
    }
  }

  // 4. GitHub Copilot
  if (target === 'all' || target === 'copilot') {
    const copilotDir = isGlobal
      ? path.join(homeDir, '.copilot/skills/agent-plan-viewer')
      : path.join(cwd, '.github/skills/agent-plan-viewer');

    installSkillPath(path.join(copilotDir, 'SKILL.md'), skillContent, 'GitHub Copilot skill');

    if (!skipRules) {
      const copilotRulePath = isGlobal
        ? path.join(homeDir, '.copilot/copilot-instructions.md')
        : path.join(cwd, '.github/copilot-instructions.md');
      installRulePath(copilotRulePath, AGENT_RULE_TEXT, isGlobal ? homeDir : cwd);
    }
  }

  // 5. Hermes Agent
  if (target === 'all' || target === 'hermes') {
    const hermesDir = isGlobal
      ? path.join(homeDir, '.hermes/skills/agent-plan-viewer')
      : path.join(cwd, '.hermes/skills/agent-plan-viewer');

    installSkillPath(path.join(hermesDir, 'SKILL.md'), skillContent, 'Hermes Agent skill');

    if (!skipRules) {
      const hermesRulePath = isGlobal
        ? path.join(homeDir, '.hermes/AGENTS.md')
        : path.join(cwd, 'AGENTS.md');
      installRulePath(hermesRulePath, AGENT_RULE_TEXT, isGlobal ? homeDir : cwd);
    }
  }

  // 6. Cursor
  if (target === 'all' || target === 'cursor') {
    const cursorSkillDir = isGlobal
      ? path.join(homeDir, '.cursor/skills/agent-plan-viewer')
      : path.join(cwd, '.cursor/skills/agent-plan-viewer');
    installSkillPath(path.join(cursorSkillDir, 'SKILL.md'), skillContent, 'Cursor skill');

    if (!isGlobal) {
      const cursorRulesDir = path.join(cwd, '.cursor/rules');
      const cursorMdcPath = path.join(cursorRulesDir, 'plan-review.mdc');
      installSkillPath(cursorMdcPath, CURSOR_MDC_TEXT, 'Cursor rule');

      if (!skipRules) {
        const cursorrulesPath = path.join(cwd, '.cursorrules');
        installRulePath(cursorrulesPath, AGENT_RULE_TEXT, cwd);
      }
    }
  }

  // 7. Windsurf
  if (target === 'all' || target === 'windsurf') {
    const windsurfDir = isGlobal
      ? path.join(homeDir, '.codeium/windsurf/skills/agent-plan-viewer')
      : path.join(cwd, '.windsurf/skills/agent-plan-viewer');

    installSkillPath(path.join(windsurfDir, 'SKILL.md'), skillContent, 'Windsurf skill');

    if (!skipRules) {
      const windsurfRulePath = isGlobal
        ? path.join(homeDir, '.codeium/windsurf/memories/global_rules.md')
        : path.join(cwd, '.windsurfrules');
      installRulePath(windsurfRulePath, AGENT_RULE_TEXT, isGlobal ? homeDir : cwd);
    }
  }

  // 8. OpenClaw & Cline / Roo Code
  if (target === 'all' || target === 'openclaw' || target === 'cline') {
    if (isGlobal) {
      if (target === 'all' || target === 'openclaw') {
        installSkillPath(
          path.join(homeDir, '.openclaw/skills/agent-plan-viewer/SKILL.md'),
          skillContent,
          'OpenClaw skill'
        );
      }
      if (target === 'all' || target === 'cline') {
        installSkillPath(
          path.join(homeDir, '.cline/skills/agent-plan-viewer/SKILL.md'),
          skillContent,
          'Cline skill'
        );
      }
    } else {
      installSkillPath(
        path.join(cwd, '.cline/skills/agent-plan-viewer/SKILL.md'),
        skillContent,
        'Cline skill'
      );
      if (!skipRules) {
        installRulePath(path.join(cwd, '.clinerules'), AGENT_RULE_TEXT, cwd);
      }
    }
  }

  // 9. Bundled Agent Plugins (Antigravity Plugin, Claude Plugin, Gemini Extension)
  if (target === 'all' || target === 'agy' || target === 'claude') {
    const pluginManifest = JSON.stringify(
      {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'agent-plan-viewer',
        displayName: 'Agent Plan Viewer',
        version: '1.0.7',
        description:
          'Interactive visual viewer, Mermaid diagram editor, and flow simulator for AI agent implementation plans',
        repository: 'https://github.com/ppopli/agent-plan-viewer',
        license: 'MIT',
      },
      null,
      2
    );

    const pluginRoots: Array<{ dir: string; label: string }> = [];
    if (target === 'all' || target === 'agy') {
      pluginRoots.push({
        dir: isGlobal
          ? path.join(homeDir, '.gemini/config/plugins/agent-plan-viewer')
          : path.join(cwd, '.agents/plugins/agent-plan-viewer'),
        label: 'Antigravity plugin',
      });
    }
    if (target === 'all' || target === 'claude') {
      pluginRoots.push({
        dir: isGlobal
          ? path.join(homeDir, '.claude/plugins/agent-plan-viewer')
          : path.join(cwd, '.claude/plugins/agent-plan-viewer'),
        label: 'Claude plugin',
      });
    }

    for (const { dir: pluginDir, label } of pluginRoots) {
      if (!isDryRun) {
        fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
        fs.mkdirSync(path.join(pluginDir, 'rules'), { recursive: true });
        fs.mkdirSync(path.join(pluginDir, 'skills/agent-plan-viewer'), { recursive: true });
        fs.writeFileSync(path.join(pluginDir, '.claude-plugin/plugin.json'), `${pluginManifest}\n`, 'utf-8');
        fs.writeFileSync(path.join(pluginDir, 'rules/AGENTS.md'), `${AGENT_RULE_TEXT.trim()}\n`, 'utf-8');
        fs.writeFileSync(
          path.join(pluginDir, 'skills/agent-plan-viewer/SKILL.md'),
          skillContent,
          'utf-8'
        );
      }
      installSkillPath(path.join(pluginDir, 'plugin.json'), `${pluginManifest}\n`, label);
    }
  }

  // 10. Desktop / Web Upload Bundle (Claude Desktop .zip skill, ChatGPT & Gemini SKILL.md)
  if (target === 'all' || target === 'claude' || target === 'agy' || target === 'codex') {
    const bundleDir = isGlobal
      ? path.join(homeDir, '.agent-plan-viewer')
      : path.join(cwd, '.agent-plan-viewer');
    const zipPath = path.join(bundleDir, 'agent-plan-viewer-skill.zip');
    const existedZip = fs.existsSync(zipPath);
    if (!isDryRun) {
      exportSkillBundle(bundleDir, skillContent);
    }
    const paddedLabel = 'Desktop skill zip:'.padEnd(20, ' ');
    if (existedZip) {
      console.log(chalk.yellow(`  ↻ Updated ${paddedLabel}${chalk.white(zipPath)}`));
    } else {
      console.log(chalk.green(`  + Created ${paddedLabel}${chalk.white(zipPath)}`));
    }
  }

  console.log(chalk.bold.green('\n🎉 Installation & update complete!'));
  console.log(chalk.gray('Agents and users can now launch the interactive plan viewer directly via:'));
  console.log(chalk.cyan('   agent-plan-viewer review <plan.md> --json'));
  console.log(chalk.gray('or via npx:'));
  console.log(chalk.cyan('   npx agent-plan-viewer review <plan.md> --json\n'));
}

function crc32Buffer(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipArchive(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localFileHeaders: Buffer[] = [];
  const centralDirectoryHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const dataBuf = entry.content;
    const crc = crc32Buffer(dataBuf);

    // Local file header (30 bytes + name + data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression (0 = store)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x21, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localFileHeaders.push(localHeader, nameBuf, dataBuf);

    // Central directory file header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // compression
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0x21, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralDirectoryHeaders.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + dataBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralDirectoryHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...localFileHeaders, centralDirBuf, eocd]);
}

export function exportSkillBundle(
  outputDir: string,
  skillContent: string = getSkillContent()
): { zipPath: string; skillMdPath: string } {
  fs.mkdirSync(outputDir, { recursive: true });
  const skillMdPath = path.join(outputDir, 'SKILL.md');
  fs.writeFileSync(skillMdPath, skillContent, 'utf-8');

  const pluginJson = JSON.stringify(
    {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'agent-plan-viewer',
      displayName: 'Agent Plan Viewer',
      version: '1.0.7',
      description:
        'Interactive visual viewer, Mermaid diagram editor, and flow simulator for AI agent implementation plans',
      repository: 'https://github.com/ppopli/agent-plan-viewer',
      license: 'MIT',
    },
    null,
    2
  );

  const zipBuf = createZipArchive([
    {
      name: 'agent-plan-viewer/SKILL.md',
      content: Buffer.from(skillContent, 'utf-8'),
    },
    {
      name: 'agent-plan-viewer/plugin.json',
      content: Buffer.from(`${pluginJson}\n`, 'utf-8'),
    },
    {
      name: 'agent-plan-viewer/.claude-plugin/plugin.json',
      content: Buffer.from(`${pluginJson}\n`, 'utf-8'),
    },
    {
      name: 'agent-plan-viewer/rules/AGENTS.md',
      content: Buffer.from(`${AGENT_RULE_TEXT.trim()}\n`, 'utf-8'),
    },
  ]);

  const zipPath = path.join(outputDir, 'agent-plan-viewer-skill.zip');
  fs.writeFileSync(zipPath, zipBuf);
  return { zipPath, skillMdPath };
}

function upsertSkillFile(targetFile: string, content: string, label: string, isDryRun: boolean): void {
  const existed = fs.existsSync(targetFile);
  if (!isDryRun) {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, content, 'utf-8');
  }
  const paddedLabel = `${label}:`.padEnd(20, ' ');
  if (existed) {
    console.log(chalk.yellow(`  ↻ Updated ${paddedLabel}${chalk.white(targetFile)}`));
  } else {
    console.log(chalk.green(`  + Installed ${paddedLabel}${chalk.white(targetFile)}`));
  }
}

function upsertRulesFile(
  filePath: string,
  ruleText: string,
  isDryRun: boolean,
  baseDir: string,
  defaultFileHeader?: string
): void {
  const relPath = path.relative(baseDir, filePath) || path.basename(filePath);
  const displayPath = relPath.startsWith('..') ? filePath : relPath;
  const existed = fs.existsSync(filePath);
  const existing = existed ? fs.readFileSync(filePath, 'utf-8') : '';

  const sectionRegex = /(?:^|\n)## [^\n]*agent-plan-viewer[^\n]*\n[\s\S]*?(?=\n## |\s*$)/i;
  const hasExistingRule = sectionRegex.test(existing) || existing.includes('agent-plan-viewer');

  if (!isDryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let updated: string;
    if (sectionRegex.test(existing)) {
      const replaced = existing.replace(sectionRegex, `\n${ruleText.trim()}\n`);
      updated = `${replaced.trim()}\n`;
    } else if (existing.trim().length > 0) {
      updated = `${existing.trimEnd()}\n\n${ruleText.trim()}\n`;
    } else if (defaultFileHeader) {
      updated = `${defaultFileHeader}\n\n${ruleText.trim()}\n`;
    } else {
      updated = `${ruleText.trim()}\n`;
    }
    fs.writeFileSync(filePath, updated, 'utf-8');
  }

  if (hasExistingRule) {
    console.log(chalk.yellow(`  ↻ Updated review rule in ${chalk.white(displayPath)}`));
  } else {
    console.log(chalk.green(`  + Installed review rule in ${chalk.white(displayPath)}`));
  }
}

