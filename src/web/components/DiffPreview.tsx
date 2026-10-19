import React, { useState, useMemo } from 'react';
import { PlanState } from '../../core/types.js';
import { parsePlanMarkdown } from '../../core/plan-parser.js';
import { calculatePlanDiff, formatAgentInstructions } from '../../core/plan-serializer.js';
import {
  GitCompare,
  Terminal,
  Eye,
  Code,
  Plus,
  Minus,
  RefreshCw,
  Sparkles,
  Edit2,
  Check,
  X,
  FileText,
  MessageSquarePlus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { marked } from 'marked';
import { InlineMarkdown, BlockMarkdown } from '../utils/markdown.js';

interface DiffPreviewProps {
  initialState: PlanState;
  presentState: PlanState;
  planPath: string;
  onStateChange?: (newState: PlanState) => void;
}

interface IndexedSection {
  index: number;
  heading: string;
  level: number;
  headerLineIndex: number | null;
  startLineIndex: number;
  endLineIndex: number;
  content: string;
}

function extractIndexedSections(rawMarkdown: string): IndexedSection[] {
  const allLines = rawMarkdown.split('\n');
  const sections: IndexedSection[] = [];

  let currentHeading = 'Overview';
  let currentLevel = 1;
  let currentHeaderLineIndex: number | null = null;
  let currentLines: { lineIndex: number; text: string }[] = [];

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
    currentLines.push({ lineIndex: i, text: line });
  }

  pushCurrent(allLines.length - 1);
  return sections;
}

