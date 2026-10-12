import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PlanViewerServer } from '../../src/cli/server.js';
import { ReviewResult } from '../../src/core/types.js';

describe('PlanViewerServer Integration Tests', () => {
  let tmpDir: string;
  let testPlanPath: string;
  let server: PlanViewerServer;
  let resolvedResult: ReviewResult | null = null;

  const initialPlanContent = `# Test Plan

## Goal
Verify server API endpoints.

\`\`\`mermaid
flowchart TD
    A[Service] --> B[(DB)]
\`\`\`

## Tasks
- [ ] Task 1: Initialize
`;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-plan-viewer-test-'));
    testPlanPath = path.join(tmpDir, 'plan.md');
    fs.writeFileSync(testPlanPath, initialPlanContent, 'utf-8');
    resolvedResult = null;

    server = new PlanViewerServer({
      planPath: testPlanPath,
      port: 0, // dynamic
      onResolve: (res) => {
        resolvedResult = res;
      },
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/plan returns current plan state and baseline 0', async () => {
    const res = await request(server.app).get('/api/plan');
    expect(res.status).toBe(200);
    expect(res.body.state.goal.title).toBe('Test Plan');
    expect(res.body.baselines.length).toBe(1);
    expect(res.body.baselines[0].label).toBe('Initial Agent Plan');
  });

  it('Disk file is NOT modified before explicit save', async () => {
    const onDiskBefore = fs.readFileSync(testPlanPath, 'utf-8');
    expect(onDiskBefore).toBe(initialPlanContent);

    // Call GET
    await request(server.app).get('/api/plan');

    const onDiskAfter = fs.readFileSync(testPlanPath, 'utf-8');
    expect(onDiskAfter).toBe(initialPlanContent);
  });

  it('POST /api/save explicitly persists to disk and adds baseline', async () => {
    const modifiedState = {
      ...server.currentPlanState,
      tasks: [
        ...server.currentPlanState.tasks,
        { id: 't-2', title: 'Task 2: New Milestone', completed: false, indent: 0 },
      ],
    };

    const res = await request(server.app)
      .post('/api/save')
      .send({ planState: modifiedState, label: 'Draft with Task 2' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify disk content changed
    const onDisk = fs.readFileSync(testPlanPath, 'utf-8');
    expect(onDisk).toContain('Task 2: New Milestone');

    // Verify baselines list updated
    const baselinesRes = await request(server.app).get('/api/baselines');
    expect(baselinesRes.body.baselines.length).toBe(2);
    expect(baselinesRes.body.baselines[1].label).toBe('Draft with Task 2');
  });

  it('POST /api/approve resolves the review session and computes diff', async () => {
    const modifiedState = {
      ...server.currentPlanState,
      tasks: [
        { id: 't-1', title: 'Task 1: Initialize', completed: true, indent: 0 },
        { id: 't-new', title: 'Task New: Added by Human', completed: false, indent: 0 },
      ],
    };

    const res = await request(server.app)
      .post('/api/approve')
      .send({
        planState: modifiedState,
        userInstructions: 'Ensure test coverage is 95%',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.status).toBe('APPROVED');
    expect(res.body.result.userInstructions).toBe('Ensure test coverage is 95%');
    expect(res.body.result.diff.tasksAdded).toContain('Task New: Added by Human');
    expect(resolvedResult?.status).toBe('APPROVED');
  });
});
