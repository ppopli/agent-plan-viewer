import { DiagramNode, DiagramEdge, FlowStep, FlowScenario, ParsedDiagram, NodeType } from './types.js';

export function inferNodeType(id: string, label: string, shape?: string): NodeType {
  const text = `${id} ${label}`.toLowerCase();
  if (shape === 'cylinder' || text.includes('db') || text.includes('database') || text.includes('postgres') || text.includes('mysql') || text.includes('redis') || text.includes('mongo') || text.includes('storage')) {
    return 'database';
  }
  if (shape === 'subroutine' || text.includes('queue') || text.includes('kafka') || text.includes('rabbit') || text.includes('sqs') || text.includes('event') || text.includes('pubsub') || text.includes('broker')) {
    return 'queue';
  }
  if (shape === 'rounded' || text.includes('gateway') || text.includes('ingress') || text.includes('proxy') || text.includes('router') || text.includes('api gateway') || text.includes('nginx')) {
    return 'gateway';
  }
  if (shape === 'circle' || text.includes('user') || text.includes('client') || text.includes('browser') || text.includes('actor') || text.includes('customer') || text.includes('frontend') || text.includes('mobile')) {
    return 'actor';
  }
  return 'service';
}

export function buildDefaultScenarios(nodes: DiagramNode[], edges: DiagramEdge[], steps: FlowStep[]): FlowScenario[] {
  if (steps.length === 0) {
    return [];
  }

  const touchedAll = Array.from(new Set(steps.flatMap(s => [s.source, s.target])));

  const successScenario: FlowScenario = {
    id: 'scen-success',
    name: 'Happy Path: Standard Request Flow',
    type: 'success',
    description: 'Complete end-to-end execution where all components succeed.',
    steps: steps.map(s => ({ ...s, status: 'success' })),
    touchedComponents: touchedAll,
  };

  // Failure Scenario 1: Downstream Service/DB Failure
  const failSteps: FlowStep[] = [];
  const midPoint = Math.floor(steps.length / 2);
  for (let i = 0; i < steps.length; i++) {
    if (i < midPoint) {
      failSteps.push({ ...steps[i], status: 'success' });
    } else if (i === midPoint) {
      failSteps.push({
        ...steps[i],
        label: `FAILURE: ${steps[i].label} (500 Error / Timeout)`,
        response: '{"status": 500, "error": "Connection Timeout / Resource Locked"}',
        status: 'failure',
      });
      break; // Stops here
    }
  }

  const downstreamFailScenario: FlowScenario = {
    id: 'scen-downstream-fail',
    name: 'Failure: Downstream Timeout & Rollback',
    type: 'failure',
    description: 'Simulates connection timeout at downstream layer and circuit breaker trigger.',
    steps: failSteps,
    touchedComponents: Array.from(new Set(failSteps.flatMap(s => [s.source, s.target]))),
  };

  // Failure Scenario 2: Gateway Auth / Validation Failure
  const authFailSteps: FlowStep[] = steps.slice(0, 1).map(s => ({
    ...s,
    label: 'REJECTED: 401 Unauthorized / Token Expired at Gateway',
    response: '{"status": 401, "error": "Invalid Token"}',
    status: 'failure' as const,
  }));

  const authFailScenario: FlowScenario = {
    id: 'scen-auth-fail',
    name: 'Failure: Unauthorized / Invalid Token',
    type: 'failure',
    description: 'Request rejected at entry gateway before reaching internal microservices.',
    steps: authFailSteps,
    touchedComponents: Array.from(new Set(authFailSteps.flatMap(s => [s.source, s.target]))),
  };

  // Scenario 3: Edge Case Cache Spike & Direct DB Fallback
  const cacheFallbackSteps: FlowStep[] = steps.map((s, idx) => {
    if (idx === 1) {
      return {
        ...s,
        label: 'CACHE MISS: Redis Cache Spike -> Fallback to PostgreSQL Primary',
        response: '{"status": 200, "cacheHit": false, "readFrom": "replica_01"}',
        status: 'success' as const,
      };
    }
    return { ...s, status: 'success' as const };
  });

  const cacheFallbackScenario: FlowScenario = {
    id: 'scen-cache-spike',
    name: 'Edge Case: Cache Spike & DB Fallback',
    type: 'edge_case',
    description: 'Cache miss occurs during traffic spike; fallback query routes directly to database read-replica.',
    steps: cacheFallbackSteps,
    touchedComponents: touchedAll,
  };

  // Scenario 4: Queue Backpressure & DLQ
  const queueFailSteps: FlowStep[] = steps.map((s, idx) => {
    if (idx === steps.length - 1) {
      return {
        ...s,
        label: 'BACKPRESSURE: Queue Ingestion Rate Limit Exceeded -> Sent to Dead-Letter Queue (DLQ)',
        response: '{"status": 429, "error": "Queue Full", "routedTo": "orders.dlq"}',
        status: 'failure' as const,
      };
    }
    return { ...s, status: 'success' as const };
  });

  const queueFailScenario: FlowScenario = {
    id: 'scen-queue-backpressure',
    name: 'Failure: Queue Backpressure & DLQ',
    type: 'failure',
    description: 'Event broker reaches capacity threshold, emits 429 rate limit and dispatches to DLQ.',
    steps: queueFailSteps,
    touchedComponents: touchedAll,
  };

  return [
    successScenario,
    downstreamFailScenario,
    authFailScenario,
    cacheFallbackScenario,
    queueFailScenario,
  ];
}

