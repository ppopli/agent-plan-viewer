import { DiagramEdge, DiagramNode, ParsedDiagram } from './types.js';
import { cleanMermaidLabel, parseMermaid } from './mermaid-graph-bridge.js';

/**
 * Source-preserving Mermaid editing.
 *
 * Regenerating a diagram from the viewer's graph model is lossy: it drops
 * subgraphs, alt/else/opt blocks, notes, styling, comments, custom ordering...
 * Instead we compute what the user changed (before -> after) and patch only
 * those lines of the ORIGINAL source. Everything we don't understand is left
 * byte-for-byte intact.
 *
 * `patchMermaid` returns null whenever a safe patch can't be produced (or the
 * patched result doesn't re-parse to the edited graph); callers then fall back
 * to full regeneration.
 */

const SHAPE_PATTERN =
  '(?:\\(\\[[^\\]]+\\]\\)|\\[\\([^\\)]+\\)\\]|\\[\\[[^\\]]+\\]\\]|\\{\\{[^\\}]+\\}\\}|\\(\\([^\\)]+\\)\\)|\\[[^\\]]+\\]|\\([^\\)]+\\))';
const ID = '[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*';

const FLOW_SKIP = /^(flowchart|graph|subgraph)/i;

interface FlowDef {
  id: string;
  start: number;
  end: number;
}

interface FlowEdgeLoc {
  line: number;
  k: number; // index of the edge within its line
}

interface FlowLineInfo {
  indent: string;
  trimmed: string;
  skip: boolean;
  defs: FlowDef[];
  edgeCount: number;
}

function detectEol(raw: string): string {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

function leadingIndent(line: string): string {
  return line.match(/^\s*/)?.[0] ?? '';
}

function escapeLabel(label: string): string {
  return label.replace(/\n/g, '\\n').replace(/"/g, "'");
}

function renderFlowNode(node: DiagramNode): string {
  const l = `"${escapeLabel(node.label)}"`;
  switch (node.shape) {
    case 'cylinder':
      return `${node.id}[(${l})]`;
    case 'subroutine':
      return `${node.id}[[${l}]]`;
    case 'circle':
      return `${node.id}{{${l}}}`;
    case 'rounded':
      return `${node.id}(${l})`;
    default:
      return `${node.id}[${l}]`;
  }
}

function flowArrow(style?: DiagramEdge['style']): string {
  if (style === 'dashed') return '-.->';
  if (style === 'thick') return '==>';
  return '-->';
}

function renderFlowEdge(e: DiagramEdge): string {
  const label = e.label && e.label.trim().length > 0 ? `|${e.label.trim()}|` : '';
  return `${e.source} ${flowArrow(e.style)}${label} ${e.target}`;
}

function edgeKey(e: DiagramEdge): string {
  return `${e.source}|${e.target}|${e.label ?? ''}|${e.style ?? 'solid'}`;
}

/** Mirrors the parser's scan so locations line up with parsed edge order. */
function scanFlowchart(lines: string[]): { infos: FlowLineInfo[]; edgeLocs: FlowEdgeLoc[] } {
  const infos: FlowLineInfo[] = [];
  const edgeLocs: FlowEdgeLoc[] = [];

  lines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    const info: FlowLineInfo = {
      indent: leadingIndent(raw),
      trimmed,
      skip: false,
      defs: [],
      edgeCount: 0,
    };
    infos.push(info);

    if (trimmed.length === 0 || trimmed.startsWith('%%')) {
      info.skip = true;
      return;
    }
    if (FLOW_SKIP.test(trimmed) || trimmed.toLowerCase() === 'end') {
      info.skip = true;
      return;
    }

    const defRe = new RegExp(`(${ID})\\s*(${SHAPE_PATTERN})`, 'g');
    let m: RegExpExecArray | null;
    while ((m = defRe.exec(trimmed)) !== null) {
      info.defs.push({ id: m[1], start: m.index, end: m.index + m[0].length });
    }

    const forEdges = trimmed.replace(new RegExp(`(${ID})\\s*${SHAPE_PATTERN}`, 'g'), '$1');
    const edgeRe = new RegExp(`(${ID})\\s*(-->|-.->|==>|->)\\s*(?:\\|([^|]+)\\|)?\\s*(${ID})`, 'g');
    let em: RegExpExecArray | null;
    while ((em = edgeRe.exec(forEdges)) !== null) {
      edgeLocs.push({ line: idx, k: info.edgeCount });
      info.edgeCount++;
    }
  });

  return { infos, edgeLocs };
}

