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

export function classifyScenarioType(
  text: string,
  headingOnly?: string
): 'success' | 'failure' | 'edge_case' {
  const title = (headingOnly ?? text).trim();

  // 1. Check heading/title first so words in details like "within 500ms" or "DLQ alerting" don't override a Happy Path or Edge Case title
  if (headingOnly) {
    if (
      /\b(rate[- ]limit|backoff|throttl|retry|fallback|spike|miss|degrad|backpressure|stale|idempoten|dedup|quiet[- ]hours|edge[- ]case|circuit[- ]breaker)\b/i.test(
        title
      )
    ) {
      return 'edge_case';
    }
    if (
      /\b(fail|failure|error|timeout|reject|invalid|unauthorized|forbidden|crash|down|drop|dlq|dead[- ]letter|rollback|abort|outage|expir\w*|unregistered|bounce\w*)\b/i.test(
        title
      )
    ) {
      return 'failure';
    }
    if (
      /\b(happy[- ]path|success\w*|normal|standard|primary|high[- ]priority|otp|transactional|delivery|end[- ]to[- ]end|complete)\b/i.test(
        title
      )
    ) {
      return 'success';
    }
  }

  // 2. Full text fallback with strict word boundaries (avoiding "500ms" matching HTTP 500)
  if (
    /\b(rate[- ]limit\w*|backoff|throttl\w*|edge[- ]case|spike|cache[- ]miss|fallback|retry|degrad\w*|backpressure|stale|idempoten\w*|race[- ]condition|partial|evict\w*)\b/i.test(
      text
    ) &&
    !/\b(fail\w*|error|outage|expir\w*|invalid|unregistered|crash)\b/i.test(title)
  ) {
    return 'edge_case';
  }

  if (
    /\b(fail|failure|failed|error|timeout|reject\w*|invalid|unauthorized|forbidden|crash\w*|outage|expir\w*|unregistered|dlq|dead[- ]letter|rollback|abort)\b/i.test(
      text
    ) ||
    /\b(?:http\s*|status\s*)?(?:401|403|404|409|422|429|500|502|503|504)\b(?!\s*(?:ms|s|sec|seconds|req|rps|k|m)\b)/i.test(
      text
    )
  ) {
    return 'failure';
  }

  return 'success';
}

export function buildDefaultScenarios(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  steps: FlowStep[]
): FlowScenario[] {
  if (steps.length === 0) {
    return [];
  }

  // Filter out pure error/DLQ or high-fan-in dashed telemetry edges for the primary happy-path walkthrough if solid flow steps exist
  const solidSteps = steps.filter((_, idx) => {
    const edge = edges[idx];
    return !edge || edge.style !== 'dashed';
  });
  const baseWalkthrough = solidSteps.length >= 2 ? solidSteps : steps;

  const normalizedSteps: FlowStep[] = baseWalkthrough.map((s, idx) => ({
    ...s,
    stepNumber: idx + 1,
    status: 'success' as const,
  }));

  const touchedAll = Array.from(new Set(normalizedSteps.flatMap((s) => [s.source, s.target])));

  return [
    {
      id: 'scen-primary-flow',
      name: 'Primary Diagram Flow',
      type: 'success',
      description: `End-to-end primary execution flow across ${touchedAll.length} core components (${normalizedSteps.length} hops).`,
      steps: normalizedSteps,
      touchedComponents: touchedAll,
    },
  ];
}

