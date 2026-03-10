import * as ts from 'typescript';
import { ParsedFile, CodeNode, CodeEdge } from '../../shared/types.js';
import { Parser, makeNodeId, createNode, createEdge } from './base.js';

/**
 * Parser for TypeScript, JavaScript, JSX, TSX files.
 * Uses TypeScript AST extraction with a regex fallback.
 */
export class TypeScriptParser implements Parser {
  extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  language = 'typescript';

  parse(content: string, filePath: string): ParsedFile {
    try {
      return this.parseWithAst(content, filePath);
    } catch {
      return parseWithRegexFallback(content, filePath, this.language);
    }
  }

  private parseWithAst(content: string, filePath: string): ParsedFile {
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

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath),
    );

    for (const statement of sourceFile.statements) {
      if (ts.isClassDeclaration(statement) && statement.name) {
        const className = statement.name.text;
        const classNodeId = makeNodeId('class', className, filePath);

        const properties = statement.members
          .filter(ts.isPropertyDeclaration)
          .map(member => {
            const name = member.name && ts.isIdentifier(member.name)
              ? member.name.text
              : member.name?.getText(sourceFile) || 'property';
            const type = member.type?.getText(sourceFile);
            return type ? `${name}: ${type}` : name;
          });

        nodes.push(createNode({
          name: className,
          kind: 'class',
          filePath,
          language: this.language,
          lineNumber: lineOf(statement, sourceFile),
          endLine: endLineOf(statement, sourceFile),
          properties,
          modifiers: getModifiers(statement, sourceFile),
        }));
        edges.push(createEdge(fileNodeId, classNodeId, 'contains'));

        const extendsTypes = getHeritageTypeNames(statement, ts.SyntaxKind.ExtendsKeyword);
        for (const parent of extendsTypes) {
          edges.push(createEdge(classNodeId, makeNodeId('class', parent, '*'), 'inheritance', `extends ${parent}`));
        }

        const implementedTypes = getHeritageTypeNames(statement, ts.SyntaxKind.ImplementsKeyword);
        for (const iface of implementedTypes) {
          edges.push(createEdge(classNodeId, makeNodeId('interface', iface, '*'), 'implements', `implements ${iface}`));
        }

        for (const member of statement.members) {
          if (!isMethodLikeMember(member)) continue;
          const methodName = getMethodName(member, sourceFile);
          if (!methodName) continue;

          const fullMethodName = `${className}.${methodName}`;
          const methodId = makeNodeId('function', fullMethodName, filePath);

          nodes.push(createNode({
            name: fullMethodName,
            kind: 'function',
            filePath,
            language: this.language,
            lineNumber: lineOf(member, sourceFile),
            endLine: endLineOf(member, sourceFile),
            parameters: getParameters(member, sourceFile),
            returnType: getReturnType(member, sourceFile),
            modifiers: getModifiers(member, sourceFile),
          }));
          edges.push(createEdge(classNodeId, methodId, 'contains'));
        }
        continue;
      }

      if (ts.isInterfaceDeclaration(statement)) {
        const ifaceName = statement.name.text;
        const ifaceNodeId = makeNodeId('interface', ifaceName, filePath);

        const properties = statement.members.map(member => member.getText(sourceFile).replace(/;$/, '').trim());

        nodes.push(createNode({
          name: ifaceName,
          kind: 'interface',
          filePath,
          language: this.language,
          lineNumber: lineOf(statement, sourceFile),
          endLine: endLineOf(statement, sourceFile),
          properties,
          modifiers: getModifiers(statement, sourceFile),
        }));
        edges.push(createEdge(fileNodeId, ifaceNodeId, 'contains'));

        const parentInterfaces = getHeritageTypeNames(statement, ts.SyntaxKind.ExtendsKeyword);
        for (const parent of parentInterfaces) {
          edges.push(createEdge(ifaceNodeId, makeNodeId('interface', parent, '*'), 'inheritance', `extends ${parent}`));
        }
        continue;
      }

      if (ts.isEnumDeclaration(statement)) {
        const enumName = statement.name.text;
        const enumNodeId = makeNodeId('enum', enumName, filePath);
        nodes.push(createNode({
          name: enumName,
          kind: 'enum',
          filePath,
          language: this.language,
          lineNumber: lineOf(statement, sourceFile),
          endLine: endLineOf(statement, sourceFile),
          modifiers: getModifiers(statement, sourceFile),
        }));
        edges.push(createEdge(fileNodeId, enumNodeId, 'contains'));
        continue;
      }

      if (ts.isFunctionDeclaration(statement) && statement.name) {
        const funcName = statement.name.text;
        const funcNodeId = makeNodeId('function', funcName, filePath);
        nodes.push(createNode({
          name: funcName,
          kind: 'function',
          filePath,
          language: this.language,
          lineNumber: lineOf(statement, sourceFile),
          endLine: endLineOf(statement, sourceFile),
          parameters: statement.parameters.map(p => p.getText(sourceFile)),
          returnType: statement.type?.getText(sourceFile),
          modifiers: getModifiers(statement, sourceFile),
        }));
        edges.push(createEdge(fileNodeId, funcNodeId, 'contains'));
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        const varModifiers = getModifiers(statement, sourceFile);
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;

          if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
            const funcName = declaration.name.text;
            const funcNodeId = makeNodeId('function', funcName, filePath);
            const init = declaration.initializer;
            const modifiers = [...varModifiers];
            if (init.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
              modifiers.push('async');
            }

            nodes.push(createNode({
              name: funcName,
              kind: 'function',
              filePath,
              language: this.language,
              lineNumber: lineOf(init, sourceFile),
              endLine: endLineOf(init, sourceFile),
              parameters: init.parameters.map(p => p.getText(sourceFile)),
              returnType: init.type?.getText(sourceFile),
              modifiers,
            }));
            edges.push(createEdge(fileNodeId, funcNodeId, 'contains'));
          }
        }
      }
    }

    return { filePath, language: this.language, nodes, edges };
  }
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx': return ts.ScriptKind.TSX;
    case 'jsx': return ts.ScriptKind.JSX;
    case 'js': return ts.ScriptKind.JS;
    case 'mjs': return ts.ScriptKind.JS;
    case 'cjs': return ts.ScriptKind.JS;
    case 'ts':
    default:
      return ts.ScriptKind.TS;
  }
}

