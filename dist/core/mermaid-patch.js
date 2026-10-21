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
 * Supported: flowcharts, sequence diagrams and ER diagrams.
 *
 * `patchMermaid` returns null whenever a safe patch can't be produced (or the
 * patched result doesn't re-parse to the edited graph); callers decide whether
 * to fall back (flowchart/sequence: regenerate; ER: keep the original source).
 */
const SHAPE_PATTERN = '(?:\\(\\[[^\\]]+\\]\\)|\\[\\([^\\)]+\\)\\]|\\[\\[[^\\]]+\\]\\]|\\{\\{[^\\}]+\\}\\}|\\(\\([^\\)]+\\)\\)|\\[[^\\]]+\\]|\\([^\\)]+\\))';
const ID = '[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*';
const FLOW_SKIP = /^(flowchart|graph|subgraph)/i;
/** Thrown when an edit needs to touch a line holding several `;`-separated statements. */
class NeedSplit {
    lines;
    constructor(lines) {
        this.lines = lines;
    }
}
function detectEol(raw) {
    return raw.includes('\r\n') ? '\r\n' : '\n';
}
function leadingIndent(line) {
    return line.match(/^\s*/)?.[0] ?? '';
}
function escapeLabel(label) {
    return label.replace(/\n/g, '\\n').replace(/"/g, "'");
}
function detectKind(raw) {
    const first = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith('%%'))
        ?.toLowerCase() ?? '';
    if (first.startsWith('sequencediagram'))
        return 'sequence';
    if (first.startsWith('erdiagram'))
        return 'er';
    return 'flow';
}
function renderFlowNode(node) {
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
function flowArrow(style) {
    if (style === 'dashed')
        return '-.->';
    if (style === 'thick')
        return '==>';
    return '-->';
}
function renderFlowEdge(e) {
    const label = e.label && e.label.trim().length > 0 ? `|${e.label.trim()}|` : '';
    return `${e.source} ${flowArrow(e.style)}${label} ${e.target}`;
}
function edgeKey(e) {
    return `${e.source}|${e.target}|${e.label ?? ''}|${e.style ?? 'solid'}`;
}
/**
 * Re-order retained items by permuting their text between the original "slots"
 * (line positions). Structure lines (blocks, subgraphs, notes...) never move.
 */
function permuteSlots(beforeIds, afterIds, lineOf, lines, replacements) {
    if (beforeIds.length !== afterIds.length)
        return false;
    if (beforeIds.every((id, i) => id === afterIds[i]))
        return false;
    const slots = beforeIds.map((id) => lineOf.get(id));
    const texts = afterIds.map((id) => {
        const l = lineOf.get(id);
        const r = replacements.get(l);
        return (r && r.length === 1 ? r[0] : lines[l]).trim();
    });
    afterIds.forEach((id, k) => {
        replacements.set(slots[k], [`${leadingIndent(lines[slots[k]])}${texts[k]}`]);
    });
    afterIds.forEach((id, k) => lineOf.set(id, slots[k]));
    return true;
}
// ---------------------------------------------------------------------------
// Flowcharts
// ---------------------------------------------------------------------------
/** Split a line into `;`-separated statements, ignoring `;` inside quotes/brackets. */
function splitStatements(trimmed) {
    const out = [];
    let cur = '';
    let quote = false;
    let depth = 0;
    for (const ch of trimmed) {
        if (ch === '"')
            quote = !quote;
        else if (!quote && '[({'.includes(ch))
            depth++;
        else if (!quote && '])}'.includes(ch))
            depth = Math.max(0, depth - 1);
        if (ch === ';' && !quote && depth === 0) {
            if (cur.trim())
                out.push(cur.trim());
            cur = '';
        }
        else {
            cur += ch;
        }
    }
    if (cur.trim())
        out.push(cur.trim());
    return out;
}
/** Mirrors the parser's scan so locations line up with parsed edge order. */
function scanFlowchart(lines) {
    const infos = [];
    const edgeLocs = [];
    const sgOf = [];
    const sgEnd = new Map();
    const defLine = new Map();
    const mentionLine = new Map();
    const stack = [];
    lines.forEach((raw, idx) => {
        const trimmed = raw.trim();
        const info = {
            indent: leadingIndent(raw),
            trimmed,
            skip: false,
            defs: [],
            edgeCount: 0,
            endpoints: [],
        };
        infos.push(info);
        sgOf.push(stack.length ? stack[stack.length - 1] : -1);
        if (trimmed.length === 0 || trimmed.startsWith('%%')) {
            info.skip = true;
            return;
        }
        if (/^subgraph\b/i.test(trimmed)) {
            stack.push(idx);
            info.skip = true;
            return;
        }
        if (trimmed.toLowerCase() === 'end') {
            const start = stack.pop();
            if (start !== undefined)
                sgEnd.set(start, idx);
            info.skip = true;
            return;
        }
        if (FLOW_SKIP.test(trimmed)) {
            info.skip = true;
            return;
        }
        const defRe = new RegExp(`(${ID})\\s*(${SHAPE_PATTERN})`, 'g');
        let m;
        while ((m = defRe.exec(trimmed)) !== null) {
            info.defs.push({ id: m[1], start: m.index, end: m.index + m[0].length });
            if (!defLine.has(m[1]))
                defLine.set(m[1], idx);
        }
        const forEdges = trimmed.replace(new RegExp(`(${ID})\\s*${SHAPE_PATTERN}`, 'g'), '$1');
        const edgeRe = new RegExp(`(${ID})\\s*(-->|-.->|==>|->)\\s*(?:\\|([^|]+)\\|)?\\s*(${ID})`, 'g');
        let em;
        while ((em = edgeRe.exec(forEdges)) !== null) {
            edgeLocs.push(idx);
            info.edgeCount++;
            info.endpoints.push(em[1], em[4]);
            for (const id of [em[1], em[4]])
                if (!mentionLine.has(id))
                    mentionLine.set(id, idx);
        }
    });
    return { infos, edgeLocs, sgOf, sgEnd, defLine, mentionLine };
}
function shapeDelims(shape) {
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
function patchFlowchartLines(lines, eol, before, after) {
    const scan = scanFlowchart(lines);
    const { infos, edgeLocs } = scan;
    if (edgeLocs.length !== before.edges.length)
        return null;
    const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
    const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
    const afterEdges = new Map(after.edges.map((e) => [e.id, e]));
    const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
    const removedNodes = new Set(before.nodes.filter((n) => !afterNodes.has(n.id)).map((n) => n.id));
    // line index -> replacement lines (empty array = delete)
    const replacements = new Map();
    const handledNodes = new Set();
    const insertAfter = new Map();
    const insertBefore = new Map();
    const lineOfEdge = new Map(); // retained before-edge id -> line index
    const defaultIndent = infos.find((i) => !i.skip && i.indent.length > 0)?.indent ?? '    ';
    // 0. Lines holding several statements that need surgery must be split first.
    const needSplit = new Set();
    for (let i = 0; i < before.edges.length; i++) {
        const be = before.edges[i];
        const line = edgeLocs[i];
        const ae = afterEdges.get(be.id);
        const gone = !ae || removedNodes.has(be.source) || removedNodes.has(be.target);
        const changed = !gone && edgeKey(be) !== edgeKey(ae);
        if ((gone || changed) && infos[line].edgeCount !== 1)
            needSplit.add(line);
    }
    if (needSplit.size > 0)
        throw new NeedSplit([...needSplit]);
    // 1. Existing edges: removed / modified / untouched
    for (let i = 0; i < before.edges.length; i++) {
        const be = before.edges[i];
        const line = edgeLocs[i];
        const info = infos[line];
        const ae = afterEdges.get(be.id);
        const gone = !ae || removedNodes.has(be.source) || removedNodes.has(be.target);
        const changed = !gone && edgeKey(be) !== edgeKey(ae);
        if (!gone && !changed) {
            lineOfEdge.set(be.id, line);
            continue;
        }
        const out = [];
        // keep inline node definitions that are still alive
        for (const d of info.defs) {
            const n = afterNodes.get(d.id);
            if (n && !handledNodes.has(n.id)) {
                out.push(`${info.indent}${renderFlowNode(n)}`);
                handledNodes.add(n.id);
            }
        }
        if (changed) {
            out.push(`${info.indent}${renderFlowEdge(ae)}`);
            lineOfEdge.set(be.id, line);
        }
        replacements.set(line, out);
    }
    // 2. Removed nodes: drop def-only lines
    infos.forEach((info, idx) => {
        if (info.skip || replacements.has(idx) || info.defs.length === 0 || info.edgeCount > 0)
            return;
        const removedHere = info.defs.filter((d) => removedNodes.has(d.id));
        if (removedHere.length === 0)
            return;
        if (removedHere.length === info.defs.length) {
            replacements.set(idx, []);
        }
        else {
            const out = [];
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
    const appendedNodeLines = [];
    for (const an of after.nodes) {
        const bn = beforeNodes.get(an.id);
        if (!bn || handledNodes.has(an.id))
            continue;
        if (bn.label === an.label && bn.shape === an.shape)
            continue;
        const defLineIdx = infos.findIndex((info, idx) => !info.skip && !replacements.has(idx) && info.defs.some((d) => d.id === an.id));
        if (defLineIdx === -1) {
            appendedNodeLines.push(`${defaultIndent}${renderFlowNode(an)}`);
            continue;
        }
        const info = infos[defLineIdx];
        const def = info.defs.find((d) => d.id === an.id);
        const [open, close] = shapeDelims(an.shape);
        const replacement = `${an.id}${open}"${escapeLabel(an.label)}"${close}`;
        const newTrimmed = info.trimmed.slice(0, def.start) + replacement + info.trimmed.slice(def.end);
        replacements.set(defLineIdx, [`${info.indent}${newTrimmed}`]);
    }
    // 4. Added nodes: join the subgraph of the node they connect to, else go at the end
    for (const an of after.nodes) {
        if (beforeNodes.has(an.id))
            continue;
        const text = renderFlowNode(an);
        let placed = false;
        for (const e of after.edges) {
            if (beforeEdgeIds.has(e.id))
                continue;
            const other = e.source === an.id ? e.target : e.target === an.id ? e.source : null;
            if (!other || !beforeNodes.has(other))
                continue;
            const anchorLine = scan.defLine.get(other) ?? scan.mentionLine.get(other);
            if (anchorLine === undefined)
                continue;
            const sg = scan.sgOf[anchorLine];
            const end = sg >= 0 ? scan.sgEnd.get(sg) : undefined;
            if (sg >= 0 && end !== undefined) {
                const arr = insertBefore.get(end) ?? [];
                arr.push(`${infos[anchorLine].indent}${text}`);
                insertBefore.set(end, arr);
                placed = true;
                break;
            }
        }
        if (!placed)
            appendedNodeLines.push(`${defaultIndent}${text}`);
    }
    // 5. Re-order retained edges (only when every involved line is a clean single-edge line)
    const retainedBefore = before.edges.filter((e) => lineOfEdge.has(e.id)).map((e) => e.id);
    const retainedSet = new Set(retainedBefore);
    const retainedAfter = after.edges.filter((e) => retainedSet.has(e.id)).map((e) => e.id);
    let reordered = false;
    const clean = retainedBefore.every((id) => {
        const info = infos[lineOfEdge.get(id)];
        return info.edgeCount === 1 && info.defs.length === 0;
    });
    if (clean)
        reordered = permuteSlots(retainedBefore, retainedAfter, lineOfEdge, lines, replacements);
    // 6. Added edges: place right after the closest preceding retained edge
    const appendedEdgeLines = [];
    let lastRetainedLine = -1;
    for (const ae of after.edges) {
        if (beforeEdgeIds.has(ae.id)) {
            const l = lineOfEdge.get(ae.id);
            if (l !== undefined)
                lastRetainedLine = l;
            continue;
        }
        const text = `${defaultIndent}${renderFlowEdge(ae)}`;
        if (lastRetainedLine >= 0) {
            const arr = insertAfter.get(lastRetainedLine) ?? [];
            arr.push(text);
            insertAfter.set(lastRetainedLine, arr);
        }
        else {
            appendedEdgeLines.push(text);
        }
    }
    // Assemble
    const out = [];
    lines.forEach((line, idx) => {
        if (insertBefore.has(idx))
            out.push(...insertBefore.get(idx));
        if (replacements.has(idx))
            out.push(...replacements.get(idx));
        else
            out.push(line);
        if (insertAfter.has(idx))
            out.push(...insertAfter.get(idx));
    });
    while (out.length > 0 && out[out.length - 1].trim() === '')
        out.pop();
    out.push(...appendedNodeLines, ...appendedEdgeLines);
    return { text: out.join(eol), reordered };
}
function patchFlowchart(raw, before, after) {
    const eol = detectEol(raw);
    let lines = raw.split(/\r?\n/);
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return patchFlowchartLines(lines, eol, before, after);
        }
        catch (e) {
            if (!(e instanceof NeedSplit))
                throw e;
            if (attempt === 1)
                return null;
            // Split only the lines that need surgery into one statement per line.
            const targets = new Set(e.lines);
            const next = [];
            lines.forEach((l, i) => {
                if (!targets.has(i))
                    return next.push(l);
                const parts = splitStatements(l.trim());
                if (parts.length <= 1)
                    return next.push(l);
                const indent = leadingIndent(l);
                parts.forEach((p) => next.push(`${indent}${p}`));
            });
            lines = next;
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// Sequence diagrams
// ---------------------------------------------------------------------------
const PARTICIPANT_RE = new RegExp(`^(participant|actor)\\s+(${ID})(?:\\s+as\\s+([^\\n]+))?`, 'i');
const MESSAGE_RE = new RegExp(`^(${ID})\\s*(-->>|->>|-->|->)\\s*(${ID})\\s*:\\s*([^\\n]+)`);
function seqLabel(label) {
    return label.replace(/\n/g, '<br/>');
}
function seqArrow(style) {
    return style === 'dashed' ? '-->>' : '->>';
}
function patchSequence(raw, before, after) {
    const eol = detectEol(raw);
    const lines = raw.split(/\r?\n/);
    const participantLine = new Map();
    const messageLines = [];
    let headerLine = -1;
    let lastParticipantLine = -1;
    lines.forEach((raw, idx) => {
        const t = raw.trim();
        if (t.length === 0 || t.startsWith('%%'))
            return;
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
        if (MESSAGE_RE.test(t))
            messageLines.push(idx);
    });
    if (messageLines.length !== before.edges.length || headerLine === -1)
        return null;
    const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
    const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
    const afterEdges = new Map(after.edges.map((e) => [e.id, e]));
    const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
    const removedNodes = new Set(before.nodes.filter((n) => !afterNodes.has(n.id)).map((n) => n.id));
    const replacements = new Map();
    const insertAfter = new Map();
    const lineOfEdge = new Map();
    const defaultIndent = lines.map((l, i) => (i === headerLine ? '' : leadingIndent(l))).find((s) => s.length > 0) ?? '    ';
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
        const same = be.source === ae.source &&
            be.target === ae.target &&
            (be.label ?? '') === (ae.label ?? '') &&
            (be.style ?? 'solid') === (ae.style ?? 'solid');
        if (same)
            continue;
        const t = lines[idx].trim();
        const mm = t.match(MESSAGE_RE);
        const arrow = (be.style ?? 'solid') === (ae.style ?? 'solid') ? mm[2] : seqArrow(ae.style);
        replacements.set(idx, [
            `${leadingIndent(lines[idx])}${ae.source}${arrow}${ae.target}: ${seqLabel(ae.label ?? '')}`,
        ]);
    }
    // Participants: removed
    for (const id of removedNodes) {
        const idx = participantLine.get(id);
        if (idx !== undefined)
            replacements.set(idx, []);
    }
    // Participants: relabel / retype
    for (const an of after.nodes) {
        const bn = beforeNodes.get(an.id);
        if (!bn)
            continue;
        const wasActor = bn.type === 'actor';
        const isActor = an.type === 'actor';
        if (bn.label === an.label && wasActor === isActor)
            continue;
        const idx = participantLine.get(an.id);
        const keyword = isActor ? 'actor' : 'participant';
        const text = `${keyword} ${an.id} as "${escapeLabel(an.label)}"`;
        if (idx !== undefined) {
            replacements.set(idx, [`${leadingIndent(lines[idx])}${text}`]);
        }
        else {
            const anchor = lastParticipantLine >= 0 ? lastParticipantLine : headerLine;
            const arr = insertAfter.get(anchor) ?? [];
            arr.push(`${defaultIndent}${text}`);
            insertAfter.set(anchor, arr);
        }
    }
    // Participants: re-order the declared ones (column order) by permuting declaration lines
    const declared = [...participantLine.entries()]
        .filter(([id]) => afterNodes.has(id))
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id);
    const declaredSet = new Set(declared);
    const declaredAfter = after.nodes.map((n) => n.id).filter((id) => declaredSet.has(id));
    permuteSlots(declared, declaredAfter, participantLine, lines, replacements);
    // Participants: added (declared right after the last existing declaration)
    for (const an of after.nodes) {
        if (beforeNodes.has(an.id))
            continue;
        const keyword = an.type === 'actor' ? 'actor' : 'participant';
        const anchor = lastParticipantLine >= 0 ? lastParticipantLine : headerLine;
        const arr = insertAfter.get(anchor) ?? [];
        arr.push(`${defaultIndent}${keyword} ${an.id} as "${escapeLabel(an.label)}"`);
        insertAfter.set(anchor, arr);
    }
    // Messages: re-order retained messages by permuting their text between message slots
    const retainedBefore = before.edges.filter((e) => lineOfEdge.has(e.id)).map((e) => e.id);
    const retainedSet = new Set(retainedBefore);
    const retainedAfter = after.edges.filter((e) => retainedSet.has(e.id)).map((e) => e.id);
    const reordered = permuteSlots(retainedBefore, retainedAfter, lineOfEdge, lines, replacements);
    // Messages: added, placed right after the closest preceding retained message
    const appended = [];
    let lastRetained = -1;
    for (const ae of after.edges) {
        if (beforeEdgeIds.has(ae.id)) {
            const l = lineOfEdge.get(ae.id);
            if (l !== undefined)
                lastRetained = l;
            continue;
        }
        const text = `${defaultIndent}${ae.source}${seqArrow(ae.style)}${ae.target}: ${seqLabel(ae.label ?? '')}`;
        if (lastRetained >= 0) {
            const arr = insertAfter.get(lastRetained) ?? [];
            arr.push(text);
            insertAfter.set(lastRetained, arr);
        }
        else {
            appended.push(text);
        }
    }
    const out = [];
    lines.forEach((line, idx) => {
        if (replacements.has(idx))
            out.push(...replacements.get(idx));
        else
            out.push(line);
        if (insertAfter.has(idx))
            out.push(...insertAfter.get(idx));
    });
    while (out.length > 0 && out[out.length - 1].trim() === '')
        out.pop();
    out.push(...appended);
    return { text: out.join(eol), reordered };
}
// ---------------------------------------------------------------------------
// ER diagrams
// ---------------------------------------------------------------------------
const ER_REL_RE = /^([a-zA-Z0-9_-]+)\s+([|o}{]+(?:--|\.\.)[|o}{]+)\s+([a-zA-Z0-9_-]+)\s*:\s*(.+)$/;
const ER_ENTITY_RE = /^([a-zA-Z0-9_-]+)\s*\{$/;
const ER_ID_RE = /^[a-zA-Z0-9_-]+$/;
const ER_LEFT = { '1': '||', '0..1': '|o', '1..N': '}|', '0..N': '}o' };
const ER_RIGHT = { '1': '||', '0..1': 'o|', '1..N': '|{', '0..N': 'o{' };
const ER_CARD_SUFFIX = /\s*\(([^()]*?)\s*→\s*([^()]*?)\)\s*$/;
function stripErCardinality(label) {
    return (label ?? '').replace(ER_CARD_SUFFIX, '').trim();
}
function patchEr(raw, before, after) {
    const eol = detectEol(raw);
    const lines = raw.split(/\r?\n/);
    // Scan exactly like the parser: entity blocks are skipped, relationships collected.
    const rels = [];
    const blocks = new Map();
    let headerLine = -1;
    let active = null;
    lines.forEach((l, idx) => {
        const t = l.trim();
        if (t.length === 0 || t.startsWith('%%'))
            return;
        if (headerLine === -1 && /^erdiagram/i.test(t)) {
            headerLine = idx;
            return;
        }
        if (active) {
            if (t === '}') {
                blocks.set(active.id, { start: active.start, end: idx });
                active = null;
            }
            return;
        }
        const em = t.match(ER_ENTITY_RE);
        if (em) {
            active = { id: em[1], start: idx };
            return;
        }
        const rm = t.match(ER_REL_RE);
        if (rm)
            rels.push({ line: idx, source: rm[1], symbol: rm[2], target: rm[3], rawLabel: rm[4].trim() });
    });
    if (headerLine === -1 || rels.length !== before.edges.length)
        return null;
    const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
    const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
    const afterEdges = new Map(after.edges.map((e) => [e.id, e]));
    const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
    const removedNodes = new Set(before.nodes.filter((n) => !afterNodes.has(n.id)).map((n) => n.id));
    // Entity renames: only plain entities (no attribute summary) with a valid, free identifier.
    const idMap = new Map();
    const taken = new Set(after.nodes.map((n) => n.id));
    for (const an of after.nodes) {
        const bn = beforeNodes.get(an.id);
        if (!bn || bn.label === an.label)
            continue;
        if (bn.label.includes('\n') || an.label.includes('\n'))
            continue; // attribute summaries are display-only
        const newId = an.label.trim();
        if (ER_ID_RE.test(newId) && newId !== an.id && !taken.has(newId)) {
            idMap.set(an.id, newId);
            taken.add(newId);
        }
    }
    const rn = (id) => idMap.get(id) ?? id;
    const replacements = new Map();
    const insertAfter = new Map();
    const lineOfEdge = new Map();
    const defaultIndent = lines.find((l, i) => i !== headerLine && l.trim() && /^\s+/.test(l))?.match(/^\s*/)?.[0] ?? '    ';
    const symbolFor = (e, origSymbol) => {
        const sep = e.style === 'dashed' ? '..' : '--';
        const m = (e.label ?? '').match(ER_CARD_SUFFIX);
        if (m && ER_LEFT[m[1].trim()] && ER_RIGHT[m[2].trim()]) {
            return { symbol: `${ER_LEFT[m[1].trim()]}${sep}${ER_RIGHT[m[2].trim()]}`, raw: stripErCardinality(e.label) };
        }
        const base = origSymbol ?? '||--o{';
        const [l, r] = base.split(/--|\.\./);
        return { symbol: `${l}${sep}${r}`, raw: stripErCardinality(e.label) || (e.label ?? '').trim() };
    };
    const quote = (label, origQuoted) => origQuoted || /\s/.test(label) || label === '' ? `"${(label || 'relates to').replace(/"/g, "'")}"` : label;
    // Relationships
    for (let i = 0; i < before.edges.length; i++) {
        const be = before.edges[i];
        const rel = rels[i];
        const ae = afterEdges.get(be.id);
        const gone = !ae || removedNodes.has(be.source) || removedNodes.has(be.target);
        if (gone) {
            replacements.set(rel.line, []);
            continue;
        }
        lineOfEdge.set(be.id, rel.line);
        const renamed = idMap.has(rel.source) || idMap.has(rel.target);
        const labelChanged = stripErCardinality(be.label) !== stripErCardinality(ae.label);
        const cardChanged = (be.label ?? '') !== (ae.label ?? '') && !labelChanged;
        const styleChanged = (be.style ?? 'solid') !== (ae.style ?? 'solid');
        if (!renamed && !labelChanged && !cardChanged && !styleChanged)
            continue;
        const { symbol, raw: rawLabel } = symbolFor(ae, rel.symbol);
        const useLabel = labelChanged ? rawLabel : rel.rawLabel.replace(/^"|"$/g, '');
        const origQuoted = rel.rawLabel.startsWith('"');
        const text = `${leadingIndent(lines[rel.line])}${rn(ae.source)} ${symbol} ${rn(ae.target)} : ${labelChanged ? quote(useLabel, origQuoted) : rel.rawLabel}`;
        replacements.set(rel.line, [text]);
    }
    // Entity blocks: removed / renamed headers
    for (const id of removedNodes) {
        const b = blocks.get(id);
        if (b)
            for (let l = b.start; l <= b.end; l++)
                replacements.set(l, []);
    }
    for (const [oldId, newId] of idMap) {
        const b = blocks.get(oldId);
        if (b) {
            const l = lines[b.start];
            replacements.set(b.start, [`${leadingIndent(l)}${newId} {`]);
        }
    }
    // Re-order retained relationships
    const retainedBefore = before.edges.filter((e) => lineOfEdge.has(e.id)).map((e) => e.id);
    const retainedSet = new Set(retainedBefore);
    const retainedAfter = after.edges.filter((e) => retainedSet.has(e.id)).map((e) => e.id);
    permuteSlots(retainedBefore, retainedAfter, lineOfEdge, lines, replacements);
    // Added relationships
    const appended = [];
    let lastRetained = -1;
    for (const ae of after.edges) {
        if (beforeEdgeIds.has(ae.id)) {
            const l = lineOfEdge.get(ae.id);
            if (l !== undefined)
                lastRetained = l;
            continue;
        }
        const { symbol, raw: rawLabel } = symbolFor(ae, null);
        const text = `${defaultIndent}${rn(ae.source)} ${symbol} ${rn(ae.target)} : ${quote(rawLabel, true)}`;
        if (lastRetained >= 0) {
            const arr = insertAfter.get(lastRetained) ?? [];
            arr.push(text);
            insertAfter.set(lastRetained, arr);
        }
        else {
            appended.push(text);
        }
    }
    // Added entities (empty attribute block so the entity exists on its own)
    for (const an of after.nodes) {
        if (beforeNodes.has(an.id))
            continue;
        const id = an.label.trim();
        if (!ER_ID_RE.test(id))
            return null;
        appended.unshift(`${defaultIndent}${id} {`, `${defaultIndent}}`);
    }
    const out = [];
    lines.forEach((line, idx) => {
        if (replacements.has(idx))
            out.push(...replacements.get(idx));
        else
            out.push(line);
        if (insertAfter.has(idx))
            out.push(...insertAfter.get(idx));
    });
    while (out.length > 0 && out[out.length - 1].trim() === '')
        out.pop();
    out.push(...appended);
    let patched = out.join(eol);
    // Entities that only existed through a removed relationship must stay alive.
    {
        const present = new Set(parseMermaid(patched, after.id).nodes.map((n) => n.id));
        const missing = after.nodes.map((n) => rn(n.id)).filter((id) => !present.has(id));
        if (missing.length > 0) {
            patched += missing.map((id) => `${eol}${defaultIndent}${id} {${eol}${defaultIndent}}`).join('');
        }
    }
    // Self-check against the edited graph (ER labels carry a computed cardinality suffix).
    try {
        const re = parseMermaid(patched, after.id);
        const expectedNodes = new Set(after.nodes.map((n) => rn(n.id)));
        if (re.nodes.length !== expectedNodes.size || !re.nodes.every((n) => expectedNodes.has(n.id)))
            return null;
        const key = (s, t, label, style) => `${s}|${t}|${cleanMermaidLabel(stripErCardinality(label))}|${style ?? 'solid'}`;
        const expected = after.edges.map((e) => key(rn(e.source), rn(e.target), e.label, e.style));
        const actual = re.edges.map((e) => key(e.source, e.target, e.label, e.style));
        const counts = new Map();
        expected.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
        for (const k of actual) {
            const c = counts.get(k) ?? 0;
            if (c === 0)
                return null;
            counts.set(k, c - 1);
        }
        if (actual.length !== expected.length)
            return null;
    }
    catch {
        return null;
    }
    return patched;
}
// ---------------------------------------------------------------------------
/** Compare two diagrams on what is persisted in Mermaid (ids, labels, edges). */
function sameGraph(a, b) {
    if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length)
        return false;
    const nodeLabels = new Map(b.nodes.map((n) => [n.id, cleanMermaidLabel(n.label)]));
    for (const n of a.nodes) {
        if (nodeLabels.get(n.id) !== cleanMermaidLabel(n.label))
            return false;
    }
    const bk = new Map();
    for (const e of b.edges)
        bk.set(edgeKey(e), (bk.get(edgeKey(e)) ?? 0) + 1);
    for (const e of a.edges) {
        const k = edgeKey(e);
        const c = bk.get(k) ?? 0;
        if (c === 0)
            return false;
        bk.set(k, c - 1);
    }
    return true;
}
/** True when nothing persisted in Mermaid differs (ids, labels, shapes, edges incl. style), order included. */
export function diagramsEqual(a, b) {
    if (!sameGraph(a, b))
        return false;
    const shapes = new Map(b.nodes.map((n) => [n.id, n.shape ?? 'box']));
    if (!a.nodes.every((n) => shapes.get(n.id) === (n.shape ?? 'box')))
        return false;
    // Re-ordering edges / participants is an edit too.
    const sameSeq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
    if (!sameSeq(a.edges.map((e) => e.id), b.edges.map((e) => e.id)))
        return false;
    if (a.type === 'sequence' && !sameSeq(a.nodes.map((n) => n.id), b.nodes.map((n) => n.id)))
        return false;
    return true;
}
/**
 * Apply the before -> after changes to the original Mermaid source.
 * Returns null when it can't be done faithfully.
 */
export function patchMermaid(raw, before, editedAfter) {
    // An edge can't outlive its endpoints: ignore dangling edges left by node removal.
    const known = new Set(editedAfter.nodes.map((n) => n.id));
    const after = {
        ...editedAfter,
        edges: editedAfter.edges.filter((e) => known.has(e.source) && known.has(e.target)),
    };
    const kind = detectKind(raw);
    try {
        if (kind === 'er')
            return patchEr(raw, before, after);
        const result = kind === 'sequence' ? patchSequence(raw, before, after) : patchFlowchart(raw, before, after);
        if (result === null)
            return null;
        // Nodes that only existed through a removed edge/message must stay alive.
        const present = new Set(parseMermaid(result.text, after.id).nodes.map((n) => n.id));
        const missing = after.nodes.filter((n) => !present.has(n.id));
        if (missing.length > 0) {
            const eol = detectEol(raw);
            const ls = result.text.split(eol);
            if (kind === 'sequence') {
                const h = ls.findIndex((l) => /^\s*sequencediagram/i.test(l));
                const indent = ls.map(leadingIndent).find((s, i) => i !== h && s.length > 0) ?? '    ';
                const decl = missing.map((n) => `${indent}${n.type === 'actor' ? 'actor' : 'participant'} ${n.id} as "${escapeLabel(n.label)}"`);
                ls.splice(h + 1, 0, ...decl);
            }
            else {
                const indent = ls.map(leadingIndent).find((s) => s.length > 0) ?? '    ';
                missing.forEach((n) => ls.push(`${indent}${renderFlowNode(n)}`));
            }
            result.text = ls.join(eol);
        }
        // Self-check: the patched source must re-parse to exactly the edited graph.
        const reparsed = parseMermaid(result.text, after.id);
        if (reparsed.type !== after.type || !sameGraph(reparsed, after))
            return null;
        if (result.reordered) {
            // Retained edges must appear in the order the user arranged them.
            const beforeIds = new Set(before.edges.map((e) => e.id));
            const wanted = after.edges.filter((e) => beforeIds.has(e.id)).map(edgeKey);
            const added = new Map();
            after.edges.filter((e) => !beforeIds.has(e.id)).forEach((e) => added.set(edgeKey(e), (added.get(edgeKey(e)) ?? 0) + 1));
            const got = [];
            for (const e of reparsed.edges) {
                const k = edgeKey(e);
                const c = added.get(k) ?? 0;
                if (c > 0)
                    added.set(k, c - 1);
                else
                    got.push(k);
            }
            if (got.length !== wanted.length || got.some((k, i) => k !== wanted[i]))
                return null;
        }
        return result.text;
    }
    catch {
        return null;
    }
}