function shapeDelims(shape: DiagramNode['shape']): [string, string] {
  switch (shape) {
    case 'cylinder':
      return ['[(', ')]'];
    case 'subroutine':
      return ['[[', ']]'];
    case 'circle':
      return ['{{', '}}'];
    case 'rounded':
      return ['(', ')'];
    default:
      return ['[', ']'];
  }
}

function patchFlowchart(raw: string, before: ParsedDiagram, after: ParsedDiagram): string | null {
  const eol = detectEol(raw);
  const lines = raw.split(/\r?\n/);
  const { infos, edgeLocs } = scanFlowchart(lines);
  if (edgeLocs.length !== before.edges.length) return null;

  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterEdges = new Map(after.edges.map((e) => [e.id, e]));
  const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
  const removedNodes = new Set(before.nodes.filter((n) => !afterNodes.has(n.id)).map((n) => n.id));

  // line index -> replacement lines (empty array = delete)
  const replacements = new Map<number, string[]>();
  const handledNodes = new Set<string>();
  const insertAfter = new Map<number, string[]>();
  const lineOfEdge = new Map<string, number>(); // retained before-edge id -> line index

  const defaultIndent =
    infos.find((i) => !i.skip && i.indent.length > 0)?.indent ?? '    ';

  // 1. Existing edges: removed / modified / untouched
  for (let i = 0; i < before.edges.length; i++) {
    const be = before.edges[i];
    const loc = edgeLocs[i];
    const info = infos[loc.line];
    const ae = afterEdges.get(be.id);
    const gone = !ae || removedNodes.has(be.source) || removedNodes.has(be.target);
    const changed = !gone && edgeKey(be) !== edgeKey(ae!);

    if (!gone && !changed) {
      lineOfEdge.set(be.id, loc.line);
      continue;
    }
    if (info.edgeCount !== 1) return null; // can't surgically edit multi-edge lines

    const out: string[] = [];
    // keep inline node definitions that are still alive
    for (const d of info.defs) {
      const n = afterNodes.get(d.id);
      if (n && !handledNodes.has(n.id)) {
        out.push(`${info.indent}${renderFlowNode(n)}`);
        handledNodes.add(n.id);
      }
    }
    if (changed) {
      out.push(`${info.indent}${renderFlowEdge(ae!)}`);
      lineOfEdge.set(be.id, loc.line);
    }
    replacements.set(loc.line, out);
  }

  // 2. Removed nodes: drop def-only lines
  infos.forEach((info, idx) => {
    if (info.skip || replacements.has(idx) || info.defs.length === 0 || info.edgeCount > 0) return;
    const removedHere = info.defs.filter((d) => removedNodes.has(d.id));
    if (removedHere.length === 0) return;
    if (removedHere.length === info.defs.length) {
      replacements.set(idx, []);
    } else {
      // mixed line: rewrite keeping survivors
      const out: string[] = [];
      for (const d of info.defs) {
        const n = afterNodes.get(d.id);
        if (n) {
          out.push(`${info.indent}${renderFlowNode(n)}`);
          handledNodes.add(n.id);
        }
      }
      replacements.set(idx, out);
    }
  });

  // 3. Relabel / reshape existing nodes in place
  const appendedNodeLines: string[] = [];
  for (const an of after.nodes) {
    const bn = beforeNodes.get(an.id);
    if (!bn || handledNodes.has(an.id)) continue;
    if (bn.label === an.label && bn.shape === an.shape) continue;

    const defLineIdx = infos.findIndex(
      (info, idx) => !info.skip && !replacements.has(idx) && info.defs.some((d) => d.id === an.id)
    );
    if (defLineIdx === -1) {
      // implicit node (declared only through edges): add an explicit definition
      appendedNodeLines.push(`${defaultIndent}${renderFlowNode(an)}`);
      continue;
    }
    const info = infos[defLineIdx];
    const def = info.defs.find((d) => d.id === an.id)!;
    const [open, close] = shapeDelims(an.shape);
    const replacement = `${an.id}${open}"${escapeLabel(an.label)}"${close}`;
    const newTrimmed = info.trimmed.slice(0, def.start) + replacement + info.trimmed.slice(def.end);
    replacements.set(defLineIdx, [`${info.indent}${newTrimmed}`]);
  }

  // 4. Added nodes
  for (const an of after.nodes) {
    if (!beforeNodes.has(an.id)) appendedNodeLines.push(`${defaultIndent}${renderFlowNode(an)}`);
  }

  // 5. Added edges: place right after the closest preceding retained edge
  const appendedEdgeLines: string[] = [];
  let lastRetainedLine = -1;
  for (const ae of after.edges) {
    if (beforeEdgeIds.has(ae.id)) {
      const l = lineOfEdge.get(ae.id);
      if (l !== undefined) lastRetainedLine = l;
      continue;
    }
    const text = `${defaultIndent}${renderFlowEdge(ae)}`;
    if (lastRetainedLine >= 0) {
      const arr = insertAfter.get(lastRetainedLine) ?? [];
      arr.push(text);
      insertAfter.set(lastRetainedLine, arr);
    } else {
      appendedEdgeLines.push(text);
    }
  }

  // Assemble
  const out: string[] = [];
  lines.forEach((line, idx) => {
    if (replacements.has(idx)) out.push(...replacements.get(idx)!);
    else out.push(line);
    if (insertAfter.has(idx)) out.push(...insertAfter.get(idx)!);
  });
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  out.push(...appendedNodeLines, ...appendedEdgeLines);
  return out.join(eol);
}

