import { describe, it, expect } from 'vitest';
import {
  parseMermaid,
  serializeToMermaid,
  computeDiagramDiff,
  inferNodeType,
  rebuildDiagramFlows,
} from '../../src/core/mermaid-graph-bridge.js';
import { ParsedDiagram } from '../../src/core/types.js';

describe('mermaid-graph-bridge', () => {
  it('should infer semantic node types correctly', () => {
    expect(inferNodeType('db', 'PostgreSQL Database', 'cylinder')).toBe('database');
    expect(inferNodeType('q', 'Kafka Topic', 'subroutine')).toBe('queue');
    expect(inferNodeType('gw', 'API Gateway', 'rounded')).toBe('gateway');
    expect(inferNodeType('u', 'User Browser', 'circle')).toBe('actor');
    expect(inferNodeType('srv', 'Order Service', 'box')).toBe('service');
  });

  it('should parse flowchart nodes, edges, and shapes', () => {
    const mermaid = `flowchart TD
    Client{{Client Browser}}
    Gateway(API Gateway)
    OrderDB[(PostgreSQL)]
    Client -->|HTTP| Gateway
    Gateway -.-> OrderDB`;

    const parsed = parseMermaid(mermaid, 'diag-test');
    expect(parsed.type).toBe('flowchart');
    expect(parsed.nodes.length).toBe(3);
    expect(parsed.edges.length).toBe(2);

    const clientNode = parsed.nodes.find(n => n.id === 'Client');
    expect(clientNode?.shape).toBe('circle');
    expect(clientNode?.type).toBe('actor');

    const dbNode = parsed.nodes.find(n => n.id === 'OrderDB');
    expect(dbNode?.shape).toBe('cylinder');
    expect(dbNode?.type).toBe('database');

    const dashedEdge = parsed.edges.find(e => e.source === 'Gateway' && e.target === 'OrderDB');
    expect(dashedEdge?.style).toBe('dashed');
  });

  it('should parse sequence diagrams', () => {
    const mermaid = `sequenceDiagram
    actor User as "User Browser"
    participant Auth as "Auth Service"
    User->>Auth: Login Request
    Auth-->>User: 200 OK Token`;

    const parsed = parseMermaid(mermaid, 'diag-seq');
    expect(parsed.type).toBe('sequence');
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(2);
    expect(parsed.flowSteps.length).toBe(2);
    expect(parsed.flowSteps[0].label).toBe('Login Request');
  });

  it('should serialize parsed flowchart back to valid Mermaid', () => {
    const mermaid = `flowchart TD
    A[Service A]
    B[(Database B)]
    A --> B`;

    const parsed = parseMermaid(mermaid, 'diag-roundtrip');
    const serialized = serializeToMermaid(parsed);
    expect(serialized).toContain('flowchart TD');
    expect(serialized).toContain('A["Service A"]');
    expect(serialized).toContain('B[("Database B")]');
    expect(serialized).toContain('A --> B');
  });

  it('should compute diagram diffs when components are added or removed', () => {
    const before: ParsedDiagram = {
      id: 'd1',
      type: 'flowchart',
      rawMermaid: '',
      nodes: [
        { id: 'A', label: 'Gateway', type: 'gateway', x: 0, y: 0 },
        { id: 'B', label: 'DB', type: 'database', x: 0, y: 0 },
      ],
      edges: [{ id: 'e1', source: 'A', target: 'B', style: 'solid' }],
      flowSteps: [],
    };

    const after: ParsedDiagram = {
      id: 'd1',
      type: 'flowchart',
      rawMermaid: '',
      nodes: [
        { id: 'A', label: 'Gateway', type: 'gateway', x: 0, y: 0 },
        { id: 'Redis', label: 'Redis Cache', type: 'database', x: 0, y: 0 },
        { id: 'B', label: 'DB', type: 'database', x: 0, y: 0 },
      ],
      edges: [
        { id: 'e2', source: 'A', target: 'Redis', style: 'solid' },
        { id: 'e3', source: 'Redis', target: 'B', style: 'solid' },
      ],
      flowSteps: [],
    };

    const diffs = computeDiagramDiff(before, after);
    expect(diffs).toContain("Added component 'Redis Cache' (database)");
    expect(diffs).toContain("Connected 'Gateway' -> 'Redis Cache'");
    expect(diffs).toContain("Connected 'Redis Cache' -> 'DB'");
    expect(diffs).toContain("Disconnected 'Gateway' -> 'DB'");
  });

  it('should return empty flowSteps and scenarios for static diagrams with 0 edges, and rebuild when connected', () => {
    const staticMermaid = `flowchart TD
    Client{{Client App}}
    APIGateway(API Gateway)
    PostgresDB[(PostgreSQL Database)]`;

    const parsed = parseMermaid(staticMermaid, 'diag-static');
    expect(parsed.nodes.length).toBe(3);
    expect(parsed.edges.length).toBe(0);
    expect(parsed.flowSteps.length).toBe(0);
    expect(parsed.scenarios?.length).toBe(0);

    // Add a connection and rebuild flows
    const connected = rebuildDiagramFlows({
      ...parsed,
      edges: [
        { id: 'e1', source: 'Client', target: 'APIGateway', label: 'HTTPS', style: 'solid' },
      ],
    });
    expect(connected.flowSteps.length).toBe(1);
    expect(connected.scenarios && connected.scenarios.length).toBeGreaterThan(0);
  });
});

