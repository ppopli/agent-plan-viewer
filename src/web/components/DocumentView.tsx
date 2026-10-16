import React, { useState, useRef, useMemo } from 'react';
import { PlanState, PlanTask } from '../../core/types.js';
import { parsePlanMarkdown } from '../../core/plan-parser.js';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  FileCode,
  FilePlus,
  FileDiff,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Edit3,
  Check,
  StickyNote,
  Database,
  Search,
  BookOpen,
  FileText,
  AlignLeft,
  Code,
  X,
  CornerDownLeft,
} from 'lucide-react';
import { CodeSection } from './CodeSection.js';
import { InlineMarkdown, BlockMarkdown } from '../utils/markdown.js';

interface DocumentViewProps {
  planState: PlanState;
  onStateChange: (newState: PlanState) => void;
}

interface IndexedLine {
  lineIndex: number;
  lineNumber: number;
  text: string;
}

interface IndexedSection {
  index: number;
  heading: string;
  level: number;
  headerLineIndex: number | null;
  startLineIndex: number;
  endLineIndex: number;
  content: string;
  lines: IndexedLine[];
}

function extractIndexedSections(rawMarkdown: string): IndexedSection[] {
  const allLines = rawMarkdown.split('\n');
  const sections: IndexedSection[] = [];

  let currentHeading = 'Overview';
  let currentLevel = 1;
  let currentHeaderLineIndex: number | null = null;
  let currentLines: IndexedLine[] = [];

  const pushCurrent = (endIdx: number) => {
    if (currentLines.length > 0 || currentHeaderLineIndex !== null) {
      const startIdx =
        currentLines.length > 0
          ? currentLines[0].lineIndex
          : currentHeaderLineIndex !== null
          ? currentHeaderLineIndex + 1
          : 0;
      sections.push({
        index: sections.length,
        heading: currentHeading,
        level: currentLevel,
        headerLineIndex: currentHeaderLineIndex,
        startLineIndex: startIdx,
        endLineIndex: endIdx,
        content: currentLines.map((l) => l.text).join('\n'),
        lines: currentLines,
      });
    }
  };

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      pushCurrent(i - 1);
      currentLevel = headerMatch[1].length;
      currentHeading = headerMatch[2].trim();
      currentHeaderLineIndex = i;
      currentLines = [];
      continue;
    }
    currentLines.push({
      lineIndex: i,
      lineNumber: i + 1,
      text: line,
    });
  }

  pushCurrent(allLines.length - 1);
  return sections;
}

