import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { ProjectGraph, CodeNode, CodeEdge, NodeKind } from '../shared/types';

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

/**
 * Convert a ProjectGraph into React Flow nodes and edges with Dagre auto-layout.
 */
export function buildFlowGraph(
  graph: ProjectGraph,
  filterKinds: Set<string>,
  searchQuery: string,
  focusedNodeId?: string | null,
): { nodes: Node[]; edges: Edge[] } {
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

  // ─── Normal mode with kind/search filtering ───
  let filteredNodes = graph.nodes.filter(n => filterKinds.has(n.kind));

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredNodes = filteredNodes.filter(n =>
      n.name.toLowerCase().includes(query) ||
      n.filePath.toLowerCase().includes(query) ||
      n.kind.toLowerCase().includes(query)
    );
  }

  const nodeIds = new Set(filteredNodes.map(n => n.id));

  // Filter edges: only structural edges between visible nodes.
  // Exclude 'references' edges in normal view — they are only shown in focused mode.
  const filteredEdges = graph.edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target) && e.kind !== 'references'
  );

  return layoutAndConvert(filteredNodes, filteredEdges, graph);
}

/**
 * Perform dagre layout and convert to React Flow format.
 */
function layoutAndConvert(
  filteredNodes: CodeNode[],
  filteredEdges: CodeEdge[],
  graph: ProjectGraph,
  focusedNodeId?: string,
): { nodes: Node[]; edges: Edge[] } {
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
    const color = EDGE_COLORS[edge.kind] || EDGE_COLORS.dependency;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.kind === 'contains' ? 'smoothstep' : 'default',
      animated: edge.kind === 'inheritance' || edge.kind === 'implements' || edge.kind === 'references',
      label: edge.kind !== 'contains' ? edge.label : undefined,
      style: {
        stroke: color,
        strokeWidth: edge.kind === 'contains' ? 1 : (edge.kind === 'references' ? 2 : 2),
        opacity: edge.kind === 'contains' ? 0.4 : 0.8,
      },
      labelStyle: {
        fill: color,
        fontSize: 10,
        fontWeight: 500,
      },
      markerEnd: {
        type: 'arrowclosed' as const,
        color,
        width: 15,
        height: 15,
      },
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}
