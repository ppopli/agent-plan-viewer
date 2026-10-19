import { describe, it, expect } from 'vitest';
import { parseMermaid } from '../../src/core/mermaid-graph-bridge';
import { patchMermaid, diagramsEqual } from '../../src/core/mermaid-patch';
import { ParsedDiagram } from '../../src/core/types';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** parse -> mutate a copy -> patch the original source */
function edit(raw: string, mutate: (d: ParsedDiagram) => void): string | null {
  const before = parseMermaid(raw, 'd');
  const after = clone(before);
  mutate(after);
  return patchMermaid(raw, before, after);
}

const FLOW = `flowchart TD
    %% core services
    Client["Web / Mobile"]
    GW["API Gateway"]
    DB[("Postgres")]
    subgraph Backend["Backend"]
        Auth["Auth"]
        Pin["Pin Service"]
    end
    Client --> GW
    GW --> Auth
    GW -->|read| Pin
    Pin -.-> DB
    style GW fill:#f9f,stroke:#333
    classDef hot fill:#f66
`;

const SEQ = `sequenceDiagram
    actor Client as "Client"
    participant Svc as "Svc"
    participant Kafka as "Kafka"
    Note over Client,Svc: upload flow
    Client->>Svc: POST /pins
    Svc->>Kafka: pin.created
    alt moderation fails
        Kafka->>Svc: rejected
    else passes
        Kafka->>Svc: active
    end
    Svc-->>Client: done
`;

describe('patchMermaid: identity', () => {
  it('diagramsEqual is true for an unmodified parse', () => {
    const a = parseMermaid(FLOW, 'd');
    expect(diagramsEqual(a, clone(a))).toBe(true);
  });

  it('returns the source unchanged when nothing changed (flowchart)', () => {
    expect(edit(FLOW, () => {})?.trim()).toBe(FLOW.trim());
  });

  it('returns the source unchanged when nothing changed (sequence)', () => {
    expect(edit(SEQ, () => {})?.trim()).toBe(SEQ.trim());
  });
});