// ---------------------------------------------------------------------------
// Sequence diagrams
// ---------------------------------------------------------------------------

const PARTICIPANT_RE = new RegExp(`^(participant|actor)\\s+(${ID})(?:\\s+as\\s+([^\\n]+))?`, 'i');
const MESSAGE_RE = new RegExp(`^(${ID})\\s*(-->>|->>|-->|->)\\s*(${ID})\\s*:\\s*([^\\n]+)`);

function seqLabel(label: string): string {
  return label.replace(/\n/g, '<br/>');
}

function seqArrow(style?: DiagramEdge['style']): string {
  return style === 'dashed' ? '-->>' : '->>';
}

function patchSequence(raw: string, before: ParsedDiagram, after: ParsedDiagram): string | null {
  const eol = detectEol(raw);
  const lines = raw.split(/\r?\n/);

  const participantLine = new Map<string, number>();
  const messageLines: number[] = [];
  let headerLine = -1;
  let lastParticipantLine = -1;

  lines.forEach((raw, idx) => {
    const t = raw.trim();
    if (t.length === 0 || t.startsWith('%%')) return;
    if (headerLine === -1 && /^sequencediagram/i.test(t)) {
      headerLine = idx;
      return;
    }
    const pm = t.match(PARTICIPANT_RE);
    if (pm) {
      participantLine.set(pm[2], idx);
      lastParticipantLine = idx;
      return;
    }
    if (MESSAGE_RE.test(t)) messageLines.push(idx);
  });

  if (messageLines.length !== before.edges.length || headerLine === -1) return null;

  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterEdges = new Map(after.edges.map((e) => [e.id, e]));
  const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
  const removedNodes = new Set(before.nodes.filter((n) => !afterNodes.has(n.id)).map((n) => n.id));

  const replacements = new Map<number, string[]>();
  const insertAfter = new Map<number, string[]>();
  const lineOfEdge = new Map<string, number>();

  const defaultIndent =
    lines.map((l, i) => (i === headerLine ? '' : leadingIndent(l))).find((s) => s.length > 0) ?? '    ';

  // Messages
  for (let i = 0; i < before.edges.length; i++) {
    const be = before.edges[i];
    const idx = messageLines[i];
    const ae = afterEdges.get(be.id);
    const gone = !ae || removedNodes.has(be.source) || removedNodes.has(be.target);
    if (gone) {
      replacements.set(idx, []);
      continue;
    }
    lineOfEdge.set(be.id, idx);
    const same =
      be.source === ae!.source &&
      be.target === ae!.target &&
      (be.label ?? '') === (ae!.label ?? '') &&
      (be.style ?? 'solid') === (ae!.style ?? 'solid');
    if (same) continue;

    const t = lines[idx].trim();
    const mm = t.match(MESSAGE_RE)!;
    const arrow = (be.style ?? 'solid') === (ae!.style ?? 'solid') ? mm[2] : seqArrow(ae!.style);
    replacements.set(idx, [
      `${leadingIndent(lines[idx])}${ae!.source}${arrow}${ae!.target}: ${seqLabel(ae!.label ?? '')}`,
    ]);
  }

  // Participants: removed
  for (const id of removedNodes) {
    const idx = participantLine.get(id);
    if (idx !== undefined) replacements.set(idx, []);
  }

  // Participants: relabel / retype
  for (const an of after.nodes) {
    const bn = beforeNodes.get(an.id);
    if (!bn) continue;
    const wasActor = bn.type === 'actor';
    const isActor = an.type === 'actor';
    if (bn.label === an.label && wasActor === isActor) continue;
    const idx = participantLine.get(an.id);
    const keyword = isActor ? 'actor' : 'participant';
    const text = `${keyword} ${an.id} as "${escapeLabel(an.label)}"`;
    if (idx !== undefined) {
      replacements.set(idx, [`${leadingIndent(lines[idx])}${text}`]);
    } else {
      const anchor = lastParticipantLine >= 0 ? lastParticipantLine : headerLine;
      const arr = insertAfter.get(anchor) ?? [];
      arr.push(`${defaultIndent}${text}`);
      insertAfter.set(anchor, arr);
    }
  }

  // Participants: added (declared right after the last existing declaration)
  for (const an of after.nodes) {
    if (beforeNodes.has(an.id)) continue;
    const keyword = an.type === 'actor' ? 'actor' : 'participant';
    const anchor = lastParticipantLine >= 0 ? lastParticipantLine : headerLine;
    const arr = insertAfter.get(anchor) ?? [];
    arr.push(`${defaultIndent}${keyword} ${an.id} as "${escapeLabel(an.label)}"`);
    insertAfter.set(anchor, arr);
  }

  // Messages: added, placed right after the closest preceding retained message
  const appended: string[] = [];
  let lastRetained = -1;
  for (const ae of after.edges) {
    if (beforeEdgeIds.has(ae.id)) {
      const l = lineOfEdge.get(ae.id);
      if (l !== undefined) lastRetained = l;
      continue;
    }
    const text = `${defaultIndent}${ae.source}${seqArrow(ae.style)}${ae.target}: ${seqLabel(ae.label ?? '')}`;
    if (lastRetained >= 0) {
      const arr = insertAfter.get(lastRetained) ?? [];
      arr.push(text);
      insertAfter.set(lastRetained, arr);
    } else {
      appended.push(text);
    }
  }

  const out: string[] = [];
  lines.forEach((line, idx) => {
    if (replacements.has(idx)) out.push(...replacements.get(idx)!);
    else out.push(line);
    if (insertAfter.has(idx)) out.push(...insertAfter.get(idx)!);
  });
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  out.push(...appended);
  return out.join(eol);
}

