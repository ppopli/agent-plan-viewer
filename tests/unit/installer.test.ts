import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { installSkill, ensureCliInstalled, ensureGlobalCliInstalled, ExecOptions } from '../../src/cli/installer.js';

describe('CLI & Skill Installer / Updater', () => {
  let tmpDir: string;
  let fakeHome: string;
  let fakeCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apv-installer-test-'));
    fakeHome = path.join(tmpDir, 'home');
    fakeCwd = path.join(tmpDir, 'workspace');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeCwd, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs global CLI when --global is used and agent-plan-viewer is not yet installed', () => {
    const executed: string[] = [];
    let installed = false;

    const res = ensureGlobalCliInstalled({
      execCommand: (cmd: string) => {
        executed.push(cmd);
        if (cmd === 'agent-plan-viewer --version') {
          if (!installed) {
            throw new Error('command not found: agent-plan-viewer');
          }
          return '1.0.3';
        }
        if (cmd.startsWith('npm install -g')) {
          installed = true;
          return '';
        }
        return '';
      },
    });

    expect(res.action).toBe('installed');
    expect(res.version).toBe('1.0.3');
    expect(res.usedSudo).toBe(false);
    expect(executed).toContain('npm install -g agent-plan-viewer@latest');
  });

  it('prompts for sudo interactively when global install encounters EACCES permission error', () => {
    const executed: Array<{ cmd: string; opts?: ExecOptions }> = [];
    let installed = false;

    const res = ensureCliInstalled({
      global: true,
      execCommand: (cmd: string, opts?: ExecOptions) => {
        executed.push({ cmd, opts });
        if (cmd === 'agent-plan-viewer --version') {
          if (!installed) throw new Error('not found');
          return '1.0.3';
        }
        if (cmd === 'npm install -g agent-plan-viewer@latest') {
          throw new Error('npm error code EACCES: permission denied, access /usr/local/lib/node_modules');
        }
        if (cmd === 'sudo npm install -g agent-plan-viewer@latest') {
          installed = true;
          return '';
        }
        return '';
      },
    });

    expect(res.action).toBe('installed');
    expect(res.scope).toBe('global');
    expect(res.usedSudo).toBe(true);
    expect(executed.some((e) => e.cmd === 'sudo npm install -g agent-plan-viewer@latest' && e.opts?.interactive === true)).toBe(true);
  });

  it('updates global CLI when agent-plan-viewer is already installed globally', () => {
    const executed: string[] = [];
    let version = '1.0.0';

    const res = ensureGlobalCliInstalled({
      execCommand: (cmd: string) => {
        executed.push(cmd);
        if (cmd === 'agent-plan-viewer --version') {
          return version;
        }
        if (cmd === 'npm install -g agent-plan-viewer@latest') {
          version = '1.0.3';
          return '';
        }
        return '';
      },
    });

    expect(res.action).toBe('updated');
    expect(res.version).toBe('1.0.3');
    expect(executed).toContain('npm install -g agent-plan-viewer@latest');
  });

  it('installs and updates CLI locally in workspace (without -g or sudo) when --global is not set', () => {
    const executed: Array<{ cmd: string; opts?: ExecOptions }> = [];
    const localPkgDir = path.join(fakeCwd, 'node_modules/agent-plan-viewer');
    const localPkgPath = path.join(localPkgDir, 'package.json');

    // 1. Fresh local install
    const resInstall = ensureCliInstalled({
      global: false,
      cwd: fakeCwd,
      execCommand: (cmd: string, opts?: ExecOptions) => {
        executed.push({ cmd, opts });
        if (cmd === 'npm install --no-save agent-plan-viewer@latest') {
          fs.mkdirSync(localPkgDir, { recursive: true });
          fs.writeFileSync(localPkgPath, JSON.stringify({ name: 'agent-plan-viewer', version: '1.0.2' }), 'utf-8');
        }
        return '';
      },
    });

    expect(resInstall.action).toBe('installed');
    expect(resInstall.scope).toBe('local');
    expect(resInstall.version).toBe('1.0.2');
    expect(executed.every((e) => !e.cmd.includes('-g') && !e.cmd.includes('sudo'))).toBe(true);

    // 2. Local update when already present
    const resUpdate = ensureCliInstalled({
      global: false,
      cwd: fakeCwd,
      execCommand: (cmd: string, opts?: ExecOptions) => {
        executed.push({ cmd, opts });
        if (cmd === 'npm install --no-save agent-plan-viewer@latest') {
          fs.writeFileSync(localPkgPath, JSON.stringify({ name: 'agent-plan-viewer', version: '1.0.3' }), 'utf-8');
        }
        return '';
      },
    });

    expect(resUpdate.action).toBe('updated');
    expect(resUpdate.scope).toBe('local');
    expect(resUpdate.version).toBe('1.0.3');
  });

  it('installs workspace skill and rule files when missing, and updates them when already present', async () => {
    const commands: string[] = [];
    const mockExec = (cmd: string) => {
      commands.push(cmd);
      return '1.0.3';
    };

    // 1. Fresh workspace install
    await installSkill({
      cwd: fakeCwd,
      homeDir: fakeHome,
      execCommand: mockExec,
    });

    const agySkillPath = path.join(fakeCwd, '.agents/skills/agent-plan-viewer/SKILL.md');
    const claudeSkillPath = path.join(fakeCwd, '.claude/skills/agent-plan-viewer/SKILL.md');
    const cursorMdcPath = path.join(fakeCwd, '.cursor/rules/plan-review.mdc');
    const agentsMdPath = path.join(fakeCwd, 'AGENTS.md');
    const claudeMdPath = path.join(fakeCwd, 'CLAUDE.md');

    expect(fs.existsSync(agySkillPath)).toBe(true);
    expect(fs.existsSync(claudeSkillPath)).toBe(true);
    expect(fs.existsSync(cursorMdcPath)).toBe(true);
    expect(fs.existsSync(agentsMdPath)).toBe(true);
    expect(fs.existsSync(claudeMdPath)).toBe(true);
    expect(commands).toContain('npm install --no-save agent-plan-viewer@latest');

    // Modify existing skill & AGENTS.md to simulate outdated version + custom surrounding rules
    fs.writeFileSync(agySkillPath, '# Outdated Skill', 'utf-8');
    fs.writeFileSync(
      agentsMdPath,
      `# Project Rules\n\n## Code Style\nUse TypeScript.\n\n## Interactive Plan Review Protocol (agent-plan-viewer)\nOld outdated rule text\n\n## Testing\nRun vitest.\n`,
      'utf-8'
    );

    // 2. Re-run installer to verify update behavior
    await installSkill({
      cwd: fakeCwd,
      homeDir: fakeHome,
      execCommand: mockExec,
    });

    expect(fs.readFileSync(agySkillPath, 'utf-8')).toContain('name: agent-plan-viewer');
    const updatedAgentsMd = fs.readFileSync(agentsMdPath, 'utf-8');
    expect(updatedAgentsMd).toContain('## Code Style\nUse TypeScript.');
    expect(updatedAgentsMd).toContain('## Testing\nRun vitest.');
    expect(updatedAgentsMd).toContain('agent-plan-viewer review plan.md --json');
    expect(updatedAgentsMd).not.toContain('Old outdated rule text');
  });

  it('installs and updates global skills and ~/.gemini/GEMINI.md when --global is set', async () => {
    await installSkill({
      global: true,
      cwd: fakeCwd,
      homeDir: fakeHome,
      execCommand: () => '1.0.3',
    });

    expect(fs.existsSync(path.join(fakeHome, '.gemini/antigravity-cli/skills/agent-plan-viewer/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.gemini/config/skills/agent-plan-viewer/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.gemini/skills/agent-plan-viewer/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.gemini/GEMINI.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.claude/skills/agent-plan-viewer/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(fakeHome, '.claude/CLAUDE.md'))).toBe(true);

    const geminiMd = fs.readFileSync(path.join(fakeHome, '.gemini/GEMINI.md'), 'utf-8');
    expect(geminiMd).toContain('# Global Rules');
    expect(geminiMd).toContain('## Plan review with agent-plan-viewer (enabled)');
    expect(geminiMd).toContain('agent-plan-viewer review <path-to-plan.md> --json');
  });
});
