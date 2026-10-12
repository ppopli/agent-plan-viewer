import React, { useState } from 'react';
import { PlanState, PlanTask, FileChange } from '../../core/types.js';
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
} from 'lucide-react';

interface DocumentViewProps {
  planState: PlanState;
  onStateChange: (newState: PlanState) => void;
}

export const DocumentView: React.FC<DocumentViewProps> = ({
  planState,
  onStateChange,
}) => {
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [activeTaskNoteId, setActiveTaskNoteId] = useState<string | null>(null);
  const [taskNoteInput, setTaskNoteInput] = useState('');
  const [taskFilter, setTaskFilter] = useState('');

  const completedCount = planState.tasks.filter((t) => t.completed).length;
  const totalCount = planState.tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const filteredTasks = planState.tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(taskFilter.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(taskFilter.toLowerCase()))
  );

  const schemaSections = (planState.sections || []).filter((s) =>
    /schema|database|data model|entity|table|models|migrations/i.test(s.heading)
  );

  // Helper to append automatic instruction notes to userInstructions
  const appendAutoInstruction = (note: string, baseState = planState): string => {
    const current = (baseState.userInstructions || '').trim();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formatted = `[${timestamp}] ${note}`;
    if (!current) return formatted;
    return `${current}\n${formatted}`;
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
    const targetTask = planState.tasks.find((t) => t.id === taskId);
    const nextTasks = planState.tasks.map((t) =>
      t.id === taskId ? { ...t, title: newTitle } : t
    );

    onStateChange({
      ...planState,
      tasks: nextTasks,
    });
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
    onStateChange({ ...planState, tasks: nextTasks });
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

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-150">
      {/* 1. Execution Target: Rich HTML Card with inline edit toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Sparkles className="w-4 h-4" />
            <span>Execution Target & Architectural Scope</span>
          </div>

          <button
            onClick={() => setIsEditingGoal(!isEditingGoal)}
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
              className="text-xl font-bold bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white w-full focus:outline-none focus:border-emerald-500"
              placeholder="Plan Goal Title"
            />
            <textarea
              value={planState.goal.description}
              onChange={(e) => updateGoal('description', e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-y"
              placeholder="Describe what the plan accomplishes..."
            />
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
              {planState.goal.title}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/80">
              {planState.goal.description || 'AI-generated plan overview.'}
            </p>
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
            Edits & task notes automatically append to Agent Feedback below
          </span>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 mb-4">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Task Filter / Search (helpful for long task lists) */}
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
          {filteredTasks.map((task, idx) => (
            <div
              key={task.id}
              className={`group rounded-xl border transition ${
                task.completed
                  ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                  : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
              }`}
              style={{ marginLeft: `${task.indent * 20}px` }}
            >
              <div className="flex items-center gap-3 p-2.5">
                <button
                  onClick={() => toggleTask(task.id)}
                  className="text-slate-400 hover:text-emerald-400 transition"
                  title="Toggle task completion"
                >
                  {task.completed ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>

                <input
                  type="text"
                  value={task.title}
                  onChange={(e) => updateTaskTitle(task.id, e.target.value)}
                  className={`flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-emerald-500 transition ${
                    task.completed ? 'line-through text-slate-500' : 'text-slate-200'
                  }`}
                />

                <div className="flex items-center gap-1">
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
                    <div className="flex items-center justify-between text-xs text-indigo-300 font-mono">
                      <span>Note: {task.notes}</span>
                      <button
                        onClick={() => {
                          setActiveTaskNoteId(task.id);
                          setTaskNoteInput(task.notes || '');
                        }}
                        className="text-[11px] text-slate-400 hover:text-white"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
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
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {file.type === 'NEW' && <FilePlus className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {file.type === 'MODIFY' && <FileDiff className="w-4 h-4 text-blue-400 shrink-0" />}
                    {file.type === 'DELETE' && <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />}
                    <span className="text-xs font-mono text-slate-200 truncate">{file.path}</span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border shrink-0 ${badgeStyle}`}
                  >
                    {file.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Database Schema & Data Models Section (renders SQL schema tables or data structures if present) */}
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
              <div key={idx} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {sec.heading}
                </h3>
                <pre className="bg-slate-900 border border-slate-800/80 rounded-lg p-3 font-mono text-xs text-amber-200/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {sec.content.trim()}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Agent Instructions & Direct Feedback with Live Auto-population */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Agent Instructions & Direct Feedback</h2>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono">Auto-populates from task edits & inline notes</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          This section is automatically updated as you toggle or annotate tasks above. You can also edit, format, or type additional instructions directly below:
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