function buildStepsForPlanScenario(
  name: string,
  rawTextForPath: string,
  cleanDescription: string,
  scenType: 'success' | 'failure' | 'edge_case',
  diagram: ParsedDiagram
): FlowStep[] {
  const baseSteps = diagram.flowSteps;
  if (baseSteps.length === 0) return [];

  const combinedText = `${name} ${rawTextForPath}`;
  const lowerText = combinedText.toLowerCase();

  // Check if explicit arrow sequence is written in the scenario text, e.g. "Client -> Gateway -> Auth"
  const arrowParts = rawTextForPath.split(/\s*(?:->|-->|=>|→)\s*/);
  if (arrowParts.length >= 2) {
    const matchedNodes: DiagramNode[] = [];
    for (const part of arrowParts) {
      // Take only the token before any newline or "Details:" marker
      const tokenPart = part
        .split(/\n|\bDetails\s*:/i)[0]
        .replace(/^(?:Path|Flow|Route)\s*:\s*/i, '')
        .replace(/[`*_]/g, '')
        .trim()
        .toLowerCase();
      if (!tokenPart) continue;
      const found = diagram.nodes.find(
        (n) =>
          n.id.toLowerCase() === tokenPart ||
          tokenPart.includes(n.id.toLowerCase()) ||
          tokenPart.includes(n.label.replace(/\n/g, ' ').toLowerCase()) ||
          n.label.replace(/\n/g, ' ').toLowerCase().includes(tokenPart)
      );
      if (found && (matchedNodes.length === 0 || matchedNodes[matchedNodes.length - 1].id !== found.id)) {
        matchedNodes.push(found);
      }
    }
    if (matchedNodes.length >= 2) {
      const customSteps: FlowStep[] = [];
      // Determine which hop is the failure hop (e.g. hop into DLQ or hop from failing worker)
      let failStepIdx = -1;
      if (scenType === 'failure') {
        const dlqHopIdx = matchedNodes.findIndex(
          (n, idx) => idx > 0 && /dlq|dead[- ]?letter/i.test(`${n.id} ${n.label}`)
        );
        failStepIdx = dlqHopIdx > 0 ? dlqHopIdx - 1 : matchedNodes.length - 2;
      }

      for (let i = 0; i < matchedNodes.length - 1; i++) {
        const src = matchedNodes[i];
        const tgt = matchedNodes[i + 1];
        const existingEdge = diagram.edges.find(
          (e) => e.source === src.id && e.target === tgt.id
        );
        const stepStatus: 'success' | 'failure' =
          scenType === 'failure' && i === failStepIdx ? 'failure' : 'success';
        customSteps.push({
          stepNumber: i + 1,
          source: src.id,
          target: tgt.id,
          label:
            i === failStepIdx && scenType === 'failure'
              ? `${existingEdge?.label || `${src.label} -> ${tgt.label}`} (${name})`
              : existingEdge?.label || `Forward to ${tgt.label.replace(/\n/g, ' ')}`,
          payload: `{"from": "${src.id}", "to": "${tgt.id}", "scenario": "${name}"}`,
          response:
            stepStatus === 'failure'
              ? `{"status": "ERROR", "scenario": "${name}", "detail": "${cleanDescription
                  .replace(/"/g, "'")
                  .slice(0, 90)}"}`
              : `{"status": 200, "ok": true}`,
          status: stepStatus,
        });
      }
      return customSteps;
    }
  }

  // Otherwise find diagram nodes referenced in the scenario text
  const mentionedNodes = diagram.nodes.filter((n) => {
    const idLower = n.id.toLowerCase();
    const labelFlat = n.label.replace(/\n/g, ' ').toLowerCase();
    const firstWord = labelFlat.split(/\s+/)[0];
    return (
      (idLower.length >= 2 && lowerText.includes(idLower)) ||
      lowerText.includes(labelFlat) ||
      (firstWord.length >= 4 && lowerText.includes(firstWord))
    );
  });

  if (scenType === 'failure') {
    // Find the step where the mentioned failing component is target or source
    let failIdx = -1;
    if (mentionedNodes.length > 0) {
      const targetNodeIds = new Set(mentionedNodes.map((n) => n.id));
      for (let i = 0; i < baseSteps.length; i++) {
        if (targetNodeIds.has(baseSteps[i].target) || targetNodeIds.has(baseSteps[i].source)) {
          failIdx = i;
        }
      }
    }
    if (failIdx === -1) {
      failIdx = Math.max(0, Math.min(baseSteps.length - 1, Math.floor(baseSteps.length / 2)));
    }

    const statusMatch = combinedText.match(/\b(400|401|403|404|409|422|429|500|502|503|504)\b/);
    const statusCode = statusMatch ? Number(statusMatch[1]) : 500;

    return baseSteps.slice(0, failIdx + 1).map((s, idx) => {
      if (idx === failIdx) {
        return {
          ...s,
          stepNumber: idx + 1,
          label: `${name}: ${cleanDescription.slice(0, 90)}`,
          response: `{"status": ${statusCode}, "error": "${name.replace(/"/g, "'")}", "detail": "${cleanDescription
            .replace(/"/g, "'")
            .slice(0, 80)}"}`,
          status: 'failure' as const,
        };
      }
      return { ...s, stepNumber: idx + 1, status: 'success' as const };
    });
  }

  // For edge_case or success scenarios defined in the plan
  if (mentionedNodes.length > 0) {
    const mentionedSet = new Set(mentionedNodes.map((n) => n.id));
    let highlightIdx = baseSteps.findIndex(
      (s) => mentionedSet.has(s.target) || mentionedSet.has(s.source)
    );
    if (highlightIdx === -1) highlightIdx = 0;

    return baseSteps.map((s, idx) => {
      if (idx === highlightIdx) {
        return {
          ...s,
          stepNumber: idx + 1,
          label: `${name}: ${s.label}`,
          response: `{"status": 200, "scenario": "${name.replace(/"/g, "'")}", "note": "${cleanDescription
            .replace(/"/g, "'")
            .slice(0, 80)}"}`,
          status: 'success' as const,
        };
      }
      return { ...s, stepNumber: idx + 1, status: 'success' as const };
    });
  }

  return baseSteps.map((s, idx) => ({
    ...s,
    stepNumber: idx + 1,
    status: 'success' as const,
  }));
}

