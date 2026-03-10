import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { ProjectGraph, CodeNode, CodeEdge, NodeKind } from '../shared/types';
import { semanticSearchNodes } from './semanticSearch';

// ─── Node colors by kind ───
export const NODE_COLORS: Record<NodeKind, { bg: string; border: string; text: string; icon: string }> = {
  file:      { bg: '#1e293b', border: '#475569', text: '#e2e8f0', icon: '📄' },
  class:     { bg: '#1e1b4b', border: '#6366f1', text: '#c7d2fe', icon: '🔷' },
  function:  { bg: '#042f2e', border: '#14b8a6', text: '#99f6e4', icon: '⚡' },
  interface: { bg: '#1a1a2e', border: '#8b5cf6', text: '#c4b5fd', icon: '🔶' },
  enum:      { bg: '#27171a', border: '#f43f5e', text: '#fda4af', icon: '📋' },
  variable:  { bg: '#1c1917', border: '#f59e0b', text: '#fde68a', icon: '📌' },
  module:    { bg: '#0c1222', border: '#3b82f6', text: '#93c5fd', icon: '📦' },
};

// ─── Edge colors by kind ───
export const EDGE_COLORS: Record<string, string> = {
  inheritance: '#6366f1',
  implements:  '#8b5cf6',
  import:      '#3b82f6',
  contains:    '#475569',
  calls:       '#14b8a6',
  references:  '#f59e0b',
  dependency:  '#f59e0b',
};

const NODE_WIDTH = 220;
const NODE_HEIGHT_BASE = 50;
const NODE_HEIGHT_PER_PROP = 18;

function getNodeHeight(node: CodeNode): number {
  const propCount = (node.properties?.length || 0) + (node.parameters?.length || 0);
  return NODE_HEIGHT_BASE + Math.min(propCount, 5) * NODE_HEIGHT_PER_PROP;
}

export interface BuildFlowOptions {
  nodeLimit?: number;
}

export interface BuildFlowMeta {
  candidateNodes: number;
  candidateEdges: number;
  visibleNodes: number;
  visibleEdges: number;
  hiddenNodes: number;
  hiddenEdges: number;
}

export function resolveEffectiveViewMode(
  requestedMode: 'detailed' | 'folder',
  autoClusterEnabled: boolean,
  autoClusterThreshold: number,
  totalNodes: number,
): 'detailed' | 'folder' {
  if (requestedMode === 'folder') return 'folder';
  if (!autoClusterEnabled) return 'detailed';
  return totalNodes >= autoClusterThreshold ? 'folder' : 'detailed';
}

/**
 * Convert a ProjectGraph into React Flow nodes and edges with Dagre auto-layout.
 */
