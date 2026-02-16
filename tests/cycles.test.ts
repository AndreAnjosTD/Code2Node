import { describe, it, expect } from 'vitest';
import { detectCycles, getFileLevelCycles, describeCycle } from '../server/cycleDetector';
import type { CodeNode, CodeEdge } from '../shared/types';

describe('Cycle Detection', () => {
  describe('detectCycles', () => {
    it('should detect a simple import cycle', () => {
      const nodes: CodeNode[] = [
        { id: 'n1', name: 'FileA', kind: 'file', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n2', name: 'FileB', kind: 'file', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n3', name: 'FileC', kind: 'file', filePath: '/c.ts', language: 'typescript', lineNumber: 1 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2', kind: 'import' },
        { id: 'e2', source: 'n2', target: 'n3', kind: 'import' },
        { id: 'e3', source: 'n3', target: 'n1', kind: 'import' }, // Cycle!
      ];

      const result = detectCycles(nodes, edges);

      expect(result.cycles.length).toBeGreaterThan(0);
      expect(result.stats.totalCycles).toBeGreaterThan(0);
      expect(result.affectedNodes.size).toBe(3);
      
      const importCycles = result.cycles.filter(c => c.type === 'import');
      expect(importCycles.length).toBeGreaterThan(0);
    });

    it('should detect an inheritance cycle', () => {
      const nodes: CodeNode[] = [
        { id: 'c1', name: 'ClassA', kind: 'class', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'c2', name: 'ClassB', kind: 'class', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'c1', target: 'c2', kind: 'inheritance' },
        { id: 'e2', source: 'c2', target: 'c1', kind: 'inheritance' }, // Cycle!
      ];

      const result = detectCycles(nodes, edges);

      expect(result.cycles.length).toBe(1);
      expect(result.cycles[0].type).toBe('inheritance');
      expect(result.cycles[0].severity).toBe('high'); // Inheritance cycles are high severity
    });

    it('should handle graphs with no cycles', () => {
      const nodes: CodeNode[] = [
        { id: 'n1', name: 'FileA', kind: 'file', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n2', name: 'FileB', kind: 'file', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n3', name: 'FileC', kind: 'file', filePath: '/c.ts', language: 'typescript', lineNumber: 1 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2', kind: 'import' },
        { id: 'e2', source: 'n2', target: 'n3', kind: 'import' },
        // No cycle
      ];

      const result = detectCycles(nodes, edges);

      expect(result.cycles.length).toBe(0);
      expect(result.stats.totalCycles).toBe(0);
      expect(result.affectedNodes.size).toBe(0);
    });

    it('should detect multiple independent cycles', () => {
      const nodes: CodeNode[] = [
        { id: 'n1', name: 'FileA', kind: 'file', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n2', name: 'FileB', kind: 'file', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n3', name: 'FileC', kind: 'file', filePath: '/c.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n4', name: 'FileD', kind: 'file', filePath: '/d.ts', language: 'typescript', lineNumber: 1 },
      ];

      const edges: CodeEdge[] = [
        // Cycle 1: A -> B -> A
        { id: 'e1', source: 'n1', target: 'n2', kind: 'import' },
        { id: 'e2', source: 'n2', target: 'n1', kind: 'import' },
        // Cycle 2: C -> D -> C
        { id: 'e3', source: 'n3', target: 'n4', kind: 'import' },
        { id: 'e4', source: 'n4', target: 'n3', kind: 'import' },
      ];

      const result = detectCycles(nodes, edges);

      expect(result.cycles.length).toBeGreaterThanOrEqual(2);
      expect(result.affectedNodes.size).toBe(4);
    });

    it('should handle self-loops', () => {
      const nodes: CodeNode[] = [
        { id: 'n1', name: 'FileA', kind: 'file', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'n1', target: 'n1', kind: 'calls' }, // Self-loop
      ];

      const result = detectCycles(nodes, edges);

      expect(result.cycles.length).toBe(1);
      expect(result.cycles[0].nodes.length).toBe(1);
    });

    it('should detect cycles in complex graphs', () => {
      const nodes: CodeNode[] = [
        { id: 'n1', name: 'A', kind: 'file', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n2', name: 'B', kind: 'file', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n3', name: 'C', kind: 'file', filePath: '/c.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n4', name: 'D', kind: 'file', filePath: '/d.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n5', name: 'E', kind: 'file', filePath: '/e.ts', language: 'typescript', lineNumber: 1 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2', kind: 'import' },
        { id: 'e2', source: 'n2', target: 'n3', kind: 'import' },
        { id: 'e3', source: 'n3', target: 'n4', kind: 'import' },
        { id: 'e4', source: 'n4', target: 'n2', kind: 'import' }, // Cycle: B -> C -> D -> B
        { id: 'e5', source: 'n4', target: 'n5', kind: 'import' },
      ];

      const result = detectCycles(nodes, edges);

      expect(result.cycles.length).toBeGreaterThan(0);
      
      // Should detect the B->C->D->B cycle
      const cycle = result.cycles.find(c => 
        c.nodes.includes('n2') && c.nodes.includes('n3') && c.nodes.includes('n4')
      );
      expect(cycle).toBeDefined();
    });

    it('should categorize severity correctly', () => {
      const nodes: CodeNode[] = [
        { id: 'c1', name: 'ClassA', kind: 'class', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'c2', name: 'ClassB', kind: 'class', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'f1', name: 'funcA', kind: 'function', filePath: '/a.ts', language: 'typescript', lineNumber: 5 },
        { id: 'f2', name: 'funcB', kind: 'function', filePath: '/b.ts', language: 'typescript', lineNumber: 5 },
      ];

      const edges: CodeEdge[] = [
        // High severity: inheritance cycle
        { id: 'e1', source: 'c1', target: 'c2', kind: 'inheritance' },
        { id: 'e2', source: 'c2', target: 'c1', kind: 'inheritance' },
        // Low severity: call cycle (recursion)
        { id: 'e3', source: 'f1', target: 'f2', kind: 'calls' },
        { id: 'e4', source: 'f2', target: 'f1', kind: 'calls' },
      ];

      const result = detectCycles(nodes, edges);

      const inheritanceCycle = result.cycles.find(c => c.type === 'inheritance');
      expect(inheritanceCycle?.severity).toBe('high');

      const callCycle = result.cycles.find(c => c.type === 'calls');
      expect(callCycle?.severity).toBe('low');

      expect(result.stats.highSeverity).toBeGreaterThan(0);
    });

    it('should count cycles by type', () => {
      const nodes: CodeNode[] = [
        { id: 'n1', name: 'A', kind: 'file', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n2', name: 'B', kind: 'file', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'c1', name: 'ClassA', kind: 'class', filePath: '/a.ts', language: 'typescript', lineNumber: 5 },
        { id: 'c2', name: 'ClassB', kind: 'class', filePath: '/b.ts', language: 'typescript', lineNumber: 5 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2', kind: 'import' },
        { id: 'e2', source: 'n2', target: 'n1', kind: 'import' },
        { id: 'e3', source: 'c1', target: 'c2', kind: 'inheritance' },
        { id: 'e4', source: 'c2', target: 'c1', kind: 'inheritance' },
      ];

      const result = detectCycles(nodes, edges);

      expect(result.stats.byType['import']).toBeGreaterThan(0);
      expect(result.stats.byType['inheritance']).toBeGreaterThan(0);
    });
  });

  describe('getFileLevelCycles', () => {
    it('should aggregate cycles to file level', () => {
      const nodes: CodeNode[] = [
        { id: 'c1', name: 'ClassA', kind: 'class', filePath: '/src/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'c2', name: 'ClassB', kind: 'class', filePath: '/src/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'f1', name: 'funcA', kind: 'function', filePath: '/src/a.ts', language: 'typescript', lineNumber: 10 },
        { id: 'f2', name: 'funcB', kind: 'function', filePath: '/src/b.ts', language: 'typescript', lineNumber: 10 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'c1', target: 'c2', kind: 'calls' },
        { id: 'e2', source: 'c2', target: 'c1', kind: 'calls' },
        { id: 'e3', source: 'f1', target: 'f2', kind: 'calls' },
        { id: 'e4', source: 'f2', target: 'f1', kind: 'calls' },
      ];

      const result = detectCycles(nodes, edges);
      const fileCycles = getFileLevelCycles(result.cycles, nodes);

      // Multiple node-level cycles should be aggregated to one file-level cycle
      expect(fileCycles.length).toBe(1);
      expect(fileCycles[0].files).toContain('/src/a.ts');
      expect(fileCycles[0].files).toContain('/src/b.ts');
    });

    it('should filter out self-file cycles', () => {
      const nodes: CodeNode[] = [
        { id: 'c1', name: 'ClassA', kind: 'class', filePath: '/src/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'c2', name: 'ClassB', kind: 'class', filePath: '/src/a.ts', language: 'typescript', lineNumber: 10 },
      ];

      const edges: CodeEdge[] = [
        { id: 'e1', source: 'c1', target: 'c2', kind: 'calls' },
        { id: 'e2', source: 'c2', target: 'c1', kind: 'calls' },
      ];

      const result = detectCycles(nodes, edges);
      const fileCycles = getFileLevelCycles(result.cycles, nodes);

      // Same file cycles should be filtered out (only 1 file involved)
      expect(fileCycles.length).toBe(0);
    });
  });

  describe('describeCycle', () => {
    it('should create human-readable cycle description', () => {
      const nodes: CodeNode[] = [
        { id: 'n1', name: 'FileA', kind: 'file', filePath: '/a.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n2', name: 'FileB', kind: 'file', filePath: '/b.ts', language: 'typescript', lineNumber: 1 },
        { id: 'n3', name: 'FileC', kind: 'file', filePath: '/c.ts', language: 'typescript', lineNumber: 1 },
      ];

      const cycle = {
        id: 'test-cycle',
        nodes: ['n1', 'n2', 'n3'],
        edges: ['e1', 'e2', 'e3'],
        type: 'import' as const,
        severity: 'high' as const,
      };

      const description = describeCycle(cycle, nodes);

      expect(description).toContain('import cycle');
      expect(description).toContain('FileA');
      expect(description).toContain('FileB');
      expect(description).toContain('FileC');
    });
  });
});