function lineOf(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function endLineOf(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}

function getModifiers(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers) return [];
  return modifiers.map(m => m.getText(sourceFile));
}

function getHeritageTypeNames(
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  token: ts.SyntaxKind.ExtendsKeyword | ts.SyntaxKind.ImplementsKeyword,
): string[] {
  const clauses = node.heritageClauses || [];
  const clause = clauses.find(c => c.token === token);
  if (!clause) return [];

  return clause.types.map(t => {
    if (ts.isExpressionWithTypeArguments(t) && ts.isIdentifier(t.expression)) {
      return t.expression.text;
    }
    return t.getText().split('<')[0].trim();
  });
}

function isMethodLikeMember(member: ts.ClassElement): member is
  ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration {
  return ts.isMethodDeclaration(member)
    || ts.isConstructorDeclaration(member)
    || ts.isGetAccessorDeclaration(member)
    || ts.isSetAccessorDeclaration(member);
}

function getMethodName(
  member: ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  sourceFile: ts.SourceFile,
): string | null {
  if (ts.isConstructorDeclaration(member)) return 'constructor';
  if (!member.name) return null;
  if (ts.isIdentifier(member.name)) return member.name.text;
  return member.name.getText(sourceFile);
}

function getParameters(
  member: ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  sourceFile: ts.SourceFile,
): string[] {
  return member.parameters.map(p => p.getText(sourceFile));
}

function getReturnType(
  member: ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (ts.isConstructorDeclaration(member)) return undefined;
  return member.type?.getText(sourceFile);
}

// ─── Fallback (legacy regex parser) ───

