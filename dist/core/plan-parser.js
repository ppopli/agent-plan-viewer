import { parseMermaid, extractScenariosFromPlanSections } from './mermaid-graph-bridge.js';
function cleanTextContent(text) {
    return text
        .replace(/\\`\\`\\`mermaid[\s\S]*?\\`\\`\\`/gi, '')
        .replace(/```mermaid[\s\S]*?```/gi, '')
        .replace(/^\s*---+\s*$/gm, '')
        .trim();
}
function isPhaseHeaderTaskTitle(title) {
    return /^\*\*[^*]+\*\*:?$/.test(title.trim());
}
/**
 * Toggles a task's completion status and cascades the state:
 * 1. Downward cascade: Completing or unchecking a parent task automatically marks all contiguous
 *    nested subtasks (tasks below it with `indent > targetTask.indent`, or non-phase tasks under a
 *    bold Phase header task) with the same completion status.
 * 2. Upward consistency: If all subtasks under a parent task are completed, the parent task is
 *    marked completed; if any subtask is unchecked, its parent is marked incomplete.
 */
export function toggleTaskWithCascade(tasks, taskId) {
    const targetIdx = tasks.findIndex((t) => t.id === taskId);
    if (targetIdx === -1) {
        return { tasks, newStatus: false, cascadedCount: 0 };
    }
    const targetTask = tasks[targetIdx];
    const newStatus = !targetTask.completed;
    const nextTasks = tasks.map((t) => ({ ...t }));
    nextTasks[targetIdx].completed = newStatus;
    let cascadedCount = 0;
    const targetIsPhaseHeader = targetTask.indent === 0 && isPhaseHeaderTaskTitle(targetTask.title);
    // 1. Downward cascade to all nested child/descendant subtasks
    for (let i = targetIdx + 1; i < nextTasks.length; i++) {
        const candidate = nextTasks[i];
        const isChildByIndent = candidate.indent > targetTask.indent;
        const isChildOfPhaseHeader = targetIsPhaseHeader &&
            candidate.indent === 0 &&
            !isPhaseHeaderTaskTitle(candidate.title);
        if (isChildByIndent || isChildOfPhaseHeader) {
            if (candidate.completed !== newStatus) {
                cascadedCount++;
            }
            candidate.completed = newStatus;
        }
        else {
            break;
        }
    }
    // 2. Upward hierarchical consistency (walk bottom-up over parent tasks)
    for (let i = nextTasks.length - 1; i >= 0; i--) {
        if (i === targetIdx)
            continue;
        const parent = nextTasks[i];
        const parentIsPhaseHeader = parent.indent === 0 && isPhaseHeaderTaskTitle(parent.title);
        const children = [];
        for (let j = i + 1; j < nextTasks.length; j++) {
            const cand = nextTasks[j];
            const isChildByIndent = cand.indent > parent.indent;
            const isChildOfPhase = parentIsPhaseHeader && cand.indent === 0 && !isPhaseHeaderTaskTitle(cand.title);
            if (isChildByIndent || isChildOfPhase) {
                children.push(cand);
            }
            else {
                break;
            }
        }
        if (children.length > 0) {
            parent.completed = children.every((c) => c.completed);
        }
    }
    return {
        tasks: nextTasks,
        targetTask,
        newStatus,
        cascadedCount,
    };
}
export function parsePlanMarkdown(markdown) {
    const lines = markdown.split('\n');
    let title = 'Implementation Plan';
    let goalDesc = '';
    const tasks = [];
    const fileChanges = [];
    const diagrams = [];
    let userInstructions = '';
    const sections = [];
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
    let currentContentLines = [];
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
    // Extract Goal Description from sections, cleaning out any raw mermaid blocks
    const goalSection = sections.find(s => s.heading.toLowerCase().includes('goal') ||
        s.heading.toLowerCase().includes('overview') ||
        s.heading.toLowerCase().includes('description'));
    if (goalSection && cleanTextContent(goalSection.content).length > 0) {
        goalDesc = cleanTextContent(goalSection.content);
    }
    else {
        const firstNonEmpty = sections.find(s => cleanTextContent(s.content).length > 0);
        if (firstNonEmpty) {
            goalDesc = cleanTextContent(firstNonEmpty.content);
        }
    }
    // Extract Tasks (Checklists or step lists)
    let taskCounter = 1;
    const taskRegex = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
    const numberedTaskRegex = /^(\s*)\d+\.\s+\[([ xX])\]\s+(.*)$/;
    let activePhaseHeaderSeen = false;
    for (const line of lines) {
        if (/^#{1,6}\s+/.test(line)) {
            activePhaseHeaderSeen = false;
        }
        const match = line.match(taskRegex) || line.match(numberedTaskRegex);
        if (match) {
            const normalizedSpaces = match[1].replace(/\t/g, '  ').length;
            let indent = normalizedSpaces > 0 ? Math.max(1, Math.floor(normalizedSpaces / 2)) : 0;
            const completed = match[2].toLowerCase() === 'x';
            const text = match[3].trim();
            if (indent === 0 && isPhaseHeaderTaskTitle(text)) {
                activePhaseHeaderSeen = true;
            }
            else if (indent === 0 && activePhaseHeaderSeen) {
                // Subtask listed directly beneath a bold phase header task
                indent = 1;
            }
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
        const taskSections = sections.filter(s => s.heading.toLowerCase().includes('task') ||
            s.heading.toLowerCase().includes('step') ||
            s.heading.toLowerCase().includes('plan') ||
            s.heading.toLowerCase().includes('verification'));
        for (const sec of taskSections) {
            let sectionPhaseSeen = false;
            for (const line of sec.content.split('\n')) {
                const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
                if (bulletMatch && !bulletMatch[2].startsWith('[')) {
                    const normalizedSpaces = bulletMatch[1].replace(/\t/g, '  ').length;
                    let indent = normalizedSpaces > 0 ? Math.max(1, Math.floor(normalizedSpaces / 2)) : 0;
                    const text = bulletMatch[2].trim();
                    if (indent === 0 && isPhaseHeaderTaskTitle(text)) {
                        sectionPhaseSeen = true;
                    }
                    else if (indent === 0 && sectionPhaseSeen) {
                        indent = 1;
                    }
                    tasks.push({
                        id: `task-${taskCounter++}`,
                        title: text,
                        completed: false,
                        indent,
                    });
                }
            }
        }
    }
    // Extract File Changes: [NEW], [MODIFY], [DELETE]
    for (const sec of sections) {
        const secFileMatch = sec.heading.match(/^\[(NEW|MODIFY|DELETE)\]\s+(.+)$/i);
        if (secFileMatch) {
            const type = secFileMatch[1].toUpperCase();
            const filePath = secFileMatch[2].replace(/`/g, '').trim();
            const summary = cleanTextContent(sec.content)
                .split('\n')
                .map(l => l.replace(/^\s*[-*+]\s+/, '').trim())
                .filter(Boolean)
                .join(' · ');
            fileChanges.push({
                path: filePath,
                type,
                summary: summary || undefined,
            });
        }
    }
    const bulletFileRegex = /[-*+]\s+`([^`]+)`\s*:\s*(\[(NEW|MODIFY|DELETE)\])?\s*(.*)/gi;
    let bMatch;
    while ((bMatch = bulletFileRegex.exec(markdown)) !== null) {
        const filePath = bMatch[1].replace(/`/g, '').trim();
        const type = (bMatch[3] ? bMatch[3].toUpperCase() : 'MODIFY');
        const summary = bMatch[4]?.trim();
        if (!fileChanges.some(f => f.path === filePath)) {
            fileChanges.push({ path: filePath, type, summary });
        }
    }
    // Extract Mermaid diagram blocks and bind any plan-defined scenarios
    const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g;
    let mermaidMatch;
    let diagCounter = 1;
    while ((mermaidMatch = mermaidRegex.exec(markdown)) !== null) {
        const rawCode = mermaidMatch[1].trim();
        const parsed = parseMermaid(rawCode, `diag-${diagCounter++}`);
        const planScenarios = extractScenariosFromPlanSections(sections, parsed);
        if (planScenarios.length > 0) {
            // If the plan only defined failure/edge_case scenarios, keep the diagram's primary flow first
            const hasSuccessInPlan = planScenarios.some(s => s.type === 'success');
            if (!hasSuccessInPlan && parsed.scenarios && parsed.scenarios.length > 0) {
                parsed.scenarios = [...parsed.scenarios, ...planScenarios];
            }
            else {
                parsed.scenarios = planScenarios;
            }
        }
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
