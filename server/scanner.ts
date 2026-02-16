import * as fs from 'fs';
import * as path from 'path';
import { ProjectGraph, ParsedFile, CodeNode, CodeEdge, CodeMetrics, DependencyCycle } from '../shared/types.js';
import { getParserForFile, getSupportedExtensions } from './parsers/index.js';
import { resetCounters, makeNodeId, createEdge } from './parsers/base.js';
import { detectCycles, getFileLevelCycles } from './cycleDetector.js';

const DEFAULT_EXCLUDE = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', '.venv',
  'venv', 'env', '.env', 'coverage', '.coverage', '.nyc_output',
  '.next', '.nuxt', '.cache', 'vendor', 'target', 'bin', 'obj',
];

export type ScanPhase = 'discovering' | 'parsing' | 'resolving' | 'complete' | 'error';

export interface ScanProgress {
  phase: ScanPhase;
  currentFile?: string;
  filesDiscovered: number;
  filesParsed: number;
  totalFiles: number;
  nodesFound: number;
  edgesFound: number;
  languages: Record<string, number>;
  message: string;
}

export type ProgressCallback = (progress: ScanProgress) => void;

export interface ScanOptions {
  rootPath: string;
  extensions?: string[];
  excludePatterns?: string[];
  maxFileSize?: number; // bytes
  maxFiles?: number;
  onProgress?: ProgressCallback;
}

/**
 * Analyze file content to count lines
 */
interface FileLineStats {
  total: number;
  code: number;
  comment: number;
  blank: number;
}

function analyzeFileLines(content: string, language: string): FileLineStats {
  const lines = content.split('\n');
  let code = 0;
  let comment = 0;
  let blank = 0;
  
  // Simple comment detection based on language
  const singleLineComment = language === 'python' ? '#' : '//';
  const multiLineStart = language === 'python' ? '"""' : '/*';
  const multiLineEnd = language === 'python' ? '"""' : '*/';
  
  let inMultiLineComment = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.length === 0) {
      blank++;
      continue;
    }
    
    // Check for multi-line comments
    if (trimmed.includes(multiLineStart)) {
      inMultiLineComment = true;
    }
    
    if (inMultiLineComment) {
      comment++;
      if (trimmed.includes(multiLineEnd)) {
        inMultiLineComment = false;
      }
      continue;
    }
    
    // Check for single-line comments
    if (trimmed.startsWith(singleLineComment)) {
      comment++;
      continue;
    }
    
    // Otherwise it's code
    code++;
  }
  
  return {
    total: lines.length,
    code,
    comment,
    blank,
  };
}

/**
 * Calculate comprehensive code metrics
 */
function calculateMetrics(
  filePaths: string[],
  parsedFiles: ParsedFile[],
  allNodes: CodeNode[],
  absoluteRoot: string
): CodeMetrics {
  let totalLines = 0;
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  
  let largestFile: { path: string; lines: number } | undefined;
  let mostComplexFile: { path: string; nodes: number } | undefined;
  
  const fileStats = new Map<string, FileLineStats>();
  const fileNodeCounts = new Map<string, number>();
  
  // Count nodes per file
  for (const node of allNodes) {
    fileNodeCounts.set(node.filePath, (fileNodeCounts.get(node.filePath) || 0) + 1);
  }
  
  // Analyze each file
  for (const fp of filePaths) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const parser = getParserForFile(fp);
      const language = parser?.language || 'text';
      
      const stats = analyzeFileLines(content, language);
      const relativePath = path.relative(absoluteRoot, fp).replace(/\\/g, '/');
      
      fileStats.set(relativePath, stats);
      
      totalLines += stats.total;
      codeLines += stats.code;
      commentLines += stats.comment;
      blankLines += stats.blank;
      
      // Track largest file
      if (!largestFile || stats.total > largestFile.lines) {
        largestFile = { path: relativePath, lines: stats.total };
      }
      
      // Track most complex file (most nodes)
      const nodeCount = fileNodeCounts.get(relativePath) || 0;
      if (!mostComplexFile || nodeCount > mostComplexFile.nodes) {
        mostComplexFile = { path: relativePath, nodes: nodeCount };
      }
    } catch (err) {
      // Ignore errors, file may have been deleted or inaccessible
    }
  }
  
  return {
    totalLines,
    codeLines,
    commentLines,
    blankLines,
    averageLinesPerFile: filePaths.length > 0 ? Math.round(totalLines / filePaths.length) : 0,
    largestFile,
    mostComplexFile,
  };
}

/**
 * Recursively scan a directory and parse all supported source files.

 */