export function buildFlowGraph(
  graph: ProjectGraph,
  filterKinds: Set<string>,
  searchQuery: string,
  focusedNodeId?: string | null,
  highlightedCycle?: { nodeIds: string[]; edgeIds: string[] } | null,
  viewMode: 'detailed' | 'folder' = 'detailed',
  options?: BuildFlowOptions,
): { nodes: Node[]; edges: Edge[]; meta: BuildFlowMeta } {
  // ─── Highlighted cycle mode: show only the cycle nodes and edges ───
  if (highlightedCycle && highlightedCycle.nodeIds.length > 0) {
    const cycleNodeIds = new Set(highlightedCycle.nodeIds);
    const cycleEdgeIds = new Set(highlightedCycle.edgeIds);
    
    const cycleNodes = graph.nodes.filter(n => cycleNodeIds.has(n.id));
    const cycleEdges = graph.edges.filter(e => cycleEdgeIds.has(e.id));
    
    return layoutAndConvert(cycleNodes, cycleEdges, graph, undefined, true);
  }

  // ─── Focused-node mode: show only the focused node and its direct connections ───
  if (focusedNodeId) {
    const focusedNode = graph.nodes.find(n => n.id === focusedNodeId);
    if (focusedNode) {
      // Find all edges connected to the focused node (excluding 'contains')
      const connectedEdges = graph.edges.filter(
        e => (e.source === focusedNodeId || e.target === focusedNodeId) && e.kind !== 'contains'
      );

      // Collect all connected node IDs
      const connectedIds = new Set<string>([focusedNodeId]);
      for (const e of connectedEdges) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      }

      // Also include edges between the connected nodes themselves
      const allRelevantEdges = graph.edges.filter(
        e => connectedIds.has(e.source) && connectedIds.has(e.target) && e.kind !== 'contains'
      );

      const connectedNodes = graph.nodes.filter(n => connectedIds.has(n.id));
      return layoutAndConvert(connectedNodes, allRelevantEdges, graph, focusedNodeId);
    }
  }

  // ─── Folder-cluster mode ───
  if (viewMode === 'folder') {
    return buildFolderClusterGraph(graph);
  }

  // ─── Normal mode with kind/search filtering ───
  const allFilteredNodes = graph.nodes.filter(n => filterKinds.has(n.kind));

  let filteredNodes = allFilteredNodes;

  if (searchQuery.trim()) {
    // Use semantic search for intelligent matching
    filteredNodes = semanticSearchNodes(filteredNodes, searchQuery);
  }

  const allNodeIds = new Set(filteredNodes.map(n => n.id));

  const allCandidateEdges = graph.edges.filter(
    e => allNodeIds.has(e.source) && allNodeIds.has(e.target) && e.kind !== 'references'
  );

  if (options?.nodeLimit && options.nodeLimit > 0 && filteredNodes.length > options.nodeLimit) {
    filteredNodes = filteredNodes.slice(0, options.nodeLimit);
  }

  const nodeIds = new Set(filteredNodes.map(n => n.id));

  // Filter edges: only structural edges between visible nodes.
  // Exclude 'references' edges in normal view — they are only shown in focused mode.
  const filteredEdges = allCandidateEdges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  return layoutAndConvert(filteredNodes, filteredEdges, graph, undefined, false, {
    candidateNodes: allFilteredNodes.length,
    candidateEdges: allCandidateEdges.length,
  });
}

