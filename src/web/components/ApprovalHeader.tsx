import React from 'react';
import {
  Undo2,
  Redo2,
  History,
  Save,
  CheckCircle2,
  AlertCircle,
  FileText,
  Network,
  PlayCircle,
  GitCompare,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';

export type ActiveTab = 'document' | 'diagram' | 'flow' | 'diff';

interface ApprovalHeaderProps {
  planPath: string;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  // Tier 1
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  onUndo: () => void;
  onRedo: () => void;
  // Tier 2
  baselinesCount: number;
  onOpenBaselines: () => void;
  // State
  isDirty: boolean;
  isSaving: boolean;
  onSaveDraft: () => void;
  onDiscardChanges: () => void;
  onApprove: () => void;
  onRequestChanges: () => void;
}

export const ApprovalHeader: React.FC<ApprovalHeaderProps> = ({
  planPath,
  activeTab,
  onTabChange,
  canUndo,
  canRedo,
  undoDepth,
  redoDepth,
  onUndo,
  onRedo,
  baselinesCount,
  onOpenBaselines,
  isDirty,
  isSaving,
  onSaveDraft,
  onDiscardChanges,
  onApprove,
  onRequestChanges,
}) => {
  const fileName = planPath ? planPath.split('/').pop() : 'plan.md';

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Left: Branding & Plan File Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-base">
              ⚡
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight text-white flex items-center gap-2">
                Agent Plan Viewer
                {isDirty ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    <AlertCircle className="w-3 h-3" />
                    Unsaved Changes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-mono truncate max-w-xs" title={planPath}>
                {fileName}
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800 mx-2" />

          {/* Tier 1: Action Undo/Redo Controls */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title={`Undo action (⌘Z) - ${undoDepth}/10`}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>{undoDepth > 0 ? undoDepth : ''}</span>
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title={`Redo action (⌘⇧Z) - ${redoDepth}/10`}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>{redoDepth > 0 ? redoDepth : ''}</span>
            </button>
          </div>

          {/* Tier 2: Baseline History Button */}
          <button
            onClick={onOpenBaselines}
            title="Inspect & revert to saved baselines (depth 10)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span>Baselines</span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px]">
              {baselinesCount}/10
            </span>
          </button>
        </div>

        {/* Center: View Switcher */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onTabChange('document')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'document'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Plan & Tasks</span>
          </button>
          <button
            onClick={() => onTabChange('diagram')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'diagram'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Network className="w-3.5 h-3.5 text-emerald-400" />
            <span>Diagram Canvas</span>
          </button>
          <button
            onClick={() => onTabChange('flow')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'flow'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Flow Stepper</span>
          </button>
          <button
            onClick={() => onTabChange('diff')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'diff'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5 text-purple-400" />
            <span>Diff & Prompt</span>
          </button>
        </div>

        {/* Right: Explicit Save & Submit Controls */}
        <div className="flex items-center gap-2">
          {/* Discard */}
          <button
            onClick={onDiscardChanges}
            disabled={!isDirty}
            title="Discard unsaved changes and revert to active baseline"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Discard</span>
          </button>

          {/* Explicit Save Draft */}
          <button
            onClick={onSaveDraft}
            disabled={isSaving || !isDirty}
            title="Save draft to disk and create new baseline checkpoint"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 transition shadow-sm"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
          </button>

          {/* Request Changes */}
          <button
            onClick={onRequestChanges}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition shadow-sm"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Request Changes</span>
          </button>

          {/* Approve & Submit */}
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950 transition active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Approve & Submit</span>
          </button>
        </div>
      </div>
    </header>
  );
};