/**
 * Parses Mermaid code into nodes, edges, flow steps, and multiple scenarios
 */
export function parseMermaid(raw: string, diagramId = 'diag-1'): ParsedDiagram {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('%%'));
  if (lines.length === 0) {
    return { id: diagramId, type: 'flowchart', rawMermaid: raw, nodes: [], edges: [], flowSteps: [], scenarios: [] };
  }

  const firstLine = lines[0].toLowerCase();
  if (firstLine.startsWith('sequencediagram')) {
    return parseSequenceDiagram(raw, lines, diagramId);
  }

  return parseFlowchart(raw, lines, diagramId);
}

function cleanMermaidLabel(rawLabel: string): string {
  return rawLabel
    .trim()
    .replace(/^\["|"\]$/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .trim();
}

function parseFlowchart(raw: string, lines: string[], diagramId: string): ParsedDiagram {
  const nodeMap = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const flowSteps: FlowStep[] = [];

  // Order matters: match multi-character delimiters ([...]), [(...)], [[...]], {{...}}, ((...)) before [...] and (...)
  const shapePattern = '(?:\\(\\[[^\\]]+\\]\\)|\\[\\([^\\)]+\\)\\]|\\[\\[[^\\]]+\\]\\]|\\{\\{[^\\}]+\\}\\}|\\(\\([^\\)]+\\)\\)|\\[[^\\]]+\\]|\\([^\\)]+\\))';
  const nodeDefRegex = new RegExp(`([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\\s*(${shapePattern})`, 'g');
  const edgeRegex = /([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\s*(-->|-.->|==>|->)\s*(?:\|([^|]+)\|)?\s*([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)/g;

  let currentY = 80;
  let currentX = 80;

  for (const line of lines) {
    if (
      line.toLowerCase().startsWith('flowchart') ||
      line.toLowerCase().startsWith('graph') ||
      line.toLowerCase().startsWith('subgraph') ||
      line.toLowerCase() === 'end'
    ) {
      continue;
    }

    let nodeMatch;
    while ((nodeMatch = nodeDefRegex.exec(line)) !== null) {
      const id = nodeMatch[1];
      const shapeStr = nodeMatch[2];
      let label = id;
      let shape: DiagramNode['shape'] = 'box';

      if (shapeStr.startsWith('[(') && shapeStr.endsWith(')]')) {
        label = shapeStr.slice(2, -2).trim();
        shape = 'cylinder';
      } else if (shapeStr.startsWith('([') && shapeStr.endsWith('])')) {
        label = shapeStr.slice(2, -2).trim();
        shape = 'rounded';
      } else if (shapeStr.startsWith('[[') && shapeStr.endsWith(']]')) {
        label = shapeStr.slice(2, -2).trim();
        shape = 'subroutine';
      } else if (shapeStr.startsWith('{{') && shapeStr.endsWith('}}')) {
        label = shapeStr.slice(2, -2).trim();
        shape = 'circle';
      } else if (shapeStr.startsWith('((') && shapeStr.endsWith('))')) {
        label = shapeStr.slice(2, -2).trim();
        shape = 'circle';
      } else if (shapeStr.startsWith('(') && shapeStr.endsWith(')')) {
        label = shapeStr.slice(1, -1).trim();
        shape = 'rounded';
      } else if (shapeStr.startsWith('[') && shapeStr.endsWith(']')) {
        label = shapeStr.slice(1, -1).trim();
        shape = 'box';
      }

      label = cleanMermaidLabel(label);

      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          label: label || id,
          type: inferNodeType(id, label, shape),
          shape,
          x: currentX,
          y: currentY,
        });
        currentX += 280;
        if (currentX > 900) {
          currentX = 80;
          currentY += 160;
        }
      } else {
        // Update label/shape if node was previously created implicitly from an edge
        const existing = nodeMap.get(id)!;
        if (existing.label === existing.id && label) {
          existing.label = label;
          existing.shape = shape;
          existing.type = inferNodeType(id, label, shape);
        }
      }
    }

    // Strip inline node shape definitions so edgeRegex matches `A(["Label"]) -->|...| B["Label"]` cleanly
    const lineForEdges = line.replace(new RegExp(`([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\\s*${shapePattern}`, 'g'), '$1');

    let edgeMatch;
    while ((edgeMatch = edgeRegex.exec(lineForEdges)) !== null) {
      const source = edgeMatch[1];
      const arrow = edgeMatch[2];
      const rawEdgeLabel = edgeMatch[3]?.trim();
      const edgeLabel = rawEdgeLabel ? cleanMermaidLabel(rawEdgeLabel).replace(/\n/g, ' · ') : undefined;
      const target = edgeMatch[4];

      if (!nodeMap.has(source)) {
        nodeMap.set(source, {
          id: source,
          label: source,
          type: inferNodeType(source, source, 'box'),
          shape: 'box',
          x: currentX,
          y: currentY,
        });
        currentX += 280;
        if (currentX > 900) { currentX = 80; currentY += 160; }
      }
      if (!nodeMap.has(target)) {
        nodeMap.set(target, {
          id: target,
          label: target,
          type: inferNodeType(target, target, 'box'),
          shape: 'box',
          x: currentX,
          y: currentY,
        });
        currentX += 280;
        if (currentX > 900) { currentX = 80; currentY += 160; }
      }

      const style: DiagramEdge['style'] = arrow.includes('.') ? 'dashed' : arrow.includes('=') ? 'thick' : 'solid';
      const edgeId = `e-${source}-${target}-${edges.length}`;
      edges.push({
        id: edgeId,
        source,
        target,
        label: edgeLabel,
        style,
        animated: style === 'dashed',
      });

      flowSteps.push({
        stepNumber: flowSteps.length + 1,
        source,
        target,
        label: edgeLabel || `Call ${nodeMap.get(target)?.label.replace(/\n/g, ' ') || target}`,
        payload: `{"from": "${source}", "to": "${target}"}`,
        response: `{"status": 200, "ok": true}`,
        status: 'success',
      });
    }
  }

  const nodes = Array.from(nodeMap.values());
  autoLayout(nodes, edges);

  const scenarios = buildDefaultScenarios(nodes, edges, flowSteps);

  return {
    id: diagramId,
    type: 'flowchart',
    rawMermaid: raw,
    nodes,
    edges,
    flowSteps,
    scenarios,
  };
}

function parseSequenceDiagram(raw: string, lines: string[], diagramId: string): ParsedDiagram {
  const nodeMap = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const flowSteps: FlowStep[] = [];

  let currentX = 100;
  const participantRegex = /^(?:participant|actor)\s+([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)(?:\s+as\s+([^\n]+))?/i;
  const messageRegex = /^([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\s*(-->>|->>|-->|->)\s*([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\s*:\s*([^\n]+)/;

  for (const line of lines) {
    const partMatch = line.match(participantRegex);
    if (partMatch) {
      const id = partMatch[1];
      const label = cleanMermaidLabel(partMatch[2] || id);
      const isActor = line.toLowerCase().startsWith('actor');
      nodeMap.set(id, {
        id,
        label,
        type: isActor ? 'actor' : inferNodeType(id, label),
        shape: isActor ? 'circle' : 'box',
        x: currentX,
        y: 120,
      });
      currentX += 280;
      continue;
    }

    const msgMatch = line.match(messageRegex);
    if (msgMatch) {
      const source = msgMatch[1];
      const arrow = msgMatch[2];
      const target = msgMatch[3];
      const label = cleanMermaidLabel(msgMatch[4]);

      if (!nodeMap.has(source)) {
        nodeMap.set(source, {
          id: source,
          label: source,
          type: inferNodeType(source, source),
          shape: 'box',
          x: currentX,
          y: 120,
        });
        currentX += 280;
      }
      if (!nodeMap.has(target)) {
        nodeMap.set(target, {
          id: target,
          label: target,
          type: inferNodeType(target, target),
          shape: 'box',
          x: currentX,
          y: 120,
        });
        currentX += 280;
      }

      const style: DiagramEdge['style'] = arrow.includes('--') ? 'dashed' : 'solid';
      const edgeId = `e-${source}-${target}-${edges.length}`;
      edges.push({
        id: edgeId,
        source,
        target,
        label,
        style,
        animated: true,
      });

      flowSteps.push({
        stepNumber: flowSteps.length + 1,
        source,
        target,
        label,
        payload: `{"request": "${label}"}`,
        response: arrow.includes('--') ? `{"status": "ACK", "response": "${label}"}` : undefined,
        status: 'success',
      });
    }
  }

  const nodes = Array.from(nodeMap.values());
  assignOptimalHandles(nodes, edges);
  const scenarios = buildDefaultScenarios(nodes, edges, flowSteps);

  return {
    id: diagramId,
    type: 'sequence',
    rawMermaid: raw,
    nodes,
    edges,
    flowSteps,
    scenarios,
  };
}

/**
 * Assigns optimal 4-way sourceHandle and targetHandle to each edge based on relative node coordinates
 * so edges exit from the bottom/side toward the target and NEVER loop upward across the source node.
 */
export function assignOptimalHandles(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const nodeById = new Map<string, DiagramNode>();
  nodes.forEach((n) => nodeById.set(n.id, n));

  for (const edge of edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;

    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;

    // Sidecar / observability targets positioned significantly to the right
    if (edge.style === 'dashed' && dx > 250) {
      edge.sourceHandle = 'right-src';
      edge.targetHandle = 'left-tgt';
      continue;
    }

    if (dy >= 50) {
      edge.sourceHandle = 'bottom-src';
      edge.targetHandle = 'top-tgt';
    } else if (dy <= -50) {
      edge.sourceHandle = 'top-src';
      edge.targetHandle = 'bottom-tgt';
    } else if (dx >= 0) {
      edge.sourceHandle = 'right-src';
      edge.targetHandle = 'left-tgt';
    } else {
      edge.sourceHandle = 'left-src';
      edge.targetHandle = 'right-tgt';
    }
  }
}

/**
 * Hierarchical Sugiyama-style Auto-Layout:
 * 1. Separates auxiliary dashed-only sink nodes (e.g. Observability/Monitoring/Logging sinks)
 *    into a clean right-hand sidecar column when present on medium/large graphs.
 * 2. Computes Longest-Path Topological Layering on the primary flow graph so all primary
 *    edges flow strictly downward from layer L to layer > L without backtracking.
 * 3. Orders nodes within each layer using Barycenter parent alignment to eliminate edge crossings.
 * 4. Spaces nodes with generous horizontal (340px) and vertical (195px) margins so boxes never overlap.
 * 5. Assigns optimal 4-way boundary handles (`bottom-src -> top-tgt`, `right-src -> left-tgt`, etc.).
 */
export function autoLayout(nodes: DiagramNode[], edges: DiagramEdge[]) {
  if (nodes.length === 0) return;

  const incomingByNode = new Map<string, DiagramEdge[]>();
  const outgoingByNode = new Map<string, DiagramEdge[]>();
  nodes.forEach((n) => {
    incomingByNode.set(n.id, []);
    outgoingByNode.set(n.id, []);
  });
  edges.forEach((e) => {
    if (incomingByNode.has(e.target) && outgoingByNode.has(e.source) && e.source !== e.target) {
      incomingByNode.get(e.target)!.push(e);
      outgoingByNode.get(e.source)!.push(e);
    }
  });

  // Identify auxiliary dashed-only sink nodes (e.g. Prometheus, Cloud Trace, Cloud Logging)
  // when the graph has > 5 nodes so they sit neatly in a right-hand telemetry column
  const sidecarNodes: DiagramNode[] = [];
  const primaryNodes: DiagramNode[] = [];

  for (const node of nodes) {
    const inc = incomingByNode.get(node.id) || [];
    const out = outgoingByNode.get(node.id) || [];
    const isDashedSink =
      nodes.length > 5 &&
      inc.length > 0 &&
      out.length === 0 &&
      inc.every((e) => e.style === 'dashed');
    if (isDashedSink) {
      sidecarNodes.push(node);
    } else {
      primaryNodes.push(node);
    }
  }

  const primarySet = new Set(primaryNodes.map((n) => n.id));
  const primaryEdges = edges.filter(
    (e) => primarySet.has(e.source) && primarySet.has(e.target) && e.source !== e.target
  );

  // Longest-path layering with cycle protection
  const rank = new Map<string, number>();
  primaryNodes.forEach((n) => rank.set(n.id, 0));

  const maxIterations = primaryNodes.length + 2;
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const edge of primaryEdges) {
      const uRank = rank.get(edge.source) || 0;
      const vRank = rank.get(edge.target) || 0;
      if (vRank < uRank + 1 && uRank + 1 < primaryNodes.length) {
        rank.set(edge.target, uRank + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group primary nodes into layers by rank
  const layerMap = new Map<number, DiagramNode[]>();
  let maxRank = 0;
  for (const node of primaryNodes) {
    const r = rank.get(node.id) || 0;
    if (r > maxRank) maxRank = r;
    if (!layerMap.has(r)) layerMap.set(r, []);
    layerMap.get(r)!.push(node);
  }

  const layers: DiagramNode[][] = [];
  for (let r = 0; r <= maxRank; r++) {
    const layer = layerMap.get(r);
    if (layer && layer.length > 0) {
      layers.push(layer);
    }
  }

  const colWidth = 340;
  const rowHeight = 195;
  const centerX = 480;
  const startY = 60;

  // Position Layer 0 first, then order subsequent layers by parent barycenter X
  const nodeXMap = new Map<string, number>();
  let maxPrimaryRightX = centerX;

  layers.forEach((layer, layerIdx) => {
    if (layerIdx > 0) {
      layer.sort((a, b) => {
        const aParents = primaryEdges
          .filter((e) => e.target === a.id && nodeXMap.has(e.source))
          .map((e) => nodeXMap.get(e.source)!);
        const bParents = primaryEdges
          .filter((e) => e.target === b.id && nodeXMap.has(e.source))
          .map((e) => nodeXMap.get(e.source)!);
        const aBary =
          aParents.length > 0
            ? aParents.reduce((s, v) => s + v, 0) / aParents.length
            : centerX;
        const bBary =
          bParents.length > 0
            ? bParents.reduce((s, v) => s + v, 0) / bParents.length
            : centerX;
        return aBary - bBary;
      });
    }

    const y = startY + layerIdx * rowHeight;
    const totalWidth = (layer.length - 1) * colWidth;
    const rowStartX = Math.max(60, centerX - totalWidth / 2);

    layer.forEach((node, nodeIdx) => {
      const x = Math.round(rowStartX + nodeIdx * colWidth);
      node.x = x;
      node.y = y;
      nodeXMap.set(node.id, x);
      if (x > maxPrimaryRightX) maxPrimaryRightX = x;
    });
  });

  // Position sidecar / observability sink nodes in a clean vertical column to the right
  if (sidecarNodes.length > 0) {
    const sidecarX = maxPrimaryRightX + 500;
    const sidecarStartY = startY + Math.max(1, Math.floor(layers.length / 4)) * rowHeight;
    sidecarNodes.forEach((node, idx) => {
      node.x = sidecarX;
      node.y = sidecarStartY + idx * rowHeight;
    });
  }

  assignOptimalHandles(nodes, edges);
}

export function serializeToMermaid(diagram: ParsedDiagram): string {
  if (diagram.type === 'sequence') {
    return serializeSequenceToMermaid(diagram);
  }

  const lines: string[] = ['flowchart TD'];

  for (const node of diagram.nodes) {
    const safeLabel = `"${node.label.replace(/\n/g, '\\n').replace(/"/g, "'")}"`;
    let nodeStr = '';
    switch (node.shape) {
      case 'cylinder':
        nodeStr = `    ${node.id}[(${safeLabel})]`;
        break;
      case 'subroutine':
        nodeStr = `    ${node.id}[[${safeLabel}]]`;
        break;
      case 'circle':
        nodeStr = `    ${node.id}{{${safeLabel}}}`;
        break;
      case 'rounded':
        nodeStr = `    ${node.id}(${safeLabel})`;
        break;
      case 'box':
      default:
        nodeStr = `    ${node.id}[${safeLabel}]`;
        break;
    }
    lines.push(nodeStr);
  }

  for (const edge of diagram.edges) {
    let arrow = '-->';
    if (edge.style === 'dashed') arrow = '-.->';
    else if (edge.style === 'thick') arrow = '==>';

    if (edge.label && edge.label.trim().length > 0) {
      lines.push(`    ${edge.source} ${arrow}|${edge.label.trim()}| ${edge.target}`);
    } else {
      lines.push(`    ${edge.source} ${arrow} ${edge.target}`);
    }
  }

  return lines.join('\n');
}

function serializeSequenceToMermaid(diagram: ParsedDiagram): string {
  const lines: string[] = ['sequenceDiagram'];

  for (const node of diagram.nodes) {
    const keyword = node.type === 'actor' ? 'actor' : 'participant';
    lines.push(`    ${keyword} ${node.id} as "${node.label}"`);
  }

  for (const edge of diagram.edges) {
    const arrow = edge.style === 'dashed' ? '-->>' : '->>';
    const label = edge.label ? `: ${edge.label}` : '';
    lines.push(`    ${edge.source}${arrow}${edge.target}${label}`);
  }

  return lines.join('\n');
}

export function computeDiagramDiff(before: ParsedDiagram, after: ParsedDiagram): string[] {
  const diffs: string[] = [];

  const beforeNodeMap = new Map(before.nodes.map(n => [n.id, n]));
  const afterNodeMap = new Map(after.nodes.map(n => [n.id, n]));

  for (const node of after.nodes) {
    if (!beforeNodeMap.has(node.id)) {
      diffs.push(`Added component '${node.label}' (${node.type})`);
    } else {
      const orig = beforeNodeMap.get(node.id)!;
      if (orig.label !== node.label) {
        diffs.push(`Renamed component '${orig.label}' -> '${node.label}'`);
      }
      if (orig.type !== node.type) {
        diffs.push(`Changed component '${node.label}' type: ${orig.type} -> ${node.type}`);
      }
    }
  }

  for (const node of before.nodes) {
    if (!afterNodeMap.has(node.id)) {
      diffs.push(`Removed component '${node.label}'`);
    }
  }

  const beforeEdgeSet = new Set(before.edges.map(e => `${e.source}->${e.target}${e.label ? `[${e.label}]` : ''}`));
  const afterEdgeSet = new Set(after.edges.map(e => `${e.source}->${e.target}${e.label ? `[${e.label}]` : ''}`));

  for (const edge of after.edges) {
    const key = `${edge.source}->${edge.target}${edge.label ? `[${edge.label}]` : ''}`;
    if (!beforeEdgeSet.has(key)) {
      const sName = afterNodeMap.get(edge.source)?.label || edge.source;
      const tName = afterNodeMap.get(edge.target)?.label || edge.target;
      diffs.push(`Connected '${sName}' -> '${tName}'${edge.label ? ` (${edge.label})` : ''}`);
    }
  }

  for (const edge of before.edges) {
    const key = `${edge.source}->${edge.target}${edge.label ? `[${edge.label}]` : ''}`;
    if (!afterEdgeSet.has(key)) {
      const sName = beforeNodeMap.get(edge.source)?.label || edge.source;
      const tName = beforeNodeMap.get(edge.target)?.label || edge.target;
      diffs.push(`Disconnected '${sName}' -> '${tName}'`);
    }
  }

  return diffs;
}

export function rebuildDiagramFlows(diagram: ParsedDiagram): ParsedDiagram {
  const nodeMap = new Map(diagram.nodes.map(n => [n.id, n]));
  const flowSteps: FlowStep[] = diagram.edges.map((e, idx) => ({
    stepNumber: idx + 1,
    source: e.source,
    target: e.target,
    label: e.label || `Call ${nodeMap.get(e.target)?.label || e.target}`,
    payload: `{"from": "${e.source}", "to": "${e.target}"}`,
    response: `{"status": 200, "ok": true}`,
    status: 'success',
  }));
  const scenarios = buildDefaultScenarios(diagram.nodes, diagram.edges, flowSteps);
  return {
    ...diagram,
    flowSteps,
    scenarios,
  };
}
