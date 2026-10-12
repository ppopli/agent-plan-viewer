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

function buildDefaultScenarios(nodes: DiagramNode[], edges: DiagramEdge[], steps: FlowStep[]): FlowScenario[] {
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
  const midPoint = Math.max(1, Math.floor(steps.length / 2));
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

  return [successScenario, downstreamFailScenario, authFailScenario];
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

function parseFlowchart(raw: string, lines: string[], diagramId: string): ParsedDiagram {
  const nodeMap = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const flowSteps: FlowStep[] = [];

  const nodeDefRegex = /([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\s*(\[\([^\)]+\)\]|\[\[[^\]]+\]\]|\{\{[^\}]+\}\}|\[[^\]]+\]|\([^\)]+\))/g;
  const edgeRegex = /([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)\s*(-->|-.->|==>|->)\s*(?:\|([^|]+)\|)?\s*([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)/g;

  let currentY = 80;
  let currentX = 80;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('flowchart') || line.toLowerCase().startsWith('graph') || line.toLowerCase().startsWith('subgraph') || line.toLowerCase() === 'end') {
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
      } else if (shapeStr.startsWith('[[') && shapeStr.endsWith(']]')) {
        label = shapeStr.slice(2, -2).trim();
        shape = 'subroutine';
      } else if (shapeStr.startsWith('{{') && shapeStr.endsWith('}}')) {
        label = shapeStr.slice(2, -2).trim();
        shape = 'circle';
      } else if (shapeStr.startsWith('(') && shapeStr.endsWith(')')) {
        label = shapeStr.slice(1, -1).trim();
        shape = 'rounded';
      } else if (shapeStr.startsWith('[') && shapeStr.endsWith(']')) {
        label = shapeStr.slice(1, -1).trim();
        shape = 'box';
      }

      label = label.replace(/^["']|["']$/g, '');

      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          label: label || id,
          type: inferNodeType(id, label, shape),
          shape,
          x: currentX,
          y: currentY,
        });
        currentX += 240;
        if (currentX > 800) {
          currentX = 80;
          currentY += 140;
        }
      }
    }

    let edgeMatch;
    while ((edgeMatch = edgeRegex.exec(line)) !== null) {
      const source = edgeMatch[1];
      const arrow = edgeMatch[2];
      const edgeLabel = edgeMatch[3]?.trim();
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
        currentX += 240;
        if (currentX > 800) { currentX = 80; currentY += 140; }
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
        currentX += 240;
        if (currentX > 800) { currentX = 80; currentY += 140; }
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
        label: edgeLabel || `Call ${nodeMap.get(target)?.label || target}`,
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
      const label = (partMatch[2] || id).replace(/^["']|["']$/g, '');
      const isActor = line.toLowerCase().startsWith('actor');
      nodeMap.set(id, {
        id,
        label,
        type: isActor ? 'actor' : inferNodeType(id, label),
        shape: isActor ? 'circle' : 'box',
        x: currentX,
        y: 120,
      });
      currentX += 240;
      continue;
    }

    const msgMatch = line.match(messageRegex);
    if (msgMatch) {
      const source = msgMatch[1];
      const arrow = msgMatch[2];
      const target = msgMatch[3];
      const label = msgMatch[4].trim();

      if (!nodeMap.has(source)) {
        nodeMap.set(source, {
          id: source,
          label: source,
          type: inferNodeType(source, source),
          shape: 'box',
          x: currentX,
          y: 120,
        });
        currentX += 240;
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
        currentX += 240;
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

export function autoLayout(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const inDegree = new Map<string, number>();
  nodes.forEach(n => inDegree.set(n.id, 0));
  edges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  });

  const layers: DiagramNode[][] = [];
  const assigned = new Set<string>();

  let currentLayer = nodes.filter(n => inDegree.get(n.id) === 0);
  if (currentLayer.length === 0 && nodes.length > 0) {
    currentLayer = [nodes[0]];
  }

  while (currentLayer.length > 0 && assigned.size < nodes.length) {
    layers.push(currentLayer);
    currentLayer.forEach(n => assigned.add(n.id));

    const nextLayerSet = new Set<string>();
    for (const node of currentLayer) {
      for (const edge of edges.filter(e => e.source === node.id)) {
        if (!assigned.has(edge.target)) {
          nextLayerSet.add(edge.target);
        }
      }
    }

    currentLayer = nodes.filter(n => nextLayerSet.has(n.id));
    if (currentLayer.length === 0 && assigned.size < nodes.length) {
      const remaining = nodes.filter(n => !assigned.has(n.id));
      if (remaining.length > 0) {
        currentLayer = [remaining[0]];
      }
    }
  }

  const startX = 80;
  const startY = 80;
  const colWidth = 260;
  const rowHeight = 150;

  layers.forEach((layer, layerIdx) => {
    const y = startY + layerIdx * rowHeight;
    const totalWidth = layer.length * colWidth;
    const offset = Math.max(0, (800 - totalWidth) / 2);

    layer.forEach((node, nodeIdx) => {
      node.x = startX + offset + nodeIdx * colWidth;
      node.y = y;
    });
  });
}

export function serializeToMermaid(diagram: ParsedDiagram): string {
  if (diagram.type === 'sequence') {
    return serializeSequenceToMermaid(diagram);
  }

  const lines: string[] = ['flowchart TD'];

  for (const node of diagram.nodes) {
    const safeLabel = `"${node.label.replace(/"/g, "'")}"`;
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
