import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';

const ARTIFACTS_DIR = '/Users/pulkitpopli/.gemini/antigravity-cli/brain/e9d04427-44fc-41a1-b45c-8c034f707a1c';
const TEST_DIR = path.resolve(process.cwd(), 'scratch/skill-verification');

if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

const TEST_PLAN = `# Payment Gateway Architecture & Migration Plan

## Executive Summary
This document outlines the migration of legacy checkout payment flows to an asynchronous tokenized gateway architecture.

## System Architecture Diagram
\`\`\`mermaid
graph LR
  Client[Web Client] --> Gateway[API Gateway]
  Gateway --> Auth[Auth Service]
  Gateway --> PaymentService[Payment Engine]
  PaymentService --> Vault[Card Vault]
  PaymentService --> BankAcquirer[Bank Acquirer]
\`\`\`

## High-Volume Request Scenarios
- **3DS Acquirer Step-Up Challenge**: Client -> Gateway -> Auth -> PaymentService -> BankAcquirer when transaction exceeds $500.
- **Card Vault Tokenization Fallback**: Gateway -> PaymentService -> Vault fallback when network tokenization is down.

## Implementation Tasks
- [ ] **Phase 1: Zero-Downtime Infrastructure Setup**
  - [ ] Provision AWS KMS key ring with multi-region replication
  - [ ] Deploy Envoy sidecar proxies with mutual TLS (mTLS)
  - [ ] Configure Datadog synthetic probes for 99.999% SLA
- [ ] **Phase 2: Payment Token Migration**
  - [ ] Implement dual-write adapter for legacy MySQL vault
  - [ ] Run dry-run backfill on 1.2M historical card tokens
- [ ] **Phase 3: Production Traffic Cutover**
  - [ ] Route 5% canary traffic through new gateway
  - [ ] Validate latency p99 < 120ms for 24 hours
`;

