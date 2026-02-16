import { ParsedFile, CodeNode, CodeEdge } from '../../shared/types.js';
import { Parser, makeNodeId, createNode, createEdge } from './base.js';

/**
 * Parser for TypeScript, JavaScript, JSX, TSX files.
 * Uses regex-based extraction of classes, functions, interfaces, imports.
 */
export class TypeScriptParser implements Parser {
  extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  language = 'typescript';

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

    // Track imports for edge creation
    const importMap: { name: string; source: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // ─── Imports ───
      // import { Foo, Bar } from './module'
      const namedImport = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
      if (namedImport) {
        const names = namedImport[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
        const source = namedImport[2];
        names.forEach(n => importMap.push({ name: n, source }));
      }

      // import Default from './module'
      const defaultImport = line.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
      if (defaultImport && !namedImport) {
        importMap.push({ name: defaultImport[1], source: defaultImport[2] });
      }

      // import * as X from './module'
      const starImport = line.match(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
      if (starImport) {
        importMap.push({ name: starImport[1], source: starImport[2] });
      }

      // ─── Classes ───
      const classMatch = line.match(
        /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/
      );
      if (classMatch) {
        const className = classMatch[1];
        const extendsClass = classMatch[2];
        const implementsList = classMatch[3];
        const modifiers: string[] = [];
        if (line.includes('export')) modifiers.push('export');
        if (line.includes('abstract')) modifiers.push('abstract');
        if (line.includes('default')) modifiers.push('default');

        // Find class end (simple brace counting)
        const classEnd = findBlockEnd(lines, i);
        const classBody = lines.slice(i, classEnd).join('\n');

        // Extract properties and methods
        const properties = extractClassProperties(classBody);
        const methods = extractClassMethods(classBody);

        const classNodeId = makeNodeId('class', className, filePath);
        nodes.push(createNode({
          name: className,
          kind: 'class',
          filePath,
          language: this.language,
          lineNumber: lineNum,
          endLine: classEnd + 1,
          properties,
          modifiers,
        }));

        // File contains class
        edges.push(createEdge(fileNodeId, classNodeId, 'contains'));

        // Inheritance
        if (extendsClass) {
          const parentId = makeNodeId('class', extendsClass, '*');
          edges.push(createEdge(classNodeId, parentId, 'inheritance', `extends ${extendsClass}`));
        }

        // Implements
        if (implementsList) {
          implementsList.split(',').map(s => s.trim()).filter(Boolean).forEach(iface => {
            const ifaceId = makeNodeId('interface', iface, '*');
            edges.push(createEdge(classNodeId, ifaceId, 'implements', `implements ${iface}`));
          });
        }

        // Add methods as function nodes
        methods.forEach(method => {
          const methodNodeId = makeNodeId('function', `${className}.${method.name}`, filePath);
          nodes.push(createNode({
            name: `${className}.${method.name}`,
            kind: 'function',
            filePath,
            language: this.language,
            lineNumber: lineNum + method.line,
            endLine: lineNum + method.endLine - 1,
            parameters: method.params,
            returnType: method.returnType,
            modifiers: method.modifiers,
          }));
          edges.push(createEdge(classNodeId, methodNodeId, 'contains'));
        });
      }

      // ─── Interfaces ───
      const ifaceMatch = line.match(
        /(?:export\s+)?(?:default\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?/
      );
      if (ifaceMatch && !classMatch) {
        const ifaceName = ifaceMatch[1];
        const ifaceEnd = findBlockEnd(lines, i);
        const properties = extractInterfaceProperties(lines.slice(i, ifaceEnd).join('\n'));
        const modifiers: string[] = [];
        if (line.includes('export')) modifiers.push('export');

        const ifaceNodeId = makeNodeId('interface', ifaceName, filePath);
        nodes.push(createNode({
          name: ifaceName,
          kind: 'interface',
          filePath,
          language: this.language,
          lineNumber: lineNum,
          endLine: ifaceEnd + 1,
          properties,
          modifiers,
        }));
        edges.push(createEdge(fileNodeId, ifaceNodeId, 'contains'));

        // Interface extends
        if (ifaceMatch[2]) {
          ifaceMatch[2].split(',').map(s => s.trim()).filter(Boolean).forEach(parent => {
            const parentId = makeNodeId('interface', parent, '*');
            edges.push(createEdge(ifaceNodeId, parentId, 'inheritance', `extends ${parent}`));
          });
        }
      }

      // ─── Enums ───
      const enumMatch = line.match(/(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        const enumName = enumMatch[1];
        const enumEnd = findBlockEnd(lines, i);
        const enumNodeId = makeNodeId('enum', enumName, filePath);
        nodes.push(createNode({
          name: enumName,
          kind: 'enum',
          filePath,
          language: this.language,
          lineNumber: lineNum,
          endLine: enumEnd + 1,
          modifiers: line.includes('export') ? ['export'] : [],
        }));
        edges.push(createEdge(fileNodeId, enumNodeId, 'contains'));
      }

      // ─── Standalone functions ───
      const funcMatch = line.match(
        /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+))?/
      );
      if (funcMatch && !classMatch) {
        const funcName = funcMatch[1];
        const params = funcMatch[2].split(',').map(p => p.trim()).filter(Boolean);
        const returnType = funcMatch[3];
        const funcEnd = findBlockEnd(lines, i);
        const modifiers: string[] = [];
        if (line.includes('export')) modifiers.push('export');
        if (line.includes('async')) modifiers.push('async');
        if (line.includes('default')) modifiers.push('default');

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
        }));
        edges.push(createEdge(fileNodeId, funcNodeId, 'contains'));
      }