function parseWithRegexFallback(content: string, filePath: string, language: string): ParsedFile {
  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const lines = content.split('\n');

  const fileNodeId = makeNodeId('file', filePath, filePath);
  nodes.push(createNode({
    name: filePath.split(/[/\\]/).pop() || filePath,
    kind: 'file',
    filePath,
    language,
    lineNumber: 1,
    endLine: lines.length,
  }));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const classMatch = line.match(
      /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/
    );
    if (classMatch) {
      const className = classMatch[1];
      const extendsClass = classMatch[2];
      const classEnd = findBlockEnd(lines, i);
      const classBody = lines.slice(i, classEnd).join('\n');
      const classNodeId = makeNodeId('class', className, filePath);

      nodes.push(createNode({
        name: className,
        kind: 'class',
        filePath,
        language,
        lineNumber: lineNum,
        endLine: classEnd + 1,
        properties: extractClassProperties(classBody),
        modifiers: line.includes('export') ? ['export'] : [],
      }));
      edges.push(createEdge(fileNodeId, classNodeId, 'contains'));

      if (extendsClass) {
        edges.push(createEdge(classNodeId, makeNodeId('class', extendsClass, '*'), 'inheritance', `extends ${extendsClass}`));
      }

      const methods = extractClassMethods(classBody);
      for (const method of methods) {
        const methodNodeId = makeNodeId('function', `${className}.${method.name}`, filePath);
        nodes.push(createNode({
          name: `${className}.${method.name}`,
          kind: 'function',
          filePath,
          language,
          lineNumber: lineNum + method.line,
          endLine: lineNum + method.endLine - 1,
          parameters: method.params,
          returnType: method.returnType,
          modifiers: method.modifiers,
        }));
        edges.push(createEdge(classNodeId, methodNodeId, 'contains'));
      }
    }

    const ifaceMatch = line.match(/(?:export\s+)?(?:default\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?/);
    if (ifaceMatch && !classMatch) {
      const ifaceName = ifaceMatch[1];
      const ifaceEnd = findBlockEnd(lines, i);
      const ifaceNodeId = makeNodeId('interface', ifaceName, filePath);
      nodes.push(createNode({
        name: ifaceName,
        kind: 'interface',
        filePath,
        language,
        lineNumber: lineNum,
        endLine: ifaceEnd + 1,
        properties: extractInterfaceProperties(lines.slice(i, ifaceEnd).join('\n')),
        modifiers: line.includes('export') ? ['export'] : [],
      }));
      edges.push(createEdge(fileNodeId, ifaceNodeId, 'contains'));
      if (ifaceMatch[2]) {
        ifaceMatch[2].split(',').map(s => s.trim()).filter(Boolean).forEach(parent => {
          edges.push(createEdge(ifaceNodeId, makeNodeId('interface', parent, '*'), 'inheritance', `extends ${parent}`));
        });
      }
    }

    const enumMatch = line.match(/(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      const enumName = enumMatch[1];
      const enumEnd = findBlockEnd(lines, i);
      const enumNodeId = makeNodeId('enum', enumName, filePath);
      nodes.push(createNode({
        name: enumName,
        kind: 'enum',
        filePath,
        language,
        lineNumber: lineNum,
        endLine: enumEnd + 1,
        modifiers: line.includes('export') ? ['export'] : [],
      }));
      edges.push(createEdge(fileNodeId, enumNodeId, 'contains'));
    }

    const funcMatch = line.match(
      /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+))?/
    );
    if (funcMatch && !classMatch) {
      const funcName = funcMatch[1];
      const funcEnd = findBlockEnd(lines, i);
      const funcNodeId = makeNodeId('function', funcName, filePath);
      nodes.push(createNode({
        name: funcName,
        kind: 'function',
        filePath,
        language,
        lineNumber: lineNum,
        endLine: funcEnd + 1,
        parameters: funcMatch[2].split(',').map(p => p.trim()).filter(Boolean),
        returnType: funcMatch[3],
        modifiers: [line.includes('export') ? 'export' : '', line.includes('async') ? 'async' : ''].filter(Boolean),
      }));
      edges.push(createEdge(fileNodeId, funcNodeId, 'contains'));
    }

    const arrowMatch = line.match(
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?\(?([^)]*)\)?\s*(?::\s*([^\s=>]+))?\s*=>/
    );
    if (arrowMatch && !classMatch && !funcMatch) {
      const funcName = arrowMatch[1];
      const funcEnd = findBlockEnd(lines, i);
      const funcNodeId = makeNodeId('function', funcName, filePath);
      nodes.push(createNode({
        name: funcName,
        kind: 'function',
        filePath,
        language,
        lineNumber: lineNum,
        endLine: funcEnd + 1,
        parameters: arrowMatch[2] ? arrowMatch[2].split(',').map(p => p.trim()).filter(Boolean) : [],
        returnType: arrowMatch[3],
        modifiers: [line.includes('export') ? 'export' : '', line.includes('async') ? 'async' : ''].filter(Boolean),
      }));
      edges.push(createEdge(fileNodeId, funcNodeId, 'contains'));
    }
  }

  return { filePath, language, nodes, edges };
}

// ─── Legacy fallback helpers ───

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
