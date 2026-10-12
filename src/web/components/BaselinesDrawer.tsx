import React from 'react';
import { BaselineCheckpoint } from '../../core/types.js';
import { History, X, Check, RotateCcw, Calendar, Layers } from 'lucide-react';

interface BaselinesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  baselines: BaselineCheckpoint[];
  activeBaselineId: string;
  onRevertToBaseline: (baselineId: string) => void;
}

export const BaselinesDrawer: React.FC<BaselinesDrawerProps> = ({
  isOpen,
  onClose,
  baselines,
  activeBaselineId,
  onRevertToBaseline,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Saved Baselines History</h2>
              <p className="text-xs text-slate-400">
                Tier 2 checkpoint history (capped at {baselines.length}/10 saved versions)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of Baselines */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {baselines.slice().reverse().map((baseline, idx) => {
            const isActive = baseline.id === activeBaselineId;
            const dateStr = new Date(baseline.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const taskCount = baseline.snapshot.tasks.length;
            const diagramCount = baseline.snapshot.diagrams.length;

            return (
              <div
                key={baseline.id}
                className={`p-3 rounded-xl border transition ${
                  isActive
                    ? 'bg-indigo-950/30 border-indigo-500/40 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-white">
                      {baseline.label}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        <Check className="w-2.5 h-2.5" />
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                    <Calendar className="w-3 h-3" />
                    <span>{dateStr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {taskCount} tasks
                  </span>
                  <span>•</span>
                  <span>{diagramCount} diagrams</span>
                </div>

                <div className="flex items-center justify-end">
                  {isActive ? (
                    <span className="text-[11px] text-slate-500 italic">Current baseline</span>
                  ) : (
                    <button
                      onClick={() => {
                        onRevertToBaseline(baseline.id);
                        onClose();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white transition shadow-sm"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Revert to this Version</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 text-xs text-slate-400">
          Reverting to a baseline restores all tasks, diagrams, and files from that checkpoint while keeping your action undo history available.
        </div>
      </div>
    </div>
  );
};
