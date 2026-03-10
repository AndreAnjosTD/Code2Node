import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { ProjectGraph, CodeNode, EdgeKind } from '../shared/types';

// ─── Repo-scale defaults (importable by UI for dropdown options) ───
export const PROGRESSIVE_INITIAL_NODES_OPTIONS = [250, 500, 1000, 2000] as const;
export const PROGRESSIVE_LOAD_STEP_OPTIONS = [100, 250, 500, 1000] as const;
export const AUTO_CLUSTER_THRESHOLD_OPTIONS = [500, 1000, 1200, 1500, 2500] as const;

export const PROGRESSIVE_INITIAL_NODES_DEFAULT = 500;
export const PROGRESSIVE_LOAD_STEP_DEFAULT = 250;
export const AUTO_CLUSTER_THRESHOLD_DEFAULT = 1200;

export interface CodeViewerConnection {
  name: string;       // dependency node name (search term)
  edgeKind: EdgeKind; // 'inheritance', 'references', etc.
  label?: string;     // edge label e.g. 'extends Animal'
}

export interface ScanProgress {
  phase: 'discovering' | 'parsing' | 'resolving' | 'complete' | 'error';
  currentFile?: string;
  filesDiscovered: number;
  filesParsed: number;
  totalFiles: number;
  nodesFound: number;
  edgesFound: number;
  languages: Record<string, number>;
  message: string;
}

export interface RenderTelemetry {
  layoutMs: number;
  sourceNodes: number;
  sourceEdges: number;
  visibleNodes: number;
  visibleEdges: number;
  hiddenNodes: number;
  hiddenEdges: number;
  effectiveViewMode: 'detailed' | 'folder';
  progressiveActive: boolean;
  updatedAt: number;
}

export const RENDER_TELEMETRY_INITIAL: RenderTelemetry = {
  layoutMs: 0,
  sourceNodes: 0,
  sourceEdges: 0,
  visibleNodes: 0,
  visibleEdges: 0,
  hiddenNodes: 0,
  hiddenEdges: 0,
  effectiveViewMode: 'detailed',
  progressiveActive: false,
  updatedAt: 0,
};

/**
 * Compute the progressive render-node limit given the current config.
 * Returns `null` when progressive loading is disabled or there's no graph.
 */
function computeRenderNodeLimit(
  enabled: boolean,
  initialNodes: number,
  graph: ProjectGraph | null,
): number | null {
  if (!enabled || !graph) return null;
  return Math.min(initialNodes, graph.nodes.length);
}

export interface AppState {
  // Project data
  graph: ProjectGraph | null;
  loading: boolean;
  error: string | null;
  projectPath: string;

  // Scan progress
  scanProgress: ScanProgress | null;

  // UI state
  selectedNode: CodeNode | null;
  searchQuery: string;
  filterKinds: Set<string>;
  sidebarOpen: boolean;
  detailsOpen: boolean;

  // Code viewer
  codeViewerNode: CodeNode | null;
  codeViewerConnections: CodeViewerConnection[] | null;

  // Focus mode (show connections for a specific node)
  focusedNodeId: string | null;

  // Highlighted cycle (for cycle detection)
  highlightedCycle: { nodeIds: string[]; edgeIds: string[] } | null;

  // Expert mode (fullscreen canvas)
  expertMode: boolean;

  // Active sidebar panel (controlled by keyboard too)
  activeSidebarPanel: string | null;

  // Graph view mode
  graphViewMode: 'detailed' | 'folder';

  // Repo-scale controls
  progressiveLoadingEnabled: boolean;
  progressiveInitialNodes: number;
  progressiveLoadStep: number;
  renderNodeLimit: number | null;
  autoClusterEnabled: boolean;
  autoClusterThreshold: number;

  // Render performance telemetry
  renderTelemetry: RenderTelemetry;

  // Settings
  ideCommand: string;

  // React Flow nodes/edges
  flowNodes: Node[];
  flowEdges: Edge[];

  // Actions
  setGraph: (graph: ProjectGraph) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProjectPath: (path: string) => void;
  setScanProgress: (progress: ScanProgress | null) => void;
  setSelectedNode: (node: CodeNode | null) => void;
  setSearchQuery: (query: string) => void;
  toggleFilterKind: (kind: string) => void;
  setFilterKinds: (kinds: Set<string>) => void;
  setSidebarOpen: (open: boolean) => void;
  setDetailsOpen: (open: boolean) => void;
  setCodeViewerNode: (node: CodeNode | null) => void;
  setCodeViewerConnections: (connections: CodeViewerConnection[] | null) => void;
  setFocusedNodeId: (id: string | null) => void;
  setHighlightedCycle: (cycle: { nodeIds: string[]; edgeIds: string[] } | null) => void;
  setExpertMode: (on: boolean) => void;
  setActiveSidebarPanel: (panel: string | null) => void;
  setGraphViewMode: (mode: 'detailed' | 'folder') => void;
  setProgressiveLoadingEnabled: (enabled: boolean) => void;
  setProgressiveInitialNodes: (value: number) => void;
  setProgressiveLoadStep: (value: number) => void;
  loadMoreRenderNodes: () => void;
  setAutoClusterEnabled: (enabled: boolean) => void;
  setAutoClusterThreshold: (value: number) => void;
  setRenderTelemetry: (telemetry: RenderTelemetry) => void;
  setIdeCommand: (cmd: string) => void;
  setFlowNodes: (nodes: Node[]) => void;
  setFlowEdges: (edges: Edge[]) => void;
  reset: () => void;
}

