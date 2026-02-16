import { Parser } from './base.js';
import { TypeScriptParser } from './typescript.js';
import { PythonParser } from './python.js';
import { CppParser } from './cpp.js';

const parsers: Parser[] = [
  new TypeScriptParser(),
  new PythonParser(),
  new CppParser(),
];

export function getParserForFile(filePath: string): Parser | null {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  return parsers.find(p => p.extensions.includes(ext)) || null;
}

export function getSupportedExtensions(): string[] {
  return parsers.flatMap(p => p.extensions);
}

export { TypeScriptParser, PythonParser, CppParser };