// ---------------------------------------------------------------------------

/** Compare two diagrams on what is persisted in Mermaid (ids, labels, edges). */
function sameGraph(a: ParsedDiagram, b: ParsedDiagram): boolean {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false;
  const nodeLabels = new Map(b.nodes.map((n) => [n.id, cleanMermaidLabel(n.label)]));
  for (const n of a.nodes) {
    if (nodeLabels.get(n.id) !== cleanMermaidLabel(n.label)) return false;
  }
  const bk = new Map<string, number>();
  for (const e of b.edges) bk.set(edgeKey(e), (bk.get(edgeKey(e)) ?? 0) + 1);
  for (const e of a.edges) {
    const k = edgeKey(e);
    const c = bk.get(k) ?? 0;
    if (c === 0) return false;
    bk.set(k, c - 1);
  }
  return true;
}

/** True when nothing persisted in Mermaid differs (ids, labels, shapes, edges incl. style). */
export function diagramsEqual(a: ParsedDiagram, b: ParsedDiagram): boolean {
  if (!sameGraph(a, b)) return false;
  const shapes = new Map(b.nodes.map((n) => [n.id, n.shape ?? 'box']));
  return a.nodes.every((n) => shapes.get(n.id) === (n.shape ?? 'box'));
}

/**
 * Apply the before -> after changes to the original Mermaid source.
 * Returns null when it can't be done faithfully.
 */
export function patchMermaid(raw: string, before: ParsedDiagram, editedAfter: ParsedDiagram): string | null {
  // An edge can't outlive its endpoints: ignore dangling edges left by node removal.
  const known = new Set(editedAfter.nodes.map((n) => n.id));
  const after: ParsedDiagram = {
    ...editedAfter,
    edges: editedAfter.edges.filter((e) => known.has(e.source) && known.has(e.target)),
  };
  let patched: string | null;
  try {
    patched = after.type === 'sequence' ? patchSequence(raw, before, after) : patchFlowchart(raw, before, after);
  } catch {
    return null;
  }
  if (patched === null) return null;

  // Self-check: the patched source must re-parse to exactly the edited graph.
  try {
    const reparsed = parseMermaid(patched, after.id);
    if (reparsed.type !== after.type || !sameGraph(reparsed, after)) return null;
  } catch {
    return null;
  }
  return patched;
}
