import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import path from 'path';
import fs from 'fs';
import { PlanViewerServer } from './server.js';
import { ReviewResult } from '../core/types.js';
import { formatAgentInstructions } from '../core/plan-serializer.js';
import { installSkill } from './installer.js';

const program = new Command();

program
  .name('agent-plan-viewer')
  .description('Interactive visual viewer and editor for AI agent implementation plans')
  .version('1.0.3');

program
  .command('review')
  .description('Start interactive review session for an agent plan and block until user submits')
  .argument('<plan-path>', 'Path to the plan markdown file')
  .option('-p, --port <number>', 'Port for local viewer server', '4100')
  .option('--no-open', 'Do not automatically open browser')
  .option('--json', 'Output strictly JSON result on resolution')
  .action(async (planPathArg: string, options: { port: string; open: boolean; json?: boolean }) => {
    const planPath = path.resolve(process.cwd(), planPathArg);
    if (!fs.existsSync(planPath)) {
      console.error(chalk.red(`Error: Plan file not found at ${planPath}`));
      process.exit(1);
    }

    const port = parseInt(options.port, 10) || 4100;

    let resolveSession: (result: ReviewResult) => void;
    const sessionPromise = new Promise<ReviewResult>((resolve) => {
      resolveSession = resolve;
    });

    const server = new PlanViewerServer({
      planPath,
      port,
      autoOpen: options.open,
      onResolve: (result) => {
        resolveSession(result);
      },
    });

    try {
      const actualPort = await server.start();
      const url = `http://localhost:${actualPort}`;

      if (!options.json) {
        console.log(chalk.bold.green(`\n⚡ Agent Plan Viewer launched!`));
        console.log(chalk.cyan(`   URL:  ${url}`));
        console.log(chalk.gray(`   Plan: ${planPath}`));
        console.log(chalk.yellow(`\nWaiting for user review... (Press 'Approve & Submit' in browser or Ctrl+C to exit)\n`));
      }

      if (options.open) {
        open(url).catch(() => {
          // Ignore open errors if headless
        });
      }

      // Handle interrupt signals
      const cleanup = async () => {
        await server.stop();
        process.exit(130);
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Block until review session is resolved by user
      const result = await sessionPromise;

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.bold.green(`\n✓ Review Completed: ${result.status}`));
        console.log(formatAgentInstructions(result));
      }

      process.exit(0);
    } catch (err: any) {
      console.error(chalk.red(`Error starting viewer: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start viewer server in live-reload inspection mode without blocking')
  .argument('<plan-path>', 'Path to plan or markdown file')
  .option('-p, --port <number>', 'Port for server', '4100')
  .option('--no-open', 'Do not automatically open browser')
  .action(async (planPathArg: string, options: { port: string; open: boolean }) => {
    const planPath = path.resolve(process.cwd(), planPathArg);
    const port = parseInt(options.port, 10) || 4100;
    const server = new PlanViewerServer({ planPath, port, autoOpen: options.open });
    const actualPort = await server.start();
    const url = `http://localhost:${actualPort}`;
    console.log(chalk.green(`Agent Plan Viewer running at ${url} (watching ${planPath} for changes)`));
    if (options.open) {
      open(url).catch(() => {});
    }
  });

program
  .command('install-skill')
  .alias('init')
  .alias('add-skill')
  .description('Install/update global agent-plan-viewer CLI and configure skill files in Antigravity, Claude Code, or Cursor')
  .option('-t, --target <target>', 'Target agent: agy, claude, cursor, or all', 'all')
  .option('-g, --global', 'Install globally to user home directory instead of current workspace')
  .option('--dry-run', 'Preview files and CLI actions without writing')
  .option('--no-rules', 'Do not update rule files (AGENTS.md, CLAUDE.md, .cursorrules, ~/.gemini/GEMINI.md)')
  .option('--skip-cli', 'Skip installing/updating the global agent-plan-viewer CLI binary')
  .action(async (options: { target: 'all' | 'agy' | 'claude' | 'cursor'; global?: boolean; dryRun?: boolean; rules?: boolean; skipCli?: boolean }) => {
    await installSkill({
      target: options.target,
      global: options.global,
      dryRun: options.dryRun,
      skipRules: options.rules === false,
      skipCli: options.skipCli,
    });
  });

program.parse(process.argv);
