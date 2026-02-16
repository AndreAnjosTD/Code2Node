import { ParsedFile, CodeNode, CodeEdge } from '../../shared/types.js';
import { Parser, makeNodeId, createNode, createEdge } from './base.js';

/**
 * Parser for C and C++ files.
 * Extracts classes, structs, functions, includes using regex.
 */
export class CppParser implements Parser {
  extensions = ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx'];
  language = 'cpp';

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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // ─── Includes ───
      const includeMatch = line.match(/^#include\s+[<"]([^>"]+)[>"]/);
      if (includeMatch) {
        // Track includes as imports
        continue;
      }

      // ─── Enums (check before classes since "enum class" contains "class") ───
      const enumMatch = line.match(/enum\s+(?:class\s+)?(\w+)/);
      if (enumMatch && !line.includes(';')) {
        const enumName = enumMatch[1];
        const enumEnd = findBraceBlockEnd(lines, i);
        const enumNodeId = makeNodeId('enum', enumName, filePath);
        nodes.push(createNode({
          name: enumName,
          kind: 'enum',
          filePath,
          language: this.language,
          lineNumber: lineNum,
          endLine: enumEnd + 1,
        }));
        edges.push(createEdge(fileNodeId, enumNodeId, 'contains'));
        i = enumEnd - 1;
        continue;
      }

      // ─── Classes/Structs ───
      const classMatch = line.match(
        /(?:template\s*<[^>]*>\s*)?(?:(class|struct))\s+(?:(\w+)\s+)?(\w+)(?:\s*:\s*(.+))?\s*\{?/
      );
      if (classMatch && !line.includes(';') && !line.trim().startsWith('//') && !line.match(/\benum\b/)) {
        const keyword = classMatch[1]; // class or struct
        const className = classMatch[3] || classMatch[2];
        if (!className) continue;

        const basesStr = classMatch[4];
        const classEnd = findBraceBlockEnd(lines, i);
        const classBody = lines.slice(i, classEnd).join('\n');

        // Extract members
        const members = extractCppMembers(classBody);
        const methods = extractCppMethods(classBody);

        const classNodeId = makeNodeId('class', className, filePath);
        nodes.push(createNode({
          name: className,
          kind: 'class',
          filePath,
          language: this.language,
          lineNumber: lineNum,
          endLine: classEnd + 1,
          properties: members,
          modifiers: [keyword],
        }));
        edges.push(createEdge(fileNodeId, classNodeId, 'contains'));

        // Parse inheritance
        if (basesStr) {
          const bases = basesStr.split(',').map(b => {
            const m = b.trim().match(/(?:public|private|protected)?\s*(\w+)/);
            return m ? m[1] : null;
          }).filter(Boolean);

          bases.forEach(base => {
            if (base) {
              const parentId = makeNodeId('class', base, '*');
              edges.push(createEdge(classNodeId, parentId, 'inheritance', `extends ${base}`));
            }
          });
        }

        // Add methods as function nodes
        methods.forEach(method => {
          const methodNodeId = makeNodeId('function', `${className}::${method.name}`, filePath);
          nodes.push(createNode({
            name: `${className}::${method.name}`,
            kind: 'function',
            filePath,
            language: this.language,
            lineNumber: lineNum + method.line,
            parameters: method.params,
            returnType: method.returnType,
            modifiers: method.modifiers,
          }));
          edges.push(createEdge(classNodeId, methodNodeId, 'contains'));
        });

        // Skip to end of class
        i = classEnd - 1;
        continue;
      }

      // ─── Standalone functions ───
      const funcMatch = line.match(
        /^(?:(?:static|inline|virtual|extern|constexpr)\s+)*(\w[\w:*&<>\s]*?)\s+(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:\{|$)/
      );
      if (funcMatch && !line.includes(';') && !line.trim().startsWith('//') && !line.trim().startsWith('#') && !classMatch) {
        const returnType = funcMatch[1].trim();
        const funcName = funcMatch[2];
        const params = funcMatch[3].split(',').map(p => p.trim()).filter(Boolean);

        // Skip common non-function patterns
        if (['if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'class', 'struct', 'enum'].includes(funcName)) continue;

        const funcEnd = findBraceBlockEnd(lines, i);
        const modifiers: string[] = [];
        if (line.includes('static')) modifiers.push('static');
        if (line.includes('virtual')) modifiers.push('virtual');
        if (line.includes('inline')) modifiers.push('inline');
        if (line.includes('constexpr')) modifiers.push('constexpr');

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

        i = funcEnd - 1;
      }
    }

    return { filePath, language: this.language, nodes, edges };
  }
}

// ─── C++ specific helpers ───

function findBraceBlockEnd(lines: string[], startLine: number): number {
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

function extractCppMembers(body: string): string[] {
  const members: string[] = [];
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Match member declarations: type name;
    const memberMatch = trimmed.match(/^(?:(?:const|static|mutable|volatile)\s+)?(\w[\w:<>*&\s]*?)\s+(\w+)\s*(?:=\s*[^;]+)?\s*;/);
    if (memberMatch && !['return', 'delete', 'throw', 'break', 'continue'].includes(memberMatch[2])) {
      members.push(`${memberMatch[2]}: ${memberMatch[1].trim()}`);
    }
  }
  return members;
}

function extractCppMethods(body: string): Array<{
  name: string; params: string[]; returnType?: string; modifiers: string[]; line: number;
}> {
  const methods: Array<{
    name: string; params: string[]; returnType?: string; modifiers: string[]; line: number;
  }> = [];
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const methodMatch = line.match(
      /(?:(?:virtual|static|inline|constexpr|override|explicit)\s+)*(?:(\w[\w:*&<>\s]*?)\s+)?(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:override)?\s*(?:\{|;|=)/
    );
    if (methodMatch) {
      const name = methodMatch[2];
      if (['if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'class', 'struct'].includes(name)) continue;
      const params = methodMatch[3] ? methodMatch[3].split(',').map(p => p.trim()).filter(Boolean) : [];
      const modifiers: string[] = [];
      if (line.includes('virtual')) modifiers.push('virtual');
      if (line.includes('static')) modifiers.push('static');
      if (line.includes('override')) modifiers.push('override');
      if (line.includes('const)') || line.includes('const {')) modifiers.push('const');

      methods.push({
        name,
        params,
        returnType: methodMatch[1]?.trim(),
        modifiers,
        line: i,
      });
    }
  }
  return methods;
}
