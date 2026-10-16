export type FileChangeType = 'NEW' | 'MODIFY' | 'DELETE';

export interface FileChange {
  path: string;
  type: FileChangeType;
  summary?: string;
}

export interface PlanTask {
  id: string;
  title: string;
  completed: boolean;
  indent: number;
  notes?: string;
}

export type NodeType = 'service' | 'database' | 'queue' | 'gateway' | 'actor' | 'default';

export interface DiagramNode {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  shape?: 'box' | 'cylinder' | 'rounded' | 'circle' | 'subroutine';
  meta?: Record<string, any>;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'thick';
  animated?: boolean;
}

export interface FlowStep {
  stepNumber: number;
  source: string;
  target: string;
  label: string;
  payload?: string;
  response?: string;
  notes?: string;
  status?: 'success' | 'failure' | 'pending';
}

export interface FlowScenario {
  id: string;
  name: string;
  type: 'success' | 'failure' | 'edge_case';
  description: string;
  steps: FlowStep[];
  touchedComponents: string[];
}

export interface ParsedDiagram {
  id: string;
  type: 'flowchart' | 'sequence';
  title?: string;
  rawMermaid: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  flowSteps: FlowStep[];
  scenarios: FlowScenario[];
}

export interface GoalInfo {
  title: string;
  description: string;
}

export interface PlanState {
  rawMarkdown: string;
  goal: GoalInfo;
  tasks: PlanTask[];
  fileChanges: FileChange[];
  diagrams: ParsedDiagram[];
  userInstructions: string;
  sections: Array<{ heading: string; level: number; content: string }>;
}

export interface BaselineCheckpoint {
  id: string;
  timestamp: number;
  label: string;
  snapshot: PlanState;
}

export interface PlanDiff {
  tasksAdded: string[];
  tasksRemoved: string[];
  tasksModified: string[];
  diagramChanges: string[];
  goalChanges?: string[];
  instructionsChanged: boolean;
}

export interface ReviewResult {
  status: 'APPROVED' | 'CHANGES_REQUESTED' | 'DISCARDED';
  planPath: string;
  diff: PlanDiff;
  userInstructions?: string;
  updatedMarkdown: string;
}
