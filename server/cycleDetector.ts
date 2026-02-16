import type { CodeNode, CodeEdge, EdgeKind } from '../shared/types.js';

export interface DependencyCycle {
  id: string;
  nodes: string[];        // Node IDs in the cycle
  edges: string[];        // Edge IDs forming the cycle
  type: EdgeKind;         // Type of cycle (import, inheritance, etc.)
  severity: 'high' | 'medium' | 'low';
}

export interface CycleDetectionResult {
  cycles: DependencyCycle[];
  affectedNodes: Set<string>;
  stats: {
    totalCycles: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    byType: Record<EdgeKind, number>;
  };
}

/**
 * Detects cycles in a directed graph using DFS with recursion stack.
 * Returns all strongly connected components that form cycles.
 */
export function detectCycles(nodes: CodeNode[], edges: CodeEdge[]): CycleDetectionResult {
  // Build adjacency list for each edge type separately
  const edgesByType = groupEdgesByType(edges);
  
  const allCycles: DependencyCycle[] = [];
  const affectedNodes = new Set<string>();
  
  // Detect cycles for each edge type separately
  // Priority edge types that are more problematic
  const edgeTypePriority: EdgeKind[] = [
    'import',       // Import cycles are common and problematic
    'inheritance',  // Inheritance cycles are severe
    'implements',   // Interface implementation cycles
    'dependency',   // Generic dependencies
    'calls',        // Function call cycles (less severe)
    'references',   // Reference cycles (usually ok)
  ];
  
  for (const edgeType of edgeTypePriority) {
    const typeEdges = edgesByType.get(edgeType) || [];
    if (typeEdges.length === 0) continue;
    
    const cycles = findCyclesForEdgeType(nodes, typeEdges, edgeType);
    allCycles.push(...cycles);
    
    // Track affected nodes
    cycles.forEach(cycle => {
      cycle.nodes.forEach(nodeId => affectedNodes.add(nodeId));
    });
  }
  
  // Calculate statistics
  const stats = {
    totalCycles: allCycles.length,
    highSeverity: allCycles.filter(c => c.severity === 'high').length,
    mediumSeverity: allCycles.filter(c => c.severity === 'medium').length,
    lowSeverity: allCycles.filter(c => c.severity === 'low').length,
    byType: {} as Record<EdgeKind, number>,
  };
  
  // Count cycles by type
  allCycles.forEach(cycle => {
    stats.byType[cycle.type] = (stats.byType[cycle.type] || 0) + 1;
  });
  
  return { cycles: allCycles, affectedNodes, stats };
}

/**
 * Group edges by their type for separate analysis
 */
function groupEdgesByType(edges: CodeEdge[]): Map<EdgeKind, CodeEdge[]> {
  const groups = new Map<EdgeKind, CodeEdge[]>();
  
  edges.forEach(edge => {
    if (!groups.has(edge.kind)) {
      groups.set(edge.kind, []);
    }
    groups.get(edge.kind)!.push(edge);
  });
  
  return groups;
}

/**
 * Find all cycles for a specific edge type using DFS
 */
function findCyclesForEdgeType(
  nodes: CodeNode[],
  edges: CodeEdge[],
  edgeType: EdgeKind
): DependencyCycle[] {
  // Build adjacency list
  const graph = new Map<string, Array<{ target: string; edgeId: string }>>();
  const nodeIds = new Set(nodes.map(n => n.id));
  
  edges.forEach(edge => {
    if (!graph.has(edge.source)) {
      graph.set(edge.source, []);
    }
    graph.get(edge.source)!.push({ target: edge.target, edgeId: edge.id });
  });
  
  const cycles: DependencyCycle[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathNodes: string[] = [];
  const pathEdges: string[] = [];
  
  /**
   * DFS to detect cycles using recursion stack
   */
  function dfs(nodeId: string): void {
    visited.add(nodeId);
    recStack.add(nodeId);
    pathNodes.push(nodeId);
    
    const neighbors = graph.get(nodeId) || [];
    
    for (const { target, edgeId } of neighbors) {
      if (recStack.has(target)) {
        // Found a cycle! Extract the cycle from path
        const cycleStartIndex = pathNodes.indexOf(target);
        if (cycleStartIndex !== -1) {
          const cycleNodes = [...pathNodes.slice(cycleStartIndex), target];
          const cycleEdges = [...pathEdges.slice(cycleStartIndex), edgeId];
          
          // Create unique cycle ID based on sorted node IDs
          const sortedNodes = [...cycleNodes].sort();
          const cycleId = `cycle-${edgeType}-${sortedNodes.join('-')}`;
          
          // Check if this cycle already exists (to avoid duplicates)
          const exists = cycles.some(c => c.id === cycleId);
          if (!exists) {
            cycles.push({
              id: cycleId,
              nodes: cycleNodes.slice(0, -1), // Remove duplicate target node
              edges: cycleEdges,
              type: edgeType,
              severity: getCycleSeverity(edgeType, cycleNodes.length - 1),
            });
          }
        }
      } else if (!visited.has(target)) {
        pathEdges.push(edgeId);
        dfs(target);
        pathEdges.pop();
      }
    }
    
    pathNodes.pop();
    recStack.delete(nodeId);
  }
  
  // Run DFS from each unvisited node
  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }
  
  return cycles;
}

/**
 * Determine cycle severity based on edge type and cycle length
 */
function getCycleSeverity(edgeType: EdgeKind, cycleLength: number): 'high' | 'medium' | 'low' {
  // Inheritance cycles are always high severity (programming error)
  if (edgeType === 'inheritance' || edgeType === 'implements') {
    return 'high';
  }
  
  // Import cycles are problematic, especially short ones
  if (edgeType === 'import') {
    return cycleLength <= 3 ? 'high' : 'medium';
  }
  
  // Dependency cycles can be medium severity
  if (edgeType === 'dependency') {
    return cycleLength <= 2 ? 'medium' : 'low';
  }
  
  // Call cycles and reference cycles are usually acceptable (recursion, etc.)
  return 'low';
}

/**
 * Get a human-readable description of a cycle
 */
export function describeCycle(cycle: DependencyCycle, nodes: CodeNode[]): string {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nodeNames = cycle.nodes
    .map(id => nodeMap.get(id)?.name || id)
    .join(' → ');
  
  return `${cycle.type} cycle (${cycle.nodes.length} nodes): ${nodeNames} → ...`;
}

/**
 * Get file-level cycles (most useful for developers)
 * Aggregates node-level cycles to their containing files
 */
export function getFileLevelCycles(
  cycles: DependencyCycle[],
  nodes: CodeNode[]
): Array<{ files: string[]; type: EdgeKind; severity: 'high' | 'medium' | 'low' }> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const fileCycles = new Map<string, { files: string[]; type: EdgeKind; severity: 'high' | 'medium' | 'low' }>();
  
  cycles.forEach(cycle => {
    // Get unique files involved in this cycle
    const files = Array.from(new Set(
      cycle.nodes
        .map(id => nodeMap.get(id)?.filePath)
        .filter((f): f is string => !!f)
    ));
    
    if (files.length > 1) {
      // Create a unique key for this file cycle
      const key = files.sort().join('|');
      
      if (!fileCycles.has(key)) {
        fileCycles.set(key, { files, type: cycle.type, severity: cycle.severity });
      } else {
        // Update severity if this one is higher
        const existing = fileCycles.get(key)!;
        if (
          (cycle.severity === 'high') ||
          (cycle.severity === 'medium' && existing.severity === 'low')
        ) {
          existing.severity = cycle.severity;
        }
      }
    }
  });
  
  return Array.from(fileCycles.values());
}
