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
  HelpCircle,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from 'lucide-react';

interface DocumentViewProps {
  planState: PlanState;
  onStateChange: (newState: PlanState) => void;
}

export const DocumentView: React.FC<DocumentViewProps> = ({
  planState,
  onStateChange,
}) => {
  const [newTaskText, setNewTaskText] = useState('');

  // Handle task checkbox toggle
  const toggleTask = (taskId: string) => {
    const nextTasks = planState.tasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    onStateChange({ ...planState, tasks: nextTasks });
  };

  // Handle task text edit
  const updateTaskTitle = (taskId: string, newTitle: string) => {
    const nextTasks = planState.tasks.map((t) =>
      t.id === taskId ? { ...t, title: newTitle } : t
    );
    onStateChange({ ...planState, tasks: nextTasks });
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
    onStateChange({
      ...planState,
      tasks: [...planState.tasks, newTask],
    });
    setNewTaskText('');
  };

  // Delete task
  const deleteTask = (taskId: string) => {
    const nextTasks = planState.tasks.filter((t) => t.id !== taskId);
    onStateChange({ ...planState, tasks: nextTasks });
  };

  // Move task up / down
  const moveTask = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= planState.tasks.length) return;
    const nextTasks = [...planState.tasks];
    const [moved] = nextTasks.splice(idx, 1);
    nextTasks.splice(targetIdx, 0, moved);
    onStateChange({ ...planState, tasks: nextTasks });
  };

  // Update Goal Title or Description
  const updateGoal = (field: 'title' | 'description', value: string) => {
    onStateChange({
      ...planState,
      goal: {
        ...planState.goal,
        [field]: value,
      },
    });
  };

  // Update User Instructions
  const updateInstructions = (text: string) => {
    onStateChange({
      ...planState,
      userInstructions: text,
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-150">
      {/* 1. Goal & Executive Summary Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
          <Sparkles className="w-4 h-4" />
          <span>Execution Target</span>
        </div>
        <input
          type="text"
          value={planState.goal.title}
          onChange={(e) => updateGoal('title', e.target.value)}
          className="text-2xl font-bold bg-transparent text-white border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:outline-none w-full pb-1 mb-3 transition"
          placeholder="Plan Goal Title"
        />
        <textarea
          value={planState.goal.description}
          onChange={(e) => updateGoal('description', e.target.value)}
          rows={3}
          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-sm text-slate-300 focus:outline-none focus:border-emerald-500/50 resize-y transition"
          placeholder="Summary of what the plan accomplishes..."
        />
      </div>

      {/* 2. Interactive Tasks & Checklists */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Interactive Tasks & Steps</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              {planState.tasks.filter((t) => t.completed).length} / {planState.tasks.length} done
            </span>
          </div>
          <span className="text-xs text-slate-500">Click checkboxes or edit task text directly</span>
        </div>

        {/* Task List */}
        <div className="space-y-2 mb-4">
          {planState.tasks.map((task, idx) => (
            <div
              key={task.id}
              className={`group flex items-center gap-3 p-2.5 rounded-xl border transition ${
                task.completed
                  ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                  : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
              }`}
              style={{ marginLeft: `${task.indent * 20}px` }}
            >
              <button
                onClick={() => toggleTask(task.id)}
                className="text-slate-400 hover:text-emerald-400 transition"
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

      {/* 4. Instructions & Comments for Agent */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-white">Agent Instructions & Direct Feedback</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Type instructions or specific requirements here. These are explicitly formatted and delivered to the waiting agent upon approval or revision request.
        </p>
        <textarea
          value={planState.userInstructions || ''}
          onChange={(e) => updateInstructions(e.target.value)}
          rows={3}
          placeholder="e.g. Ensure we add automated tests for the token expiration edge cases. Use Redis instead of memory cache..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
        />
      </div>
    </div>
  );
};
