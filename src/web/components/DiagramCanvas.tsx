import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  reconnectEdge,
  Connection,
  Handle,
  Position,
  NodeProps,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Server,
  Database,
  Layers,
  Router,
  User,
  Trash2,
  Code2,
  LayoutGrid,
  Link2,
  Plus,
} from 'lucide-react';
import { PlanState, ParsedDiagram, DiagramNode, DiagramEdge, NodeType } from '../../core/types.js';
import { autoLayout, serializeToMermaid, rebuildDiagramFlows } from '../../core/mermaid-graph-bridge.js';
import { appendAutoInstruction } from '../utils/instructions.js';

// Custom 4-Way Node Component with Handles on all 4 boundaries and delete button
const CustomDiagramNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data.label as string) || id);

  useEffect(() => {
    setLabel((data.label as string) || id);
  }, [data.label, id]);

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
        return 'border-amber-500/40 bg-amber-950/40';
      case 'queue':
        return 'border-purple-500/40 bg-purple-950/40';
      case 'gateway':
        return 'border-blue-500/40 bg-blue-950/40';
      case 'actor':
        return 'border-emerald-500/40 bg-emerald-950/40';
      case 'service':
      default:
        return 'border-indigo-500/40 bg-slate-900/95';
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange && typeof data.onLabelChange === 'function') {
      (data.onLabelChange as (id: string, label: string) => void)(id, label);
    }
  };

  const labelLines = label.split('\n');

  return (
    <div
      className={`group relative px-4 py-3 rounded-xl border-2 shadow-xl w-[245px] max-w-[260px] text-white transition-all ${getBgStyle()} ${
        selected ? 'ring-2 ring-emerald-400 border-emerald-400 shadow-emerald-950' : ''
      }`}
    >
      {/* 4-Way Handles (Top, Bottom, Right, Left) - Primary Bottom source & Top target first */}
      {/* Top Handles */}
      <Handle type="target" position={Position.Top} id="top-tgt" className="!bg-emerald-400 !w-3 !h-3 !-top-1.5 hover:!scale-125 transition" />
      <Handle type="source" position={Position.Top} id="top-src" className="!bg-indigo-400 !w-2 !h-2 !-top-1 opacity-0 hover:opacity-100" />

      {/* Bottom Handles */}
      <Handle type="source" position={Position.Bottom} id="bottom-src" className="!bg-indigo-400 !w-3 !h-3 !-bottom-1.5 hover:!scale-125 transition" />
      <Handle type="target" position={Position.Bottom} id="bottom-tgt" className="!bg-emerald-400 !w-2 !h-2 !-bottom-1 opacity-0 hover:opacity-100" />

      {/* Right Handles */}
      <Handle type="source" position={Position.Right} id="right-src" className="!bg-indigo-400 !w-3 !h-3 !-right-1.5 hover:!scale-125 transition" />
      <Handle type="target" position={Position.Right} id="right-tgt" className="!bg-emerald-400 !w-2 !h-2 !-right-1 opacity-0 hover:opacity-100" />

      {/* Left Handles */}
      <Handle type="target" position={Position.Left} id="left-tgt" className="!bg-emerald-400 !w-3 !h-3 !-left-1.5 hover:!scale-125 transition" />
      <Handle type="source" position={Position.Left} id="left-src" className="!bg-indigo-400 !w-2 !h-2 !-left-1 opacity-0 hover:opacity-100" />

      {/* Node Header with Type Icon and Delete Button */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded bg-slate-800/90 border border-slate-700">{getIcon()}</div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {nodeType}
          </span>
        </div>

        {/* Delete Node Button */}
        <button
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (data.onDeleteNode && typeof data.onDeleteNode === 'function') {
              (data.onDeleteNode as (id: string) => void)(id);
            }
          }}
          title="Delete component"
          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 opacity-70 group-hover:opacity-100 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Node Label */}
      {isEditing ? (
        <input
          type="text"
          value={label}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') handleBlur();
          }}
          className="text-xs font-semibold bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white w-full outline-none focus:border-emerald-500"
        />
      ) : (
        <div
          onDoubleClick={() => setIsEditing(true)}
          className="cursor-text hover:text-emerald-300 space-y-0.5"
          title="Double click to edit label"
        >
          <div className="text-xs font-semibold text-slate-100 whitespace-normal break-words leading-snug">
            {labelLines[0]}
          </div>
          {labelLines.length > 1 && (
            <div className="text-[11px] font-medium text-slate-300/90 whitespace-normal break-words leading-snug">
              {labelLines.slice(1).join(' · ')}
            </div>
          )}
        </div>
      )}
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);

  const hasSelection = Boolean(selectedEdgeId || selectedNodeId);

  const diagram: ParsedDiagram | undefined = planState.diagrams[selectedDiagIdx];

  const nodeTypes = useMemo(() => ({ custom: CustomDiagramNode }), []);

  // Deselect on click outside the canvas
  useEffect(() => {
    const handleDocumentMouseDown = (e: MouseEvent) => {
      // Don't deselect if clicking inside the Delete button itself
      if (deleteButtonRef.current && deleteButtonRef.current.contains(e.target as Node)) {
        return;
      }
      // If clicking outside the React Flow canvas (e.g. top toolbar, switcher, page)
      if (
        reactFlowWrapperRef.current &&
        !reactFlowWrapperRef.current.contains(e.target as Node)
      ) {
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
      }
    };

    window.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, []);

  // Update node label
  const handleNodeLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      if (!diagram) return;
      const targetNode = diagram.nodes.find((n) => n.id === nodeId);
      if (!targetNode || targetNode.label === newLabel) return;

      const nextNodes = diagram.nodes.map((n) =>
        n.id === nodeId ? { ...n, label: newLabel } : n
      );
      const nextDiagrams = [...planState.diagrams];
      nextDiagrams[selectedDiagIdx] = rebuildDiagramFlows({ ...diagram, nodes: nextNodes });
      const updatedInstructions = appendAutoInstruction(
        `Renamed diagram component: "${targetNode.label}" -> "${newLabel}"`,
        planState.userInstructions
      );
      onStateChange({
        ...planState,
        diagrams: nextDiagrams,
        userInstructions: updatedInstructions,
      });
    },
    [diagram, planState, selectedDiagIdx, onStateChange]
  );

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!diagram) return;
      const targetNode = diagram.nodes.find((n) => n.id === nodeId);
      const nextNodes = diagram.nodes.filter((n) => n.id !== nodeId);
      const nextEdges = diagram.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      );
      const nextDiagrams = [...planState.diagrams];
      nextDiagrams[selectedDiagIdx] = rebuildDiagramFlows({
        ...diagram,
        nodes: nextNodes,
        edges: nextEdges,
      });
      const updatedInstructions = appendAutoInstruction(
        `Removed diagram component: "${targetNode?.label || nodeId}" (${targetNode?.type || 'node'})`,
        planState.userInstructions
      );
      onStateChange({
        ...planState,
        diagrams: nextDiagrams,
        userInstructions: updatedInstructions,
      });
      setSelectedNodeId(null);
      setSelectedEdgeId((currentEdgeId) => {
        if (!currentEdgeId) return null;
        return nextEdges.some((e) => e.id === currentEdgeId) ? currentEdgeId : null;
      });
    },
    [diagram, planState, selectedDiagIdx, onStateChange]
  );

  // Delete selected edge
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      if (!diagram) return;
      const edgeToDelete = diagram.edges.find((e) => e.id === edgeId);
      const sourceNode = edgeToDelete ? diagram.nodes.find((n) => n.id === edgeToDelete.source) : null;
      const targetNode = edgeToDelete ? diagram.nodes.find((n) => n.id === edgeToDelete.target) : null;
      const srcLabel = sourceNode?.label || edgeToDelete?.source || 'node';
      const tgtLabel = targetNode?.label || edgeToDelete?.target || 'node';

      const nextEdges = diagram.edges.filter((e) => e.id !== edgeId);
      const nextDiagrams = [...planState.diagrams];
      nextDiagrams[selectedDiagIdx] = rebuildDiagramFlows({ ...diagram, edges: nextEdges });
      const updatedInstructions = appendAutoInstruction(
        `Removed diagram connection: "${srcLabel}" -> "${tgtLabel}"`,
        planState.userInstructions
      );
      onStateChange({
        ...planState,
        diagrams: nextDiagrams,
        userInstructions: updatedInstructions,
      });
      setSelectedEdgeId(null);
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
      selected: selectedNodeId === n.id,
      data: {
        label: n.label,
        type: n.type,
        shape: n.shape,
        onLabelChange: handleNodeLabelChange,
        onDeleteNode: handleDeleteNode,
      },
    }));
  }, [diagram, selectedNodeId, handleNodeLabelChange, handleDeleteNode]);

  // React Flow edges with selection styling, smoothstep/bezier routing & arrowheads
  const flowEdges: Edge[] = useMemo(() => {
    if (!diagram) return [];
    const nodeMap = new Map(diagram.nodes.map((n) => [n.id, n]));
    const dashedInCount = new Map<string, number>();
    for (const e of diagram.edges) {
      if (e.style === 'dashed') {
        dashedInCount.set(e.target, (dashedInCount.get(e.target) || 0) + 1);
      }
    }

    const outIdxBySource = new Map<string, number>();
    return diagram.edges.map((e) => {
      const siblingIdx = outIdxBySource.get(e.source) || 0;
      outIdxBySource.set(e.source, siblingIdx + 1);

      const isSelected = selectedEdgeId === e.id;
      const isConnectedToSelectedNode =
        Boolean(selectedNodeId) && (selectedNodeId === e.source || selectedNodeId === e.target);
      const isHighFanInDashed =
        e.style === 'dashed' && (dashedInCount.get(e.target) || 0) >= 4;
      const isHighlighted = isSelected || isConnectedToSelectedNode;

      const strokeColor = isSelected
        ? '#f59e0b'
        : isConnectedToSelectedNode && e.style === 'dashed'
        ? '#38bdf8'
        : e.style === 'dashed'
        ? '#64748b'
        : '#22c55e';

      let sourceHandle = e.sourceHandle;
      let targetHandle = e.targetHandle;
      if (!sourceHandle || !targetHandle) {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (src && tgt) {
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          if (e.style === 'dashed' && dx > 250) {
            sourceHandle = sourceHandle || 'right-src';
            targetHandle = targetHandle || 'left-tgt';
          } else if (dy >= 50) {
            sourceHandle = sourceHandle || 'bottom-src';
            targetHandle = targetHandle || 'top-tgt';
          } else if (dy <= -50) {
            sourceHandle = sourceHandle || 'top-src';
            targetHandle = targetHandle || 'bottom-tgt';
          } else if (dx >= 0) {
            sourceHandle = sourceHandle || 'right-src';
            targetHandle = targetHandle || 'left-tgt';
          } else {
            sourceHandle = sourceHandle || 'left-src';
            targetHandle = targetHandle || 'right-tgt';
          }
        }
      }

      // Hide colliding labels on high-fan-in dashed telemetry edges unless selected/inspected
      const visibleLabel =
        isHighFanInDashed && !isHighlighted ? undefined : e.label;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: isHighFanInDashed ? 'default' : 'smoothstep',
        pathOptions: isHighFanInDashed
          ? undefined
          : { borderRadius: 16, offset: 18 + (siblingIdx % 4) * 12 },
        sourceHandle,
        targetHandle,
        label: visibleLabel,
        reconnectable: true,
        selected: isSelected,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: isHighFanInDashed && !isHighlighted ? 11 : 15,
          height: isHighFanInDashed && !isHighlighted ? 11 : 15,
          color: strokeColor,
        },
        style: {
          stroke: strokeColor,
          strokeOpacity: isHighFanInDashed && !isHighlighted ? 0.24 : 1,
          strokeWidth: isSelected
            ? 3.5
            : isHighlighted
            ? 2.5
            : e.style === 'thick'
            ? 3
            : isHighFanInDashed
            ? 1.35
            : 1.75,
          strokeDasharray: e.style === 'dashed' ? '5,5' : undefined,
        },
        labelStyle: { fill: '#e2e8f0', fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.92, rx: 5, ry: 5 },
        labelBgPadding: [6, 4] as [number, number],
      };
    });
  }, [diagram, selectedEdgeId, selectedNodeId]);

  // Node position & removal handling
  const onNodesChange = useCallback(
    (changes: any) => {
      if (!diagram) return;
      let hasPosition = false;
      const nextNodes = [...diagram.nodes];

      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          const target = nextNodes.find((n) => n.id === change.id);
          if (target) {
            target.x = change.position.x;
            target.y = change.position.y;
            hasPosition = true;
          }
        } else if (change.type === 'remove') {
          handleDeleteNode(change.id);
          return;
        } else if (change.type === 'select') {
          if (change.selected) {
            setSelectedNodeId(change.id);
            setSelectedEdgeId(null);
          } else if (selectedNodeId === change.id) {
            setSelectedNodeId(null);
          }
        }
      }

      if (hasPosition) {
        const nextDiagrams = [...planState.diagrams];
        nextDiagrams[selectedDiagIdx] = { ...diagram, nodes: nextNodes };
        onStateChange({ ...planState, diagrams: nextDiagrams });
      }
    },
    [diagram, planState, selectedDiagIdx, onStateChange, handleDeleteNode, selectedNodeId]
  );

  // Edge changes handling
  const onEdgesChange = useCallback(
    (changes: any) => {
      if (!diagram) return;

      for (const change of changes) {
        if (change.type === 'remove') {
          handleDeleteEdge(change.id);
          return;
        } else if (change.type === 'select') {
          if (change.selected) {
            setSelectedEdgeId(change.id);
            setSelectedNodeId(null);
          } else if (selectedEdgeId === change.id) {
            setSelectedEdgeId(null);
          }
        }
      }
    },
    [diagram, handleDeleteEdge, selectedEdgeId]
  );

  // Pane click (click on empty canvas background)
  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
  }, []);

  // Edge click
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  // Node click
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  // Selection change from React Flow
  const onSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      if (edges.length > 0) {
        setSelectedEdgeId(edges[0].id);
        setSelectedNodeId(null);
      } else if (nodes.length > 0) {
        setSelectedNodeId(nodes[0].id);
        setSelectedEdgeId(null);
      } else {
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
      }
    },
    []
  );

  // Connect new edge (connectable on any 4 handles)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!diagram || !connection.source || !connection.target) return;
      const sourceNode = diagram.nodes.find((n) => n.id === connection.source);
      const targetNode = diagram.nodes.find((n) => n.id === connection.target);
      const srcLabel = sourceNode?.label || connection.source;
      const tgtLabel = targetNode?.label || connection.target;

      const newEdge: DiagramEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        style: 'solid',
        animated: true,
      };

      const nextDiagrams = [...planState.diagrams];
      nextDiagrams[selectedDiagIdx] = rebuildDiagramFlows({
        ...diagram,
        edges: [...diagram.edges, newEdge],
      });
      const updatedInstructions = appendAutoInstruction(
        `Connected diagram: "${srcLabel}" -> "${tgtLabel}"`,
        planState.userInstructions
      );
      onStateChange({
        ...planState,
        diagrams: nextDiagrams,
        userInstructions: updatedInstructions,
      });
    },
    [diagram, planState, selectedDiagIdx, onStateChange]
  );

  // Reconnect existing edge to a new node / handle
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!diagram || !newConnection.source || !newConnection.target) return;
      const sourceNode = diagram.nodes.find((n) => n.id === newConnection.source);
      const targetNode = diagram.nodes.find((n) => n.id === newConnection.target);
      const srcLabel = sourceNode?.label || newConnection.source;
      const tgtLabel = targetNode?.label || newConnection.target;

      const nextEdges = diagram.edges.map((e) => {
        if (e.id === oldEdge.id) {
          return {
            ...e,
            source: newConnection.source,
            target: newConnection.target,
            sourceHandle: newConnection.sourceHandle || undefined,
            targetHandle: newConnection.targetHandle || undefined,
          };
        }
        return e;
      });

      const nextDiagrams = [...planState.diagrams];
      nextDiagrams[selectedDiagIdx] = rebuildDiagramFlows({ ...diagram, edges: nextEdges });
      const updatedInstructions = appendAutoInstruction(
        `Rewired diagram connection to: "${srcLabel}" -> "${tgtLabel}"`,
        planState.userInstructions
      );
      onStateChange({
        ...planState,
        diagrams: nextDiagrams,
        userInstructions: updatedInstructions,
      });
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
      x: 200 + Math.random() * 200,
      y: 200 + Math.random() * 150,
      shape: type === 'database' ? 'cylinder' : type === 'queue' ? 'subroutine' : 'box',
    };

    const nextDiagrams = [...planState.diagrams];
    nextDiagrams[selectedDiagIdx] = {
      ...diagram,
      nodes: [...diagram.nodes, newNode],
    };
    const updatedInstructions = appendAutoInstruction(
      `Added diagram component: "${newNode.label}" (${newNode.type})`,
      planState.userInstructions
    );
    onStateChange({
      ...planState,
      diagrams: nextDiagrams,
      userInstructions: updatedInstructions,
    });
  };

  // Run auto layout
  const handleAutoLayout = () => {
    if (!diagram) return;
    const nextNodes = JSON.parse(JSON.stringify(diagram.nodes));
    autoLayout(nextNodes, diagram.edges);

    const nextDiagrams = [...planState.diagrams];
    nextDiagrams[selectedDiagIdx] = { ...diagram, nodes: nextNodes };
    const updatedInstructions = appendAutoInstruction(
      `Applied automated layered layout to architecture diagram`,
      planState.userInstructions
    );
    onStateChange({
      ...planState,
      diagrams: nextDiagrams,
      userInstructions: updatedInstructions,
    });
  };

  // Initialize a new diagram when plan has no diagrams
  const handleCreateNewDiagram = () => {
    const starterNodes: DiagramNode[] = [
      { id: 'Client', label: 'Client / User', type: 'actor', shape: 'circle', x: 100, y: 180 },
      { id: 'Gateway', label: 'API Gateway', type: 'gateway', shape: 'rounded', x: 360, y: 180 },
      { id: 'CoreService', label: 'Core Service', type: 'service', shape: 'box', x: 620, y: 180 },
    ];
    const starterEdges: DiagramEdge[] = [
      { id: 'e-Client-Gateway-0', source: 'Client', target: 'Gateway', label: 'HTTP Request', style: 'solid', animated: true },
      { id: 'e-Gateway-CoreService-1', source: 'Gateway', target: 'CoreService', label: 'Route', style: 'solid', animated: true },
    ];
    const newDiag: ParsedDiagram = rebuildDiagramFlows({
      id: `diag-${planState.diagrams.length + 1}`,
      type: 'flowchart',
      rawMermaid: '',
      nodes: starterNodes,
      edges: starterEdges,
      flowSteps: [],
      scenarios: [],
    });

    const updatedInstructions = appendAutoInstruction(
      `Initialized new architecture diagram on canvas`,
      planState.userInstructions
    );

    onStateChange({
      ...planState,
      diagrams: [...planState.diagrams, newDiag],
      userInstructions: updatedInstructions,
    });
    setSelectedDiagIdx(planState.diagrams.length);
  };

  if (!diagram) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] text-slate-400 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Layers className="w-7 h-7" />
          </div>
          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/20 mb-2">
            Text-Only Plan Mode
          </span>
          <h3 className="text-lg font-bold text-white">No Diagrams Found in Plan</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            This plan file does not contain any <code className="text-indigo-300 bg-slate-950 px-1.5 py-0.5 rounded">```mermaid</code> architecture or sequence blocks. You can review and edit all tasks in the <strong>Plan &amp; Tasks</strong> tab, or initialize an interactive diagram below.
          </p>
          <button
            onClick={handleCreateNewDiagram}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Initialize Architecture Diagram</span>
          </button>
        </div>
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

          {/* Delete Action button (Delete Connection / Delete Component, disabled when nothing is selected) */}
          <button
            ref={deleteButtonRef}
            disabled={!hasSelection}
            onMouseDown={(e) => {
              // Crucial: prevent canvas blur/deselect on mousedown before click triggers
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (selectedEdgeId) {
                handleDeleteEdge(selectedEdgeId);
              } else if (selectedNodeId) {
                handleDeleteNode(selectedNodeId);
              }
            }}
            title={
              selectedEdgeId
                ? 'Delete selected connection (Del)'
                : selectedNodeId
                ? 'Delete selected component (Del)'
                : 'Select an edge or component to delete'
            }
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              hasSelection
                ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 cursor-pointer shadow-sm'
                : 'bg-slate-800/40 text-slate-500 border border-slate-800 cursor-not-allowed opacity-40'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {selectedEdgeId
                ? 'Delete Connection'
                : selectedNodeId
                ? 'Delete Component'
                : 'Delete'}
            </span>
          </button>

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
        <div className="flex-1 h-full relative" ref={reactFlowWrapperRef}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onPaneClick={onPaneClick}
            onEdgeClick={onEdgeClick}
            onNodeClick={onNodeClick}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Backspace', 'Delete']}
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
              <span className="font-semibold text-slate-300">4-Way Linking:</span> Connect from any edge boundary (Top/Right/Bottom/Left) • Drag edge ends to reconnect • Click edge/node to delete (Del key or trash icon)
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
              This syntax dynamically updates as you move, link, or delete nodes and edges on the canvas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
