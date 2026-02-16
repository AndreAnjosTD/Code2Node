import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import { scanProject, ScanProgress } from './scanner.js';
import { ScanRequest, ScanResponse } from '../shared/types.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── API Routes ───

/**
 * POST /api/scan
 * Scan a directory and return the parsed project graph.
 */
app.post('/api/scan', (req, res) => {
  try {
    const { path: dirPath, extensions, excludePatterns } = req.body as ScanRequest;

    if (!dirPath) {
      res.status(400).json({ success: false, error: 'Path is required' } as ScanResponse);
      return;
    }

    const resolvedPath = path.resolve(dirPath);

    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ success: false, error: `Directory not found: ${resolvedPath}` } as ScanResponse);
      return;
    }

    console.log(`Scanning: ${resolvedPath}`);
    const graph = scanProject({
      rootPath: resolvedPath,
      extensions,
      excludePatterns,
    });

    console.log(`Found ${graph.stats.totalFiles} files, ${graph.stats.totalNodes} nodes, ${graph.stats.totalEdges} edges`);

    res.json({ success: true, graph } as ScanResponse);
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    } as ScanResponse);
  }
});

/**
 * GET /api/health
 * Health check endpoint.
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/scan-stream?path=...
 * Server-Sent Events endpoint for real-time scan progress.
 */