function buildFolderClusterGraph(graph: ProjectGraph): { nodes: Node[]; edges: Edge[]; meta: BuildFlowMeta } {
  const folderStats = new Map<string, { files: number; symbols: number }>();
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));

  const folderOf = (filePath: string): string => {
    const clean = filePath.replace(/\\/g, '/');
    const parts = clean.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : '(root)';
  };

  for (const node of graph.nodes) {
    const folder = folderOf(node.filePath);
    if (!folderStats.has(folder)) {
      folderStats.set(folder, { files: 0, symbols: 0 });
    }
    const stats = folderStats.get(folder)!;
    if (node.kind === 'file') {
      stats.files += 1;
    } else {
      stats.symbols += 1;
    }
  }

  const clusterNodes: CodeNode[] = Array.from(folderStats.entries()).map(([folder, stats]) => ({
    id: `module_${folder.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    name: folder,
    kind: 'module',
    filePath: folder,
    language: 'mixed',
    lineNumber: 1,
    endLine: 1,
    properties: [`files: ${stats.files}`, `symbols: ${stats.symbols}`],
  }));

  const edgeCountByFolders = new Map<string, number>();

  for (const edge of graph.edges) {
    if (edge.kind === 'contains' || edge.kind === 'references') continue;
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceFolder = folderOf(sourceNode.filePath);
    const targetFolder = folderOf(targetNode.filePath);
    if (sourceFolder === targetFolder) continue;

    const key = `${sourceFolder}=>${targetFolder}`;
    edgeCountByFolders.set(key, (edgeCountByFolders.get(key) || 0) + 1);
  }

  const clusterEdges: CodeEdge[] = Array.from(edgeCountByFolders.entries()).map(([key, count], idx) => {
    const [sourceFolder, targetFolder] = key.split('=>');
    return {
      id: `cluster_edge_${idx}`,
      source: `module_${sourceFolder.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      target: `module_${targetFolder.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      kind: 'dependency',
      label: `${count} deps`,
    };
  });

  return layoutAndConvert(clusterNodes, clusterEdges, graph, undefined, false, {
    candidateNodes: clusterNodes.length,
    candidateEdges: clusterEdges.length,
  });
}

/**
 * Perform dagre layout and convert to React Flow format.
 */
function layoutAndConvert(
  filteredNodes: CodeNode[],
  filteredEdges: CodeEdge[],
  graph: ProjectGraph,
  focusedNodeId?: string,
  isCycleMode?: boolean,
  metaInput?: { candidateNodes: number; candidateEdges: number },
): { nodes: Node[]; edges: Edge[]; meta: BuildFlowMeta } {
  // Pre-compute reference counts from ALL edges in the graph
  const refCounts = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.kind === 'references' || e.kind === 'calls') {
      refCounts.set(e.target, (refCounts.get(e.target) || 0) + 1);
    }
  }

  // Build dagre graph for layout
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: 60,
    ranksep: 80,
    edgesep: 30,
    marginx: 40,
    marginy: 40,
  });

  filteredNodes.forEach(node => {
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height: getNodeHeight(node),
    });
  });

  filteredEdges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  // Convert to React Flow format
  const flowNodes: Node[] = filteredNodes.map(node => {
    const dagreNode = g.node(node.id);
    const colors = NODE_COLORS[node.kind] || NODE_COLORS.file;

    return {
      id: node.id,
      type: 'codeNode',
      position: {
        x: (dagreNode?.x || 0) - NODE_WIDTH / 2,
        y: (dagreNode?.y || 0) - getNodeHeight(node) / 2,
      },
      measured: {
        width: NODE_WIDTH,
        height: getNodeHeight(node),
      },
      data: {
        ...node,
        colors,
        width: NODE_WIDTH,
        height: getNodeHeight(node),
        referenceCount: refCounts.get(node.id) || 0,
        isFocused: node.id === focusedNodeId,
      },
    };
  });

  const flowEdges: Edge[] = filteredEdges.map(edge => {
    const color = isCycleMode ? '#ef4444' : (EDGE_COLORS[edge.kind] || EDGE_COLORS.dependency);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.kind === 'contains' ? 'smoothstep' : 'default',
      animated: isCycleMode || edge.kind === 'inheritance' || edge.kind === 'implements' || edge.kind === 'references',
      label: edge.kind !== 'contains' ? edge.label : undefined,
      style: {
        stroke: color,
        strokeWidth: isCycleMode ? 3 : (edge.kind === 'contains' ? 1 : (edge.kind === 'references' ? 2 : 2)),
        opacity: isCycleMode ? 1 : (edge.kind === 'contains' ? 0.4 : 0.8),
      },
      labelStyle: {
        fill: color,
        fontSize: isCycleMode ? 11 : 10,
        fontWeight: isCycleMode ? 600 : 500,
      },
      markerEnd: {
        type: 'arrowclosed' as const,
        color,
        width: isCycleMode ? 18 : 15,
        height: isCycleMode ? 18 : 15,
      },
    };
  });

  const candidateNodes = metaInput?.candidateNodes ?? filteredNodes.length;
  const candidateEdges = metaInput?.candidateEdges ?? filteredEdges.length;

  return {
    nodes: flowNodes,
    edges: flowEdges,
    meta: {
      candidateNodes,
      candidateEdges,
      visibleNodes: flowNodes.length,
      visibleEdges: flowEdges.length,
      hiddenNodes: Math.max(0, candidateNodes - flowNodes.length),
      hiddenEdges: Math.max(0, candidateEdges - flowEdges.length),
    },
  };
}