export function scanProject(options: ScanOptions): ProjectGraph {
  const {
    rootPath,
    extensions = getSupportedExtensions(),
    excludePatterns = DEFAULT_EXCLUDE,
    maxFileSize = 1024 * 512, // 512KB
    maxFiles = 5000,
  } = options;

  resetCounters();

  const absoluteRoot = path.resolve(rootPath);
  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(`Directory not found: ${absoluteRoot}`);
  }

  const stat = fs.statSync(absoluteRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absoluteRoot}`);
  }

  const { onProgress } = options;

  const emitProgress = (p: Partial<ScanProgress> & { phase: ScanPhase }) => {
    if (onProgress) {
      onProgress({
        filesDiscovered: 0,
        filesParsed: 0,
        totalFiles: 0,
        nodesFound: 0,
        edgesFound: 0,
        languages: {},
        message: '',
        ...p,
      });
    }
  };

  // Collect all matching files
  emitProgress({ phase: 'discovering', message: 'Discovering source files...' });
  const filePaths: string[] = [];
  collectFiles(absoluteRoot, absoluteRoot, extensions, excludePatterns, maxFileSize, maxFiles, filePaths, (dir) => {
    emitProgress({
      phase: 'discovering',
      currentFile: path.relative(absoluteRoot, dir).replace(/\\/g, '/') || '.',
      filesDiscovered: filePaths.length,
      totalFiles: 0,
      message: `Scanning: ${path.relative(absoluteRoot, dir).replace(/\\/g, '/') || '.'}`,
    });
  });

  emitProgress({
    phase: 'parsing',
    filesDiscovered: filePaths.length,
    totalFiles: filePaths.length,
    message: `Found ${filePaths.length} source files. Parsing...`,
  });

  // Parse each file
  const parsedFiles: ParsedFile[] = [];
  const allNodes: CodeNode[] = [];
  const allEdges: CodeEdge[] = [];
  const languages: Record<string, number> = {};

  for (let i = 0; i < filePaths.length; i++) {
    const fp = filePaths[i];
    const parser = getParserForFile(fp);
    if (!parser) continue;

    const relativePath = path.relative(absoluteRoot, fp).replace(/\\/g, '/');

    emitProgress({
      phase: 'parsing',
      currentFile: relativePath,
      filesDiscovered: filePaths.length,
      filesParsed: i,
      totalFiles: filePaths.length,
      nodesFound: allNodes.length,
      edgesFound: allEdges.length,
      languages: { ...languages },
      message: `Parsing: ${relativePath}`,
    });

    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const parsed = parser.parse(content, relativePath);

      parsedFiles.push(parsed);
      allNodes.push(...parsed.nodes);
      allEdges.push(...parsed.edges);

      languages[parser.language] = (languages[parser.language] || 0) + 1;
    } catch (err) {
      console.warn(`Failed to parse ${fp}:`, err);
    }
  }

  // Resolve wildcard edges (inheritance/implements to nodes in other files)
  emitProgress({
    phase: 'resolving',
    filesDiscovered: filePaths.length,
    filesParsed: filePaths.length,
    totalFiles: filePaths.length,
    nodesFound: allNodes.length,
    edgesFound: allEdges.length,
    languages: { ...languages },
    message: 'Resolving cross-file references...',
  });
  resolveWildcardEdges(allNodes, allEdges);

  // Create import edges between files
  createImportEdges(allNodes, allEdges, parsedFiles);

  // Resolve usage / call references across the codebase
  emitProgress({
    phase: 'resolving',
    filesDiscovered: filePaths.length,
    filesParsed: filePaths.length,
    totalFiles: filePaths.length,
    nodesFound: allNodes.length,
    edgesFound: allEdges.length,
    languages: { ...languages },
    message: 'Resolving usage references...',
  });
  resolveReferences(allNodes, allEdges, absoluteRoot, filePaths);

  emitProgress({
    phase: 'complete',
    filesDiscovered: filePaths.length,
    filesParsed: parsedFiles.length,
    totalFiles: filePaths.length,
    nodesFound: allNodes.length,
    edgesFound: allEdges.length,
    languages: { ...languages },
    message: `Done! ${parsedFiles.length} files, ${allNodes.length} nodes, ${allEdges.length} edges`,
  });

  // Calculate code metrics
  const metrics = calculateMetrics(filePaths, parsedFiles, allNodes, absoluteRoot);

  // Detect dependency cycles
  const cycleDetection = detectCycles(allNodes, allEdges);
  const fileLevelCycles = getFileLevelCycles(cycleDetection.cycles, allNodes);
  const uniqueFiles = new Set(
    cycleDetection.cycles.flatMap(c => 
      c.nodes.map(nodeId => allNodes.find(n => n.id === nodeId)?.filePath).filter(Boolean)
    )
  );

  return {
    projectPath: absoluteRoot,
    files: parsedFiles,
    nodes: allNodes,
    edges: allEdges,
    cycles: cycleDetection.cycles,
    stats: {
      totalFiles: parsedFiles.length,
      totalNodes: allNodes.length,
      totalEdges: allEdges.length,
      languages,
      metrics,
      cycles: {
        totalCycles: cycleDetection.stats.totalCycles,
        highSeverity: cycleDetection.stats.highSeverity,
        mediumSeverity: cycleDetection.stats.mediumSeverity,
        lowSeverity: cycleDetection.stats.lowSeverity,
        byType: cycleDetection.stats.byType,
        affectedNodes: cycleDetection.affectedNodes.size,
        affectedFiles: uniqueFiles.size,
      },
    },
  };
}

function collectFiles(
  dir: string,
  root: string,
  extensions: string[],
  excludePatterns: string[],
  maxFileSize: number,
  maxFiles: number,
  result: string[],
  onEnterDir?: (dir: string) => void,
): void {
  if (onEnterDir) onEnterDir(dir);
  if (result.length >= maxFiles) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Permission denied etc.
  }

  for (const entry of entries) {
    if (result.length >= maxFiles) return;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (excludePatterns.some(p => entry.name === p || entry.name.startsWith('.'))) {
        continue;
      }
      collectFiles(fullPath, root, extensions, excludePatterns, maxFileSize, maxFiles, result, onEnterDir);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size <= maxFileSize) {
            result.push(fullPath);
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }
}

/**
 * Resolve edges that point to wildcard targets (e.g., inheritance to classes in other files).
 * Replaces wildcard node IDs with actual node IDs where matches are found.
 */
function resolveWildcardEdges(nodes: CodeNode[], edges: CodeEdge[]): void {
  const nodesByName = new Map<string, CodeNode>();
  for (const node of nodes) {
    // Index by simple name (last part after . or ::)
    const simpleName = node.name.split(/[.:]/).pop() || node.name;
    if (!nodesByName.has(simpleName)) {
      nodesByName.set(simpleName, node);
    }
  }

  for (const edge of edges) {
    // Check if target or source contains wildcard
    if (edge.target.includes('_*')) {
      // Extract the name from the wildcard ID
      const parts = edge.target.split('_');
      const kind = parts[0];
      const name = parts.slice(1, -1).join('_'); // Remove the '*' suffix
      const resolvedNode = nodesByName.get(name);
      if (resolvedNode) {
        edge.target = resolvedNode.id;
      }
    }
    if (edge.source.includes('_*')) {
      const parts = edge.source.split('_');
      const name = parts.slice(1, -1).join('_');
      const resolvedNode = nodesByName.get(name);
      if (resolvedNode) {
        edge.source = resolvedNode.id;
      }
    }
  }
}

/**
 * Create import/dependency edges between file nodes based on import statements.
 */
function createImportEdges(nodes: CodeNode[], edges: CodeEdge[], files: ParsedFile[]): void {
  const fileNodes = nodes.filter(n => n.kind === 'file');
  const fileMap = new Map<string, string>();

  for (const fn of fileNodes) {
    // Map various possible import paths to the file node ID
    const fp = fn.filePath;
    fileMap.set(fp, fn.id);
    // Without extension
    const noExt = fp.replace(/\.\w+$/, '');
    fileMap.set(noExt, fn.id);
    // Just filename
    const basename = fp.split('/').pop() || fp;
    fileMap.set(basename, fn.id);
    const basenameNoExt = basename.replace(/\.\w+$/, '');
    fileMap.set(basenameNoExt, fn.id);
  }
}

// ─── Reference / usage resolution ───

const SKIP_NAMES = new Set([
  // JS/TS keywords & common builtins
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'let', 'const', 'var', 'function', 'class',
  'interface', 'enum', 'type', 'import', 'export', 'from', 'as', 'default',
  'extends', 'implements', 'super', 'this', 'true', 'false', 'null',
  'undefined', 'void', 'any', 'never', 'number', 'string', 'boolean',
  'object', 'symbol', 'async', 'await', 'yield', 'static', 'public',
  'private', 'protected', 'readonly', 'abstract', 'override', 'get', 'set',
  // Python keywords & builtins
  'self', 'cls', 'is', 'not', 'and', 'or', 'def', 'none', 'pass', 'with',
  'lambda', 'raise', 'except', 'print', 'len', 'str', 'int', 'list', 'dict',
  'tuple', 'map', 'filter', 'range', 'init', 'main', 'test', 'setup',
  'name', 'value', 'data', 'item', 'index', 'result', 'args', 'kwargs',
  // Too generic / common names that create noisy references
  'error', 'err', 'close', 'open', 'read', 'write', 'update', 'reset',
  'state', 'props', 'event', 'node', 'edge', 'path', 'file', 'key', 'id',
  'app', 'req', 'res', 'ctx', 'log', 'run', 'use', 'add', 'remove',
  'start', 'stop', 'load', 'save', 'send', 'parse', 'query', 'config',
  'options', 'params', 'body', 'text', 'line', 'content', 'message',
  'callback', 'handler', 'listener', 'next', 'prev', 'current', 'parent',
  'child', 'children', 'color', 'style', 'width', 'height', 'size',
]);

/**
 * Scan all source files for references to known symbols (classes, functions, etc.)
 * and create 'references' edges from the calling scope to the referenced symbol.
 */
function resolveReferences(
  nodes: CodeNode[],
  edges: CodeEdge[],
  absoluteRoot: string,
  filePaths: string[],
): void {
  const MIN_NAME_LEN = 3;

  // Collect searchable symbols
  type SymEntry = { searchName: string; node: CodeNode; isMethod: boolean };
  const symbols: SymEntry[] = [];

  for (const node of nodes) {
    if (node.kind === 'file') continue;

    const isMethod = node.name.includes('.');
    const searchName = isMethod ? node.name.split('.').pop()! : node.name;

    if (searchName.length < MIN_NAME_LEN) continue;
    if (SKIP_NAMES.has(searchName.toLowerCase())) continue;
    // Skip dunder methods
    if (searchName.startsWith('__') && searchName.endsWith('__')) continue;

    symbols.push({ searchName, node, isMethod });
  }

  if (symbols.length === 0) return;

  // Build a combined regex for all unique names (longest first)
  const uniqueNames = [...new Set(symbols.map(s => s.searchName))];
  const escaped = uniqueNames
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  const nameRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');

  // Build name -> SymEntry[] lookup
  const nameMap = new Map<string, SymEntry[]>();
  for (const sym of symbols) {
    if (!nameMap.has(sym.searchName)) nameMap.set(sym.searchName, []);
    nameMap.get(sym.searchName)!.push(sym);
  }

  // Track existing edges to avoid duplicates
  const edgeKeys = new Set(edges.map(e => `${e.source}|${e.target}|${e.kind}`));

  for (const fp of filePaths) {
    const relativePath = path.relative(absoluteRoot, fp).replace(/\\/g, '/');

    let content: string;
    try {
      content = fs.readFileSync(fp, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // Get all nodes defined in this file for scope resolution
    const fileNodesHere = nodes.filter(n => n.filePath === relativePath);
    const fileNode = fileNodesHere.find(n => n.kind === 'file');
    const scopeCandidates = fileNodesHere
      .filter(n => n.kind !== 'file')
      .sort((a, b) => {
        // Sort by range size ascending → most specific scope first
        const aRange = (a.endLine || a.lineNumber + 1) - a.lineNumber;
        const bRange = (b.endLine || b.lineNumber + 1) - b.lineNumber;
        return aRange - bRange;
      });

    function findScope(lineNum: number): CodeNode | null {
      for (const sc of scopeCandidates) {
        const end = sc.endLine || sc.lineNumber + 200;
        if (lineNum >= sc.lineNumber && lineNum <= end) {
          return sc;
        }
      }
      return fileNode || null;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip import / require lines
      if (/^\s*(import\s|from\s[\w.]+\s+import|require\s*\()/.test(line)) continue;
      // Skip pure comment lines
      if (/^\s*(\/\/|#(?!!)|\/\*|\*\s)/.test(line)) continue;

      nameRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = nameRegex.exec(line)) !== null) {
        const matched = match[1];
        const entries = nameMap.get(matched);
        if (!entries) continue;

        const scope = findScope(lineNum);
        if (!scope) continue;

        for (const entry of entries) {
          // No self-references
          if (entry.node.id === scope.id) continue;

          // Don't reference within the target node's own definition body
          if (entry.node.filePath === relativePath) {
            const entryEnd = entry.node.endLine || entry.node.lineNumber + 1;
            if (lineNum >= entry.node.lineNumber && lineNum <= entryEnd) continue;
          }

          // For methods, require .methodName( pattern
          if (entry.isMethod) {
            const before = line.substring(0, match.index);
            const after = line.substring(match.index + matched.length);
            if (!before.endsWith('.') || !/^\s*\(/.test(after)) continue;
          }

          const key = `${scope.id}|${entry.node.id}|references`;
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);

          edges.push(createEdge(scope.id, entry.node.id, 'references', `uses ${entry.node.name}`));
        }
      }
    }
  }

  console.log(`  Found ${edges.filter(e => e.kind === 'references').length} reference edges`);
}
