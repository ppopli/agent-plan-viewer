import { describe, it, expect } from 'vitest';
import { parsePlanMarkdown } from '../../src/core/plan-parser.js';
import { serializePlanMarkdown, calculatePlanDiff } from '../../src/core/plan-serializer.js';
import { parseMermaid } from '../../src/core/mermaid-graph-bridge.js';

describe('plan-parser', () => {
  const sampleMarkdown = `# Implementation Plan: Test Project

Overview of the project goals.

\`\`\`mermaid
flowchart TD
    A[Client] -->|HTTP| B[(Database)]
\`\`\`

## Tasks
- [ ] Task 1: Initialize database
- [x] Task 2: Setup configuration
  - [ ] Task 2.1: Nested item

## Proposed File Changes
#### [NEW] src/index.ts
#### [MODIFY] package.json
#### [DELETE] legacy.js
`;

  it('should extract title and goal description', () => {
    const plan = parsePlanMarkdown(sampleMarkdown);
    expect(plan.goal.title).toBe('Implementation Plan: Test Project');
    expect(plan.goal.description).toContain('Overview of the project goals');
  });

  it('should parse tasks with completion status and indentation', () => {
    const plan = parsePlanMarkdown(sampleMarkdown);
    expect(plan.tasks.length).toBe(3);
    expect(plan.tasks[0].title).toBe('Task 1: Initialize database');
    expect(plan.tasks[0].completed).toBe(false);
    expect(plan.tasks[1].title).toBe('Task 2: Setup configuration');
    expect(plan.tasks[1].completed).toBe(true);
    expect(plan.tasks[2].title).toBe('Task 2.1: Nested item');
    expect(plan.tasks[2].indent).toBe(1);
  });

  it('should extract file changes by change type', () => {
    const plan = parsePlanMarkdown(sampleMarkdown);
    expect(plan.fileChanges.length).toBe(3);
    expect(plan.fileChanges).toEqual([
      { path: 'src/index.ts', type: 'NEW' },
      { path: 'package.json', type: 'MODIFY' },
      { path: 'legacy.js', type: 'DELETE' },
    ]);
  });

  it('should parse fenced Mermaid diagrams', () => {
    const plan = parsePlanMarkdown(sampleMarkdown);
    expect(plan.diagrams.length).toBe(1);
    const diag = plan.diagrams[0];
    expect(diag.type).toBe('flowchart');
    expect(diag.nodes.length).toBe(2);
    expect(diag.nodes.find(n => n.id === 'B')?.type).toBe('database');
  });

  it('should handle text-only plans with zero diagrams and serialize newly initialized diagrams', () => {
    const textOnlyMarkdown = `# Implementation Plan: Database Migration

Migrate PostgreSQL schema to support multi-tenant workspaces.

## Tasks
- [ ] Create tenants table
- [ ] Backfill tenant_id foreign keys
`;

    const initialPlan = parsePlanMarkdown(textOnlyMarkdown);
    expect(initialPlan.diagrams.length).toBe(0);
    expect(initialPlan.tasks.length).toBe(2);

    const newDiag = parseMermaid(
      `flowchart TD\n    App[App Server] -->|SQL| DB[(PostgreSQL)]`,
      'diagram-0'
    );
    const updatedPlan = {
      ...initialPlan,
      diagrams: [newDiag],
    };

    const serialized = serializePlanMarkdown(updatedPlan);
    expect(serialized).toContain('## System Architecture');
    expect(serialized).toContain('```mermaid');
    expect(serialized).toContain('flowchart TD');

    const diff = calculatePlanDiff(initialPlan, updatedPlan);
    expect(diff.diagramChanges.length).toBeGreaterThanOrEqual(2);
    expect(diff.diagramChanges.join(' ')).toContain('App Server');
    expect(diff.diagramChanges.join(' ')).toContain('PostgreSQL');
  });
});