app.get('/api/scan-stream', (req, res) => {
  const dirPath = req.query.path as string;

  if (!dirPath) {
    res.status(400).json({ error: 'Path is required' });
    return;
  }

  const resolvedPath = path.resolve(dirPath);

  if (!fs.existsSync(resolvedPath)) {
    res.status(404).json({ error: `Directory not found: ${resolvedPath}` });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    console.log(`Scanning (stream): ${resolvedPath}`);

    const graph = scanProject({
      rootPath: resolvedPath,
      onProgress: (progress: ScanProgress) => {
        sendEvent('progress', progress);
      },
    });

    console.log(`Found ${graph.stats.totalFiles} files, ${graph.stats.totalNodes} nodes, ${graph.stats.totalEdges} edges`);

    sendEvent('complete', { success: true, graph });
    res.end();
  } catch (err) {
    console.error('Scan stream error:', err);
    sendEvent('error', {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    res.end();
  }
});

/**
 * GET /api/browse?path=...
 * List directory contents for the path browser.
 */
app.get('/api/browse', (req, res) => {
  try {
    const dirPath = (req.query.path as string) || process.cwd();
    const resolvedPath = path.resolve(dirPath);

    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'Directory not found' });
      return;
    }

    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const items = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(resolvedPath, e.name).replace(/\\/g, '/'),
        isDirectory: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      currentPath: resolvedPath.replace(/\\/g, '/'),
      parentPath: path.dirname(resolvedPath).replace(/\\/g, '/'),
      items,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

/**
 * GET /api/file-content?path=...&startLine=...&endLine=...
 * Read file content, optionally limited to a line range.
 */
app.get('/api/file-content', (req, res) => {
  try {
    const filePath = req.query.path as string;
    const startLine = req.query.startLine ? parseInt(req.query.startLine as string, 10) : undefined;
    const endLine = req.query.endLine ? parseInt(req.query.endLine as string, 10) : undefined;

    if (!filePath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }

    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: `File not found: ${resolvedPath}` });
      return;
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      res.status(400).json({ error: 'Path is not a file' });
      return;
    }

    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const allLines = raw.split('\n');

    const from = startLine && startLine >= 1 ? startLine - 1 : 0;
    const to = endLine && endLine >= 1 ? endLine : allLines.length;
    const lines = allLines.slice(from, to);

    res.json({
      filePath: resolvedPath.replace(/\\/g, '/'),
      startLine: from + 1,
      endLine: to,
      totalLines: allLines.length,
      content: lines.join('\n'),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

/**
 * GET /api/installed-ides
 * Detect which IDEs/editors are installed on the system.
 */
interface IdeDef {
  cmd: string;
  label: string;
  /** Additional filesystem paths to check on Windows (glob-like with wildcard dirs) */
  winPaths?: string[];
}

const IDE_DEFINITIONS: IdeDef[] = [
  { cmd: 'code',           label: 'VS Code' },
  { cmd: 'code-insiders',  label: 'VS Code Insiders' },
  { cmd: 'cursor',         label: 'Cursor' },
  { cmd: 'idea',           label: 'IntelliJ IDEA',
    winPaths: ['C:\\Program Files\\JetBrains\\IntelliJ IDEA*\\bin\\idea64.exe'] },
  { cmd: 'idea64',         label: 'IntelliJ IDEA',
    winPaths: ['C:\\Program Files\\JetBrains\\IntelliJ IDEA*\\bin\\idea64.exe'] },
  { cmd: 'webstorm',       label: 'WebStorm',
    winPaths: ['C:\\Program Files\\JetBrains\\WebStorm*\\bin\\webstorm64.exe'] },
  { cmd: 'webstorm64',     label: 'WebStorm',
    winPaths: ['C:\\Program Files\\JetBrains\\WebStorm*\\bin\\webstorm64.exe'] },
  { cmd: 'pycharm',        label: 'PyCharm',
    winPaths: [
      'C:\\Program Files\\JetBrains\\PyCharm*\\bin\\pycharm64.exe',
      'C:\\Program Files\\JetBrains\\PyCharm Community*\\bin\\pycharm64.exe',
      'C:\\Program Files\\JetBrains\\PyCharm Professional*\\bin\\pycharm64.exe',
    ] },
  { cmd: 'pycharm64',      label: 'PyCharm',
    winPaths: [
      'C:\\Program Files\\JetBrains\\PyCharm*\\bin\\pycharm64.exe',
      'C:\\Program Files\\JetBrains\\PyCharm Community*\\bin\\pycharm64.exe',
      'C:\\Program Files\\JetBrains\\PyCharm Professional*\\bin\\pycharm64.exe',
    ] },
  { cmd: 'rider',          label: 'Rider',
    winPaths: ['C:\\Program Files\\JetBrains\\Rider*\\bin\\rider64.exe'] },
  { cmd: 'rider64',        label: 'Rider',
    winPaths: ['C:\\Program Files\\JetBrains\\Rider*\\bin\\rider64.exe'] },
  { cmd: 'subl',           label: 'Sublime Text',
    winPaths: ['C:\\Program Files\\Sublime Text*\\subl.exe', 'C:\\Program Files\\Sublime Text*\\sublime_text.exe'] },
  { cmd: 'atom',           label: 'Atom' },
  { cmd: 'zed',            label: 'Zed' },
  { cmd: 'nvim',           label: 'Neovim' },
  { cmd: 'vim',            label: 'Vim' },
  { cmd: 'notepad++',      label: 'Notepad++',
    winPaths: ['C:\\Program Files\\Notepad++\\notepad++.exe', 'C:\\Program Files (x86)\\Notepad++\\notepad++.exe'] },
];

function isCommandAvailable(cmd: string): boolean {
  try {
    const isWin = process.platform === 'win32';
    const check = isWin ? `where "${cmd}" 2>NUL` : `which "${cmd}" 2>/dev/null`;
    execSync(check, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a glob-like path pattern with a single wildcard directory segment.
 * e.g. "C:\Program Files\JetBrains\PyCharm*\bin\pycharm64.exe"
 * Returns the resolved full path if found, or null.
 */
function resolveWinPath(pattern: string): string | null {
  // Split on the wildcard segment
  const parts = pattern.split('*');
  if (parts.length !== 2) {
    return fs.existsSync(pattern) ? pattern : null;
  }

  const parentDir = path.dirname(parts[0]); // directory containing wildcard folders
  const prefix = path.basename(parts[0]);    // partial folder name before *
  const suffix = parts[1];                   // rest of path after *

  if (!fs.existsSync(parentDir)) return null;

  try {
    const entries = fs.readdirSync(parentDir);
    // Sort descending to prefer the latest version
    const matching = entries
      .filter(e => e.startsWith(prefix))
      .sort((a, b) => b.localeCompare(a));

    for (const dir of matching) {
      const candidate = path.join(parentDir, dir) + suffix;
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // ignore
  }
  return null;
}

// Cache the result so we don't re-scan on every request
let installedIdesCache: Array<{ cmd: string; label: string }> | null = null;

app.get('/api/installed-ides', (_req, res) => {
  if (!installedIdesCache) {
    console.log('Detecting installed IDEs...');
    const seen = new Set<string>();
    installedIdesCache = [];
    const isWin = process.platform === 'win32';

    for (const ide of IDE_DEFINITIONS) {
      if (seen.has(ide.label)) continue;

      // 1. Check PATH first
      if (isCommandAvailable(ide.cmd)) {
        installedIdesCache.push({ cmd: ide.cmd, label: ide.label });
        seen.add(ide.label);
        console.log(`  ✓ ${ide.label} (${ide.cmd})`);
        continue;
      }

      // 2. On Windows, check known installation directories
      if (isWin && ide.winPaths) {
        for (const wp of ide.winPaths) {
          const resolved = resolveWinPath(wp);
          if (resolved) {
            // Use the full exe path as the command
            installedIdesCache.push({ cmd: resolved, label: ide.label });
            seen.add(ide.label);
            console.log(`  ✓ ${ide.label} (${resolved})`);
            break;
          }
        }
      }
    }
    if (installedIdesCache.length === 0) {
      console.log('  No supported IDEs detected');
    }
  }
  res.json({ ides: installedIdesCache });
});

/**
 * POST /api/validate-ide
 * Check if an IDE executable exists at a given path or command.
 */
app.post('/api/validate-ide', (req, res) => {
  try {
    const { cmd } = req.body as { cmd: string };
    if (!cmd) {
      res.status(400).json({ valid: false, error: 'cmd is required' });
      return;
    }

    // Check if it's an absolute path that exists on disk
    if (path.isAbsolute(cmd)) {
      if (fs.existsSync(cmd)) {
        res.json({ valid: true });
        return;
      }
      res.json({ valid: false, error: 'File not found at that path' });
      return;
    }

    // Otherwise check if it's available on PATH
    if (isCommandAvailable(cmd)) {
      res.json({ valid: true });
      return;
    }

    res.json({ valid: false, error: 'Command not found on PATH' });
  } catch (err) {
    res.json({ valid: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

/**\n * POST /api/open-in-ide\n * Open a file in the user's IDE at a specific line.\n */
app.post('/api/open-in-ide', (req, res) => {
  try {
    const { filePath: rawPath, line, ide } = req.body as { filePath: string; line?: number; ide?: string };

    if (!rawPath) {
      res.status(400).json({ error: 'filePath is required' });
      return;
    }

    const resolvedPath = path.resolve(rawPath);

    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: `File not found: ${resolvedPath}` });
      return;
    }

    const ideCmd = ide || 'code';
    let args: string[];

    // Normalize the command name for matching (handle full paths like C:\...\pycharm64.exe)
    const cmdBase = path.basename(ideCmd).replace(/\.(exe|bat|cmd)$/i, '').toLowerCase();

    // Build arguments based on IDE
    if (cmdBase === 'code' || cmdBase === 'code-insiders') {
      // VS Code: code --goto file:line
      args = ['--goto', `${resolvedPath}:${line || 1}`];
    } else if (cmdBase === 'cursor') {
      // Cursor: same as VS Code
      args = ['--goto', `${resolvedPath}:${line || 1}`];      
    } else if (['idea', 'idea64', 'webstorm', 'webstorm64', 'pycharm', 'pycharm64', 'rider', 'rider64'].includes(cmdBase)) {
      // JetBrains IDEs: exe --line <num> <file>
      args = line ? ['--line', String(line), resolvedPath] : [resolvedPath];
    } else if (cmdBase === 'subl' || cmdBase === 'sublime_text') {
      // Sublime Text: subl file:line
      args = [`${resolvedPath}:${line || 1}`];
    } else if (cmdBase === 'atom' || cmdBase === 'zed') {
      args = [`${resolvedPath}:${line || 1}`];
    } else if (cmdBase === 'nvim' || cmdBase === 'vim') {
      args = line ? [`+${line}`, resolvedPath] : [resolvedPath];
    } else {
      // Generic fallback: just pass the file
      args = [resolvedPath];
    }

    console.log(`Opening in IDE: ${ideCmd} ${args.join(' ')}`);

    // Full absolute paths (e.g. C:\Program Files\...\pycharm64.exe) must NOT use
    // shell: true, because the shell splits on spaces.  Short command names like
    // "code" are .cmd shims on Windows and need the shell to resolve.
    const isFullPath = path.isAbsolute(ideCmd);
    const useShell = !isFullPath;

    // Use spawn with detached + unref so the IDE runs independently
    // and we respond immediately without waiting for it to close.
    const child = spawn(ideCmd, args, {
      shell: useShell,
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', (err) => {
      console.error('Failed to open IDE:', err.message);
      // Response may already be sent — guard against double-send
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to open ${ideCmd}: ${err.message}` });
      }
    });

    child.unref();

    // Respond immediately — the IDE is launching in the background
    if (!res.headersSent) {
      res.json({ success: true });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── Start server ───
app.listen(PORT, () => {
  console.log(`\n🚀 Code2Node API server running at http://localhost:${PORT}`);
  console.log(`   POST /api/scan   - Scan a codebase`);
  console.log(`   GET  /api/browse - Browse directories\n`);
});