const initialState = {
  graph: null,
  loading: false,
  error: null,
  projectPath: '',
  scanProgress: null as ScanProgress | null,
  selectedNode: null,
  codeViewerNode: null as CodeNode | null,
  codeViewerConnections: null as CodeViewerConnection[] | null,
  focusedNodeId: null as string | null,
  highlightedCycle: null as { nodeIds: string[]; edgeIds: string[] } | null,
  expertMode: false,
  activeSidebarPanel: 'project' as string | null,
  graphViewMode: 'detailed' as 'detailed' | 'folder',
  progressiveLoadingEnabled: true,
  progressiveInitialNodes: PROGRESSIVE_INITIAL_NODES_DEFAULT,
  progressiveLoadStep: PROGRESSIVE_LOAD_STEP_DEFAULT,
  renderNodeLimit: null as number | null,
  autoClusterEnabled: true,
  autoClusterThreshold: AUTO_CLUSTER_THRESHOLD_DEFAULT,
  renderTelemetry: { ...RENDER_TELEMETRY_INITIAL },
  ideCommand: localStorage.getItem('code2node_ide') || 'code',
  searchQuery: '',
  filterKinds: new Set(['file', 'module', 'class', 'function', 'interface', 'enum', 'variable']),
  sidebarOpen: true,
  detailsOpen: false,
  flowNodes: [] as Node[],
  flowEdges: [] as Edge[],
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  setGraph: (graph) => set((state) => ({
    graph,
    error: null,
    scanProgress: null,
    renderNodeLimit: computeRenderNodeLimit(
      state.progressiveLoadingEnabled, state.progressiveInitialNodes, graph,
    ),
  })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false, scanProgress: null }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  setSelectedNode: (selectedNode) => set({ selectedNode, detailsOpen: !!selectedNode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleFilterKind: (kind) =>
    set((state) => {
      const newKinds = new Set(state.filterKinds);
      if (newKinds.has(kind)) {
        newKinds.delete(kind);
      } else {
        newKinds.add(kind);
      }
      return { filterKinds: newKinds };
    }),
  setFilterKinds: (filterKinds) => set({ filterKinds }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  setCodeViewerNode: (codeViewerNode) => set({ codeViewerNode, codeViewerConnections: codeViewerNode ? undefined : null }),
  setCodeViewerConnections: (codeViewerConnections) => set({ codeViewerConnections }),
  setFocusedNodeId: (focusedNodeId) => set({ focusedNodeId }),
  setHighlightedCycle: (highlightedCycle) => set({ highlightedCycle, focusedNodeId: null }),
  setExpertMode: (expertMode) => set({ expertMode }),
  setActiveSidebarPanel: (activeSidebarPanel) => set({ activeSidebarPanel }),
  setGraphViewMode: (graphViewMode) => set({ graphViewMode }),
  setProgressiveLoadingEnabled: (progressiveLoadingEnabled) => set((state) => ({
    progressiveLoadingEnabled,
    renderNodeLimit: computeRenderNodeLimit(
      progressiveLoadingEnabled, state.progressiveInitialNodes, state.graph,
    ),
  })),
  setProgressiveInitialNodes: (progressiveInitialNodes) => set((state) => ({
    progressiveInitialNodes,
    renderNodeLimit: computeRenderNodeLimit(
      state.progressiveLoadingEnabled, progressiveInitialNodes, state.graph,
    ),
  })),
  setProgressiveLoadStep: (progressiveLoadStep) => set({ progressiveLoadStep }),
  loadMoreRenderNodes: () => {
    const state = get();
    if (!state.graph || !state.progressiveLoadingEnabled) return;
    const totalNodes = state.graph.nodes.length;
    const currentLimit = state.renderNodeLimit ?? Math.min(state.progressiveInitialNodes, totalNodes);
    const nextLimit = Math.min(totalNodes, currentLimit + state.progressiveLoadStep);
    set({ renderNodeLimit: nextLimit });
  },
  setAutoClusterEnabled: (autoClusterEnabled) => set({ autoClusterEnabled }),
  setAutoClusterThreshold: (autoClusterThreshold) => set({ autoClusterThreshold }),
  setRenderTelemetry: (renderTelemetry) => set({ renderTelemetry }),
  setIdeCommand: (ideCommand) => {
    localStorage.setItem('code2node_ide', ideCommand);
    set({ ideCommand });
  },
  setFlowNodes: (flowNodes) => set({ flowNodes }),
  setFlowEdges: (flowEdges) => set({ flowEdges }),
  reset: () => set(initialState),
}));
