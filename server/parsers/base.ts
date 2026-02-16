import { CodeNode, CodeEdge, ParsedFile } from '../shared/types.js';

export interface Parser {
  extensions: string[];
  language: string;
  parse(content: string, filePath: string): ParsedFile;
}

let nodeIdCounter = 0;
let edgeIdCounter = 0;

export function resetCounters() {
  nodeIdCounter = 0;
  edgeIdCounter = 0;
}

export function makeNodeId(kind: string, name: string, filePath: string): string {
  return `${kind}_${name}_${filePath}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function makeEdgeId(): string {
  return `edge_${edgeIdCounter++}`;
}

export function createNode(
  partial: Omit<CodeNode, 'id'> & { id?: string }
): CodeNode {
  return {
    id: partial.id || makeNodeId(partial.kind, partial.name, partial.filePath),
    name: partial.name,
    kind: partial.kind,
    filePath: partial.filePath,
    language: partial.language,
    lineNumber: partial.lineNumber,
    endLine: partial.endLine,
    properties: partial.properties,
    parameters: partial.parameters,
    returnType: partial.returnType,
    modifiers: partial.modifiers,
    documentation: partial.documentation,
  };
}

export function createEdge(
  source: string, target: string, kind: CodeEdge['kind'], label?: string
): CodeEdge {
  return { id: makeEdgeId(), source, target, kind, label };
}
