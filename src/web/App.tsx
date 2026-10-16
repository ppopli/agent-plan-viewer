import React, { useState, useEffect } from 'react';
import { PlanState, BaselineCheckpoint } from '../core/types.js';
import { parsePlanMarkdown } from '../core/plan-parser.js';
import { usePlanHistory } from './hooks/usePlanHistory.js';
import { ApprovalHeader, ActiveTab } from './components/ApprovalHeader.js';
import { BaselinesDrawer } from './components/BaselinesDrawer.js';
import { DocumentView } from './components/DocumentView.js';
import { DiagramCanvas } from './components/DiagramCanvas.js';
import { FlowSimulator } from './components/FlowSimulator.js';
import { DiffPreview } from './components/DiffPreview.js';
import { CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planPath, setPlanPath] = useState('');
  const [initialState, setInitialState] = useState<PlanState | null>(null);
  const [initialBaselines, setInitialBaselines] = useState<BaselineCheckpoint[]>([]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('document');
  const [isBaselinesOpen, setIsBaselinesOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'APPROVED' | 'CHANGES_REQUESTED' | null>(null);

  // Fetch initial plan data
  useEffect(() => {
    fetch('/api/plan')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setPlanPath(data.planPath);
        let state: PlanState = data.state;
        // Re-hydrate from rawMarkdown if connected to a pre-existing server instance
        if (state && state.rawMarkdown) {
          const freshlyParsed = parsePlanMarkdown(state.rawMarkdown);
          state = {
            ...freshlyParsed,
            userInstructions: state.userInstructions || freshlyParsed.userInstructions,
          };
        }
        setInitialState(state);
        setInitialBaselines(data.baselines || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(`Failed to connect to plan server: ${err.message}`);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-sm font-medium">Connecting to Agent Plan Viewer...</span>
      </div>
    );
  }

  if (error || !initialState) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-white mb-1">Failed to Load Plan</h2>
        <p className="text-xs text-slate-400 max-w-md mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <PlanViewerContent
      planPath={planPath}
      initialState={initialState}
      initialBaselines={initialBaselines}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      isBaselinesOpen={isBaselinesOpen}
      setIsBaselinesOpen={setIsBaselinesOpen}
      submitStatus={submitStatus}
      setSubmitStatus={setSubmitStatus}
    />
  );
};

interface ContentProps {
  planPath: string;
  initialState: PlanState;
  initialBaselines: BaselineCheckpoint[];
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isBaselinesOpen: boolean;
  setIsBaselinesOpen: (open: boolean) => void;
  submitStatus: 'APPROVED' | 'CHANGES_REQUESTED' | null;
  setSubmitStatus: (status: 'APPROVED' | 'CHANGES_REQUESTED') => void;
}

const PlanViewerContent: React.FC<ContentProps> = ({
  planPath,
  initialState,
  initialBaselines,
  activeTab,
  onTabChange,
  isBaselinesOpen,
  setIsBaselinesOpen,
  submitStatus,
  setSubmitStatus,
}) => {
  const history = usePlanHistory(initialState, initialBaselines);

  // Explicit Save Draft action
  const handleSaveDraft = async () => {
    const ok = await history.saveBaseline();
    if (ok) {
      // Optional subtle toast
    }
  };

  // Explicit Approve & Submit action
  const handleApprove = async () => {
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planState: history.present,
          userInstructions: history.present.userInstructions,
        }),
      });
      if (res.ok) {
        setSubmitStatus('APPROVED');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Explicit Request Changes action
  const handleRequestChanges = async () => {
    try {
      const res = await fetch('/api/request-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planState: history.present,
          userInstructions: history.present.userInstructions,
        }),
      });
      if (res.ok) {
        setSubmitStatus('CHANGES_REQUESTED');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // If submitted, show confirmation splash
  if (submitStatus) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4 shadow-xl">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          {submitStatus === 'APPROVED' ? 'Plan Approved & Dispatched!' : 'Revision Requests Sent!'}
        </h1>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Your changes and feedback have been formatted and sent directly back to the running agent process. You can return to your terminal to watch the execution.
        </p>
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-400">
          File updated: {planPath}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-white">
      {/* Top Sticky Approval & History Header */}
      <ApprovalHeader
        planPath={planPath}
        activeTab={activeTab}
        onTabChange={onTabChange}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        undoDepth={history.past.length}
        redoDepth={history.future.length}
        onUndo={history.undo}
        onRedo={history.redo}
        baselinesCount={history.baselines.length}
        onOpenBaselines={() => setIsBaselinesOpen(true)}
        isDirty={history.isDirty}
        isSaving={history.isSaving}
        onSaveDraft={handleSaveDraft}
        onDiscardChanges={history.discardToActiveBaseline}
        onApprove={handleApprove}
        onRequestChanges={handleRequestChanges}
      />

      {/* Main View Body */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'document' && (
          <DocumentView
            planState={history.present}
            onStateChange={history.pushAction}
          />
        )}
        {activeTab === 'diagram' && (
          <DiagramCanvas
            planState={history.present}
            onStateChange={history.pushAction}
          />
        )}
        {activeTab === 'flow' && (
          <FlowSimulator
            planState={history.present}
            onStateChange={history.pushAction}
          />
        )}
        {activeTab === 'diff' && (
          <DiffPreview
            initialState={initialState}
            presentState={history.present}
            planPath={planPath}
          />
        )}
      </main>

      {/* Tier 2: Baselines Drawer */}
      <BaselinesDrawer
        isOpen={isBaselinesOpen}
        onClose={() => setIsBaselinesOpen(false)}
        baselines={history.baselines}
        activeBaselineId={history.activeBaselineId}
        onRevertToBaseline={history.revertToBaseline}
      />
    </div>
  );
};
