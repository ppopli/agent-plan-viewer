import { describe, it, expect } from 'vitest';
import { parsePlanMarkdown } from '../../src/core/plan-parser';
import { serializePlanMarkdown } from '../../src/core/plan-serializer';

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
