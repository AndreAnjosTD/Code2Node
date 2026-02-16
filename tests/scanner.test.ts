import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { scanProject } from '../server/scanner';
import { resetCounters } from '../server/parsers/base';

beforeEach(() => {
  resetCounters();
});

describe('Scanner', () => {
  const sampleDir = path.resolve(__dirname, '..', 'sample');

  it('should scan the sample project directory', () => {
    const graph = scanProject({ rootPath: sampleDir });

    expect(graph).toBeDefined();
    expect(graph.stats.totalFiles).toBeGreaterThan(0);
    expect(graph.stats.totalNodes).toBeGreaterThan(0);
    expect(graph.stats.totalEdges).toBeGreaterThan(0);
    expect(graph.projectPath).toBe(sampleDir);
  });

  it('should detect multiple languages', () => {
    const graph = scanProject({ rootPath: sampleDir });
    const langCount = Object.keys(graph.stats.languages).length;
    expect(langCount).toBeGreaterThanOrEqual(2); // Python + TypeScript
  });

  it('should find classes in sample project', () => {
    const graph = scanProject({ rootPath: sampleDir });
    const classes = graph.nodes.filter(n => n.kind === 'class');
    expect(classes.length).toBeGreaterThan(0);
    
    // Should find Animal, Dog, Cat, Shelter from Python
    const classNames = classes.map(c => c.name);
    expect(classNames).toContain('Animal');
    expect(classNames).toContain('Dog');
  });

  it('should find functions in sample project', () => {
    const graph = scanProject({ rootPath: sampleDir });
    const functions = graph.nodes.filter(n => n.kind === 'function');
    expect(functions.length).toBeGreaterThan(0);
  });

  it('should create containment edges', () => {
    const graph = scanProject({ rootPath: sampleDir });
    const containsEdges = graph.edges.filter(e => e.kind === 'contains');
    expect(containsEdges.length).toBeGreaterThan(0);
  });

  it('should create inheritance edges', () => {
    const graph = scanProject({ rootPath: sampleDir });
    const inheritanceEdges = graph.edges.filter(e => e.kind === 'inheritance');
    expect(inheritanceEdges.length).toBeGreaterThan(0);
  });

  it('should throw for non-existent directory', () => {
    expect(() => scanProject({ rootPath: '/nonexistent/path/xyz' })).toThrow();
  });

  it('should respect file extensions filter', () => {
    const graph = scanProject({
      rootPath: sampleDir,
      extensions: ['.py'],
    });
    expect(graph.stats.languages['python']).toBeGreaterThan(0);
    expect(graph.stats.languages['typescript']).toBeUndefined();
  });
});