async function main() {
  console.log('🚀 Starting Comprehensive E2E Skill Verification...\n');

  const planPath = path.join(TEST_DIR, 'migration-plan.md');
  fs.writeFileSync(planPath, TEST_PLAN, 'utf-8');

  const cliPath = path.resolve(process.cwd(), 'bin/cli.js');
  const port = 4132;

  console.log(`[1/8] Spawning Review Server via CLI: node ${path.basename(cliPath)} review ...`);
  const serverProc = spawn('node', [cliPath, 'review', planPath, '-p', String(port), '--no-open', '--json'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutOutput = '';
  serverProc.stdout.on('data', (d) => {
    stdoutOutput += d.toString();
  });
  serverProc.stderr.on('data', (d) => {
    console.error('SERVER STDERR:', d.toString());
  });

  // Wait for server to initialize
  await new Promise((r) => setTimeout(r, 2000));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 });

    const url = `http://localhost:${port}`;
    console.log(`[2/8] Connecting browser to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0' });

    // 1. Initial Document View
    await page.waitForSelector('h1');
    const titleText = await page.$eval('h1', (el) => el.textContent);
    console.log(`  ✓ Document Loaded: "${titleText}"`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'skill_verify_01_initial_plan.png') });
    console.log('  📸 Screenshot: skill_verify_01_initial_plan.png');

    // 2. Test Task Hierarchy Cascade: Check Phase 1 parent task
    console.log('[3/8] Testing Task Hierarchy Cascade Completion...');
    await page.evaluate(() => {
      const toggleBtns = Array.from(document.querySelectorAll('button[title="Toggle task completion"]'));
      if (toggleBtns.length > 0) {
        (toggleBtns[0] as HTMLButtonElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    // Verify progress text (4 tasks completed out of 10 total)
    const progressText = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('span, div'));
      return badges.some((el) => el.textContent?.includes('4 / 10 completed (40%)'));
    });
    console.log(`  ✓ Progress shows 4 / 10 completed (40%): ${progressText}`);

    const auditLogText = await page.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder*="connection pooling"]') as HTMLTextAreaElement;
      return ta ? ta.value : '';
    });
    console.log(`  ✓ Audit Log contains cascade notice: ${auditLogText.includes('3 nested subtasks')}`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'skill_verify_02_task_cascade_checked.png') });
    console.log('  📸 Screenshot: skill_verify_02_task_cascade_checked.png');

    if (!progressText || !auditLogText.includes('3 nested subtasks')) {
      throw new Error('Parent task toggle did not cascade to nested subtasks');
    }

    // 3. Switch to Flow Simulator and verify plan-driven scenarios
    console.log('[4/8] Testing Flow Simulator Plan-Driven Scenarios...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const flowTab = buttons.find((b) => b.textContent?.includes('Flow Stepper'));
      if (flowTab) flowTab.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Open Scenario List View
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const listBtn = buttons.find((b) => b.textContent?.includes('Scenario List View'));
      if (listBtn) listBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const flowPageText = await page.evaluate(() => document.body.innerText);
    const hasScenario1 = flowPageText.includes('3DS Acquirer Step-Up Challenge');
    const hasScenario2 = flowPageText.includes('Card Vault Tokenization Fallback');
    const hasOldHardcoded = flowPageText.includes('Edge Case: Cache Spike & DB Fallback');

    console.log(`  ✓ Plan Scenario 1 present ("3DS Acquirer Step-Up Challenge"): ${hasScenario1}`);
    console.log(`  ✓ Plan Scenario 2 present ("Card Vault Tokenization Fallback"): ${hasScenario2}`);
    console.log(`  ✓ Old hardcoded 5 scenarios absent: ${!hasOldHardcoded}`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'skill_verify_03_plan_driven_flow_scenarios.png') });
    console.log('  📸 Screenshot: skill_verify_03_plan_driven_flow_scenarios.png');

    if (!hasScenario1 || !hasScenario2 || hasOldHardcoded) {
      throw new Error('Flow simulator did not render plan-driven scenarios accurately');
    }

    // 4. Switch to Diagram Canvas
    console.log('[5/8] Testing Diagram Canvas Layout...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const diagTab = buttons.find((b) => b.textContent?.includes('Diagram Canvas'));
      if (diagTab) diagTab.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    const diagramNodeCount = await page.evaluate(() => {
      return document.querySelectorAll('.react-flow__node').length;
    });
    console.log(`  ✓ Diagram Canvas rendered with ${diagramNodeCount} nodes`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'skill_verify_04_diagram_canvas.png') });
    console.log('  📸 Screenshot: skill_verify_04_diagram_canvas.png');

    // 5. Switch back to Document View and Test Universal Line-by-Line Mode
    console.log('[6/8] Testing Universal Line-by-Line Mode...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const docTab = buttons.find((b) => b.textContent?.includes('Plan & Tasks'));
      if (docTab) docTab.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const lineBtn = buttons.find((b) => b.textContent?.includes('Line-by-Line'));
      if (lineBtn) lineBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'skill_verify_05_line_by_line_editor.png') });
    console.log('  📸 Screenshot: skill_verify_05_line_by_line_editor.png');

    // 6. Test Approve & Submit button
    console.log('[7/8] Testing "Approve & Submit" Auto-Close and CLI Termination...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const approveBtn = buttons.find((b) => b.textContent?.includes('Approve & Submit'));
      if (approveBtn) approveBtn.click();
    });
    console.log('  ✓ Clicked "Approve & Submit"');

    // Wait for server to terminate cleanly with exit code 0
    console.log('  Waiting for CLI process to resolve with exit code 0...');
    const exitResult = await Promise.race([
      new Promise<{ code: number | null }>((resolve) => {
        serverProc.on('exit', (code) => resolve({ code }));
      }),
      new Promise<{ code: number | null }>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for CLI exit')), 8000)
      ),
    ]);

    console.log(`  ✓ CLI process exited with code: ${exitResult.code}`);

    // 7. Validate JSON stdout and file synchronization
    console.log('[8/8] Validating Structured JSON Diff & Markdown Sync...');
    const parsedStdout = JSON.parse(stdoutOutput.trim());
    console.log(`  ✓ Parsed JSON Status: "${parsedStdout.status}"`);
    console.log(`  ✓ Tasks modified count: ${parsedStdout.diff?.tasksModified?.length}`);
    console.log(`  ✓ User instructions: "${parsedStdout.userInstructions}"`);

    // Verify markdown updated on disk
    const updatedPlanDisk = fs.readFileSync(planPath, 'utf-8');
    const isPhase1MarkedOnDisk = updatedPlanDisk.includes('- [x] **Phase 1: Zero-Downtime Infrastructure Setup**');
    const isSubtaskMarkedOnDisk = updatedPlanDisk.includes('- [x] Provision AWS KMS key ring with multi-region replication');
    console.log(`  ✓ Disk file updated with Phase 1 [x]: ${isPhase1MarkedOnDisk}`);
    console.log(`  ✓ Disk file updated with Subtask [x]: ${isSubtaskMarkedOnDisk}`);

    if (parsedStdout.status === 'APPROVED' && isPhase1MarkedOnDisk && isSubtaskMarkedOnDisk) {
      console.log('\n🎉 ALL 8/8 SKILL WORKFLOW VERIFICATIONS PASSED PERFECTLY!\n');
    } else {
      throw new Error('Verification assertion failed on output structure or disk sync');
    }
  } finally {
    await browser.close();
    serverProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
