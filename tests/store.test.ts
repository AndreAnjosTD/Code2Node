import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../src/store';
import type { ProjectGraph, CodeNode } from '../shared/types';

describe('Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAppStore.getState();
      
      expect(state.graph).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.projectPath).toBe('');
      expect(state.selectedNode).toBeNull();
      expect(state.searchQuery).toBe('');
      expect(state.filterKinds.size).toBeGreaterThan(0);
      expect(state.sidebarOpen).toBe(true);
      expect(state.expertMode).toBe(false);
    });
  });

  describe('Graph Management', () => {
    it('should set graph', () => {
      const mockGraph: ProjectGraph = {
        nodes: [],
        edges: [],
        projectPath: '/test/path',
        stats: {
          totalFiles: 0,
          totalNodes: 0,
          totalEdges: 0,
          languages: {},
        },
      };

      useAppStore.getState().setGraph(mockGraph);
      
      const state = useAppStore.getState();
      expect(state.graph).toEqual(mockGraph);
      expect(state.error).toBeNull();
    });

    it('should set project path', () => {
      useAppStore.getState().setProjectPath('/my/project');
      expect(useAppStore.getState().projectPath).toBe('/my/project');
    });

    it('should set loading state', () => {
      useAppStore.getState().setLoading(true);
      expect(useAppStore.getState().loading).toBe(true);
      
      useAppStore.getState().setLoading(false);
      expect(useAppStore.getState().loading).toBe(false);
    });

    it('should set error and clear loading', () => {
      useAppStore.getState().setLoading(true);
      useAppStore.getState().setError('Test error');
      
      const state = useAppStore.getState();
      expect(state.error).toBe('Test error');
      expect(state.loading).toBe(false);
    });
  });

  describe('Node Selection', () => {
    it('should select a node', () => {
      const mockNode: CodeNode = {
        id: 'node1',
        name: 'TestClass',
        kind: 'class',
        filePath: 'test.ts',
        lineNumber: 10,
        language: 'typescript',
      };

      useAppStore.getState().setSelectedNode(mockNode);
      
      const state = useAppStore.getState();
      expect(state.selectedNode).toEqual(mockNode);
      expect(state.detailsOpen).toBe(true);
    });

    it('should clear selection', () => {
      const mockNode: CodeNode = {
        id: 'node1',
        name: 'TestClass',
        kind: 'class',
        filePath: 'test.ts',
        lineNumber: 10,
        language: 'typescript',
      };

      useAppStore.getState().setSelectedNode(mockNode);
      useAppStore.getState().setSelectedNode(null);
      
      const state = useAppStore.getState();
      expect(state.selectedNode).toBeNull();
      expect(state.detailsOpen).toBe(false);
    });
  });

  describe('Search and Filters', () => {
    it('should update search query', () => {
      useAppStore.getState().setSearchQuery('MyClass');
      expect(useAppStore.getState().searchQuery).toBe('MyClass');
    });

    it('should toggle filter kinds', () => {
      const initialKinds = new Set(useAppStore.getState().filterKinds);
      
      // Toggle off
      useAppStore.getState().toggleFilterKind('class');
      expect(useAppStore.getState().filterKinds.has('class')).toBe(false);
      
      // Toggle back on
      useAppStore.getState().toggleFilterKind('class');
      expect(useAppStore.getState().filterKinds.has('class')).toBe(true);
    });

    it('should set filter kinds', () => {
      const newKinds = new Set(['class', 'function']);
      useAppStore.getState().setFilterKinds(newKinds);
      
      const state = useAppStore.getState();
      expect(state.filterKinds.size).toBe(2);
      expect(state.filterKinds.has('class')).toBe(true);
      expect(state.filterKinds.has('function')).toBe(true);
      expect(state.filterKinds.has('interface')).toBe(false);
    });
  });

  describe('Code Viewer', () => {
    it('should open code viewer with node', () => {
      const mockNode: CodeNode = {
        id: 'node1',
        name: 'TestClass',
        kind: 'class',
        filePath: 'test.ts',
        lineNumber: 10,
        language: 'typescript',
      };

      useAppStore.getState().setCodeViewerNode(mockNode);
      expect(useAppStore.getState().codeViewerNode).toEqual(mockNode);
    });

    it('should close code viewer and clear connections', () => {
      const mockNode: CodeNode = {
        id: 'node1',
        name: 'TestClass',
        kind: 'class',
        filePath: 'test.ts',
        lineNumber: 10,
        language: 'typescript',
      };

      useAppStore.getState().setCodeViewerNode(mockNode);
      useAppStore.getState().setCodeViewerConnections([
        { name: 'BaseClass', edgeKind: 'inheritance' },
      ]);

      useAppStore.getState().setCodeViewerNode(null);
      
      const state = useAppStore.getState();
      expect(state.codeViewerNode).toBeNull();
      expect(state.codeViewerConnections).toBeNull();
    });

    it('should set code viewer connections', () => {
      const connections = [
        { name: 'BaseClass', edgeKind: 'inheritance' as const, label: 'extends BaseClass' },
        { name: 'Interface1', edgeKind: 'implements' as const },
      ];

      useAppStore.getState().setCodeViewerConnections(connections);
      expect(useAppStore.getState().codeViewerConnections).toEqual(connections);
    });
  });

  describe('Focus Mode', () => {
    it('should set focused node', () => {
      useAppStore.getState().setFocusedNodeId('node123');
      expect(useAppStore.getState().focusedNodeId).toBe('node123');
    });

    it('should clear focused node', () => {
      useAppStore.getState().setFocusedNodeId('node123');
      useAppStore.getState().setFocusedNodeId(null);
      expect(useAppStore.getState().focusedNodeId).toBeNull();
    });
  });

  describe('Expert Mode', () => {
    it('should toggle expert mode', () => {
      expect(useAppStore.getState().expertMode).toBe(false);
      
      useAppStore.getState().setExpertMode(true);
      expect(useAppStore.getState().expertMode).toBe(true);
      
      useAppStore.getState().setExpertMode(false);
      expect(useAppStore.getState().expertMode).toBe(false);
    });
  });

  describe('UI State', () => {
    it('should toggle sidebar', () => {
      useAppStore.getState().setSidebarOpen(false);
      expect(useAppStore.getState().sidebarOpen).toBe(false);
      
      useAppStore.getState().setSidebarOpen(true);
      expect(useAppStore.getState().sidebarOpen).toBe(true);
    });

    it('should set active sidebar panel', () => {
      useAppStore.getState().setActiveSidebarPanel('outliner');
      expect(useAppStore.getState().activeSidebarPanel).toBe('outliner');
      
      useAppStore.getState().setActiveSidebarPanel(null);
      expect(useAppStore.getState().activeSidebarPanel).toBeNull();
    });
  });

  describe('Settings', () => {
    it('should set IDE command', () => {
      useAppStore.getState().setIdeCommand('vim');
      expect(useAppStore.getState().ideCommand).toBe('vim');
    });

    it('should persist IDE command to localStorage', () => {
      // Note: This test relies on localStorage being available in the test environment
      useAppStore.getState().setIdeCommand('code');
      expect(localStorage.getItem('code2node_ide')).toBe('code');
    });
  });

  describe('Scan Progress', () => {
    it('should set scan progress', () => {
      const progress = {
        phase: 'parsing' as const,
        filesDiscovered: 10,
        filesParsed: 5,
        totalFiles: 10,
        nodesFound: 20,
        edgesFound: 15,
        languages: { typescript: 10 },
        message: 'Parsing files...',
      };

      useAppStore.getState().setScanProgress(progress);
      expect(useAppStore.getState().scanProgress).toEqual(progress);
    });

    it('should clear scan progress', () => {
      const progress = {
        phase: 'parsing' as const,
        filesDiscovered: 10,
        filesParsed: 5,
        totalFiles: 10,
        nodesFound: 20,
        edgesFound: 15,
        languages: { typescript: 10 },
        message: 'Parsing files...',
      };

      useAppStore.getState().setScanProgress(progress);
      useAppStore.getState().setScanProgress(null);
      expect(useAppStore.getState().scanProgress).toBeNull();
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      // Modify state
      useAppStore.getState().setProjectPath('/test');
      useAppStore.getState().setSearchQuery('test');
      useAppStore.getState().setExpertMode(true);
      useAppStore.getState().setLoading(true);

      // Reset
      useAppStore.getState().reset();

      // Verify it's back to initial state
      const state = useAppStore.getState();
      expect(state.projectPath).toBe('');
      expect(state.searchQuery).toBe('');
      expect(state.expertMode).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.graph).toBeNull();
    });
  });
});
