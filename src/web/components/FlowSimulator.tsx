import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Activity,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ListFilter,
  PlaySquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { PlanState, ParsedDiagram, FlowStep, FlowScenario } from '../../core/types.js';

// Custom Animated Node for Simulator
const SimNode: React.FC<NodeProps> = ({ id, data }) => {
  const isSource = data.isSource as boolean;
  const isTarget = data.isTarget as boolean;
  const isInactive = data.isInactive as boolean;
  const isFailed = data.isFailed as boolean;

  let highlightRing = 'border-slate-800 bg-slate-900';
  if (isFailed && isTarget) {
    highlightRing = 'border-rose-500 bg-rose-950/70 ring-4 ring-rose-500/40 animate-pulse';
  } else if (isSource) {
    highlightRing = 'border-blue-500 bg-blue-950/60 ring-4 ring-blue-500/30';
  } else if (isTarget) {
    highlightRing = 'border-emerald-500 bg-emerald-950/60 ring-4 ring-emerald-500/30 animate-pulse';
  } else if (isInactive) {
    highlightRing = 'border-slate-800/40 bg-slate-950/60 opacity-30';
  }

  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 min-w-[150px] text-white shadow-xl transition-all duration-300 ${highlightRing}`}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />

      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {(data.type as string) || 'Service'}
        </span>
        {isSource && (
          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded-full font-semibold">
            Sender
          </span>
        )}
        {isTarget && !isFailed && (
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded-full font-semibold">
            Receiver
          </span>
        )}
        {isTarget && isFailed && (
          <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded-full font-semibold">
            Failed Component
          </span>
        )}
      </div>

      <div className="text-xs font-semibold text-slate-100 truncate">
        {(data.label as string) || id}
      </div>

      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
};

interface FlowSimulatorProps {
  planState: PlanState;
  onStateChange: (newState: PlanState) => void;
}

export const FlowSimulator: React.FC<FlowSimulatorProps> = ({
  planState,
  onStateChange,
}) => {
  const [selectedDiagIdx, setSelectedDiagIdx] = useState(0);
  const diagram: ParsedDiagram | undefined = planState.diagrams[selectedDiagIdx];

  const scenarios: FlowScenario[] = useMemo(() => {
    if (!diagram) return [];
    if (diagram.scenarios && diagram.scenarios.length > 0) {
      return diagram.scenarios;
    }
    // Fallback if none exist
    return [
      {
        id: 'scen-1',
        name: 'Happy Path',
        type: 'success',
        description: 'Standard request flow execution',
        steps: diagram.flowSteps || [],
        touchedComponents: diagram.nodes.map((n) => n.id),
      },
    ];
  }, [diagram]);

  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const activeScenario: FlowScenario | undefined = scenarios[activeScenarioIdx];

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayAll, setIsPlayAll] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  const timerRef = useRef<any>(null);

  const steps = activeScenario?.steps || [];
  const currentStep: FlowStep | undefined = steps[currentStepIdx];

  // Playback timer (Single scenario or Play All scenarios)
  useEffect(() => {
    if (isPlaying && steps.length > 0) {
      const intervalMs = 2000 / speed;
      timerRef.current = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev >= steps.length - 1) {
            // Reached end of current scenario
            if (isPlayAll && activeScenarioIdx < scenarios.length - 1) {
              // Advance to next scenario
              setActiveScenarioIdx((sIdx) => sIdx + 1);
              return 0;
            } else {
              setIsPlaying(false);
              setIsPlayAll(false);
              return prev;
            }
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, isPlayAll, speed, steps.length, activeScenarioIdx, scenarios.length]);

  const nodeTypes = useMemo(() => ({ simNode: SimNode }), []);

  // Sim nodes highlighting active source & target
  const simNodes: Node[] = useMemo(() => {
    if (!diagram) return [];
    return diagram.nodes.map((n) => {
      const isSource = currentStep?.source === n.id;
      const isTarget = currentStep?.target === n.id;
      const isFailed = currentStep?.status === 'failure';
      const isInactive = currentStep && !isSource && !isTarget;

      return {
        id: n.id,
        type: 'simNode',
        position: { x: n.x, y: n.y },
        data: {
          label: n.label,
          type: n.type,
          isSource,
          isTarget,
          isFailed,
          isInactive,
        },
      };
    });
  }, [diagram, currentStep]);

  // Sim edges
  const simEdges: Edge[] = useMemo(() => {
    if (!diagram) return [];
    return diagram.edges.map((e) => {
      const isActive = currentStep?.source === e.source && currentStep?.target === e.target;
      const isFailed = currentStep?.status === 'failure';

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: isActive,
        style: {
          stroke: isActive ? (isFailed ? '#f43f5e' : '#f59e0b') : '#334155',
          strokeWidth: isActive ? 4 : 1.5,
          opacity: isActive ? 1 : 0.3,
        },
        labelStyle: {
          fill: isActive ? (isFailed ? '#fda4af' : '#fcd34d') : '#64748b',
          fontWeight: isActive ? 700 : 500,
          fontSize: 11,
        },
        labelBgStyle: { fill: '#0f172a' },
      };
    });
  }, [diagram, currentStep]);

  const handleNext = () => {
    if (currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(currentStepIdx - 1);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setIsPlayAll(false);
    setCurrentStepIdx(0);
  };

  const handlePlayAll = () => {
    setActiveScenarioIdx(0);
    setCurrentStepIdx(0);
    setIsPlayAll(true);
    setIsPlaying(true);
  };

  const handleStopAll = () => {
    setIsPlaying(false);
    setIsPlayAll(false);
    setCurrentStepIdx(0);
  };

  if (!diagram || scenarios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] text-slate-400">
        <Activity className="w-12 h-12 mb-3 text-slate-600" />
        <h3 className="text-base font-semibold text-slate-300">No Request Flow Available</h3>
        <p className="text-xs text-slate-500 mt-1">
          Add connections in the Diagram Canvas to simulate step-by-step request execution.
        </p>
      </div>
    );
  }

  const sourceNode = diagram.nodes.find((n) => n.id === currentStep?.source);
  const targetNode = diagram.nodes.find((n) => n.id === currentStep?.target);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] bg-slate-950 flex flex-col overflow-hidden">
      {/* 1. Top Scenarios Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <ListFilter className="w-4 h-4 text-indigo-400" />
            <span>Execution Scenarios:</span>
          </div>

          <div className="flex items-center gap-2">
            {scenarios.map((scen, idx) => {
              const isSelected = activeScenarioIdx === idx;
              const badgeColor =
                scen.type === 'success'
                  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/40'
                  : 'border-rose-500/40 text-rose-300 bg-rose-950/40';

              return (
                <button
                  key={scen.id}
                  onClick={() => {
                    setActiveScenarioIdx(idx);
                    setCurrentStepIdx(0);
                    setIsPlaying(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                    isSelected
                      ? `ring-2 ring-indigo-400 ${badgeColor} font-bold shadow-md`
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {scen.type === 'success' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>{scen.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Play All, Pause All, Stop All Playlist Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayAll}
            title="Run all scenarios sequentially 1 by 1"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
          >
            <PlaySquare className="w-3.5 h-3.5" />
            <span>Play All Scenarios</span>
          </button>
          <button
            onClick={() => setIsPlaying(false)}
            title="Pause all scenarios"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Pause All</span>
          </button>
          <button
            onClick={handleStopAll}
            title="Stop all and reset"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 transition"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Stop All</span>
          </button>
        </div>
      </div>

      {/* 2. Controls & Stepper Bar */}
      <div className="h-14 bg-slate-900/90 border-b border-slate-800 px-6 flex items-center justify-between z-10 shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Activity className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-semibold text-white">
                {activeScenario?.name}
              </span>
              <div className="text-[11px] text-slate-400 font-mono">
                Step {currentStepIdx + 1} of {steps.length} ({Math.round(((currentStepIdx + 1) / steps.length) * 100)}%)
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Stepper Buttons */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={handleReset}
              title="Reset to Step 1"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrev}
              disabled={currentStepIdx === 0}
              title="Previous Step"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? 'Pause' : 'Play Scenario'}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition shadow-sm"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              onClick={handleNext}
              disabled={currentStepIdx === steps.length - 1}
              title="Next Step"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Speed Toggle */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-0.5 rounded-lg font-mono transition ${
                  speed === s
                    ? 'bg-slate-800 text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Components Touched in this Scenario */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Components Touched:</span>
          <div className="flex items-center gap-1">
            {activeScenario?.touchedComponents.map((compId) => {
              const node = diagram.nodes.find((n) => n.id === compId);
              return (
                <span
                  key={compId}
                  className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700"
                >
                  {node?.label || compId}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Main Canvas + Step Inspector HUD */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={simNodes}
            edges={simEdges}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-950"
          >
            <Background color="#1e293b" gap={16} size={1} />
            <Controls className="!bg-slate-900 !border-slate-800 !text-slate-300" />
          </ReactFlow>
        </div>

        {/* Step Inspector HUD Drawer */}
        <div className="w-96 h-full bg-slate-900 border-l border-slate-800 p-5 flex flex-col shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Step Inspector
            </span>
            <div className="flex items-center gap-2">
              {currentStep?.status === 'failure' && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Failure Point
                </span>
              )}
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Step #{currentStep?.stepNumber}
              </span>
            </div>
          </div>

          {currentStep && (
            <div className="space-y-5 flex-1">
              <div>
                <h4 className="text-base font-bold text-white mb-1">{currentStep.label}</h4>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-blue-400 font-semibold">{sourceNode?.label || currentStep.source}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-emerald-400 font-semibold">{targetNode?.label || currentStep.target}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1.5 block">
                  Request Payload / Headers:
                </label>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-amber-300/90 overflow-x-auto">
                  {currentStep.payload || '{\n  "method": "POST",\n  "status": "DISPATCH"\n}'}
                </pre>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1.5 block flex items-center gap-1.5">
                  {currentStep.status === 'failure' ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  Expected Response:
                </label>
                <pre
                  className={`bg-slate-950 border rounded-xl p-3 font-mono text-xs overflow-x-auto ${
                    currentStep.status === 'failure'
                      ? 'border-rose-500/40 text-rose-300'
                      : 'border-slate-800 text-emerald-300/90'
                  }`}
                >
                  {currentStep.response || '{\n  "status": 200,\n  "ok": true\n}'}
                </pre>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Scenario Handling Check:
                </div>
                <p className="text-slate-400">
                  {currentStep.status === 'failure'
                    ? 'Failure detected! Downstream error recovery or compensation transaction must be triggered.'
                    : `Normal execution path. Verified connection from ${sourceNode?.label} to ${targetNode?.label}.`}
                </p>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={handlePrev}
              disabled={currentStepIdx === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 transition"
            >
              Previous Hop
            </button>
            <button
              onClick={handleNext}
              disabled={currentStepIdx === steps.length - 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-30 transition"
            >
              Next Hop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
