import { describe, it, expect } from 'vitest';
import { buildFlowGraph, NODE_COLORS, EDGE_COLORS, resolveEffectiveViewMode } from '../src/layout';
import type { ProjectGraph, CodeNode, CodeEdge } from '../shared/types';

describe('Layout', () => {
  // Helper to create a simple project graph
  function createTestGraph(): ProjectGraph {
    const nodes: CodeNode[] = [
      {
        id: 'file1',
        name: 'test.ts',
        kind: 'file',
        filePath: 'test.ts',
        lineNumber: 1,
        language: 'typescript',
      },
      {
        id: 'class1',
        name: 'Animal',
        kind: 'class',
        filePath: 'test.ts',
        lineNumber: 5,
        language: 'typescript',
        properties: ['name', 'age'],
      },
      {
        id: 'class2',
        name: 'Dog',
        kind: 'class',
        filePath: 'test.ts',
        lineNumber: 20,
        language: 'typescript',
        properties: ['breed'],
      },
      {
        id: 'func1',
        name: 'createAnimal',
        kind: 'function',
        filePath: 'test.ts',
        lineNumber: 40,
        language: 'typescript',
      },
      {
        id: 'iface1',
        name: 'Serializable',
        kind: 'interface',
        filePath: 'test.ts',
        lineNumber: 50,
        language: 'typescript',
      },
    ];

    const edges: CodeEdge[] = [
      {
        id: 'e1',
        source: 'file1',
        target: 'class1',
        kind: 'contains',
      },
      {
        id: 'e2',
        source: 'file1',
        target: 'class2',
        kind: 'contains',
      },
      {
        id: 'e3',
        source: 'class2',
        target: 'class1',
        kind: 'inheritance',
        label: 'extends Animal',
      },
      {
        id: 'e4',
        source: 'func1',
        target: 'class1',
        kind: 'references',
      },
      {
        id: 'e5',
        source: 'class1',
        target: 'iface1',
        kind: 'implements',
        label: 'implements Serializable',
      },
    ];

    return {
      nodes,
      edges,
      projectPath: '/test',
      stats: {
        totalFiles: 1,
        totalNodes: 5,
        totalEdges: 5,
        languages: { typescript: 1 },
      },
    };
  }

  describe('Node Colors', () => {
    it('should have colors defined for all node kinds', () => {
      const kinds = ['file', 'class', 'function', 'interface', 'enum', 'variable', 'module'];
      kinds.forEach(kind => {
        expect(NODE_COLORS[kind as keyof typeof NODE_COLORS]).toBeDefined();
        expect(NODE_COLORS[kind as keyof typeof NODE_COLORS].bg).toBeTruthy();
        expect(NODE_COLORS[kind as keyof typeof NODE_COLORS].border).toBeTruthy();
        expect(NODE_COLORS[kind as keyof typeof NODE_COLORS].text).toBeTruthy();
        expect(NODE_COLORS[kind as keyof typeof NODE_COLORS].icon).toBeTruthy();
      });
    });
  });

  describe('Edge Colors', () => {
    it('should have colors defined for all edge kinds', () => {
      const kinds = ['inheritance', 'implements', 'import', 'contains', 'calls', 'references', 'dependency'];
      kinds.forEach(kind => {
        expect(EDGE_COLORS[kind]).toBeTruthy();
      });
    });
  });

  describe('buildFlowGraph - Normal Mode', () => {
    it('should convert graph to flow nodes and edges', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { nodes, edges } = buildFlowGraph(graph, filterKinds, '');

      expect(nodes.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
    });

    it('should filter nodes by kind', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['class']);
      const { nodes } = buildFlowGraph(graph, filterKinds, '');

      expect(nodes.length).toBe(2); // Animal and Dog
      expect(nodes.every(n => n.data.kind === 'class')).toBe(true);
    });

    it('should filter nodes by search query', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { nodes } = buildFlowGraph(graph, filterKinds, 'dog');

      expect(nodes.length).toBe(1);
      expect(nodes[0].data.name).toBe('Dog');
    });

    it('should exclude references edges in normal mode', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { edges } = buildFlowGraph(graph, filterKinds, '');

      const referenceEdges = edges.filter(e => {
        const originalEdge = graph.edges.find(ge => ge.id === e.id);
        return originalEdge?.kind === 'references';
      });
      
      expect(referenceEdges.length).toBe(0);
    });

    it('should only include edges between visible nodes', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['class']);
      const { nodes, edges } = buildFlowGraph(graph, filterKinds, '');

      const nodeIds = new Set(nodes.map(n => n.id));
      
      edges.forEach(e => {
        expect(nodeIds.has(e.source)).toBe(true);
        expect(nodeIds.has(e.target)).toBe(true);
      });
    });

    it('should position nodes with dagre layout', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { nodes } = buildFlowGraph(graph, filterKinds, '');

      nodes.forEach(n => {
        expect(n.position).toBeDefined();
        expect(typeof n.position.x).toBe('number');
        expect(typeof n.position.y).toBe('number');
      });
    });

    it('should include node colors in data', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['class']);
      const { nodes } = buildFlowGraph(graph, filterKinds, '');

      nodes.forEach(n => {
        expect(n.data.colors).toBeDefined();
        expect(n.data.colors.bg).toBeTruthy();
        expect(n.data.colors.border).toBeTruthy();
      });
    });

    it('should set correct edge styles', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['class', 'interface']);
      const { edges } = buildFlowGraph(graph, filterKinds, '');

      edges.forEach(e => {
        expect(e.style).toBeDefined();
        expect(e.style?.stroke).toBeTruthy();
        expect(e.markerEnd).toBeDefined();
      });
    });
  });

  describe('buildFlowGraph - Focus Mode', () => {
    it('should show only focused node and connections', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { nodes, edges } = buildFlowGraph(graph, filterKinds, '', 'class1');

      // Should include class1 (Animal), class2 (Dog), iface1 (Serializable), func1
      expect(nodes.length).toBeGreaterThan(1);
      expect(nodes.some(n => n.id === 'class1')).toBe(true);
    });

    it('should include reference edges in focus mode', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { edges } = buildFlowGraph(graph, filterKinds, '', 'class1');

      // Should include the reference edge from func1 to class1
      const referenceEdge = edges.find(e => e.id === 'e4');
      expect(referenceEdge).toBeDefined();
    });

    it('should exclude contains edges in focus mode', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { edges } = buildFlowGraph(graph, filterKinds, '', 'class1');

      const containsEdges = edges.filter(e => {
        const originalEdge = graph.edges.find(ge => ge.id === e.id);
        return originalEdge?.kind === 'contains';
      });
      
      expect(containsEdges.length).toBe(0);
    });

    it('should mark focused node', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { nodes } = buildFlowGraph(graph, filterKinds, '', 'class2');

      const focusedNode = nodes.find(n => n.id === 'class2');
      expect(focusedNode?.data.isFocused).toBe(true);

      const otherNodes = nodes.filter(n => n.id !== 'class2');
      otherNodes.forEach(n => {
        expect(n.data.isFocused).toBeFalsy();
      });
    });

    it('should include edges between connected nodes', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      // Focus on Dog (class2), which inherits from Animal (class1)
      const { nodes, edges } = buildFlowGraph(graph, filterKinds, '', 'class2');

      // Should include both class1 and class2
      expect(nodes.some(n => n.id === 'class1')).toBe(true);
      expect(nodes.some(n => n.id === 'class2')).toBe(true);

      // Should include inheritance edge and edges between connected nodes
      const inheritanceEdge = edges.find(e => e.id === 'e3');
      expect(inheritanceEdge).toBeDefined();
    });
  });

  describe('Node Height Calculation', () => {
    it('should increase node height with properties', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['class']);
      const { nodes } = buildFlowGraph(graph, filterKinds, '');

      // Animal has 2 properties, Dog has 1 property
      const animal = nodes.find(n => n.data.name === 'Animal');
      const dog = nodes.find(n => n.data.name === 'Dog');

      expect(animal?.measured?.height).toBeDefined();
      expect(dog?.measured?.height).toBeDefined();
      
      // Animal should be taller (has more properties)
      if (animal && dog) {
        expect(animal.measured!.height).toBeGreaterThan(dog.measured!.height);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty graph', () => {
      const emptyGraph: ProjectGraph = {
        nodes: [],
        edges: [],
        projectPath: '/test',
        stats: {
          totalFiles: 0,
          totalNodes: 0,
          totalEdges: 0,
          languages: {},
        },
      };

      const filterKinds = new Set(['class']);
      const { nodes, edges } = buildFlowGraph(emptyGraph, filterKinds, '');

      expect(nodes.length).toBe(0);
      expect(edges.length).toBe(0);
    });

    it('should handle focus on non-existent node', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);
      const { nodes } = buildFlowGraph(graph, filterKinds, '', 'non-existent-id');

      // Should fall through to normal mode filtering
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should handle empty filter set', () => {
      const graph = createTestGraph();
      const filterKinds = new Set<string>();
      const { nodes } = buildFlowGraph(graph, filterKinds, '');

      expect(nodes.length).toBe(0);
    });
  });

  describe('Repo-scale controls', () => {
    it('should resolve effective view mode for auto-cluster thresholds', () => {
      expect(resolveEffectiveViewMode('folder', true, 1000, 10)).toBe('folder');
      expect(resolveEffectiveViewMode('detailed', false, 1000, 2000)).toBe('detailed');
      expect(resolveEffectiveViewMode('detailed', true, 1000, 999)).toBe('detailed');
      expect(resolveEffectiveViewMode('detailed', true, 1000, 1000)).toBe('folder');
      expect(resolveEffectiveViewMode('detailed', true, 1000, 1500)).toBe('folder');
    });

    it('should apply node limit and report hidden node/edge metadata', () => {
      const graph = createTestGraph();
      const filterKinds = new Set(['file', 'class', 'function', 'interface']);

      const result = buildFlowGraph(graph, filterKinds, '', undefined, undefined, 'detailed', { nodeLimit: 3 });

      expect(result.nodes.length).toBe(3);
      expect(result.meta.candidateNodes).toBe(5);
      expect(result.meta.hiddenNodes).toBe(2);
      expect(result.meta.visibleNodes).toBe(3);
      expect(result.meta.candidateEdges).toBeGreaterThanOrEqual(result.meta.visibleEdges);
      expect(result.meta.hiddenEdges).toBeGreaterThanOrEqual(0);
    });
  });
});
