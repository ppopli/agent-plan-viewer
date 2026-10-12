import { PlanState, PlanTask, FileChange, GoalInfo, ParsedDiagram } from './types.js';
import { parseMermaid } from './mermaid-graph-bridge.js';

export function parsePlanMarkdown(markdown: string): PlanState {
  const lines = markdown.split('\n');

  let title = 'Implementation Plan';
  let goalDesc = '';
  const tasks: PlanTask[] = [];
  const fileChanges: FileChange[] = [];
  const diagrams: ParsedDiagram[] = [];
  let userInstructions = '';

  const sections: Array<{ heading: string; level: number; content: string }> = [];

  // Extract Title
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.replace('# ', '').trim();
      break;
    }
  }

  // Parse sections
  let currentHeading = 'Overview';
  let currentLevel = 1;
  let currentContentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);

    if (headerMatch) {
      if (currentContentLines.length > 0 || currentHeading !== 'Overview') {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentContentLines.join('\n'),
        });
        currentContentLines = [];
      }
      currentLevel = headerMatch[1].length;
      currentHeading = headerMatch[2].trim();
      continue;
    }

    currentContentLines.push(line);
  }

  if (currentContentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentContentLines.join('\n'),
    });
  }

  // Extract Goal Description from sections
  const goalSection = sections.find(s =>
    s.heading.toLowerCase().includes('goal') ||
    s.heading.toLowerCase().includes('overview') ||
    s.heading.toLowerCase().includes('description')
  );
  if (goalSection && goalSection.content.trim().length > 0) {
    goalDesc = goalSection.content.trim().slice(0, 500);
  } else {
    // If not found, use content under first section or H1
    const firstNonEmpty = sections.find(s => s.content.trim().length > 0);
    if (firstNonEmpty) {
      goalDesc = firstNonEmpty.content.trim().slice(0, 500);
    }
  }

  // Extract Tasks (Checklists or step lists)
  let taskCounter = 1;
  const taskRegex = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
  const numberedTaskRegex = /^(\s*)\d+\.\s+\[([ xX])\]\s+(.*)$/;

  for (const line of lines) {
    let match = line.match(taskRegex) || line.match(numberedTaskRegex);
    if (match) {
      const indent = Math.floor(match[1].length / 2);
      const completed = match[2].toLowerCase() === 'x';
      const text = match[3].trim();
      tasks.push({
        id: `task-${taskCounter++}`,
        title: text,
        completed,
        indent,
      });
    }
  }

  // If no checkbox tasks found, parse standard bullet points under Tasks/Verification/Execution sections
  if (tasks.length === 0) {
    const taskSections = sections.filter(s =>
      s.heading.toLowerCase().includes('task') ||
      s.heading.toLowerCase().includes('step') ||
      s.heading.toLowerCase().includes('plan') ||
      s.heading.toLowerCase().includes('verification')
    );
    for (const sec of taskSections) {
      for (const line of sec.content.split('\n')) {
        const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
        if (bulletMatch && !bulletMatch[2].startsWith('[')) {
          tasks.push({
            id: `task-${taskCounter++}`,
            title: bulletMatch[2].trim(),
            completed: false,
            indent: Math.floor(bulletMatch[1].length / 2),
          });
        }
      }
    }
  }

  // Extract File Changes: [NEW], [MODIFY], [DELETE]
  const fileRegex = /####?\s+\[(NEW|MODIFY|DELETE)\]\s+([^\n]+)/gi;
  let fileMatch;
  while ((fileMatch = fileRegex.exec(markdown)) !== null) {
    const type = fileMatch[1].toUpperCase() as 'NEW' | 'MODIFY' | 'DELETE';
    const filePath = fileMatch[2].trim();
    fileChanges.push({
      path: filePath,
      type,
    });
  }

  // Also check for markdown tables or bulleted files
  const bulletFileRegex = /[-*+]\s+`([^`]+)`\s*:\s*(\[(NEW|MODIFY|DELETE)\])?\s*(.*)/gi;
  let bMatch;
  while ((bMatch = bulletFileRegex.exec(markdown)) !== null) {
    const filePath = bMatch[1].trim();
    const type = (bMatch[3] ? bMatch[3].toUpperCase() : 'MODIFY') as 'NEW' | 'MODIFY' | 'DELETE';
    const summary = bMatch[4]?.trim();
    if (!fileChanges.some(f => f.path === filePath)) {
      fileChanges.push({ path: filePath, type, summary });
    }
  }

  // Extract Mermaid diagram blocks
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g;
  let mermaidMatch;
  let diagCounter = 1;
  while ((mermaidMatch = mermaidRegex.exec(markdown)) !== null) {
    const rawCode = mermaidMatch[1].trim();
    const parsed = parseMermaid(rawCode, `diag-${diagCounter++}`);
    diagrams.push(parsed);
  }

  return {
    rawMarkdown: markdown,
    goal: {
      title,
      description: goalDesc || 'AI-generated implementation plan.',
    },
    tasks,
    fileChanges,
    diagrams,
    userInstructions: userInstructions,
    sections,
  };
}
