import { PlanState, PlanDiff, ReviewResult } from './types.js';
import { serializeToMermaid, computeDiagramDiff, parseMermaid } from './mermaid-graph-bridge.js';
import { patchMermaid, diagramsEqual } from './mermaid-patch.js';

export function serializePlanMarkdown(state: PlanState): string {
  let markdown = state.rawMarkdown;

  // 1. Update Goal Title if present
  if (state.goal?.title) {
    if (/^#\s+[^\n]+/m.test(markdown)) {
      markdown = markdown.replace(/^#\s+[^\n]+/m, `# ${state.goal.title}`);
    }
  }

  // 2. Update Goal Description if present
  if (state.goal?.description) {
    const goalHeadingRegex = /^(#{1,3}\s+(?:Goal|Overview|Description)[^\n]*\n)([\s\S]*?)(?=\n#{1,3}\s+|$)/im;
    if (goalHeadingRegex.test(markdown)) {
      markdown = markdown.replace(goalHeadingRegex, (whole: string, head: string, body: string) =>
        body.trim() === state.goal.description.trim() ? whole : `${head}${state.goal.description.trim()}\n`
      );
    }
  }

  // 3. Replace Mermaid diagram blocks with updated diagrams
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g;
  let diagIdx = 0;
  markdown = markdown.replace(mermaidRegex, (match, rawCode) => {
    if (diagIdx < state.diagrams.length) {
      const diagram = state.diagrams[diagIdx++];
      // Only flowchart/graph and sequence diagrams are editable in the viewer.
      // Anything else (erDiagram, classDiagram, ...) can't round-trip through
      // the graph model, so keep the author's original source verbatim.
      const firstLine = String(rawCode)
        .split('\n')
        .map((l: string) => l.trim())
        .find((l: string) => l.length > 0 && !l.startsWith('%%'))
        ?.toLowerCase() || '';
      const editable = /^(flowchart|graph|sequencediagram)\b/.test(firstLine);
      if (!editable) return match;
      // Regenerating from the parsed graph is lossy (e.g. drops alt/else/opt
      // blocks), so leave the block untouched unless the user changed it.
      const original = parseMermaid(String(rawCode), diagram.id);
      if (diagramsEqual(original, diagram)) return match;
      // Patch only the changed lines of the original source so subgraphs,
      // alt/else blocks, notes, styling and comments survive. Regenerating the
      // whole diagram is the last resort.
      const patched = patchMermaid(String(rawCode), original, diagram);
      const updatedMermaid = patched ?? serializeToMermaid(diagram);
      return `\`\`\`mermaid\n${updatedMermaid.replace(/\s+$/, '')}\n\`\`\``;
    }
    return match;
  });

  // Append any newly created diagrams if original markdown had fewer mermaid blocks
  while (diagIdx < state.diagrams.length) {
    const newMermaid = serializeToMermaid(state.diagrams[diagIdx++]);
    markdown = `${markdown.trim()}\n\n## System Architecture\n\n\`\`\`mermaid\n${newMermaid}\n\`\`\`\n`;
  }

  // 4. Re-serialize tasks into markdown
  const lines = markdown.split('\n');
  const taskLines = state.tasks.map(t => {
    const indentStr = '  '.repeat(t.indent || 0);
    const check = t.completed ? 'x' : ' ';
    return `${indentStr}- [${check}] ${t.title}`;
  });

  const firstTaskIdx = lines.findIndex(l => /^(\s*)[-*+]\s+\[([ xX])\]/.test(l));
  if (firstTaskIdx !== -1) {
    let lastTaskIdx = firstTaskIdx;
    for (let i = firstTaskIdx; i < lines.length; i++) {
      if (/^#{1,6}\s+/.test(lines[i])) break;
      if (/^(\s*)[-*+]\s+\[([ xX])\]/.test(lines[i])) {
        lastTaskIdx = i;
      }
    }
    const before = lines.slice(0, firstTaskIdx);
    const after = lines.slice(lastTaskIdx + 1);
    markdown = [...before, ...taskLines, ...after].join('\n');
  } else if (state.tasks.length > 0) {
    markdown = `${markdown.trim()}\n\n## Tasks\n${taskLines.join('\n')}\n`;
  }

  // 5. Append or update User Feedback section if user instructions exist
  if (state.userInstructions && state.userInstructions.trim().length > 0) {
    const instructionsHeader = '## User Feedback & Review Notes';
    if (markdown.includes(instructionsHeader)) {
      const regex = new RegExp(`(${instructionsHeader}[\\s\\S]*?)(##|$)`);
      markdown = markdown.replace(regex, `${instructionsHeader}\n\n${state.userInstructions.trim()}\n\n$2`);
    } else {
      markdown = `${markdown.trim()}\n\n---\n\n${instructionsHeader}\n\n${state.userInstructions.trim()}\n`;
    }
  }

  return markdown;
}

export function calculatePlanDiff(original: PlanState, updated: PlanState): PlanDiff {
  const origTaskMap = new Map(original.tasks.map(t => [t.id, t]));
  const updTaskMap = new Map(updated.tasks.map(t => [t.id, t]));

  const tasksAdded: string[] = [];
  const tasksRemoved: string[] = [];
  const tasksModified: string[] = [];

  for (const [id, task] of updTaskMap.entries()) {
    if (!origTaskMap.has(id)) {
      tasksAdded.push(task.title);
    } else {
      const orig = origTaskMap.get(id)!;
      if (orig.title !== task.title || orig.completed !== task.completed) {
        tasksModified.push(`"${orig.title}" -> "${task.title}" (completed: ${task.completed})`);
      }
    }
  }

  for (const [id, task] of origTaskMap.entries()) {
    if (!updTaskMap.has(id)) {
      tasksRemoved.push(task.title);
    }
  }

  const diagramChanges: string[] = [];
  const minDiags = Math.min(original.diagrams.length, updated.diagrams.length);
  for (let i = 0; i < minDiags; i++) {
    const diffs = computeDiagramDiff(original.diagrams[i], updated.diagrams[i]);
    diagramChanges.push(...diffs);
  }
  for (let i = minDiags; i < updated.diagrams.length; i++) {
    const newDiag = updated.diagrams[i];
    diagramChanges.push(`Created new ${newDiag.type} diagram (${newDiag.nodes.length} components, ${newDiag.edges.length} connections)`);
    for (const n of newDiag.nodes) {
      diagramChanges.push(`Added component '${n.label}' (${n.type})`);
    }
    for (const e of newDiag.edges) {
      const src = newDiag.nodes.find(n => n.id === e.source)?.label || e.source;
      const tgt = newDiag.nodes.find(n => n.id === e.target)?.label || e.target;
      diagramChanges.push(`Connected '${src}' -> '${tgt}'`);
    }
  }

  const goalChanges: string[] = [];
  if (original.goal.title !== updated.goal.title) {
    goalChanges.push(`Goal Title: "${original.goal.title}" -> "${updated.goal.title}"`);
  }
  if (original.goal.description !== updated.goal.description) {
    goalChanges.push(`Architectural Scope updated`);
  }

  // Track general markdown section & inline line edits
  const origSections = (original.sections || []).filter(
    s => !/user feedback & review notes/i.test(s.heading)
  );
  const updSections = (updated.sections || []).filter(
    s => !/user feedback & review notes/i.test(s.heading)
  );
  const origSecMap = new Map(origSections.map(s => [s.heading, s.content.trim()]));
  const updSecMap = new Map(updSections.map(s => [s.heading, s.content.trim()]));

  for (const [heading, content] of updSecMap.entries()) {
    if (!origSecMap.has(heading)) {
      goalChanges.push(`Added section "${heading}"`);
    } else {
      const origContent = origSecMap.get(heading)!;
      const stripMermaid = (txt: string) => txt.replace(/```mermaid[\s\S]*?```/gi, '').trim();
      if (stripMermaid(origContent) !== stripMermaid(content)) {
        const msg = `Modified section "${heading}"`;
        if (!goalChanges.includes(msg)) {
          goalChanges.push(msg);
        }
      }
    }
  }

  for (const [heading] of origSecMap.entries()) {
    if (!updSecMap.has(heading)) {
      goalChanges.push(`Removed section "${heading}"`);
    }
  }

  return {
    tasksAdded,
    tasksRemoved,
    tasksModified,
    diagramChanges,
    goalChanges,
    instructionsChanged: (original.userInstructions || '') !== (updated.userInstructions || ''),
  };
}

export function formatAgentInstructions(result: ReviewResult): string {
  const lines: string[] = [];

  if (result.status === 'APPROVED') {
    lines.push(`## Plan Review: APPROVED`);
    lines.push(`The user reviewed the plan in Agent Plan Viewer and approved it.`);
  } else {
    lines.push(`## Plan Review: CHANGES REQUESTED`);
    lines.push(`The user reviewed the plan in Agent Plan Viewer and requested changes.`);
  }

  if (result.userInstructions && result.userInstructions.trim().length > 0) {
    lines.push(`\n### User Notes & Feedback:\n${result.userInstructions.trim()}`);
  }

  const { diff } = result;
  const hasDiffs = diff.tasksAdded.length > 0 ||
    diff.tasksRemoved.length > 0 ||
    diff.tasksModified.length > 0 ||
    diff.diagramChanges.length > 0 ||
    (diff.goalChanges && diff.goalChanges.length > 0);

  if (hasDiffs) {
    lines.push(`\n### Plan Modifications Made by User:`);
    if (diff.goalChanges && diff.goalChanges.length > 0) {
      lines.push(`- **Execution Target & Goal Updates**:`);
      diff.goalChanges.forEach(g => lines.push(`  * ${g}`));
    }
    if (diff.tasksAdded.length > 0) {
      lines.push(`- **Tasks Added**:`);
      diff.tasksAdded.forEach(t => lines.push(`  + ${t}`));
    }
    if (diff.tasksRemoved.length > 0) {
      lines.push(`- **Tasks Removed**:`);
      diff.tasksRemoved.forEach(t => lines.push(`  - ${t}`));
    }
    if (diff.tasksModified.length > 0) {
      lines.push(`- **Tasks Modified**:`);
      diff.tasksModified.forEach(t => lines.push(`  ~ ${t}`));
    }
    if (diff.diagramChanges.length > 0) {
      lines.push(`- **Diagram Updates**:`);
      diff.diagramChanges.forEach(d => lines.push(`  * ${d}`));
    }
  }

  lines.push(`\nPlease review the updated plan at: ${result.planPath}`);
  lines.push(`Incorporate these changes and proceed accordingly.`);

  return lines.join('\n');
}
