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

  it('patches multi-edge lines by splitting just that line (no fallback needed)', () => {
    const raw = `flowchart TD
    A --> B; B --> C`;
    const before = parseMermaid(raw, 'd');
    expect(before.edges).toHaveLength(2);
    const out = edit(raw, (d) => {
      d.edges = d.edges.slice(0, 1);
    });
    expect(out).not.toBeNull();
    const re = parseMermaid(out!, 'd');
    expect(re.edges).toHaveLength(1);
    expect(re.nodes.map((n) => n.id)).toContain('C'); // C still exists as a node
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

// ---------------------------------------------------------------------------
// Former limitations
// ---------------------------------------------------------------------------

describe('patchMermaid: new nodes join the right subgraph', () => {
  it('places a node inside the subgraph of the node it connects to', () => {
    const out = edit(FLOW, (d) => {
      d.nodes.push({ id: 'Notif', label: 'Notifier', type: 'service', shape: 'box', x: 0, y: 0 });
      d.edges.push({ id: 'e-n', source: 'Auth', target: 'Notif', style: 'solid' });
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    const sg = lines.indexOf('subgraph Backend["Backend"]');
    const end = lines.indexOf('end');
    const at = lines.indexOf('Notif["Notifier"]');
    expect(at).toBeGreaterThan(sg);
    expect(at).toBeLessThan(end);
    // indented like its siblings
    expect(out.split('\n').find((l) => l.includes('Notif["Notifier"]'))).toMatch(/^ {8}Notif/);
  });

  it('keeps a node outside the subgraph when it connects to an outside node', () => {
    const out = edit(FLOW, (d) => {
      d.nodes.push({ id: 'Cdn', label: 'CDN', type: 'service', shape: 'box', x: 0, y: 0 });
      d.edges.push({ id: 'e-c', source: 'Client', target: 'Cdn', style: 'solid' });
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('Cdn["CDN"]')).toBeGreaterThan(lines.indexOf('end'));
  });

  it('appends unconnected nodes at the end', () => {
    const out = edit(FLOW, (d) => {
      d.nodes.push({ id: 'Solo', label: 'Solo', type: 'service', shape: 'box', x: 0, y: 0 });
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('Solo["Solo"]')).toBeGreaterThan(lines.indexOf('end'));
  });
});

describe('patchMermaid: re-ordering is saved', () => {
  it('re-orders flowchart edges', () => {
    const out = edit(FLOW, (d) => {
      const i = d.edges.findIndex((e) => e.source === 'GW' && e.target === 'Auth');
      const j = d.edges.findIndex((e) => e.source === 'GW' && e.target === 'Pin');
      [d.edges[i], d.edges[j]] = [d.edges[j], d.edges[i]];
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('GW -->|read| Pin')).toBeLessThan(lines.indexOf('GW --> Auth'));
    expect(out).toContain('subgraph Backend["Backend"]');
    expect(out).toContain('style GW fill:#f9f,stroke:#333');
  });

  it('re-orders sequence messages without moving alt/else structure', () => {
    const out = edit(SEQ, (d) => {
      const i = d.edges.findIndex((e) => e.label === 'POST /pins');
      const j = d.edges.findIndex((e) => e.label === 'pin.created');
      [d.edges[i], d.edges[j]] = [d.edges[j], d.edges[i]];
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('Svc->>Kafka: pin.created')).toBeLessThan(lines.indexOf('Client->>Svc: POST /pins'));
    expect(lines.indexOf('alt moderation fails')).toBeGreaterThan(lines.indexOf('Client->>Svc: POST /pins'));
    expect(out).toContain('else passes');
    expect(out).toContain('Note over Client,Svc: upload flow');
  });

  it('re-orders participants (column order)', () => {
    const out = edit(SEQ, (d) => {
      const i = d.nodes.findIndex((n) => n.id === 'Svc');
      const j = d.nodes.findIndex((n) => n.id === 'Kafka');
      [d.nodes[i], d.nodes[j]] = [d.nodes[j], d.nodes[i]];
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('participant Kafka as "Kafka"')).toBeLessThan(lines.indexOf('participant Svc as "Svc"'));
    const reparsed = parseMermaid(out, 'd');
    expect(reparsed.nodes.map((n) => n.id).slice(0, 3)).toEqual(['Client', 'Kafka', 'Svc']);
  });

  it('diagramsEqual treats a reorder as a change', () => {
    const a = parseMermaid(FLOW, 'd');
    const b = clone(a);
    [b.edges[0], b.edges[1]] = [b.edges[1], b.edges[0]];
    expect(diagramsEqual(a, b)).toBe(false);
  });

  it('does not mangle diagrams whose edges share lines with definitions when re-ordered', () => {
    const raw = `flowchart TD
    A["Alpha"] --> B["Beta"]
    B --> C["Gamma"]
    C --> A`;
    const out = edit(raw, (d) => {
      d.edges.reverse();
    });
    // either patched faithfully or cleanly refused, never corrupt
    if (out !== null) {
      const re = parseMermaid(out, 'd');
      expect(re.nodes.find((n) => n.id === 'A')?.label).toBe('Alpha');
      expect(re.edges).toHaveLength(3);
    }
  });
});

describe('patchMermaid: multi-statement lines', () => {
  it('removes one edge from `A --> B; B --> C` without regenerating the diagram', () => {
    const raw = `flowchart TD
    %% keep
    subgraph G["Group"]
        A["a"]
    end
    A --> B; B --> C
    style A fill:#fff`;
    const out = edit(raw, (d) => {
      d.edges = d.edges.filter((e) => !(e.source === 'B' && e.target === 'C'));
    })!;
    expect(out).not.toBeNull();
    expect(out).toContain('subgraph G["Group"]');
    expect(out).toContain('%% keep');
    expect(out).toContain('style A fill:#fff');
    expect(out).toContain('A --> B');
    expect(out).not.toContain('B --> C');
  });

  it('relabels an edge on a multi-statement line', () => {
    const raw = `flowchart TD
    A --> B; B --> C`;
    const out = edit(raw, (d) => {
      d.edges.find((e) => e.source === 'B')!.label = 'next';
    })!;
    const re = parseMermaid(out, 'd');
    expect(re.edges.find((e) => e.source === 'B')?.label).toBe('next');
    expect(re.edges).toHaveLength(2);
  });

  it('leaves untouched multi-statement lines byte-identical', () => {
    const raw = `flowchart TD
    A --> B; B --> C
    C --> D`;
    const out = edit(raw, (d) => {
      d.edges.find((e) => e.source === 'C' && e.target === 'D')!.label = 'x';
    })!;
    expect(out).toContain('A --> B; B --> C');
  });
});

describe('patchMermaid: ER diagrams', () => {
  const ER = `erDiagram
    USER ||--o{ BOARD : owns
    USER ||--o{ PIN : "creates"
    BOARD ||--o{ BOARD_PIN : contains
    PIN {
        int id
        string title
    }
    %% trailing comment`;

  it('is a no-op without changes', () => {
    expect(edit(ER, () => {})?.trim()).toBe(ER.trim());
  });

  it('removes a relationship and keeps entity blocks and comments', () => {
    const out = edit(ER, (d) => {
      d.edges = d.edges.filter((e) => e.target !== 'BOARD_PIN');
    })!;
    expect(out).not.toContain('BOARD ||--o{ BOARD_PIN');
    // the entity itself still exists, so it stays declared
    expect(parseMermaid(out, 'd').nodes.map((n) => n.id)).toContain('BOARD_PIN');
    expect(out).toContain('PIN {');
    expect(out).toContain('int id');
    expect(out).toContain('%% trailing comment');
  });

  it('adds a relationship with default cardinality', () => {
    const out = edit(ER, (d) => {
      d.edges.push({ id: 'e-new', source: 'PIN', target: 'BOARD', label: 'saved to', style: 'solid' });
    })!;
    expect(out).toContain('PIN ||--o{ BOARD : "saved to"');
    expect(parseMermaid(out, 'd').edges).toHaveLength(4);
  });

  it('adds a relationship with explicit cardinality in the label', () => {
    const out = edit(ER, (d) => {
      d.edges.push({ id: 'e-n', source: 'PIN', target: 'USER', label: 'liked by (0..N → 1)', style: 'solid' });
    })!;
    expect(out).toContain('PIN }o--|| USER : "liked by"');
  });

  it('changes a relationship label but keeps its cardinality and original quoting', () => {
    const out = edit(ER, (d) => {
      const e = d.edges.find((x) => x.target === 'BOARD')!;
      e.label = 'has boards (1 → 0..N)'.replace(/ \(.*\)/, '') + ' (1 → 0..N)';
    })!;
    expect(out).toContain('USER ||--o{ BOARD : "has boards"');
  });

  it('toggles identifying/non-identifying with edge style', () => {
    const out = edit(ER, (d) => {
      d.edges.find((x) => x.target === 'BOARD')!.style = 'dashed';
    })!;
    expect(out).toContain('USER ||..o{ BOARD : owns');
  });

  it('removes an entity with its attribute block and relationships', () => {
    const out = edit(ER, (d) => {
      d.nodes = d.nodes.filter((n) => n.id !== 'PIN');
    })!;
    expect(out).not.toMatch(/\bPIN\b/);
    expect(out).not.toContain('int id');
    expect(out).toContain('USER ||--o{ BOARD : owns');
  });

  it('adds an entity', () => {
    const out = edit(ER, (d) => {
      d.nodes.push({ id: 'TAG', label: 'TAG', type: 'database', shape: 'cylinder', x: 0, y: 0 });
    })!;
    expect(parseMermaid(out, 'd').nodes.map((n) => n.id)).toContain('TAG');
  });

  it('renames a plain entity everywhere', () => {
    const out = edit(ER, (d) => {
      d.nodes.find((n) => n.id === 'BOARD')!.label = 'COLLECTION';
    })!;
    expect(out).toContain('USER ||--o{ COLLECTION : owns');
    expect(out).toContain('COLLECTION ||--o{ BOARD_PIN : contains');
    expect(out).not.toMatch(/\bBOARD\s/);
  });

  it('ignores display-only label edits on entities with attribute summaries', () => {
    const out = edit(ER, (d) => {
      d.nodes.find((n) => n.id === 'PIN')!.label = 'Whatever';
    })!;
    expect(out).toContain('PIN {');
    expect(out).toContain('USER ||--o{ PIN : "creates"');
  });

  it('re-orders relationships', () => {
    const out = edit(ER, (d) => {
      [d.edges[0], d.edges[2]] = [d.edges[2], d.edges[0]];
    })!;
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines.indexOf('BOARD ||--o{ BOARD_PIN : contains')).toBeLessThan(lines.indexOf('USER ||--o{ BOARD : owns'));
  });
});
