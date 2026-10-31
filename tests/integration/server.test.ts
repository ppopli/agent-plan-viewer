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

  it('persists added and modified diagram components to disk and renders them accurately on next view', async () => {
    const origDiag = server.currentPlanState.diagrams[0];
    const updatedDiag = {
      ...origDiag,
      nodes: [
        // Rename existing node A
        { ...origDiag.nodes[0], label: 'Auth Service' },
        origDiag.nodes[1],
        // Add new components of each supported type (gateway, queue, database, actor) with custom labels
        { id: 'node_gw', label: 'Edge Envoy', type: 'gateway' as const, shape: 'rounded' as const, x: 100, y: 100 },
        { id: 'node_q', label: 'Audit Stream', type: 'queue' as const, shape: 'subroutine' as const, x: 300, y: 200 },
        { id: 'node_cache', label: 'Session Store', type: 'database' as const, shape: 'cylinder' as const, x: 500, y: 200 },
        { id: 'node_act', label: 'Admin Operator', type: 'actor' as const, shape: 'circle' as const, x: 50, y: 50 },
      ],
      edges: [
        ...origDiag.edges,
        { id: 'e-act-gw', source: 'node_act', target: 'node_gw', label: 'HTTPS', style: 'solid' as const },
        { id: 'e-gw-a', source: 'node_gw', target: 'A', label: 'Forward', style: 'solid' as const },
        { id: 'e-a-q', source: 'A', target: 'node_q', label: 'Emit Event', style: 'dashed' as const },
        { id: 'e-a-cache', source: 'A', target: 'node_cache', label: 'Read/Write', style: 'solid' as const },
      ],
    };

    const modifiedState = {
      ...server.currentPlanState,
      diagrams: [updatedDiag],
    };

    // 1. Save draft and verify GET /api/plan immediately has synced rawMarkdown
    const saveRes = await request(server.app)
      .post('/api/save')
      .send({ planState: modifiedState, label: 'Added diagram components' });
    expect(saveRes.status).toBe(200);

    const getAfterSave = await request(server.app).get('/api/plan');
    expect(getAfterSave.body.state.rawMarkdown).toContain('Auth Service');
    expect(getAfterSave.body.state.rawMarkdown).toContain('Edge Envoy');
    expect(getAfterSave.body.state.rawMarkdown).toContain('Audit Stream');
    expect(getAfterSave.body.state.rawMarkdown).toContain('Session Store');

    // 2. Submit via /api/request-changes and verify diff.diagramChanges
    const reqChangesRes = await request(server.app)
      .post('/api/request-changes')
      .send({
        planState: modifiedState,
        userInstructions: 'Update architecture sections for the newly added Edge Envoy and Audit Stream components',
      });
    expect(reqChangesRes.status).toBe(200);
    expect(reqChangesRes.body.result.diff.diagramChanges).toEqual(
      expect.arrayContaining([
        "Renamed component 'Service' -> 'Auth Service'",
        "Added component 'Edge Envoy' (gateway)",
        "Added component 'Audit Stream' (queue)",
        "Added component 'Session Store' (database)",
        "Added component 'Admin Operator' (actor)",
      ])
    );

    // 3. Open a brand-new PlanViewerServer on the saved plan file to simulate viewing the plan next time
    const nextServer = new PlanViewerServer({
      planPath: testPlanPath,
      port: 0,
    });
    try {
      const nextPlanRes = await request(nextServer.app).get('/api/plan');
      expect(nextPlanRes.status).toBe(200);
      const nextDiag = nextPlanRes.body.state.diagrams[0];
      expect(nextDiag.nodes.find((n: any) => n.id === 'A')?.label).toBe('Auth Service');
      expect(nextDiag.nodes.find((n: any) => n.id === 'node_gw')).toMatchObject({
        label: 'Edge Envoy',
        type: 'gateway',
        shape: 'rounded',
      });
      expect(nextDiag.nodes.find((n: any) => n.id === 'node_q')).toMatchObject({
        label: 'Audit Stream',
        type: 'queue',
        shape: 'subroutine',
      });
      expect(nextDiag.nodes.find((n: any) => n.id === 'node_cache')).toMatchObject({
        label: 'Session Store',
        type: 'database',
        shape: 'cylinder',
      });
      expect(nextDiag.nodes.find((n: any) => n.id === 'node_act')).toMatchObject({
        label: 'Admin Operator',
        type: 'actor',
        shape: 'circle',
      });
      expect(nextDiag.edges.length).toBe(5);
    } finally {
      await nextServer.stop();
    }
  });
});