      // ─── Arrow functions (const foo = () => ...) ───
      const arrowMatch = line.match(
        /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?\(?([^)]*)\)?\s*(?::\s*([^\s=>]+))?\s*=>/
      );
      if (arrowMatch && !classMatch && !funcMatch) {
        const funcName = arrowMatch[1];
        const params = arrowMatch[2] ? arrowMatch[2].split(',').map(p => p.trim()).filter(Boolean) : [];
        const returnType = arrowMatch[3];
        const modifiers: string[] = [];
        if (line.includes('export')) modifiers.push('export');
        if (line.includes('async')) modifiers.push('async');

        const arrowEnd = findBlockEnd(lines, i);
        const funcNodeId = makeNodeId('function', funcName, filePath);
        nodes.push(createNode({
          name: funcName,
          kind: 'function',
          filePath,
          language: this.language,
          lineNumber: lineNum,
          endLine: arrowEnd + 1,
          parameters: params,
          returnType,
          modifiers,
        }));
        edges.push(createEdge(fileNodeId, funcNodeId, 'contains'));
      }
    }

    return { filePath, language: this.language, nodes, edges };
  }
}

// ─── Helper functions ───

function findBlockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let foundOpen = false;
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; foundOpen = true; }
      if (ch === '}') { depth--; }
      if (foundOpen && depth === 0) return i + 1;
    }
  }
  return Math.min(startLine + 1, lines.length);
}

function extractClassProperties(body: string): string[] {
  const props: string[] = [];
  const propRegex = /(?:public|private|protected|readonly|static)?\s*(\w+)\s*[?!]?\s*:\s*([^;=]+)/g;
  let m;
  while ((m = propRegex.exec(body)) !== null) {
    if (!['constructor', 'function', 'return', 'if', 'else', 'for', 'while'].includes(m[1])) {
      props.push(`${m[1]}: ${m[2].trim()}`);
    }
  }
  return props;
}

function extractClassMethods(body: string): Array<{
  name: string; params: string[]; returnType?: string; modifiers: string[]; line: number; endLine: number;
}> {
  const methods: Array<{
    name: string; params: string[]; returnType?: string; modifiers: string[]; line: number; endLine: number;
  }> = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const methodMatch = line.match(
      /(?:(public|private|protected|static|async|abstract|override|readonly)\s+)*(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+))?/
    );
    if (methodMatch && !['if', 'else', 'for', 'while', 'switch', 'catch', 'function', 'return', 'new', 'class', 'import'].includes(methodMatch[2])) {
      const modifiers: string[] = [];
      const fullModifiers = line.match(/((?:(?:public|private|protected|static|async|abstract|override|readonly)\s+)*)/);
      if (fullModifiers) {
        fullModifiers[1].trim().split(/\s+/).filter(Boolean).forEach(m => modifiers.push(m));
      }
      // Find the end of this method block
      const methodEnd = findBlockEnd(lines, i);
      methods.push({
        name: methodMatch[2],
        params: methodMatch[3] ? methodMatch[3].split(',').map(p => p.trim()).filter(Boolean) : [],
        returnType: methodMatch[4],
        modifiers,
        line: i,
        endLine: methodEnd,
      });
    }
  }
  return methods;
}

function extractInterfaceProperties(body: string): string[] {
  const props: string[] = [];
  const propRegex = /(\w+)\s*[?]?\s*:\s*([^;}\n]+)/g;
  let m;
  while ((m = propRegex.exec(body)) !== null) {
    if (!['interface', 'extends', 'export'].includes(m[1])) {
      props.push(`${m[1]}: ${m[2].trim()}`);
    }
  }
  return props;
}
