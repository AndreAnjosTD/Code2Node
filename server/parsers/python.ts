import { ParsedFile, CodeNode, CodeEdge } from '../../shared/types.js';
import { Parser, makeNodeId, createNode, createEdge } from './base.js';

/**
 * Parser for Python files.
 * Extracts classes, functions, imports, inheritance using regex.
 */
export class PythonParser implements Parser {
  extensions = ['.py', '.pyw'];
  language = 'python';

  parse(content: string, filePath: string): ParsedFile {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const lines = content.split('\n');

    // File node
    const fileNodeId = makeNodeId('file', filePath, filePath);
    nodes.push(createNode({
      name: filePath.split(/[/\\]/).pop() || filePath,
      kind: 'file',
      filePath,
      language: this.language,
      lineNumber: 1,
      endLine: lines.length,
    }));

    let currentClass: { name: string; nodeId: string; indent: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // ─── Imports ───
      // from module import X, Y
      const fromImport = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
      if (fromImport) {
        // Track but don't create nodes for imports in this version
        continue;
      }
      // import module
      const simpleImport = line.match(/^import\s+([\w.,\s]+)/);
      if (simpleImport) {
        continue;
      }

      // ─── Classes ───
      const classMatch = line.match(/^(\s*)class\s+(\w+)(?:\(([^)]*)\))?\s*:/);
      if (classMatch) {
        const indent = classMatch[1].length;
        const className = classMatch[2];
        const bases = classMatch[3];

        const classNodeId = makeNodeId('class', className, filePath);
        const classEnd = findPythonBlockEnd(lines, i, indent);
        const classBody = lines.slice(i, classEnd).join('\n');

        // Extract docstring
        const docstring = extractDocstring(lines, i + 1);

        // Extract properties from __init__
        const properties = extractPythonProperties(classBody);

        nodes.push(createNode({
          name: className,
          kind: 'class',
          filePath,
          language: this.language,
          lineNumber: lineNum,
          endLine: classEnd + 1,
          properties,
          documentation: docstring,
        }));
        edges.push(createEdge(fileNodeId, classNodeId, 'contains'));

        // Inheritance
        if (bases) {
          bases.split(',').map(b => b.trim()).filter(b => b && b !== 'object').forEach(base => {
            // Strip generic params like Generic[T]
            const baseName = base.replace(/\[.*\]/, '').trim();
            if (baseName && !['ABC', 'object'].includes(baseName)) {
              const parentId = makeNodeId('class', baseName, '*');
              edges.push(createEdge(classNodeId, parentId, 'inheritance', `extends ${baseName}`));
            }
          });
        }

        currentClass = { name: className, nodeId: classNodeId, indent };

        // Extract methods
        const methods = extractPythonMethods(lines, i + 1, classEnd, indent);
        methods.forEach(method => {
          const methodNodeId = makeNodeId('function', `${className}.${method.name}`, filePath);
          nodes.push(createNode({
            name: `${className}.${method.name}`,
            kind: 'function',
            filePath,
            language: this.language,
            lineNumber: method.lineNumber,
            endLine: method.endLineNumber,
            parameters: method.params,
            modifiers: method.decorators,
            documentation: method.docstring,
          }));
          edges.push(createEdge(classNodeId, methodNodeId, 'contains'));
        });

        continue;
      }

      // ─── Standalone functions ───
      const funcMatch = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\s:]+))?\s*:/);
      if (funcMatch) {
        const indent = funcMatch[1].length;
        // Only top-level or module-level functions (not methods)
        if (indent === 0 || !currentClass || indent <= currentClass.indent) {
          currentClass = null;
          const funcName = funcMatch[2];
          const params = funcMatch[3].split(',').map(p => p.trim()).filter(p => p && p !== 'self' && p !== 'cls');
          const returnType = funcMatch[4];
          const funcEnd = findPythonBlockEnd(lines, i, indent);
          const docstring = extractDocstring(lines, i + 1);
          const modifiers: string[] = [];
          if (line.includes('async')) modifiers.push('async');
          // Check for decorators above
          if (i > 0 && lines[i - 1].trim().startsWith('@')) {
            modifiers.push(lines[i - 1].trim());
          }

          const funcNodeId = makeNodeId('function', funcName, filePath);
          nodes.push(createNode({
            name: funcName,
            kind: 'function',
            filePath,
            language: this.language,
            lineNumber: lineNum,
            endLine: funcEnd + 1,
            parameters: params,
            returnType,
            modifiers,
            documentation: docstring,
          }));
          edges.push(createEdge(fileNodeId, funcNodeId, 'contains'));
        }
      }
    }

    return { filePath, language: this.language, nodes, edges };
  }
}

// ─── Python-specific helpers ───

function findPythonBlockEnd(lines: string[], startLine: number, baseIndent: number): number {
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // skip blank lines
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    if (indent <= baseIndent && line.trim() !== '') {
      return i;
    }
  }
  return lines.length;
}

function extractDocstring(lines: string[], startLine: number): string | undefined {
  if (startLine >= lines.length) return undefined;
  const line = lines[startLine].trim();
  if (line.startsWith('"""') || line.startsWith("'''")) {
    const quote = line.substring(0, 3);
    if (line.endsWith(quote) && line.length > 6) {
      return line.slice(3, -3).trim();
    }
    // Multi-line docstring
    let doc = line.slice(3);
    for (let i = startLine + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.includes(quote)) {
        doc += '\n' + l.replace(quote, '');
        return doc.trim();
      }
      doc += '\n' + l;
    }
  }
  return undefined;
}

function extractPythonProperties(classBody: string): string[] {
  const props: string[] = [];
  const propRegex = /self\.(\w+)\s*(?::\s*(\w+))?\s*=/g;
  let m;
  while ((m = propRegex.exec(classBody)) !== null) {
    const prop = m[2] ? `${m[1]}: ${m[2]}` : m[1];
    if (!props.includes(prop)) props.push(prop);
  }
  return props;
}

function extractPythonMethods(
  lines: string[], startLine: number, endLine: number, classIndent: number
): Array<{ name: string; params: string[]; decorators: string[]; docstring?: string; lineNumber: number; endLineNumber: number }> {
  const methods: Array<{ name: string; params: string[]; decorators: string[]; docstring?: string; lineNumber: number; endLineNumber: number }> = [];

  for (let i = startLine; i < endLine; i++) {
    const line = lines[i];
    const methodMatch = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (methodMatch) {
      const indent = methodMatch[1].length;
      if (indent > classIndent) {
        const decorators: string[] = [];
        // Check for decorators above
        let j = i - 1;
        while (j >= startLine && lines[j].trim().startsWith('@')) {
          decorators.push(lines[j].trim());
          j--;
        }

        const params = methodMatch[3]
          .split(',')
          .map(p => p.trim())
          .filter(p => p && p !== 'self' && p !== 'cls');

        const docstring = extractDocstring(lines, i + 1);

        const methodEnd = findPythonBlockEnd(lines, i, indent);
        methods.push({
          name: methodMatch[2],
          params,
          decorators,
          docstring,
          lineNumber: i + 1,
          endLineNumber: methodEnd + 1,
        });
      }
    }
  }
  return methods;
}
