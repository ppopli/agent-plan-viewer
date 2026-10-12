import React from 'react';
import { PlanState, BaselineCheckpoint } from '../../core/types.js';
import { calculatePlanDiff, formatAgentInstructions } from '../../core/plan-serializer.js';
import { GitCompare, Terminal, CheckCircle, Plus, Minus, RefreshCw } from 'lucide-react';

interface DiffPreviewProps {
  initialState: PlanState;
  presentState: PlanState;
  planPath: string;
}

export const DiffPreview: React.FC<DiffPreviewProps> = ({
  initialState,
  presentState,
  planPath,
}) => {
  const diff = calculatePlanDiff(initialState, presentState);

  const sampleResult = {
    status: 'APPROVED' as const,
    planPath,
    diff,
    userInstructions: presentState.userInstructions,
    updatedMarkdown: '',
  };

  const agentPrompt = formatAgentInstructions(sampleResult);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <GitCompare className="w-5 h-5 text-purple-400" />
          <h2 className="text-base font-semibold text-white">Plan Modifications Diff</h2>
        </div>
        <p className="text-xs text-slate-400 mb-6">
          Comparing working draft against Initial Agent Baseline:
        </p>

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
                    <span>Added: {t}</span>
                  </div>
                ))}
                {diff.tasksRemoved.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-rose-400">
                    <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Removed: {t}</span>
                  </div>
                ))}
                {diff.tasksModified.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-amber-400">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Modified: {t}</span>
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

      {/* Agent Output Terminal Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Agent Stdout Prompt Preview</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">Delivered to running agent</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          This structured instruction block is output directly to the agent process upon review resolution so the agent seamlessly incorporates your changes:
        </p>
        <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre leading-relaxed">
          {agentPrompt}
        </pre>
      </div>
    </div>
  );
};
