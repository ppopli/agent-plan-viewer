import { describe, it, expect } from 'vitest';
import { parsePlanMarkdown, toggleTaskWithCascade } from '../../src/core/plan-parser.js';
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

  it('should cascade completion from parent task to all nested subtasks and maintain upward consistency', () => {
    const hierarchicalMarkdown = `# Hierarchical Plan

## Tasks
- [ ] **Phase 1: Core Infrastructure**
  - [ ] Setup PostgreSQL cluster
  - [ ] Configure Redis sentinel
    - [ ] Enable TLS on Redis
- [ ] **Phase 2: API Layer**
  - [ ] Implement GraphQL gateway
`;
    const plan = parsePlanMarkdown(hierarchicalMarkdown);
    expect(plan.tasks.length).toBe(6);

    // 1. Completing Phase 1 parent task (task-1) must cascade to its 3 nested subtasks, leaving Phase 2 untouched
    const afterCheckParent = toggleTaskWithCascade(plan.tasks, 'task-1');
    expect(afterCheckParent.newStatus).toBe(true);
    expect(afterCheckParent.cascadedCount).toBe(3);
    expect(afterCheckParent.tasks[0].completed).toBe(true); // Phase 1
    expect(afterCheckParent.tasks[1].completed).toBe(true); // Setup PostgreSQL
    expect(afterCheckParent.tasks[2].completed).toBe(true); // Configure Redis
    expect(afterCheckParent.tasks[3].completed).toBe(true); // Enable TLS
    expect(afterCheckParent.tasks[4].completed).toBe(false); // Phase 2 untouched
    expect(afterCheckParent.tasks[5].completed).toBe(false); // Implement GraphQL untouched

    // 2. Unchecking a single nested subtask (task-2) must uncheck its parent Phase 1
    const afterUncheckChild = toggleTaskWithCascade(afterCheckParent.tasks, 'task-2');
    expect(afterUncheckChild.tasks[1].completed).toBe(false); // Setup PostgreSQL unchecked
    expect(afterUncheckChild.tasks[0].completed).toBe(false); // Parent Phase 1 auto-unchecked

    // 3. Re-checking that subtask (task-2) when all other siblings are done must auto-complete Parent Phase 1
    const afterRecheckChild = toggleTaskWithCascade(afterUncheckChild.tasks, 'task-2');
    expect(afterRecheckChild.tasks[1].completed).toBe(true);
    expect(afterRecheckChild.tasks[0].completed).toBe(true);

    // 4. Unchecking Parent Phase 1 (task-1) must cascade false to all its subtasks
    const afterUncheckParent = toggleTaskWithCascade(afterRecheckChild.tasks, 'task-1');
    expect(afterUncheckParent.tasks.slice(0, 4).every((t) => !t.completed)).toBe(true);
  });

  it('should not hardcode 5 scenarios when plan has no scenario section, and should extract scenarios when present in plan', () => {
    // 1. Plan without scenario section -> only 1 Primary Diagram Flow scenario
    const basicPlan = parsePlanMarkdown(sampleMarkdown);
    expect(basicPlan.diagrams[0].scenarios?.length).toBe(1);
    expect(basicPlan.diagrams[0].scenarios?.[0].name).toBe('Primary Diagram Flow');

    // 2. Plan with explicit scenarios section -> extracts exact scenarios from the plan
    const planWithScenariosMd = `# Order Processing Architecture

\`\`\`mermaid
flowchart TD
    Client[Client App] -->|POST /orders| Gateway(API Gateway)
    Gateway -->|Validate| Auth[Auth Service]
    Gateway -->|Persist| DB[(Order Database)]
\`\`\`

## Request Flow Scenarios
- **Happy Path: Order Created**: Client -> API Gateway ->Order Database succeeds with 200 OK.
- **Expired JWT Token**: Rejected at API Gateway and Auth Service with 401 Unauthorized.
- **Database Write Timeout**: Order Database connection pool exhausted returning 504 Timeout.
`;

    const planWithScenarios = parsePlanMarkdown(planWithScenariosMd);
    const scenarios = planWithScenarios.diagrams[0].scenarios || [];
    expect(scenarios.length).toBe(3);
    expect(scenarios[0].name).toBe('Happy Path: Order Created');
    expect(scenarios[0].type).toBe('success');
    expect(scenarios[1].name).toBe('Expired JWT Token');
    expect(scenarios[1].type).toBe('failure');
    expect(scenarios[2].name).toBe('Database Write Timeout');
    expect(scenarios[2].type).toBe('failure');
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

