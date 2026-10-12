import { PlanState, PlanDiff, ReviewResult } from './types.js';
import { serializeToMermaid, computeDiagramDiff } from './mermaid-graph-bridge.js';

export function serializePlanMarkdown(state: PlanState): string {
  let markdown = state.rawMarkdown;

  // 1. Replace Mermaid diagram blocks with updated diagrams
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g;
  let diagIdx = 0;
  markdown = markdown.replace(mermaidRegex, (match, rawCode) => {
    if (diagIdx < state.diagrams.length) {
      const updatedMermaid = serializeToMermaid(state.diagrams[diagIdx++]);
      return `\`\`\`mermaid\n${updatedMermaid}\n\`\`\``;
    }
    return match;
  });

  // 2. Re-serialize tasks into markdown
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

  // 3. Append or update User Feedback section if user instructions exist
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

  return {
    tasksAdded,
    tasksRemoved,
    tasksModified,
    diagramChanges,
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
    diff.diagramChanges.length > 0;

  if (hasDiffs) {
    lines.push(`\n### Plan Modifications Made by User:`);
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