describe('patchMermaid: flowchart edits preserve structure', () => {
  it('relabels a node in place, keeping subgraph, comments and styles', () => {
    const out = edit(FLOW, (d) => {
      d.nodes.find((n) => n.id === 'Pin')!.label = 'Pin Svc v2';
    })!;
    expect(out).toContain('Pin["Pin Svc v2"]');
    expect(out).toContain('subgraph Backend["Backend"]');
    expect(out).toContain('%% core services');
    expect(out).toContain('style GW fill:#f9f,stroke:#333');
    expect(out).toContain('classDef hot fill:#f66');
    expect(out).not.toContain('"Pin Service"');
  });

  it('adds a node and an edge without touching existing lines', () => {
    const out = edit(FLOW, (d) => {
      d.nodes.push({ id: 'Cache', label: 'Redis', type: 'database', shape: 'cylinder', x: 0, y: 0 });
      d.edges.push({ id: 'e-new', source: 'Pin', target: 'Cache', label: 'get', style: 'solid' });
    })!;
    expect(out).toContain('Cache[("Redis")]');
    expect(out).toContain('Pin -->|get| Cache');
    expect(out).toContain('subgraph Backend["Backend"]');
    const reparsed = parseMermaid(out, 'd');
    expect(reparsed.nodes.map((n) => n.id)).toContain('Cache');
    expect(reparsed.edges.some((e) => e.source === 'Pin' && e.target === 'Cache')).toBe(true);
  });

  it('removes an edge but keeps everything else', () => {
    const out = edit(FLOW, (d) => {
      d.edges = d.edges.filter((e) => !(e.source === 'Client' && e.target === 'GW'));
    })!;
    expect(out).not.toMatch(/Client\s*-->\s*GW/);
    expect(out).toContain('GW --> Auth');
    expect(out).toContain('Client["Web / Mobile"]');
  });

  it('removes a node together with its edges and definition', () => {
    const out = edit(FLOW, (d) => {
      d.nodes = d.nodes.filter((n) => n.id !== 'DB');
      d.edges = d.edges.filter((e) => e.source !== 'DB' && e.target !== 'DB');
    })!;
    expect(out).not.toContain('DB');
    expect(out).toContain('subgraph Backend');
    const reparsed = parseMermaid(out, 'd');
    expect(reparsed.nodes.find((n) => n.id === 'DB')).toBeUndefined();
  });

  it('removes edges even when the UI leaves dangling edges for a removed node', () => {
    const out = edit(FLOW, (d) => {
      d.nodes = d.nodes.filter((n) => n.id !== 'Auth');
    })!;
    expect(out).not.toContain('Auth');
  });

  it('changes edge style and label in place', () => {
    const out = edit(FLOW, (d) => {
      const e = d.edges.find((x) => x.source === 'GW' && x.target === 'Pin')!;
      e.label = 'write';
      e.style = 'thick';
    })!;
    expect(out).toContain('GW ==>|write| Pin');
    expect(out).not.toContain('|read|');
  });

  it('reshapes a node (box -> cylinder)', () => {
    const out = edit(FLOW, (d) => {
      const n = d.nodes.find((x) => x.id === 'Auth')!;
      n.shape = 'cylinder';
      n.label = 'Auth DB';
    })!;
    expect(out).toContain('Auth[("Auth DB")]');
  });

  it('keeps inline node definitions alive when their edge is removed', () => {
    const raw = `flowchart TD
    A["Alpha"] --> B["Beta"]
    B --> C["Gamma"]`;
    const out = edit(raw, (d) => {
      d.edges = d.edges.filter((e) => !(e.source === 'B' && e.target === 'C'));
    })!;
    const reparsed = parseMermaid(out, 'd');
    expect(reparsed.nodes.find((n) => n.id === 'C')?.label).toBe('Gamma');
    expect(reparsed.edges).toHaveLength(1);
  });

  it('adds an explicit definition for implicit nodes that get relabeled', () => {
    const raw = `flowchart TD
    A --> B`;
    const out = edit(raw, (d) => {
      d.nodes.find((n) => n.id === 'B')!.label = 'Bee';
    })!;
    expect(parseMermaid(out, 'd').nodes.find((n) => n.id === 'B')?.label).toBe('Bee');
  });

  it('preserves CRLF line endings', () => {
    const raw = 'flowchart TD\r\n    A["a"]\r\n    B["b"]\r\n    A --> B';
    const out = edit(raw, (d) => {
      d.nodes.find((n) => n.id === 'A')!.label = 'aa';
    })!;
    expect(out).toContain('\r\n');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('inserts a new edge right after the preceding edge (keeps order stable)', () => {
    const out = edit(FLOW, (d) => {
      d.edges.splice(1, 0, { id: 'e-mid', source: 'Client', target: 'Pin', style: 'solid' });
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    const i = lines.indexOf('Client --> GW');
    expect(lines[i + 1]).toBe('Client --> Pin');
  });

  it('returns null (fallback) for multi-edge lines that need surgery', () => {
    const raw = `flowchart TD
    A --> B; B --> C`;
    const before = parseMermaid(raw, 'd');
    expect(before.edges).toHaveLength(2);
    const out = edit(raw, (d) => {
      d.edges = d.edges.slice(0, 1);
    });
    expect(out).toBeNull();
  });

  it('refuses to patch when line/edge counts disagree with the parse', () => {
    const before = parseMermaid(FLOW, 'd');
    const after = clone(before);
    after.nodes.pop();
    // pass a raw that doesn't match `before`
    expect(patchMermaid('flowchart TD\n  X --> Y', before, after)).toBeNull();
  });
});

describe('patchMermaid: sequence edits preserve structure', () => {
  it('relabels a participant, keeping alt/else and notes', () => {
    const out = edit(SEQ, (d) => {
      d.nodes.find((n) => n.id === 'Svc')!.label = 'Pin Service';
    })!;
    expect(out).toContain('participant Svc as "Pin Service"');
    expect(out).toContain('alt moderation fails');
    expect(out).toContain('else passes');
    expect(out).toContain('Note over Client,Svc: upload flow');
  });

  it('edits a message label in place inside an alt branch', () => {
    const out = edit(SEQ, (d) => {
      d.edges.find((e) => e.label === 'rejected')!.label = 'blocked by moderation';
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    const altIdx = lines.indexOf('alt moderation fails');
    expect(lines[altIdx + 1]).toBe('Kafka->>Svc: blocked by moderation');
  });

  it('removes a message but keeps block structure balanced', () => {
    const out = edit(SEQ, (d) => {
      d.edges = d.edges.filter((e) => e.label !== 'active');
    })!;
    expect(out).toContain('else passes');
    expect(out.match(/\bend\b/g)).toHaveLength(1);
    expect(out).not.toContain('Kafka->>Svc: active');
  });

  it('adds a message right after its predecessor', () => {
    const out = edit(SEQ, (d) => {
      const idx = d.edges.findIndex((e) => e.label === 'pin.created');
      d.edges.splice(idx + 1, 0, { id: 'e-add', source: 'Svc', target: 'Kafka', label: 'audit', style: 'solid' });
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    const i = lines.indexOf('Svc->>Kafka: pin.created');
    expect(lines[i + 1]).toBe('Svc->>Kafka: audit');
    expect(out).toContain('alt moderation fails');
  });

  it('adds a participant next to the other declarations', () => {
    const out = edit(SEQ, (d) => {
      d.nodes.push({ id: 'Cache', label: 'Redis', type: 'database', shape: 'box', x: 0, y: 0 });
      d.edges.push({ id: 'e-c', source: 'Svc', target: 'Cache', label: 'get', style: 'solid' });
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('participant Cache as "Redis"')).toBeLessThan(lines.indexOf('Note over Client,Svc: upload flow'));
    expect(out).toContain('Svc->>Cache: get');
  });

  it('removes a participant and every message that involves it', () => {
    const out = edit(SEQ, (d) => {
      d.nodes = d.nodes.filter((n) => n.id !== 'Kafka');
    })!;
    expect(out).not.toContain('Kafka');
    expect(out).toContain('Client->>Svc: POST /pins');
  });

  it('changes arrow style only when style changed', () => {
    const out = edit(SEQ, (d) => {
      d.edges.find((e) => e.label === 'POST /pins')!.style = 'dashed';
    })!;
    expect(out).toContain('Client-->>Svc: POST /pins');
    expect(out).toContain('Svc-->>Client: done');
  });

  it('turns an actor into a participant', () => {
    const out = edit(SEQ, (d) => {
      d.nodes.find((n) => n.id === 'Client')!.type = 'service';
    })!;
    expect(out).toContain('participant Client as "Client"');
  });
});
