import React, { useState, useEffect, useCallback } from 'react';
import { PlanState, BaselineCheckpoint } from '../core/types.js';
import { parsePlanMarkdown } from '../core/plan-parser.js';
import { usePlanHistory } from './hooks/usePlanHistory.js';
import { ApprovalHeader, ActiveTab } from './components/ApprovalHeader.js';
import { BaselinesDrawer } from './components/BaselinesDrawer.js';
import { DocumentView } from './components/DocumentView.js';
import { DiagramCanvas } from './components/DiagramCanvas.js';
import { FlowSimulator } from './components/FlowSimulator.js';
import { DiffPreview } from './components/DiffPreview.js';
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';

function hydratePlanState(state: PlanState): PlanState {
  if (state && state.rawMarkdown) {
    const freshlyParsed = parsePlanMarkdown(state.rawMarkdown);
    return {
      ...freshlyParsed,
      userInstructions: state.userInstructions || freshlyParsed.userInstructions,
    };
  }
  return state;
}

function attemptAutoCloseWindow() {
  setTimeout(() => {
    try {
      window.open('', '_self');
      window.close();
    } catch {
      // Ignore if browser blocks script window.close()
    }
  }, 250);
}

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
        const state = hydratePlanState(data.state);
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
      onInitialStateChange={setInitialState}
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
  onInitialStateChange: (newState: PlanState) => void;
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
  onInitialStateChange,
  initialBaselines,
  activeTab,
  onTabChange,
  isBaselinesOpen,
  setIsBaselinesOpen,
  submitStatus,
  setSubmitStatus,
}) => {
  const history = usePlanHistory(initialState, initialBaselines);
  const [reloadBanner, setReloadBanner] = useState<string | null>(null);

  const handleExternalReload = useCallback(
    (rawState: PlanState, baselines?: BaselineCheckpoint[]) => {
      const hydrated = hydratePlanState(rawState);
      onInitialStateChange(hydrated);
      history.syncExternalReload(hydrated, baselines);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setReloadBanner(`Document updated on disk — automatically reloaded latest version (${timeStr})`);
    },
    [history, onInitialStateChange]
  );

  // Connect to WebSocket for live file-change reloads and completion events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'PLAN_RELOADED' && msg.state) {
            handleExternalReload(msg.state, msg.baselines);
          } else if (msg.type === 'REVIEW_COMPLETED' && msg.status) {
            setSubmitStatus(msg.status);
            attemptAutoCloseWindow();
          }
        } catch {
          // Ignore malformed ws messages
        }
      };
    } catch {
      // Ignore ws connection errors in restricted environments
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [handleExternalReload, setSubmitStatus]);

  // Explicit Save Draft action
  const handleSaveDraft = async () => {
    await history.saveBaseline();
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
        attemptAutoCloseWindow();
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
        attemptAutoCloseWindow();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // If submitted, show confirmation splash (while browser tab closes automatically)
  if (submitStatus) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4 shadow-xl">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          {submitStatus === 'APPROVED' ? 'Plan Approved & Dispatched!' : 'Revision Requests Sent!'}
        </h1>
        <p className="text-sm text-slate-400 max-w-md mb-4">
          Your changes and feedback have been formatted and sent directly back to the running agent process. Closing viewer tab automatically...
        </p>
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-400 mb-4">
          File updated: {planPath}
        </div>
        <button
          onClick={() => {
            window.open('', '_self');
            window.close();
          }}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          Close Tab Now
        </button>
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

      {/* Live File-Reload Notification Banner */}
      {reloadBanner && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/40 px-4 py-2 flex items-center justify-between text-xs text-emerald-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="font-medium">{reloadBanner}</span>
            </div>
            <button
              onClick={() => setReloadBanner(null)}
              className="p-1 rounded hover:bg-emerald-900/60 text-emerald-300 hover:text-white transition"
              title="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
