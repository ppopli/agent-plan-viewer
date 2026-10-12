import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PlanViewerServer } from '../../src/cli/server.js';
import { ReviewResult } from '../../src/core/types.js';

describe('End-to-End Review Flow & Explicit Save / Submit Lifecycle', () => {
  let tmpDir: string;
  let testPlanPath: string;
  let server: PlanViewerServer;
  let serverPort: number;
  let resolvedResult: ReviewResult | null = null;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-plan-e2e-'));
    testPlanPath = path.join(tmpDir, 'e-commerce.md');

    // Copy sample plan to tmp directory
    const samplePath = path.resolve('examples/sample-plans/e-commerce-microservices.md');
    fs.copyFileSync(samplePath, testPlanPath);

    resolvedResult = null;
    server = new PlanViewerServer({
      planPath: testPlanPath,
      port: 0,
      onResolve: (res) => {
        resolvedResult = res;
      },
    });

    serverPort = await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('verifies complete lifecycle: load -> no autosave -> explicit save -> baseline capping -> approve', async () => {
    const originalFileContent = fs.readFileSync(testPlanPath, 'utf-8');

    // 1. Initial Plan Retrieval
    const planRes = await fetch(`http://localhost:${serverPort}/api/plan`);
    expect(planRes.ok).toBe(true);
    const planData = await planRes.json();
    expect(planData.state.goal.title).toContain('E-Commerce Order Processing Architecture');
    expect(planData.state.tasks.length).toBe(5);
    expect(planData.state.diagrams.length).toBe(1);
    expect(planData.baselines.length).toBe(1);
    expect(planData.baselines[0].label).toBe('Initial Agent Plan');

    // 2. Verify file on disk is unchanged after loading
    expect(fs.readFileSync(testPlanPath, 'utf-8')).toBe(originalFileContent);

    // 3. User modifies tasks in draft (client-side)
    const workingDraft = JSON.parse(JSON.stringify(planData.state));
    workingDraft.tasks.push({
      id: 'task-e2e-1',
      title: 'Add Redis Distributed Cache Lock',
      completed: false,
      indent: 0,
    });

    // Verify disk is STILL untouched
    expect(fs.readFileSync(testPlanPath, 'utf-8')).toBe(originalFileContent);

    // 4. User hits explicit "Save Draft"
    const saveRes1 = await fetch(`http://localhost:${serverPort}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planState: workingDraft,
        label: 'Draft #1: Added Redis Lock',
      }),
    });
    expect(saveRes1.ok).toBe(true);

    // Now disk MUST be updated
    const savedDisk1 = fs.readFileSync(testPlanPath, 'utf-8');
    expect(savedDisk1).toContain('Add Redis Distributed Cache Lock');

    // Baselines count should now be 2
    const baselinesRes1 = await fetch(`http://localhost:${serverPort}/api/baselines`);
    const baselinesData1 = await baselinesRes1.json();
    expect(baselinesData1.baselines.length).toBe(2);
    expect(baselinesData1.baselines[1].label).toBe('Draft #1: Added Redis Lock');

    // 5. Test Baseline Capping at 10
    for (let i = 2; i <= 15; i++) {
      await fetch(`http://localhost:${serverPort}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planState: workingDraft,
          label: `Draft #${i}`,
        }),
      });
    }

    const baselinesResCapped = await fetch(`http://localhost:${serverPort}/api/baselines`);
    const baselinesDataCapped = await baselinesResCapped.json();
    expect(baselinesDataCapped.baselines.length).toBe(10);
    // Oldest should have shifted
    expect(baselinesDataCapped.baselines[9].label).toBe('Draft #15');

    // 6. User modifies diagram: Add Redis node and connect
    const diagramDraft = JSON.parse(JSON.stringify(workingDraft));
    diagramDraft.diagrams[0].nodes.push({
      id: 'RedisLock',
      label: 'Redis Cache Lock',
      type: 'database',
      shape: 'cylinder',
      x: 300,
      y: 400,
    });
    diagramDraft.diagrams[0].edges.push({
      id: 'e-order-redis',
      source: 'OrderService',
      target: 'RedisLock',
      style: 'solid',
    });

    // 7. Explicit User "Approve & Submit"
    const approveRes = await fetch(`http://localhost:${serverPort}/api/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planState: diagramDraft,
        userInstructions: 'Ensure connection pooling is tuned for 1000 RPS',
      }),
    });
    expect(approveRes.ok).toBe(true);
    const approveData = await approveRes.json();
    expect(approveData.success).toBe(true);
    expect(approveData.result.status).toBe('APPROVED');
    expect(approveData.result.userInstructions).toBe('Ensure connection pooling is tuned for 1000 RPS');
    expect(approveData.result.diff.tasksAdded).toContain('Add Redis Distributed Cache Lock');
    expect(approveData.result.diff.diagramChanges.some((d: string) => d.includes('Redis Cache Lock'))).toBe(true);

    // Verify resolved result callback
    expect(resolvedResult).not.toBeNull();
    expect(resolvedResult?.status).toBe('APPROVED');

    // Final disk verification
    const finalDiskContent = fs.readFileSync(testPlanPath, 'utf-8');
    expect(finalDiskContent).toContain('RedisLock');
    expect(finalDiskContent).toContain('Ensure connection pooling is tuned for 1000 RPS');
  });
});