export const DocumentView: React.FC<DocumentViewProps> = ({
  planState,
  onStateChange,
}) => {
  const [docMode, setDocMode] = useState<'structured' | 'lines' | 'raw'>('structured');
  const [showAllSectionsInStructured, setShowAllSectionsInStructured] = useState(false);

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const goalSnapshotRef = useRef({
    title: planState.goal.title,
    description: planState.goal.description,
  });
  const taskTitleSnapshots = useRef<Record<string, string>>({});

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [activeTaskNoteId, setActiveTaskNoteId] = useState<string | null>(null);
  const [taskNoteInput, setTaskNoteInput] = useState('');
  const [taskFilter, setTaskFilter] = useState('');

  // Inline Section Editing State
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [sectionHeadingDraft, setSectionHeadingDraft] = useState('');
  const [sectionContentDraft, setSectionContentDraft] = useState('');
  const [lineEditModeSections, setLineEditModeSections] = useState<Record<number, boolean>>({});

  // Inline Single-Line Editing State (works across both Structured Section cards & Line-by-Line View)
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editingLineDraft, setEditingLineDraft] = useState('');
  const [lineSearchQuery, setLineSearchQuery] = useState('');

  // Add New Section Modal / Inline Card State
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionHeading, setNewSectionHeading] = useState('');
  const [newSectionContent, setNewSectionContent] = useState('');

  // Raw Markdown Full Editor State
  const [rawMarkdownDraft, setRawMarkdownDraft] = useState(planState.rawMarkdown);

  const allLines = useMemo(() => planState.rawMarkdown.split('\n'), [planState.rawMarkdown]);
  const indexedSections = useMemo(
    () => extractIndexedSections(planState.rawMarkdown),
    [planState.rawMarkdown]
  );

  const completedCount = planState.tasks.filter((t) => t.completed).length;
  const totalCount = planState.tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const filteredTasks = planState.tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(taskFilter.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(taskFilter.toLowerCase()))
  );

  const schemaSections = (planState.sections || []).filter((s) => {
    const isFileChange = /^\[(NEW|MODIFY|DELETE)\]/i.test(s.heading.trim());
    const matchesKeyword = /schema|database|data model|entity|table|models/i.test(s.heading);
    return !isFileChange && matchesKeyword && s.content.trim().length > 0;
  });

  // Sections shown in the Interactive Document Sections card
  const displayedIndexedSections = useMemo(() => {
    if (showAllSectionsInStructured) {
      return indexedSections;
    }
    const filtered = indexedSections.filter((s) => {
      const h = s.heading.trim();
      const isTitle = h === planState.goal.title && s.index === 0;
      const isGoal = /^(goal|overview|description)/i.test(h);
      const isTasks = /^(tasks|checklist|implementation steps)$/i.test(h);
      const isFileChange =
        /^\[(NEW|MODIFY|DELETE)\]/i.test(h) ||
        /^proposed (file )?changes$/i.test(h) ||
        /^component:/i.test(h);
      const isSchema = /schema|database|data model|entity|table|models/i.test(h);
      const isFeedback = /user feedback & review notes/i.test(h);
      const cleaned = s.content
        .replace(/```mermaid[\s\S]*?```/gi, '')
        .replace(/^\s*---+\s*$/gm, '')
        .trim();
      return !isTitle && !isGoal && !isTasks && !isFileChange && !isSchema && !isFeedback && cleaned.length > 0;
    });
    // If this is a general Markdown file where filtering hid everything, show all sections automatically!
    return filtered.length > 0 ? filtered : indexedSections;
  }, [indexedSections, planState.goal.title, showAllSectionsInStructured]);

  // Helper to append automatic instruction notes to userInstructions
  const appendAutoInstruction = (note: string, baseState = planState): string => {
    const current = (baseState.userInstructions || '').trim();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formatted = `[${timestamp}] ${note}`;
    if (!current) return formatted;
    return `${current}\n${formatted}`;
  };

  // Synchronize any rawMarkdown edit (line edit, section edit, raw edit) back into PlanState
  const applyMarkdownUpdate = (updatedRawMarkdown: string, auditLogMessage: string) => {
    const freshlyParsed = parsePlanMarkdown(updatedRawMarkdown);
    // Preserve task notes where titles match
    const existingNotesByTitle = new Map(
      planState.tasks.filter((t) => t.notes).map((t) => [t.title, t.notes])
    );
    const mergedTasks = freshlyParsed.tasks.map((t) => ({
      ...t,
      notes: existingNotesByTitle.get(t.title) || t.notes,
    }));

    const updatedInstructions = appendAutoInstruction(auditLogMessage);
    setRawMarkdownDraft(updatedRawMarkdown);

    onStateChange({
      ...freshlyParsed,
      tasks: mergedTasks,
      userInstructions: updatedInstructions,
    });
  };

  // Start editing a specific line (0-based lineIndex)
  const startEditingLine = (lineIndex: number) => {
    setEditingLineIndex(lineIndex);
    setEditingLineDraft(allLines[lineIndex] ?? '');
  };

  // Save single line edit
  const saveLineEdit = (lineIndex: number, sectionHeading?: string) => {
    const originalLine = allLines[lineIndex] ?? '';
    if (editingLineDraft === originalLine) {
      setEditingLineIndex(null);
      return;
    }
    const nextLines = [...allLines];
    nextLines[lineIndex] = editingLineDraft;
    const updatedRaw = nextLines.join('\n');
    const preview =
      editingLineDraft.trim().length > 60
        ? `${editingLineDraft.trim().slice(0, 60)}...`
        : editingLineDraft.trim() || '(blank line)';
    const contextLabel = sectionHeading ? ` in "${sectionHeading}"` : '';
    applyMarkdownUpdate(
      updatedRaw,
      `Edited line L${lineIndex + 1}${contextLabel}: "${preview}"`
    );
    setEditingLineIndex(null);
  };

  // Insert a new line right below lineIndex
  const insertLineBelow = (lineIndex: number, sectionHeading?: string) => {
    const nextLines = [...allLines];
    nextLines.splice(lineIndex + 1, 0, '');
    const updatedRaw = nextLines.join('\n');
    const contextLabel = sectionHeading ? ` in "${sectionHeading}"` : '';
    applyMarkdownUpdate(updatedRaw, `Inserted new line at L${lineIndex + 2}${contextLabel}`);
    setEditingLineIndex(lineIndex + 1);
    setEditingLineDraft('');
  };

  // Delete a specific line
  const deleteLineAt = (lineIndex: number, sectionHeading?: string) => {
    const removedText = (allLines[lineIndex] || '').trim();
    const nextLines = [...allLines];
    nextLines.splice(lineIndex, 1);
    const updatedRaw = nextLines.join('\n');
    const contextLabel = sectionHeading ? ` in "${sectionHeading}"` : '';
    applyMarkdownUpdate(
      updatedRaw,
      `Removed line L${lineIndex + 1}${contextLabel}${removedText ? ` ("${removedText.slice(0, 45)}")` : ''}`
    );
    if (editingLineIndex === lineIndex) {
      setEditingLineIndex(null);
    }
  };

  // Start editing an entire section
  const startEditingSection = (sec: IndexedSection) => {
    setEditingSectionIndex(sec.index);
    setSectionHeadingDraft(sec.heading);
    setSectionContentDraft(sec.content);
  };

  // Save full section edit
  const saveSectionEdit = (sec: IndexedSection) => {
    const nextLines = [...allLines];
    const replacementLines: string[] = [];
    if (sec.headerLineIndex !== null) {
      replacementLines.push(`${'#'.repeat(sec.level)} ${sectionHeadingDraft.trim() || sec.heading}`);
    }
    replacementLines.push(...sectionContentDraft.split('\n'));

    const replaceStart = sec.headerLineIndex !== null ? sec.headerLineIndex : sec.startLineIndex;
    const replaceCount = Math.max(0, sec.endLineIndex - replaceStart + 1);
    nextLines.splice(replaceStart, replaceCount, ...replacementLines);

    const updatedRaw = nextLines.join('\n');
    applyMarkdownUpdate(
      updatedRaw,
      `Updated section "${sectionHeadingDraft.trim() || sec.heading}"`
    );
    setEditingSectionIndex(null);
  };

  // Delete an entire section
  const deleteSection = (sec: IndexedSection) => {
    const nextLines = [...allLines];
    const replaceStart = sec.headerLineIndex !== null ? sec.headerLineIndex : sec.startLineIndex;
    const replaceCount = Math.max(0, sec.endLineIndex - replaceStart + 1);
    nextLines.splice(replaceStart, replaceCount);
    const updatedRaw = nextLines.join('\n');
    applyMarkdownUpdate(updatedRaw, `Removed section "${sec.heading}"`);
    if (editingSectionIndex === sec.index) {
      setEditingSectionIndex(null);
    }
  };

  // Add a brand new section to the document
  const handleAddNewSection = () => {
    if (!newSectionHeading.trim()) return;
    const heading = newSectionHeading.trim();
    const content = newSectionContent.trim() || 'Add section details here...';
    const updatedRaw = `${planState.rawMarkdown.trimEnd()}\n\n## ${heading}\n\n${content}\n`;
    applyMarkdownUpdate(updatedRaw, `Added new section "${heading}"`);
    setNewSectionHeading('');
    setNewSectionContent('');
    setIsAddingSection(false);
  };

  // Commit goal modifications to user instructions audit stream
  const commitGoalEdits = () => {
    let instructions = planState.userInstructions || '';
    let changed = false;
    let updatedRaw = planState.rawMarkdown;

    if (planState.goal.title !== goalSnapshotRef.current.title && planState.goal.title.trim()) {
      instructions = appendAutoInstruction(
        `Updated plan goal title: "${planState.goal.title.trim()}"`,
        { ...planState, userInstructions: instructions }
      );
      if (/^#\s+[^\n]+/m.test(updatedRaw)) {
        updatedRaw = updatedRaw.replace(/^#\s+[^\n]+/m, `# ${planState.goal.title.trim()}`);
      }
      changed = true;
    }

    if (planState.goal.description !== goalSnapshotRef.current.description && planState.goal.description.trim()) {
      const descSummary = planState.goal.description.trim().length > 60
        ? `${planState.goal.description.trim().substring(0, 60)}...`
        : planState.goal.description.trim();
      instructions = appendAutoInstruction(
        `Updated architectural scope: "${descSummary}"`,
        { ...planState, userInstructions: instructions }
      );
      const goalHeadingRegex = /^(#{1,3}\s+(?:Goal|Overview|Description)[^\n]*\n)([\s\S]*?)(?=\n#{1,3}\s+|$)/im;
      if (goalHeadingRegex.test(updatedRaw)) {
        updatedRaw = updatedRaw.replace(goalHeadingRegex, `$1${planState.goal.description.trim()}\n`);
      }
      changed = true;
    }

    if (changed) {
      goalSnapshotRef.current = {
        title: planState.goal.title,
        description: planState.goal.description,
      };
      onStateChange({
        ...planState,
        rawMarkdown: updatedRaw,
        userInstructions: instructions,
      });
    }
  };

  const handleToggleGoalEdit = () => {
    if (isEditingGoal) {
      commitGoalEdits();
      setIsEditingGoal(false);
    } else {
      goalSnapshotRef.current = {
        title: planState.goal.title,
        description: planState.goal.description,
      };
      setIsEditingGoal(true);
    }
  };

  // Handle task checkbox toggle
  const toggleTask = (taskId: string) => {
    const targetTask = planState.tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    const newStatus = !targetTask.completed;
    const nextTasks = planState.tasks.map((t) =>
      t.id === taskId ? { ...t, completed: newStatus } : t
    );

    const logMsg = newStatus
      ? `Completed task: "${targetTask.title}"`
      : `Re-opened task: "${targetTask.title}"`;

    const updatedInstructions = appendAutoInstruction(logMsg);

    onStateChange({
      ...planState,
      tasks: nextTasks,
      userInstructions: updatedInstructions,
    });
  };

  // Handle task text edit
  const updateTaskTitle = (taskId: string, newTitle: string) => {
    const nextTasks = planState.tasks.map((t) =>
      t.id === taskId ? { ...t, title: newTitle } : t
    );

    onStateChange({
      ...planState,
      tasks: nextTasks,
    });
  };

  const handleTaskTitleBlur = (taskId: string, currentTitle: string) => {
    const original = taskTitleSnapshots.current[taskId];
    if (original !== undefined && original !== currentTitle && currentTitle.trim()) {
      const updatedInstructions = appendAutoInstruction(
        `Renamed task: "${original}" -> "${currentTitle.trim()}"`
      );
      taskTitleSnapshots.current[taskId] = currentTitle.trim();
      onStateChange({
        ...planState,
        userInstructions: updatedInstructions,
      });
    }
  };

  // Save task note
  const saveTaskNote = (taskId: string) => {
    if (!taskNoteInput.trim()) {
      setActiveTaskNoteId(null);
      return;
    }
    const targetTask = planState.tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    const note = taskNoteInput.trim();
    const nextTasks = planState.tasks.map((t) =>
      t.id === taskId ? { ...t, notes: note } : t
    );

    const logMsg = `Task note for "${targetTask.title}": ${note}`;
    const updatedInstructions = appendAutoInstruction(logMsg);

    onStateChange({
      ...planState,
      tasks: nextTasks,
      userInstructions: updatedInstructions,
    });

    setActiveTaskNoteId(null);
    setTaskNoteInput('');
  };

  // Add new task
  const addTask = () => {
    if (!newTaskText.trim()) return;
    const newTask: PlanTask = {
      id: `task-${Date.now()}`,
      title: newTaskText.trim(),
      completed: false,
      indent: 0,
    };

    const logMsg = `Added new task: "${newTaskText.trim()}"`;
    const updatedInstructions = appendAutoInstruction(logMsg);

    onStateChange({
      ...planState,
      tasks: [...planState.tasks, newTask],
      userInstructions: updatedInstructions,
    });
    setNewTaskText('');
  };

  // Delete task
  const deleteTask = (taskId: string) => {
    const targetTask = planState.tasks.find((t) => t.id === taskId);
    const nextTasks = planState.tasks.filter((t) => t.id !== taskId);

    const logMsg = targetTask ? `Removed task: "${targetTask.title}"` : 'Removed task';
    const updatedInstructions = appendAutoInstruction(logMsg);

    onStateChange({
      ...planState,
      tasks: nextTasks,
      userInstructions: updatedInstructions,
    });
  };

  // Move task
  const moveTask = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= planState.tasks.length) return;
    const nextTasks = [...planState.tasks];
    const [moved] = nextTasks.splice(idx, 1);
    nextTasks.splice(targetIdx, 0, moved);

    const logMsg = `Reordered task: "${moved.title}" to position #${targetIdx + 1}`;
    const updatedInstructions = appendAutoInstruction(logMsg);

    onStateChange({
      ...planState,
      tasks: nextTasks,
      userInstructions: updatedInstructions,
    });
  };

  // Update Goal
  const updateGoal = (field: 'title' | 'description', value: string) => {
    onStateChange({
      ...planState,
      goal: {
        ...planState.goal,
        [field]: value,
      },
    });
  };

  // Render an interactive line row used in both Section Line-Edit mode and Universal Line-by-Line View
  const renderInteractiveLineRow = (lineObj: IndexedLine, sectionHeading?: string) => {
    const isEditingThisLine = editingLineIndex === lineObj.lineIndex;
    const trimmed = lineObj.text.trim();
    const isHeadingLine = /^#{1,6}\s+/.test(trimmed);
    const isCodeFence = /^```/.test(trimmed);

    if (isEditingThisLine) {
      return (
        <div
          key={lineObj.lineIndex}
          className="flex items-center gap-2 bg-slate-900 border border-emerald-500/80 rounded-lg px-2.5 py-1.5 my-1 shadow-lg"
        >
          <span className="text-[10px] font-mono text-emerald-400 select-none w-9 shrink-0">
            L{lineObj.lineNumber}
          </span>
          <input
            type="text"
            value={editingLineDraft}
            autoFocus
            onChange={(e) => setEditingLineDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveLineEdit(lineObj.lineIndex, sectionHeading);
              } else if (e.key === 'Escape') {
                setEditingLineIndex(null);
              }
            }}
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
          />
          <button
            onClick={() => saveLineEdit(lineObj.lineIndex, sectionHeading)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shrink-0"
            title="Save line (Enter)"
          >
            <Check className="w-3 h-3" />
            <span>Save</span>
          </button>
          <button
            onClick={() => insertLineBelow(lineObj.lineIndex, sectionHeading)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 shrink-0"
            title="Insert new line below"
          >
            + Line
          </button>
          <button
            onClick={() => deleteLineAt(lineObj.lineIndex, sectionHeading)}
            className="p-1 rounded text-slate-400 hover:text-rose-400 shrink-0"
            title="Delete this line"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setEditingLineIndex(null)}
            className="p-1 rounded text-slate-400 hover:text-white shrink-0"
            title="Cancel (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div
        key={lineObj.lineIndex}
        onClick={() => startEditingLine(lineObj.lineIndex)}
        title={`Click to edit line L${lineObj.lineNumber} inline`}
        className={`group flex items-start gap-2.5 px-2.5 py-1 rounded-lg cursor-text border border-transparent hover:border-slate-700/80 hover:bg-slate-900/90 transition ${
          isHeadingLine ? 'bg-slate-900/50 font-semibold text-emerald-300 mt-1' : ''
        }`}
      >
        <span className="text-[10px] font-mono text-slate-600 group-hover:text-emerald-400 select-none w-9 shrink-0 pt-0.5 transition">
          L{lineObj.lineNumber}
        </span>
        <div className="flex-1 min-w-0 text-xs leading-relaxed">
          {trimmed.length === 0 ? (
            <span className="text-slate-700 italic select-none text-[11px]">(empty line — click to edit)</span>
          ) : isHeadingLine ? (
            <span className="text-emerald-300 font-bold">
              <InlineMarkdown content={trimmed.replace(/^#{1,6}\s+/, '')} />
            </span>
          ) : isCodeFence ? (
            <span className="font-mono text-amber-400/80">{lineObj.text}</span>
          ) : (
            <div className="text-slate-200">
              <InlineMarkdown content={lineObj.text} />
            </div>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition">
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEditingLine(lineObj.lineIndex);
            }}
            className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-emerald-400 border border-slate-700 flex items-center gap-1"
          >
            <Edit3 className="w-2.5 h-2.5" />
            <span>Edit Line</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              insertLineBelow(lineObj.lineIndex, sectionHeading);
            }}
            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700"
            title="Insert line below"
          >
            + Line
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6 animate-in fade-in duration-150">
      {/* Universal Markdown & Inline Editor Mode Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 px-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-200">Document & Markdown Editor Mode:</span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            View & edit any section or individual line inline
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setDocMode('structured')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              docMode === 'structured'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Structured & Section Editor</span>
          </button>
          <button
            onClick={() => setDocMode('lines')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              docMode === 'lines'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>Line-by-Line Inline Editor ({allLines.length} lines)</span>
          </button>
          <button
            onClick={() => {
              setRawMarkdownDraft(planState.rawMarkdown);
              setDocMode('raw');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              docMode === 'raw'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Raw Markdown Source</span>
          </button>
        </div>
      </div>

      {/* MODE 2: Universal Line-by-Line Inline Markdown Editor */}
      {docMode === 'lines' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <AlignLeft className="w-5 h-5 text-emerald-400" />
                <span>Universal Line-by-Line Markdown Editor</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any line (`L1`–`L{allLines.length}`) to edit it inline, insert new lines, or remove lines. Every edit syncs with Undo/Redo & Agent Feedback.
              </p>
            </div>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={lineSearchQuery}
                onChange={(e) => setLineSearchQuery(e.target.value)}
                placeholder="Search lines by text or L#..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 divide-y divide-slate-900/60 max-h-[680px] overflow-y-auto">
            {allLines
              .map((text, idx) => ({ lineIndex: idx, lineNumber: idx + 1, text }))
              .filter((item) => {
                if (!lineSearchQuery.trim()) return true;
                const q = lineSearchQuery.toLowerCase().trim();
                return (
                  item.text.toLowerCase().includes(q) ||
                  `l${item.lineNumber}` === q
                );
              })
              .map((lineObj) => renderInteractiveLineRow(lineObj))}
          </div>
        </div>
      )}

      {/* MODE 3: Raw Markdown Source Editor */}
      {docMode === 'raw' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-emerald-400" />
                <span>Full Document Markdown Source Editor</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Edit any part of the raw Markdown file directly and click Apply to synchronize sections, tasks, and diagrams.
              </p>
            </div>
            <button
              onClick={() => {
                if (rawMarkdownDraft !== planState.rawMarkdown) {
                  applyMarkdownUpdate(rawMarkdownDraft, 'Updated markdown document in Raw Source Editor');
                }
                setDocMode('structured');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow transition"
            >
              <Check className="w-4 h-4" />
              <span>Apply Markdown Changes</span>
            </button>
          </div>
          <textarea
            value={rawMarkdownDraft}
            onChange={(e) => setRawMarkdownDraft(e.target.value)}
            rows={24}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed resize-y"
          />
        </div>
      )}

      {/* MODE 1: Structured Plan & Interactive Section / Line Editor */}
      {docMode === 'structured' && (
        <>
          {/* 1. Execution Target: Rich HTML Card with inline edit toggle */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>Execution Target & Architectural Scope</span>
              </div>

              <button
                onClick={handleToggleGoalEdit}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
              >
                {isEditingGoal ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Edit3 className="w-3.5 h-3.5" />}
                <span>{isEditingGoal ? 'Done Editing' : 'Edit Target'}</span>
              </button>
            </div>

            {isEditingGoal ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={planState.goal.title}
                  onChange={(e) => updateGoal('title', e.target.value)}
                  onBlur={commitGoalEdits}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitGoalEdits();
                      setIsEditingGoal(false);
                    }
                  }}
                  className="text-xl font-bold bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white w-full focus:outline-none focus:border-emerald-500"
                  placeholder="Document or Plan Title"
                />
                <textarea
                  value={planState.goal.description}
                  onChange={(e) => updateGoal('description', e.target.value)}
                  onBlur={commitGoalEdits}
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-y"
                  placeholder="Describe the overview or scope..."
                />
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
                  <InlineMarkdown content={planState.goal.title} />
                </h1>
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                  <BlockMarkdown content={planState.goal.description || 'Document overview.'} />
                </div>
              </div>
            )}
          </div>

          {/* 2. Interactive Tasks & Inline Comments */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-semibold text-white">Interactive Tasks & Steps</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-mono border border-slate-700">
                  {completedCount} / {totalCount} completed ({progressPercent}%)
                </span>
              </div>
              <span className="text-xs text-slate-400">
                Click any task to edit · Edits & notes auto-append to Agent Feedback
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 mb-4">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Task Filter / Search */}
            {totalCount > 4 && (
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={taskFilter}
                  onChange={(e) => setTaskFilter(e.target.value)}
                  placeholder="Filter tasks by name or note..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Task List */}
            <div className="space-y-2 mb-4">
              {filteredTasks.map((task, idx) => {
                const isPhaseHeader = task.indent === 0 && /^\*\*.*\*\*$/.test(task.title.trim());
                const isEditingThisTask = editingTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className={`group rounded-xl border transition ${
                      task.completed
                        ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                        : isPhaseHeader
                        ? 'bg-slate-800/75 border-slate-700 hover:border-slate-600'
                        : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
                    }`}
                    style={{ marginLeft: `${task.indent * 20}px` }}
                  >
                    <div className="flex items-center gap-3 p-2.5">
                      <button
                        onClick={() => toggleTask(task.id)}
                        className="text-slate-400 hover:text-emerald-400 transition shrink-0"
                        title="Toggle task completion"
                      >
                        {task.completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      {isEditingThisTask ? (
                        <input
                          type="text"
                          value={task.title}
                          autoFocus
                          onFocus={() => {
                            taskTitleSnapshots.current[task.id] = task.title;
                          }}
                          onChange={(e) => updateTaskTitle(task.id, e.target.value)}
                          onBlur={() => {
                            handleTaskTitleBlur(task.id, task.title);
                            setEditingTaskId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className={`flex-1 bg-slate-950/80 px-2 py-0.5 rounded text-sm focus:outline-none border border-emerald-500 transition ${
                            task.completed ? 'line-through text-slate-500' : 'text-slate-100'
                          }`}
                        />
                      ) : (
                        <div
                          onClick={() => {
                            taskTitleSnapshots.current[task.id] = task.title;
                            setEditingTaskId(task.id);
                          }}
                          title="Click to edit task text"
                          className={`flex-1 text-sm cursor-text py-0.5 border-b border-transparent hover:border-slate-700 transition leading-relaxed ${
                            task.completed ? 'line-through text-slate-500' : 'text-slate-200'
                          }`}
                        >
                          <InlineMarkdown content={task.title} />
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setActiveTaskNoteId(activeTaskNoteId === task.id ? null : task.id);
                            setTaskNoteInput(task.notes || '');
                          }}
                          title="Add inline feedback note for agent on this task"
                          className={`p-1.5 rounded-lg text-xs transition ${
                            task.notes
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'text-slate-400 hover:text-indigo-300 hover:bg-slate-700'
                          }`}
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                        </button>

                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
                          <button
                            onClick={() => {
                              taskTitleSnapshots.current[task.id] = task.title;
                              setEditingTaskId(task.id);
                            }}
                            title="Edit task title"
                            className="p-1 rounded text-slate-400 hover:text-white"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveTask(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveTask(idx, 'down')}
                            disabled={idx === planState.tasks.length - 1}
                            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Existing note or inline note editor */}
                    {(task.notes || activeTaskNoteId === task.id) && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-800/60 bg-slate-950/40 rounded-b-xl">
                        {activeTaskNoteId === task.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={taskNoteInput}
                              onChange={(e) => setTaskNoteInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveTaskNote(task.id)}
                              placeholder="Add specific instructions for this task..."
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-indigo-500"
                              autoFocus
                            />
                            <button
                              onClick={() => saveTaskNote(task.id)}
                              className="px-2.5 py-1 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setActiveTaskNoteId(null)}
                              className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-indigo-300">
                            <span>
                              <strong className="font-mono">Note:</strong>{' '}
                              <InlineMarkdown content={task.notes || ''} />
                            </span>
                            <button
                              onClick={() => {
                                setActiveTaskNoteId(task.id);
                                setTaskNoteInput(task.notes || '');
                              }}
                              className="text-[11px] text-slate-400 hover:text-white ml-2 shrink-0"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Task Input */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800">
              <input
                type="text"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                placeholder="Add new task or milestone step (press Enter)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={addTask}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Task</span>
              </button>
            </div>
          </div>

          {/* 3. Proposed File Changes */}
          {planState.fileChanges.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <FileCode className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-semibold text-white">Impacted Files & Scope</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {planState.fileChanges.length} files
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {planState.fileChanges.map((file, idx) => {
                  const badgeStyle =
                    file.type === 'NEW'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : file.type === 'DELETE'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/30';

                  return (
                    <div
                      key={idx}
                      className="flex flex-col justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 truncate">
                          {file.type === 'NEW' && <FilePlus className="w-4 h-4 text-emerald-400 shrink-0" />}
                          {file.type === 'MODIFY' && <FileDiff className="w-4 h-4 text-blue-400 shrink-0" />}
                          {file.type === 'DELETE' && <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />}
                          <span className="text-xs font-mono font-semibold text-slate-100 truncate">
                            {file.path.replace(/`/g, '')}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border shrink-0 ${badgeStyle}`}
                        >
                          {file.type}
                        </span>
                      </div>
                      {file.summary && (
                        <div className="text-xs text-slate-400 pl-6 leading-relaxed">
                          <InlineMarkdown content={file.summary} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Database Schema & Data Models Section */}
          {schemaSections.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-amber-400" />
                  <h2 className="text-base font-semibold text-white">Database Schema & Data Models</h2>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-mono border border-amber-500/20">
                  {schemaSections.length} Schema Definitions
                </span>
              </div>

              <div className="space-y-4">
                {schemaSections.map((sec, idx) => (
                  <CodeSection
                    key={idx}
                    content={sec.content}
                    title={sec.heading}
                    defaultLang="sql"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 4. Interactive Markdown Sections & Inline Line/Section Editor */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-400" />
                <h2 className="text-base font-semibold text-white">
                  Document Sections & Inline Editor
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-300 font-mono border border-teal-500/20">
                  {displayedIndexedSections.length} Sections
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAllSectionsInStructured((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    showAllSectionsInStructured
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {showAllSectionsInStructured
                    ? `Showing All Sections (${indexedSections.length})`
                    : `Show All Document Sections (${indexedSections.length})`}
                </button>
                <button
                  onClick={() => setIsAddingSection(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Section</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Edit any section as a block or toggle <strong>Line-by-Line Edit</strong> on any section card to click and edit individual lines inline.
            </p>

            {/* Add New Section Inline Form */}
            {isAddingSection && (
              <div className="bg-slate-950 border border-emerald-500/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    New Markdown Section
                  </span>
                  <button
                    onClick={() => setIsAddingSection(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  value={newSectionHeading}
                  onChange={(e) => setNewSectionHeading(e.target.value)}
                  placeholder="Section Heading (e.g. Security Considerations)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
                <textarea
                  value={newSectionContent}
                  onChange={(e) => setNewSectionContent(e.target.value)}
                  rows={4}
                  placeholder="Write markdown content, bullet points, or tables..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsAddingSection(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNewSection}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Insert Section</span>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {displayedIndexedSections.map((sec) => {
                const isEditingFullSection = editingSectionIndex === sec.index;
                const isLineEditOn = Boolean(lineEditModeSections[sec.index]);
                const cleaned = sec.content
                  .replace(/```mermaid[\s\S]*?```/gi, '')
                  .replace(/^\s*---+\s*$/gm, '')
                  .trim();

                return (
                  <div
                    key={sec.index}
                    className="bg-slate-950/55 border border-slate-800/90 rounded-xl p-4 space-y-3 hover:border-slate-700/80 transition"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          H{sec.level} · L{(sec.headerLineIndex ?? sec.startLineIndex) + 1}
                        </span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                          <InlineMarkdown content={sec.heading} />
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            setLineEditModeSections((prev) => ({
                              ...prev,
                              [sec.index]: !prev[sec.index],
                            }))
                          }
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                            isLineEditOn
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
                          }`}
                          title="Toggle inline click-to-edit on every line in this section"
                        >
                          <AlignLeft className="w-3 h-3" />
                          <span>{isLineEditOn ? 'Line Edit Active' : 'Edit Lines Inline'}</span>
                        </button>

                        {isEditingFullSection ? (
                          <button
                            onClick={() => saveSectionEdit(sec)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                          >
                            <Check className="w-3 h-3" />
                            <span>Save Section</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditingSection(sec)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Section</span>
                          </button>
                        )}

                        <button
                          onClick={() => deleteSection(sec)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition"
                          title="Delete section"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingFullSection ? (
                      <div className="space-y-2.5 pt-1">
                        <input
                          type="text"
                          value={sectionHeadingDraft}
                          onChange={(e) => setSectionHeadingDraft(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                          placeholder="Section Heading"
                        />
                        <textarea
                          value={sectionContentDraft}
                          onChange={(e) => setSectionContentDraft(e.target.value)}
                          rows={Math.max(4, Math.min(16, sec.lines.length + 2))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 resize-y leading-relaxed"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingSectionIndex(null)}
                            className="px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveSectionEdit(sec)}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save Section</span>
                          </button>
                        </div>
                      </div>
                    ) : isLineEditOn ? (
                      <div className="divide-y divide-slate-900/50 bg-slate-950/80 rounded-lg p-2 border border-slate-800/70">
                        {sec.lines.map((lineObj) =>
                          renderInteractiveLineRow(lineObj, sec.heading)
                        )}
                      </div>
                    ) : (
                      <div
                        onDoubleClick={() =>
                          setLineEditModeSections((prev) => ({ ...prev, [sec.index]: true }))
                        }
                        title="Double-click to edit individual lines, or click 'Edit Lines Inline' / 'Edit Section'"
                      >
                        <BlockMarkdown content={cleaned || sec.content} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 5. Agent Instructions & Direct Feedback with Live Auto-population */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Agent Instructions & Direct Feedback</h2>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono">
            Auto-populates from task, section & inline line edits
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          This section is automatically updated as you edit lines, sections, or tasks above. You can also type additional instructions directly below:
        </p>
        <textarea
          value={planState.userInstructions || ''}
          onChange={(e) => onStateChange({ ...planState, userInstructions: e.target.value })}
          rows={5}
          placeholder="e.g. Ensure connection pooling is configured. Use Redis distributed lock..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition leading-relaxed"
        />
      </div>
    </div>
  );
};
