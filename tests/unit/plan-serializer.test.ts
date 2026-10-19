import { describe, it, expect } from 'vitest';
import { parsePlanMarkdown } from '../../src/core/plan-parser';
import { serializePlanMarkdown } from '../../src/core/plan-serializer';
import { parseMermaid } from '../../src/core/mermaid-graph-bridge';

const doc = `# Plan

## Data Model

\`\`\`mermaid
erDiagram
    USER ||--o{ PIN : creates
\`\`\`

## Flow

\`\`\`mermaid
sequenceDiagram
    participant A as "A"
    participant B as "B"
    A->>B: call
    alt fails
        B->>A: error
    else passes
        B->>A: ok
    end
\`\`\`
`;

describe('serializePlanMarkdown mermaid preservation', () => {
  it('keeps unsupported diagram types verbatim', () => {
    const out = serializePlanMarkdown(parsePlanMarkdown(doc));
    expect(out).toContain('erDiagram\n    USER ||--o{ PIN : creates');
  });

  it('keeps unedited sequence diagrams (incl. alt/else) verbatim', () => {
    const out = serializePlanMarkdown(parsePlanMarkdown(doc));
    expect(out).toContain('alt fails');
    expect(out).toContain('else passes');
  });
});

// ---------------------------------------------------------------------------
// Edits made in the viewer must patch the source, not regenerate it
// ---------------------------------------------------------------------------

const multiDoc = `# Design

Intro paragraph with **bold** text.

## Architecture

\`\`\`mermaid
flowchart TD
    %% keep me
    GW["Gateway"]
    subgraph Core["Core"]
        Svc["Service"]
        DB[("Store")]
    end
    GW --> Svc
    Svc --> DB
    style GW fill:#eef
\`\`\`

## Schema

\`\`\`mermaid
erDiagram
    USER ||--o{ PIN : creates
\`\`\`

## Flow

\`\`\`mermaid
sequenceDiagram
    participant A as "A"
    participant B as "B"
    A->>B: go
    alt bad
        B->>A: fail
    else good
        B->>A: ok
    end
\`\`\`

## Tasks
- [ ] first
- [x] second
`;

function reserialize(mutate: (s: ReturnType<typeof parsePlanMarkdown>) => void, md = multiDoc): string {
  const state = parsePlanMarkdown(md);
  mutate(state);
  return serializePlanMarkdown(state);
}

describe('serializePlanMarkdown: edited diagrams', () => {
  it('is a no-op when nothing changed', () => {
    expect(reserialize(() => {}).trim()).toBe(multiDoc.trim());
  });

  it('edits the flowchart in place and leaves other diagrams byte-identical', () => {
    const out = reserialize((s) => {
      s.diagrams[0].nodes.find((n) => n.id === 'Svc')!.label = 'Pin Service';
      s.diagrams[0].nodes.push({ id: 'Q', label: 'Queue', type: 'queue', shape: 'subroutine', x: 0, y: 0 });
      s.diagrams[0].edges.push({ id: 'e-q', source: 'Svc', target: 'Q', style: 'solid' });
    });
    expect(out).toContain('subgraph Core["Core"]');
    expect(out).toContain('%% keep me');
    expect(out).toContain('style GW fill:#eef');
    expect(out).toContain('Svc["Pin Service"]');
    expect(out).toContain('Q[["Queue"]]');
    expect(out).toContain('Svc --> Q');
    // untouched diagrams + prose
    expect(out).toContain('erDiagram\n    USER ||--o{ PIN : creates');
    expect(out).toContain('alt bad');
    expect(out).toContain('else good');
    expect(out).toContain('Intro paragraph with **bold** text.');
  });

  it('edits the sequence diagram in place and leaves the ER diagram alone', () => {
    const out = reserialize((s) => {
      s.diagrams[2].edges.find((e) => e.label === 'ok')!.label = 'accepted';
    });
    expect(out).toContain('B->>A: accepted');
    expect(out).toContain('alt bad');
    expect(out).toContain('subgraph Core["Core"]');
    expect(out).toContain('erDiagram');
  });

  it('persists a style-only edge change', () => {
    const out = reserialize((s) => {
      s.diagrams[0].edges.find((e) => e.source === 'Svc' && e.target === 'DB')!.style = 'dashed';
    });
    expect(out).toContain('Svc -.-> DB');
    expect(out).toContain('subgraph Core');
  });

  it('persists a shape-only node change', () => {
    const out = reserialize((s) => {
      s.diagrams[0].nodes.find((n) => n.id === 'GW')!.shape = 'rounded';
    });
    expect(out).toContain('GW("Gateway")');
  });

  it('removes a node and its edges cleanly', () => {
    const out = reserialize((s) => {
      s.diagrams[0].nodes = s.diagrams[0].nodes.filter((n) => n.id !== 'DB');
      s.diagrams[0].edges = s.diagrams[0].edges.filter((e) => e.target !== 'DB');
    });
    expect(out).not.toContain('Store');
    expect(out).toContain('subgraph Core');
    expect(out).toContain('GW --> Svc');
  });

  it('falls back to regeneration when the source can not be patched safely, still valid mermaid', () => {
    const md = `# T

\`\`\`mermaid
flowchart TD
    A --> B; B --> C
\`\`\`
`;
    const out = reserialize((s) => {
      s.diagrams[0].edges = s.diagrams[0].edges.slice(0, 1);
    }, md);
    const block = out.match(/```mermaid\n([\s\S]*?)```/)![1];
    const reparsed = parseMermaid(block, 'x');
    expect(reparsed.edges).toHaveLength(1);
    expect(reparsed.edges[0].source).toBe('A');
  });

  it('is stable: re-serializing the output without changes yields the same text', () => {
    const once = reserialize((s) => {
      s.diagrams[0].nodes.find((n) => n.id === 'Svc')!.label = 'Renamed';
    });
    const twice = serializePlanMarkdown(parsePlanMarkdown(once));
    expect(twice.trim()).toBe(once.trim());
  });

  it('keeps tasks, headings and non-mermaid code blocks untouched', () => {
    const out = reserialize((s) => {
      s.diagrams[0].nodes.find((n) => n.id === 'GW')!.label = 'Edge';
    });
    expect(out).toContain('- [ ] first');
    expect(out).toContain('- [x] second');
    expect(out).toContain('## Schema');
  });

  it('preserves classDiagram and other unsupported types', () => {
    const md = `# T

\`\`\`mermaid
classDiagram
    class A {
      +int x
    }
\`\`\`

\`\`\`mermaid
flowchart TD
    X --> Y
\`\`\`
`;
    const out = reserialize((s) => {
      s.diagrams[1].nodes.find((n) => n.id === 'X')!.label = 'Ex';
    }, md);
    expect(out).toContain('classDiagram\n    class A {\n      +int x\n    }');
    expect(out).toContain('X["Ex"]');
  });
});
