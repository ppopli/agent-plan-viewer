import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PlanViewerServer } from '../src/cli/server.js';

const ARTIFACT_DIR = '/Users/pulkitpopli/.gemini/antigravity-cli/brain/e9d04427-44fc-41a1-b45c-8c034f707a1c';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apv-cascade-scen-'));
  const mdPath = path.join(tmpDir, 'plan-cascade-scenarios.md');

  const markdown = `# Payment Gateway Architecture Plan

## Overview
High-throughput payment orchestration service with idempotency and circuit breaking.

\`\`\`mermaid
flowchart TD
    Checkout[Checkout UI] -->|POST /pay| Gateway(Payment Gateway)
    Gateway -->|Verify| Fraud[Fraud Engine]
    Gateway -->|Charge| Stripe[(Stripe Provider)]
\`\`\`

## Tasks
- [ ] **Phase 1: Core Payment Pipeline**
  - [ ] Implement idempotency key middleware
  - [ ] Add Stripe webhook signature verifier
- [ ] **Phase 2: Resilience & Observability**
  - [ ] Configure Fraud Engine circuit breaker

## Request Flow Scenarios
- **Happy Path: Card Charge Approved**: Checkout UI -> Payment Gateway -> Fraud Engine -> Stripe Provider succeeds with 200 OK.
- **Fraud Score Rejected**: Fraud Engine flags high-risk transaction and returns 403 Forbidden.
- **Stripe Provider Timeout**: Stripe Provider times out with 504 Gateway Timeout triggering automatic retry queue.
`;

  fs.writeFileSync(mdPath, markdown, 'utf-8');

  const server = new PlanViewerServer({
    planPath: mdPath,
    port: 0,
    autoOpen: false,
  });

  const port = await server.start();
  const url = `http://localhost:${port}`;
  console.log(`Server started at ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle0' });

    // 1. Click the checkbox for parent task "Phase 1: Core Payment Pipeline"
    await page.evaluate(() => {
      const toggleBtns = Array.from(
        document.querySelectorAll('button[title="Toggle task completion"]')
      );
      if (toggleBtns.length > 0) {
        (toggleBtns[0] as HTMLButtonElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    // Verify progress badge shows 3 / 5 completed (60%) because Phase 1 + 2 subtasks cascaded!
    const progressText = await page.evaluate(() => {
      return document.body.innerText.includes('3 / 5 completed (60%)');
    });
    const auditLogText = await page.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder*="connection pooling"]') as HTMLTextAreaElement;
      return ta ? ta.value : '';
    });
    console.log('Progress shows 3 / 5 completed (60%):', progressText);
    console.log('Audit log:', auditLogText);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'cascade_01_parent_task_checked_subtasks.png'),
    });

    if (!progressText || !auditLogText.includes('2 nested subtasks')) {
      throw new Error('Parent task toggle did not cascade to nested subtasks');
    }

    // 2. Switch to Flow Stepper and verify scenarios match the 3 scenarios in the plan (not 5 hardcoded)
    await page.evaluate(() => {
      const flowTab = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Flow Stepper')
      );
      if (flowTab) flowTab.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Open Scenario List View drawer to show the exact 3 scenarios from the plan
    await page.evaluate(() => {
      const listBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Scenario List View')
      );
      if (listBtn) listBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    const scenarioPageText = await page.evaluate(() => document.body.innerText);
    const hasPlanScenario1 = scenarioPageText.includes('Happy Path: Card Charge Approved');
    const hasPlanScenario2 = scenarioPageText.includes('Fraud Score Rejected');
    const hasPlanScenario3 = scenarioPageText.includes('Stripe Provider Timeout');
    const hasOldHardcoded = scenarioPageText.includes('Edge Case: Cache Spike & DB Fallback');

    console.log('Plan Scenario 1 present:', hasPlanScenario1);
    console.log('Plan Scenario 2 present:', hasPlanScenario2);
    console.log('Plan Scenario 3 present:', hasPlanScenario3);
    console.log('Old hardcoded scenario absent:', !hasOldHardcoded);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'cascade_02_plan_driven_flow_scenarios.png'),
    });

    if (!hasPlanScenario1 || !hasPlanScenario2 || !hasPlanScenario3 || hasOldHardcoded) {
      throw new Error('Flow simulator did not render plan-driven scenarios accurately');
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
