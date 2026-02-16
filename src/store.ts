import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { ProjectGraph, CodeNode, EdgeKind } from '../shared/types';

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
  ideCommand: localStorage.getItem('code2node_ide') || 'code',
  searchQuery: '',
  filterKinds: new Set(['file', 'class', 'function', 'interface', 'enum']),
  sidebarOpen: true,
  detailsOpen: false,
  flowNodes: [] as Node[],
  flowEdges: [] as Edge[],
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setGraph: (graph) => set({ graph, error: null, scanProgress: null }),
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
  setIdeCommand: (ideCommand) => {
    localStorage.setItem('code2node_ide', ideCommand);
    set({ ideCommand });
  },
  setFlowNodes: (flowNodes) => set({ flowNodes }),
  setFlowEdges: (flowEdges) => set({ flowEdges }),
  reset: () => set(initialState),
}));
