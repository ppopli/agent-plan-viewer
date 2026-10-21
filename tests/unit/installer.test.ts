import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { installSkill, ensureGlobalCliInstalled } from '../../src/cli/installer.js';

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

  it('installs global CLI when agent-plan-viewer is not yet installed', () => {
    const executed: string[] = [];
    let installed = false;

    const res = ensureGlobalCliInstalled({
      execCommand: (cmd: string) => {
        executed.push(cmd);
        if (cmd === 'agent-plan-viewer --version') {
          if (!installed) {
            throw new Error('command not found: agent-plan-viewer');
          }
          return '1.0.1';
        }
        if (cmd.startsWith('npm install -g')) {
          installed = true;
          return '';
        }
        return '';
      },
    });

    expect(res.action).toBe('installed');
    expect(res.version).toBe('1.0.1');
    expect(executed).toContain('npm install -g agent-plan-viewer@latest');
  });

  it('updates global CLI when agent-plan-viewer is already installed', () => {
    const executed: string[] = [];
    let version = '1.0.0';

    const res = ensureGlobalCliInstalled({
      execCommand: (cmd: string) => {
        executed.push(cmd);
        if (cmd === 'agent-plan-viewer --version') {
          return version;
        }
        if (cmd === 'npm install -g agent-plan-viewer@latest') {
          version = '1.0.1';
          return '';
        }
        return '';
      },
    });

    expect(res.action).toBe('updated');
    expect(res.version).toBe('1.0.1');
    expect(executed).toContain('npm install -g agent-plan-viewer@latest');
  });

  it('falls back to GitHub global install if npm registry fails', () => {
    const executed: string[] = [];
    let installed = false;

    const res = ensureGlobalCliInstalled({
      execCommand: (cmd: string) => {
        executed.push(cmd);
        if (cmd === 'agent-plan-viewer --version') {
          if (!installed) throw new Error('not found');
          return '1.0.1';
        }
        if (cmd === 'npm install -g agent-plan-viewer@latest') {
          throw new Error('E404 Not Found');
        }
        if (cmd === 'npm install -g github:ppopli/agent-plan-viewer') {
          installed = true;
          return '';
        }
        return '';
      },
    });

    expect(res.action).toBe('installed');
    expect(executed).toEqual([
      'agent-plan-viewer --version',
      'npm install -g agent-plan-viewer@latest',
      'npm install -g github:ppopli/agent-plan-viewer',
      'agent-plan-viewer --version',
    ]);
  });

  it('installs workspace skill and rule files when missing, and updates them when already present', async () => {
    const commands: string[] = [];
    const mockExec = (cmd: string) => {
      commands.push(cmd);
      return '1.0.0';
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
      execCommand: () => '1.0.0',
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