/**
 * Extracts scenarios explicitly written in the Plan Markdown (headings, bullet lists, or tables)
 * and binds them to the diagram's nodes and edges.
 */
export function extractScenariosFromPlanSections(
  sections: Array<{ heading: string; level: number; content: string }>,
  diagram: ParsedDiagram
): FlowScenario[] {
  if (!diagram || diagram.edges.length === 0 || diagram.flowSteps.length === 0) {
    return [];
  }

  const rawExtracted: Array<{ name: string; rawText: string; cleanDescription: string }> = [];
  const sectionTriggerRegex =
    /scenario|request flow|execution flow|flow path|flow simulation|failure mode|error handling|edge case|fault tolerance|walkthrough/i;
  const headingScenarioRegex =
    /^(?:scenario\s*\d*|flow\s*\d*|path\s*\d*|happy\s*path|failure(?:\s*mode|\s*case)?|edge\s*case|fallback\s*flow)\s*[:\-–—]\s*(.+)$/i;

  let insideScenarioParentLevel: number | null = null;

  for (const sec of sections) {
    const h = sec.heading.trim();
    if (/user feedback & review notes/i.test(h)) continue;

    if (
      insideScenarioParentLevel !== null &&
      sec.level <= insideScenarioParentLevel &&
      !sectionTriggerRegex.test(h)
    ) {
      insideScenarioParentLevel = null;
    }

    const directHeadingMatch = h.match(headingScenarioRegex);
    const isScenarioContainer = sectionTriggerRegex.test(h);

    if (isScenarioContainer && !directHeadingMatch) {
      insideScenarioParentLevel = sec.level;
    }

    // 1. Sub-heading directly represents a scenario
    if (
      directHeadingMatch ||
      (insideScenarioParentLevel !== null && sec.level > insideScenarioParentLevel)
    ) {
      const contentLines = sec.content
        .replace(/```[\s\S]*?```/g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*[-*+]\s+/, '').trim())
        .filter(Boolean);

      if (contentLines.length > 0) {
        const rawText = contentLines.join('\n');
        const detailLines = contentLines
          .filter((l) => !/^(?:path|route|hops)\s*:/i.test(l))
          .map((l) => l.replace(/^(?:details|description|summary)\s*:\s*/i, '').trim())
          .filter(Boolean);
        const cleanDescription =
          detailLines.length > 0 ? detailLines.join(' ') : contentLines.join(' ');
        const cleanName = (directHeadingMatch ? directHeadingMatch[1] : h)
          .replace(/^\d+\.\s*/, '')
          .replace(/^(?:scenario|flow|path)\s*\d*\s*[:\-–—]\s*/i, '')
          .trim();

        rawExtracted.push({
          name: cleanName || h,
          rawText,
          cleanDescription,
        });
        continue;
      }
    }

    // 2. Bullet items or table rows inside a Scenario / Flow / Failure Mode / Edge Case section
    if (isScenarioContainer) {
      const lines = sec.content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Match `- **Scenario Name**: Description` or `1. **Scenario Name** - Description`
        const bulletMatch = trimmed.match(
          /^(?:[-*+]|\d+\.)\s+\*\*([^*]+)\*\*\s*[:\-–—]?\s*(.+)$/
        );
        if (bulletMatch) {
          const cleanName = bulletMatch[1]
            .replace(/^(?:scenario|flow|path)\s*\d*\s*[:\-–—]\s*/i, '')
            .trim();
          const desc = bulletMatch[2].trim();
          rawExtracted.push({
            name: cleanName,
            rawText: desc,
            cleanDescription: desc,
          });
          continue;
        }

        // Match markdown table row `| Scenario Name | Description | ... |`
        if (trimmed.startsWith('|') && trimmed.endsWith('|') && !trimmed.includes('---')) {
          const cells = trimmed
            .slice(1, -1)
            .split('|')
            .map((c) => c.replace(/\*\*/g, '').trim());
          if (
            cells.length >= 2 &&
            cells[0] &&
            !/^(scenario|flow|mode|case|name|type|step|parameter|metric)$/i.test(cells[0])
          ) {
            const desc = cells.slice(1).join(' — ');
            rawExtracted.push({
              name: cells[0],
              rawText: desc,
              cleanDescription: desc,
            });
          }
        }
      }
    }
  }

  if (rawExtracted.length === 0) {
    return [];
  }

  const planScenarios: FlowScenario[] = rawExtracted.map((item, idx) => {
    const scenType = classifyScenarioType(
      `${item.name} ${item.cleanDescription}`,
      item.name
    );
    const steps = buildStepsForPlanScenario(
      item.name,
      item.rawText,
      item.cleanDescription,
      scenType,
      diagram
    );
    const touched = Array.from(new Set(steps.flatMap((s) => [s.source, s.target])));
    return {
      id: `scen-plan-${idx + 1}`,
      name: item.name,
      type: scenType,
      description: item.cleanDescription,
      steps,
      touchedComponents: touched,
    };
  });

  return planScenarios;
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
  if (firstLine.startsWith('erdiagram')) {
    return parseErDiagram(raw, lines, diagramId);
  }

  return parseFlowchart(raw, lines, diagramId);
}

