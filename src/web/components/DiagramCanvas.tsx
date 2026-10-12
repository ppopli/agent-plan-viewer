import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Node,
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Server,
  Database,
  Layers,
  Router,
  User,
  Plus,
  Trash2,
  Code2,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { PlanState, ParsedDiagram, DiagramNode, DiagramEdge, NodeType } from '../../core/types.js';
import { autoLayout, serializeToMermaid } from '../../core/mermaid-graph-bridge.js';

// Custom Node Component
const CustomDiagramNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data.label as string) || id);

  const nodeType = (data.type as NodeType) || 'service';

  const getIcon = () => {
    switch (nodeType) {
      case 'database':
        return <Database className="w-4 h-4 text-amber-400" />;
      case 'queue':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'gateway':
        return <Router className="w-4 h-4 text-blue-400" />;
      case 'actor':
        return <User className="w-4 h-4 text-emerald-400" />;
      case 'service':
      default:
        return <Server className="w-4 h-4 text-indigo-400" />;
    }
  };

  const getBgStyle = () => {
    switch (nodeType) {
      case 'database':
        return 'border-amber-500/40 bg-amber-950/20';
      case 'queue':
        return 'border-purple-500/40 bg-purple-950/20';
      case 'gateway':
        return 'border-blue-500/40 bg-blue-950/20';
      case 'actor':
        return 'border-emerald-500/40 bg-emerald-950/20';
      case 'service':
      default:
        return 'border-indigo-500/40 bg-slate-900';
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange && typeof data.onLabelChange === 'function') {
      (data.onLabelChange as (id: string, label: string) => void)(id, label);
    }
  };

  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 shadow-lg min-w-[160px] text-white transition-all ${getBgStyle()} ${
        selected ? 'ring-2 ring-emerald-400 border-emerald-400' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2.5 !h-2.5" />

      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-slate-800/80 border border-slate-700">{getIcon()}</div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {nodeType}
        </span>
      </div>

      {isEditing ? (
        <input
          type="text"
          value={label}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
          className="text-xs font-semibold bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white w-full outline-none focus:border-emerald-500"
        />
      ) : (
        <div
          onDoubleClick={() => setIsEditing(true)}
          className="text-xs font-semibold text-slate-100 truncate cursor-text hover:text-emerald-300"
          title="Double click to edit label"
        >
          {label}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
    </div>
  );
};

interface DiagramCanvasProps {
  planState: PlanState;
  onStateChange: (newState: PlanState) => void;
}

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  planState,
  onStateChange,
}) => {
  const [selectedDiagIdx, setSelectedDiagIdx] = useState(0);
  const [showMermaidCode, setShowMermaidCode] = useState(false);

  const diagram: ParsedDiagram | undefined = planState.diagrams[selectedDiagIdx];

  const nodeTypes = useMemo(
    () => ({
      custom: CustomDiagramNode,
    }),
    []
  );

  // Update node label callback
  const handleNodeLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      if (!diagram) return;
      const nextNodes = diagram.nodes.map((n) =>
        n.id === nodeId ? { ...n, label: newLabel } : n
      );
      const nextDiagrams = [...planState.diagrams];
      nextDiagrams[selectedDiagIdx] = { ...diagram, nodes: nextNodes };
      onStateChange({ ...planState, diagrams: nextDiagrams });
    },
    [diagram, planState, selectedDiagIdx, onStateChange]
  );

  // React Flow nodes
  const flowNodes: Node[] = useMemo(() => {
    if (!diagram) return [];
    return diagram.nodes.map((n) => ({
      id: n.id,
      type: 'custom',
      position: { x: n.x, y: n.y },
      data: {
        label: n.label,
        type: n.type,
        shape: n.shape,
        onLabelChange: handleNodeLabelChange,
      },
    }));
  }, [diagram, handleNodeLabelChange]);

  // React Flow edges
  const flowEdges: Edge[] = useMemo(() => {
    if (!diagram) return [];
    return diagram.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: e.animated,
      style: {
        stroke: e.style === 'dashed' ? '#94a3b8' : '#22c55e',
        strokeWidth: e.style === 'thick' ? 3 : 1.5,
        strokeDasharray: e.style === 'dashed' ? '5,5' : undefined,
      },
      labelStyle: { fill: '#cbd5e1', fontSize: 11, fontWeight: 500 },
      labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4 },
      labelBgPadding: [6, 4] as [number, number],
    }));
  }, [diagram]);

  // Handle node drag stop or deletion
  const onNodesChange = useCallback(
    (changes: any) => {
      if (!diagram) return;
      let hasPositionOrRemove = false;
      const nextNodes = [...diagram.nodes];

      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          const target = nextNodes.find((n) => n.id === change.id);
          if (target) {
            target.x = change.position.x;
            target.y = change.position.y;
            hasPositionOrRemove = true;
          }
        } else if (change.type === 'remove') {
          const idx = nextNodes.findIndex((n) => n.id === change.id);
          if (idx !== -1) {
            nextNodes.splice(idx, 1);
            hasPositionOrRemove = true;
          }
        }
      }

      if (hasPositionOrRemove) {
        const nextDiagrams = [...planState.diagrams];
        nextDiagrams[selectedDiagIdx] = { ...diagram, nodes: nextNodes };
        onStateChange({ ...planState, diagrams: nextDiagrams });
      }
    },
    [diagram, planState, selectedDiagIdx, onStateChange]
  );

  // Handle edge changes / removal
  const onEdgesChange = useCallback(
    (changes: any) => {
      if (!diagram) return;
      let hasChange = false;
      let nextEdges = [...diagram.edges];

      for (const change of changes) {
        if (change.type === 'remove') {
          nextEdges = nextEdges.filter((e) => e.id !== change.id);
          hasChange = true;
        }
      }

      if (hasChange) {
        const nextDiagrams = [...planState.diagrams];
        nextDiagrams[selectedDiagIdx] = { ...diagram, edges: nextEdges };
        onStateChange({ ...planState, diagrams: nextDiagrams });
      }
    },
    [diagram, planState, selectedDiagIdx, onStateChange]
  );

  // Handle new connection drawn by user
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!diagram || !connection.source || !connection.target) return;
      const newEdge: DiagramEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        style: 'solid',
        animated: true,
      };

      const nextDiagrams = [...planState.diagrams];
      nextDiagrams[selectedDiagIdx] = {
        ...diagram,
        edges: [...diagram.edges, newEdge],
      };
      onStateChange({ ...planState, diagrams: nextDiagrams });
    },
    [diagram, planState, selectedDiagIdx, onStateChange]
  );

  // Add new component
  const addNode = (type: NodeType) => {
    if (!diagram) return;
    const id = `node_${Date.now()}`;
    const defaultLabels: Record<NodeType, string> = {
      service: 'New Service',
      database: 'PostgreSQL DB',
      queue: 'Event Queue',
      gateway: 'API Gateway',
      actor: 'Client / User',
      default: 'Component',
    };

    const newNode: DiagramNode = {
      id,
      label: defaultLabels[type] || 'New Node',
      type,
      x: 150 + Math.random() * 200,
      y: 150 + Math.random() * 150,
      shape: type === 'database' ? 'cylinder' : type === 'queue' ? 'subroutine' : 'box',
    };

    const nextDiagrams = [...planState.diagrams];
    nextDiagrams[selectedDiagIdx] = {
      ...diagram,
      nodes: [...diagram.nodes, newNode],
    };
    onStateChange({ ...planState, diagrams: nextDiagrams });
  };

  // Run auto layout
  const handleAutoLayout = () => {
    if (!diagram) return;
    const nextNodes = JSON.parse(JSON.stringify(diagram.nodes));
    autoLayout(nextNodes, diagram.edges);

    const nextDiagrams = [...planState.diagrams];
    nextDiagrams[selectedDiagIdx] = { ...diagram, nodes: nextNodes };
    onStateChange({ ...planState, diagrams: nextDiagrams });
  };

  if (!diagram) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] text-slate-400">
        <Layers className="w-12 h-12 mb-3 text-slate-600" />
        <h3 className="text-base font-semibold text-slate-300">No Diagrams Found in Plan</h3>
        <p className="text-xs text-slate-500 mt-1">
          Add a ````mermaid block to your plan or create an architecture diagram.
        </p>
      </div>
    );
  }

  const liveMermaid = serializeToMermaid(diagram);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Diagram Switcher & Toolbar */}
      <div className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          {planState.diagrams.map((d, idx) => (
            <button
              key={d.id}
              onClick={() => setSelectedDiagIdx(idx)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                selectedDiagIdx === idx
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Diagram #{idx + 1} ({d.type})
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Add Component Menu */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 px-2">Add Component:</span>
            <button
              onClick={() => addNode('service')}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-indigo-300 hover:bg-slate-800 transition"
            >
              <Server className="w-3 h-3" /> Service
            </button>
            <button
              onClick={() => addNode('database')}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-amber-300 hover:bg-slate-800 transition"
            >
              <Database className="w-3 h-3" /> DB
            </button>
            <button
              onClick={() => addNode('queue')}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-purple-300 hover:bg-slate-800 transition"
            >
              <Layers className="w-3 h-3" /> Queue
            </button>
            <button
              onClick={() => addNode('gateway')}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-blue-300 hover:bg-slate-800 transition"
            >
              <Router className="w-3 h-3" /> Gateway
            </button>
            <button
              onClick={() => addNode('actor')}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-emerald-300 hover:bg-slate-800 transition"
            >
              <User className="w-3 h-3" /> Actor
            </button>
          </div>

          <button
            onClick={handleAutoLayout}
            title="Auto-arrange nodes in clean layers"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto Layout</span>
          </button>

          <button
            onClick={() => setShowMermaidCode(!showMermaidCode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
              showMermaidCode
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Mermaid Code</span>
          </button>
        </div>
      </div>

      {/* Main Canvas with optional Split Mermaid Preview */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-950"
          >
            <Background color="#1e293b" gap={16} size={1} />
            <Controls className="!bg-slate-900 !border-slate-800 !text-slate-300 !fill-slate-300" />
            <MiniMap
              nodeColor={() => '#3b82f6'}
              maskColor="rgba(15, 23, 42, 0.7)"
              className="!bg-slate-900 !border-slate-800"
            />
            <Panel position="bottom-left" className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl text-[11px] text-slate-400 shadow-lg">
              <span className="font-semibold text-slate-300">Canvas Controls:</span> Drag nodes to reposition • Drag handles to link • Double-click node to edit label • Select & press Del to remove
            </Panel>
          </ReactFlow>
        </div>

        {/* Live Mermaid Syntax Split Drawer */}
        {showMermaidCode && (
          <div className="w-80 h-full bg-slate-900 border-l border-slate-800 flex flex-col p-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-indigo-400" /> Live Mermaid Output
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Syncing 2-Way</span>
            </div>
            <pre className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 overflow-auto whitespace-pre">
              {liveMermaid}
            </pre>
            <p className="text-[10px] text-slate-500 mt-2">
              This syntax is dynamically generated from your visual node placements and will be written back to the plan markdown upon save/submit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
