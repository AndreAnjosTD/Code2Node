// ─── Core types shared between server and client ───

export type NodeKind = 'file' | 'class' | 'function' | 'interface' | 'enum' | 'variable' | 'module';

export type EdgeKind =
  | 'inheritance'   // class extends another
  | 'implements'    // class implements interface
  | 'import'        // file imports from another
  | 'contains'      // file contains class/function
  | 'calls'         // function calls another
  | 'references'    // symbol is used/called from another scope
  | 'dependency';   // generic dependency

export interface CodeNode {
  id: string;
  name: string;
  kind: NodeKind;
  filePath: string;
  language: string;
  lineNumber: number;
  endLine?: number;
  properties?: string[];   // class properties
  parameters?: string[];   // function params
  returnType?: string;
  modifiers?: string[];    // public, private, static, async, etc
  documentation?: string;
}

export interface CodeEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
}

export interface ParsedFile {
  filePath: string;
  language: string;
  nodes: CodeNode[];
  edges: CodeEdge[];
}

export interface CodeMetrics {
  totalLines: number;          // Total lines including blanks/comments
  codeLines: number;           // Non-empty, non-comment lines
  commentLines: number;        // Lines with comments
  blankLines: number;          // Empty lines
  averageLinesPerFile: number; // Average file size
  largestFile?: {
    path: string;
    lines: number;
  };
  mostComplexFile?: {
    path: string;
    nodes: number;
  };
}

export interface DependencyCycle {
  id: string;
  nodes: string[];        // Node IDs in the cycle
  edges: string[];        // Edge IDs forming the cycle
  type: EdgeKind;         // Type of cycle (import, inheritance, etc.)
  severity: 'high' | 'medium' | 'low';
}

export interface CycleStats {
  totalCycles: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  byType: Record<string, number>;
  affectedNodes: number;
  affectedFiles: number;
}

export interface ProjectGraph {
  projectPath: string;
  files?: ParsedFile[];   // Included server-side; stripped from API responses for bandwidth
  nodes: CodeNode[];
  edges: CodeEdge[];
  stats: {
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    languages: Record<string, number>;
    metrics?: CodeMetrics; // Optional for backward compatibility
    cycles?: CycleStats;   // Optional for backward compatibility
  };
  cycles?: DependencyCycle[]; // Detected dependency cycles
}

export interface ScanRequest {
  path: string;
  extensions?: string[];
  excludePatterns?: string[];
}

export interface ScanResponse {
  success: boolean;
  graph?: ProjectGraph;
  error?: string;
}