function formatErCardinality(relSymbol: string): string {
  const parts = relSymbol.split(/--|\.\./);
  if (parts.length !== 2) return '';
  const mapSide = (s: string) => {
    if (s.includes('{') || s.includes('}')) {
      return s.includes('o') ? '0..N' : '1..N';
    }
    return s.includes('o') ? '0..1' : '1';
  };
  return `${mapSide(parts[0])} → ${mapSide(parts[1])}`;
}

function parseErDiagram(raw: string, lines: string[], diagramId: string): ParsedDiagram {
  const nodeMap = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const flowSteps: FlowStep[] = [];

  const relRegex = /^([a-zA-Z0-9_-]+)\s+([|o}{]+(?:--|\.\.)[|o}{]+)\s+([a-zA-Z0-9_-]+)\s*:\s*(.+)$/;
  const entityStartRegex = /^([a-zA-Z0-9_-]+)\s*\{$/;
  let activeEntityId: string | null = null;
  const entityAttrs = new Map<string, string[]>();

  const ensureEntity = (id: string) => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label: id,
        type: 'database',
        shape: 'cylinder',
        x: 80,
        y: 80,
      });
    }
  };

  for (const line of lines) {
    if (line.toLowerCase().startsWith('erdiagram')) continue;

    if (activeEntityId) {
      if (line === '}') {
        activeEntityId = null;
      } else {
        const attrs = entityAttrs.get(activeEntityId) || [];
        attrs.push(line);
        entityAttrs.set(activeEntityId, attrs);
      }
      continue;
    }

    const entMatch = line.match(entityStartRegex);
    if (entMatch) {
      activeEntityId = entMatch[1];
      ensureEntity(activeEntityId);
      continue;
    }

    const relMatch = line.match(relRegex);
    if (relMatch) {
      const source = relMatch[1];
      const relSymbol = relMatch[2];
      const target = relMatch[3];
      const rawLabel = cleanMermaidLabel(relMatch[4]);
      const card = formatErCardinality(relSymbol);
      const edgeLabel = card ? `${rawLabel} (${card})` : rawLabel;

      ensureEntity(source);
      ensureEntity(target);

      const style: DiagramEdge['style'] = relSymbol.includes('..') ? 'dashed' : 'solid';
      edges.push({
        id: `e-${source}-${target}-${edges.length}`,
        source,
        target,
        label: edgeLabel,
        style,
        animated: false,
      });

      flowSteps.push({
        stepNumber: flowSteps.length + 1,
        source,
        target,
        label: edgeLabel,
        payload: `{"entity": "${source}", "relatesTo": "${target}", "cardinality": "${card || relSymbol}"}`,
        response: `{"relation": "${rawLabel}", "ok": true}`,
        status: 'success',
      });
    }
  }

  // Append compact attribute summary to entity labels if attributes were defined
  for (const [id, attrs] of entityAttrs.entries()) {
    const node = nodeMap.get(id);
    if (node && attrs.length > 0) {
      node.label = `${id}\n${attrs.slice(0, 3).join(', ')}${attrs.length > 3 ? '…' : ''}`;
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

export function cleanMermaidLabel(rawLabel: string): string {
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
  const blockStartRegex = /^(alt|opt)\s+(.+)$/i;
  const blockElseRegex = /^else(?:\s+(.+))?$/i;
  const blockEndRegex = /^end$/i;

  const prefixSteps: FlowStep[] = [];
  const suffixSteps: FlowStep[] = [];
  const altBranches: Array<{ name: string; steps: FlowStep[] }> = [];
  let activeBranch: { name: string; steps: FlowStep[] } | null = null;
  let afterBlock = false;

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

    const startMatch = line.match(blockStartRegex);
    if (startMatch) {
      activeBranch = { name: cleanMermaidLabel(startMatch[2]), steps: [] };
      altBranches.push(activeBranch);
      afterBlock = false;
      continue;
    }

    const elseMatch = line.match(blockElseRegex);
    if (elseMatch && activeBranch) {
      activeBranch = {
        name: cleanMermaidLabel(elseMatch[1] || `Alternative Path ${altBranches.length + 1}`),
        steps: [],
      };
      altBranches.push(activeBranch);
      continue;
    }

    if (blockEndRegex.test(line) && activeBranch) {
      activeBranch = null;
      afterBlock = true;
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

      const isErrorStep = /fail|error|reject|timeout|401|403|404|429|500|502|503|504|invalid/i.test(
        label
      );
      const stepObj: FlowStep = {
        stepNumber: flowSteps.length + 1,
        source,
        target,
        label,
        payload: `{"request": "${label}"}`,
        response: arrow.includes('--')
          ? `{"status": "${isErrorStep ? 'ERROR' : 'ACK'}", "response": "${label}"}`
          : undefined,
        status: isErrorStep ? 'failure' : 'success',
      };
      flowSteps.push(stepObj);

      if (activeBranch) {
        activeBranch.steps.push(stepObj);
      } else if (afterBlock) {
        suffixSteps.push(stepObj);
      } else {
        prefixSteps.push(stepObj);
      }
    }
  }

  const nodes = Array.from(nodeMap.values());
  assignOptimalHandles(nodes, edges);

  let scenarios: FlowScenario[];
  if (altBranches.length > 0 && altBranches.some((b) => b.steps.length > 0)) {
    scenarios = altBranches
      .filter((b) => b.steps.length > 0)
      .map((branch, idx) => {
        const combinedSteps = [...prefixSteps, ...branch.steps, ...suffixSteps].map((s, sIdx) => ({
          ...s,
          stepNumber: sIdx + 1,
        }));
        const scenType = classifyScenarioType(
          `${branch.name} ${branch.steps.map((s) => s.label).join(' ')}`
        );
        const touched = Array.from(new Set(combinedSteps.flatMap((s) => [s.source, s.target])));
        return {
          id: `scen-seq-${idx + 1}`,
          name: branch.name,
          type: scenType,
          description: `Sequence diagram branch: ${branch.name} (${combinedSteps.length} steps)`,
          steps: combinedSteps,
          touchedComponents: touched,
        };
      });
  } else {
    scenarios = buildDefaultScenarios(nodes, edges, flowSteps);
  }

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

function isObservabilityNode(n: DiagramNode): boolean {
  return /telemetry|otel|opentelemetry|prometheus|grafana|datadog|jaeger|zipkin|cloudwatch|observability|monitoring|metrics/i.test(
    `${n.id} ${n.label}`
  );
}

/**
 * Assigns optimal 4-way sourceHandle and targetHandle to each edge based on relative node coordinates
 * so edges exit from the bottom/side toward the target and NEVER cut horizontally through sibling nodes.
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

    // Sidecar / observability targets positioned in the right-hand sidecar column
    if (edge.style === 'dashed' && isObservabilityNode(tgt) && dx > 250) {
      const hasRightSiblingOnSameRow = nodes.some(
        (other) =>
          other.id !== src.id &&
          other.id !== tgt.id &&
          Math.abs(other.y - src.y) < 50 &&
          other.x > src.x &&
          other.x < tgt.x - 100
      );

      if (hasRightSiblingOnSameRow) {
        edge.sourceHandle = dy >= 0 ? 'bottom-src' : 'top-src';
      } else {
        edge.sourceHandle = 'right-src';
      }

      if (dy > 180) {
        edge.targetHandle = 'top-tgt';
      } else {
        edge.targetHandle = 'left-tgt';
      }
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
 * 1. Separates auxiliary dashed-only sink nodes and observability/telemetry pipelines
 *    (e.g. OpenTelemetry Collector -> Prometheus/Grafana) into a clean right-hand sidecar column.
 * 2. Computes Longest-Path Topological Layering on the primary flow graph so all primary
 *    edges flow strictly downward from layer L to layer > L without backtracking.
 * 3. Orders nodes within each layer using Barycenter parent alignment to eliminate edge crossings,
 *    and centers sub-layers under their parent barycenter X so fan-in sinks (like DLQ) sit directly
 *    beneath the workers that feed them.
 * 4. Spaces nodes with generous horizontal (340px) and vertical (210px) margins so boxes and labels never overlap.
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

  // Pass 1: Identify auxiliary dashed-only sink nodes and observability collector nodes
  const sidecarIdSet = new Set<string>();
  if (nodes.length > 5) {
    for (const node of nodes) {
      const inc = incomingByNode.get(node.id) || [];
      const out = outgoingByNode.get(node.id) || [];
      const isPureDashedSink =
        inc.length > 0 && out.length === 0 && inc.every((e) => e.style === 'dashed') && inc.length >= 4;
      const isObsCollector =
        isObservabilityNode(node) &&
        inc.length > 0 &&
        inc.every((e) => e.style === 'dashed' || isObservabilityNode(nodes.find((n) => n.id === e.source)!));

      if (isPureDashedSink || isObsCollector) {
        sidecarIdSet.add(node.id);
      }
    }

    // Pass 2: Include downstream nodes fed exclusively by sidecar nodes (e.g. OTel Collector -> Prometheus DB)
    let addedDownstream = true;
    while (addedDownstream) {
      addedDownstream = false;
      for (const node of nodes) {
        if (sidecarIdSet.has(node.id)) continue;
        const inc = incomingByNode.get(node.id) || [];
        const out = outgoingByNode.get(node.id) || [];
        if (
          inc.length > 0 &&
          inc.every((e) => sidecarIdSet.has(e.source)) &&
          out.every((e) => sidecarIdSet.has(e.target))
        ) {
          sidecarIdSet.add(node.id);
          addedDownstream = true;
        }
      }
    }
  }

  const sidecarNodes: DiagramNode[] = [];
  const primaryNodes: DiagramNode[] = [];
  for (const node of nodes) {
    if (sidecarIdSet.has(node.id)) {
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
  let maxLayerNodes = 1;
  for (let r = 0; r <= maxRank; r++) {
    const layer = layerMap.get(r);
    if (layer && layer.length > 0) {
      layers.push(layer);
      if (layer.length > maxLayerNodes) maxLayerNodes = layer.length;
    }
  }

  const colWidth = 340;
  const rowHeight = 210;
  const centerX = Math.max(480, Math.round(80 + ((maxLayerNodes - 1) * colWidth) / 2));
  const startY = 60;

  // Position Layer 0 first, then order subsequent layers by parent barycenter X
  const nodeXMap = new Map<string, number>();
  let maxPrimaryRightX = centerX;

  layers.forEach((layer, layerIdx) => {
    let layerAnchorX = centerX;

    if (layerIdx > 0) {
      const allLayerParentXs: number[] = [];
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

      for (const n of layer) {
        const pXs = primaryEdges
          .filter((e) => e.target === n.id && nodeXMap.has(e.source))
          .map((e) => nodeXMap.get(e.source)!);
        allLayerParentXs.push(...pXs);
      }
      // If this layer is narrower than the widest layer and fed by a specific subset of parents (e.g. DLQ fed by 3 right-hand workers), center it directly under its parents
      if (allLayerParentXs.length > 0 && layer.length < maxLayerNodes) {
        layerAnchorX = Math.round(
          allLayerParentXs.reduce((s, v) => s + v, 0) / allLayerParentXs.length
        );
      }
    }

    const y = startY + layerIdx * rowHeight;
    const totalWidth = (layer.length - 1) * colWidth;
    const rowStartX = Math.max(60, Math.round(layerAnchorX - totalWidth / 2));

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
    const sidecarX = maxPrimaryRightX + 420;
    const totalPrimaryHeight = Math.max(0, (layers.length - 1) * rowHeight);
    const totalSidecarHeight = Math.max(0, (sidecarNodes.length - 1) * (rowHeight + 25));
    const sidecarStartY = Math.max(
      startY + rowHeight,
      Math.round(startY + (totalPrimaryHeight - totalSidecarHeight) / 2)
    );
    sidecarNodes.forEach((node, idx) => {
      node.x = sidecarX;
      node.y = sidecarStartY + idx * (rowHeight + 25);
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