export const DiffPreview: React.FC<DiffPreviewProps> = ({
  initialState,
  presentState,
  planPath,
  onStateChange,
}) => {
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');

  // Goal inline editing state
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalTitleDraft, setGoalTitleDraft] = useState(presentState.goal.title);
  const [goalDescDraft, setGoalDescDraft] = useState(presentState.goal.description);

  // Section inline editing state
  const [editingSecIdx, setEditingSecIdx] = useState<number | null>(null);
  const [secHeadingDraft, setSecHeadingDraft] = useState('');
  const [secContentDraft, setSecContentDraft] = useState('');
  const [expandedSecIndices, setExpandedSecIndices] = useState<Record<number, boolean>>({});

  // Add new section state
  const [addingSection, setAddingSection] = useState(false);
  const [newSecHeading, setNewSecHeading] = useState('');
  const [newSecContent, setNewSecContent] = useState('');

  // Agent instructions / review notes state
  const [instructionsDraft, setInstructionsDraft] = useState(presentState.userInstructions || '');
  const [instructionsSavedBadge, setInstructionsSavedBadge] = useState(false);

  const indexedSections = useMemo(
    () => extractIndexedSections(presentState.rawMarkdown),
    [presentState.rawMarkdown]
  );

  const editableSections = useMemo(
    () =>
      indexedSections.filter((s) => {
        const h = s.heading.trim();
        const isTitle = h === presentState.goal.title.trim() && s.content.trim().length === 0;
        const isDiagram =
          /```mermaid/i.test(s.content) ||
          /^(architecture|system\s+architecture|architecture\s+diagram|diagram)$/i.test(h);
        const isFeedback = /user feedback & review notes/i.test(h);
        return !isTitle && !isDiagram && !isFeedback;
      }),
    [indexedSections, presentState.goal.title]
  );

  const diff = calculatePlanDiff(initialState, presentState);

  const sampleResult = {
    status: 'APPROVED' as const,
    planPath,
    diff,
    userInstructions: presentState.userInstructions,
    updatedMarkdown: '',
  };

  const agentPrompt = formatAgentInstructions(sampleResult);
  const renderedHtml = marked.parse(agentPrompt) as string;

  const appendAutoInstruction = (note: string, currentInstructions?: string): string => {
    const current = (currentInstructions ?? presentState.userInstructions ?? '').trim();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formatted = `[${timestamp}] ${note}`;
    if (!current) return formatted;
    return `${current}\n${formatted}`;
  };

  const applyMarkdownUpdate = (updatedRawMarkdown: string, auditLogMessage: string) => {
    if (!onStateChange) return;
    const freshlyParsed = parsePlanMarkdown(updatedRawMarkdown);
    const existingNotesByTitle = new Map(
      presentState.tasks.filter((t) => t.notes).map((t) => [t.title, t.notes])
    );
    const mergedTasks = freshlyParsed.tasks.map((t) => ({
      ...t,
      notes: existingNotesByTitle.get(t.title) || t.notes,
    }));

    const updatedInstructions = appendAutoInstruction(auditLogMessage);
    setInstructionsDraft(updatedInstructions);

    onStateChange({
      ...freshlyParsed,
      diagrams: presentState.diagrams.length > 0 ? presentState.diagrams : freshlyParsed.diagrams,
      tasks: mergedTasks,
      userInstructions: updatedInstructions,
    });
  };

  const handleSaveGoal = () => {
    if (!onStateChange) return;
    const updatedInstructions = appendAutoInstruction('Updated Goal & Scope in Diff & Prompt');
    setInstructionsDraft(updatedInstructions);
    onStateChange({
      ...presentState,
      goal: {
        ...presentState.goal,
        title: goalTitleDraft.trim() || presentState.goal.title,
        description: goalDescDraft,
      },
      userInstructions: updatedInstructions,
    });
    setEditingGoal(false);
  };

  const startEditSection = (sec: IndexedSection) => {
    setEditingSecIdx(sec.index);
    setSecHeadingDraft(sec.heading);
    setSecContentDraft(sec.content);
    setExpandedSecIndices((prev) => ({ ...prev, [sec.index]: true }));
  };

  const handleSaveSection = (sec: IndexedSection) => {
    const allLines = presentState.rawMarkdown.split('\n');
    const replacementLines: string[] = [];
    if (sec.headerLineIndex !== null) {
      replacementLines.push(`${'#'.repeat(sec.level)} ${secHeadingDraft.trim() || sec.heading}`);
    }
    replacementLines.push(...secContentDraft.split('\n'));

    const replaceStart = sec.headerLineIndex !== null ? sec.headerLineIndex : sec.startLineIndex;
    const replaceCount = Math.max(0, sec.endLineIndex - replaceStart + 1);
    allLines.splice(replaceStart, replaceCount, ...replacementLines);

    const updatedRaw = allLines.join('\n');
    applyMarkdownUpdate(
      updatedRaw,
      `Updated section "${secHeadingDraft.trim() || sec.heading}"`
    );
    setEditingSecIdx(null);
  };

  const handleAddSection = () => {
    if (!newSecHeading.trim()) return;
    const heading = newSecHeading.trim();
    const content = newSecContent.trim() || 'Add section details here...';
    const updatedRaw = `${presentState.rawMarkdown.trim()}\n\n## ${heading}\n\n${content}\n`;
    applyMarkdownUpdate(updatedRaw, `Added new section "${heading}"`);
    setNewSecHeading('');
    setNewSecContent('');
    setAddingSection(false);
  };

  const handleSaveInstructions = () => {
    if (!onStateChange) return;
    onStateChange({
      ...presentState,
      userInstructions: instructionsDraft,
    });
    setInstructionsSavedBadge(true);
    setTimeout(() => setInstructionsSavedBadge(false), 2000);
  };

  const toggleExpandSection = (secIdx: number) => {
    setExpandedSecIndices((prev) => ({ ...prev, [secIdx]: !prev[secIdx] }));
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6 animate-in fade-in duration-150">
      {/* 1. Modifications Diff Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <GitCompare className="w-5 h-5 text-purple-400" />
          <h2 className="text-base font-semibold text-white">Plan Modifications Diff</h2>
        </div>
        <p className="text-xs text-slate-400 mb-6">
          Comparing working draft against Initial Agent Baseline:
        </p>

        {/* Goal Changes (if any) */}
        {diff.goalChanges && diff.goalChanges.length > 0 && (
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 mb-4">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Execution Target & Scope Changes
            </h3>
            <div className="space-y-1.5 text-xs text-emerald-300">
              {diff.goalChanges.map((g, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <InlineMarkdown content={g} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diff Badges / Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Task Changes */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Task Checklist Changes
            </h3>
            {diff.tasksAdded.length === 0 &&
            diff.tasksRemoved.length === 0 &&
            diff.tasksModified.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No task modifications</p>
            ) : (
              <div className="space-y-2 text-xs">
                {diff.tasksAdded.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-emerald-400">
                    <Plus className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Added: <InlineMarkdown content={t} />
                    </span>
                  </div>
                ))}
                {diff.tasksRemoved.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-rose-400">
                    <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Removed: <InlineMarkdown content={t} />
                    </span>
                  </div>
                ))}
                {diff.tasksModified.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-amber-400">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Modified: <InlineMarkdown content={t} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Diagram Changes */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Diagram Architecture Changes
            </h3>
            {diff.diagramChanges.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No diagram component modifications</p>
            ) : (
              <div className="space-y-2 text-xs text-indigo-300">
                {diff.diagramChanges.map((d, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Edit Plan Sections & Add Details Directly in Diff & Prompt */}
      {onStateChange && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-semibold text-white">
                  Plan Sections & Additional Details
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Edit any section, add missing requirements, or attach final instructions right here before submitting.
              </p>
            </div>
            <button
              onClick={() => setAddingSection((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Section</span>
            </button>
          </div>

          {/* Add New Section Form */}
          {addingSection && (
            <div className="bg-slate-950/90 border border-indigo-500/40 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                  New Plan Section
                </span>
                <button
                  onClick={() => setAddingSection(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={newSecHeading}
                onChange={(e) => setNewSecHeading(e.target.value)}
                placeholder="Section Heading (e.g. Security & Rate Limit Constraints)"
                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
              />
              <textarea
                rows={4}
                value={newSecContent}
                onChange={(e) => setNewSecContent(e.target.value)}
                placeholder="Add markdown details, bullet points, or constraints..."
                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg p-3 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAddingSection(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSection}
                  disabled={!newSecHeading.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Add Section to Plan</span>
                </button>
              </div>
            </div>
          )}

          {/* Goal & Objective Quick Editor */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Goal & Objective: {presentState.goal.title}
              </span>
              {!editingGoal ? (
                <button
                  onClick={() => {
                    setGoalTitleDraft(presentState.goal.title);
                    setGoalDescDraft(presentState.goal.description);
                    setEditingGoal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs border border-slate-700/70 transition"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit Goal</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingGoal(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveGoal}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
                  >
                    <Check className="w-3 h-3" />
                    <span>Save Goal</span>
                  </button>
                </div>
              )}
            </div>
            {editingGoal ? (
              <div className="space-y-2.5 mt-2">
                <input
                  type="text"
                  value={goalTitleDraft}
                  onChange={(e) => setGoalTitleDraft(e.target.value)}
                  placeholder="Plan Title"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none"
                />
                <textarea
                  rows={4}
                  value={goalDescDraft}
                  onChange={(e) => setGoalDescDraft(e.target.value)}
                  className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg p-3 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none"
                />
              </div>
            ) : (
              <BlockMarkdown
                content={presentState.goal.description || '_No goal description specified._'}
                className="text-xs text-slate-300"
              />
            )}
          </div>

          {/* All Editable Plan Sections Accordion / Inline Editor */}
          <div className="space-y-2.5">
            {editableSections.map((sec) => {
              const isEditing = editingSecIdx === sec.index;
              const isExpanded = !!expandedSecIndices[sec.index] || isEditing;
              return (
                <div
                  key={sec.index}
                  className="bg-slate-950/70 border border-slate-800/90 hover:border-slate-700/80 rounded-xl transition overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => toggleExpandSection(sec.index)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {sec.heading}
                      </span>
                    </button>
                    {!isEditing ? (
                      <button
                        onClick={() => startEditSection(sec)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs border border-slate-700/70 transition shrink-0"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit Section</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setEditingSecIdx(null)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveSection(sec)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-800/60">
                      {isEditing ? (
                        <div className="space-y-2.5 mt-2">
                          <input
                            type="text"
                            value={secHeadingDraft}
                            onChange={(e) => setSecHeadingDraft(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none"
                          />
                          <textarea
                            rows={Math.min(16, Math.max(5, secContentDraft.split('\n').length + 2))}
                            value={secContentDraft}
                            onChange={(e) => setSecContentDraft(e.target.value)}
                            className="w-full bg-slate-900 border border-indigo-500/50 rounded-lg p-3 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none"
                          />
                        </div>
                      ) : (
                        <BlockMarkdown
                          content={sec.content || '_Empty section_'}
                          className="text-xs text-slate-300 mt-2"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Direct Agent Review Notes / Instructions Box */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquarePlus className="w-3.5 h-3.5" />
                Additional Review Notes & Agent Instructions
              </label>
              <div className="flex items-center gap-2">
                {instructionsSavedBadge && (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    Saved to prompt!
                  </span>
                )}
                <button
                  onClick={handleSaveInstructions}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
                >
                  <Check className="w-3 h-3" />
                  <span>Update Notes</span>
                </button>
              </div>
            </div>
            <textarea
              rows={3}
              value={instructionsDraft}
              onChange={(e) => setInstructionsDraft(e.target.value)}
              onBlur={handleSaveInstructions}
              placeholder="Add any specific instructions, architectural adjustments, or implementation notes for the agent..."
              className="w-full bg-slate-900 border border-slate-700/80 focus:border-amber-500/60 rounded-lg p-3 text-xs text-slate-200 leading-relaxed focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* 3. Agent Stdout Prompt Reader with Formatted HTML & Raw Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Agent Stdout Prompt Preview</h2>
          </div>

          {/* Render Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('rendered')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                viewMode === 'rendered'
                  ? 'bg-slate-800 text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Rendered View</span>
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                viewMode === 'raw'
                  ? 'bg-slate-800 text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Raw Terminal</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Structured instructions delivered directly to the agent CLI upon resolution so it immediately acts on your feedback:
        </p>

        {viewMode === 'rendered' ? (
          <div
            className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-sm text-slate-200 prose prose-invert max-w-none prose-headings:text-slate-100 prose-headings:font-bold prose-h2:text-lg prose-h3:text-sm prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-white"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre leading-relaxed">
            {agentPrompt}
          </pre>
        )}
      </div>
    </div>
  );
};
