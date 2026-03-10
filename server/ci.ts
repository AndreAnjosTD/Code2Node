import fs from 'fs';
import path from 'path';
import { scanProject } from './scanner.js';

type ReportFormat = 'json' | 'html' | 'both';

interface CliOptions {
  projectPath: string;
  outDir: string;
  format: ReportFormat;
  failOnHighCycles: boolean;
  maxHighCycles?: number;
  maxTotalCycles?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];

  const getValue = (name: string): string | undefined => {
    const idx = args.findIndex(a => a === name);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const hasFlag = (name: string): boolean => args.includes(name);
  const parseOptionalNonNegativeInt = (name: string): number | undefined => {
    const value = getValue(name);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${name} must be a non-negative integer`);
    }
    return parsed;
  };

  const projectPath = getValue('--path') || getValue('-p');
  if (!projectPath) {
    throw new Error('Missing required argument: --path <project-path>');
  }

  const outDir = getValue('--out') || 'artifacts';
  const formatRaw = (getValue('--format') || 'both').toLowerCase();
  const format: ReportFormat =
    formatRaw === 'json' || formatRaw === 'html' || formatRaw === 'both'
      ? formatRaw
      : 'both';
  const maxHighCycles = parseOptionalNonNegativeInt('--max-high-cycles');
  const maxTotalCycles = parseOptionalNonNegativeInt('--max-total-cycles');

  return {
    projectPath,
    outDir,
    format,
    failOnHighCycles: hasFlag('--fail-on-high-cycles'),
    maxHighCycles,
    maxTotalCycles,
  };
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function topEntries(entries: Record<string, number>, n: number): Array<[string, number]> {
  return Object.entries(entries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function renderHtmlReport(report: ReturnType<typeof buildReport>): string {
  const languages = topEntries(report.summary.languages, 10)
    .map(([lang, count]) => `<li><strong>${escHtml(lang)}</strong>: ${count}</li>`)
    .join('');

  const cycleList = report.summary.topCycles
    .map(c => `<tr><td>${escHtml(c.severity)}</td><td>${escHtml(c.type)}</td><td>${c.size}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Code2Node CI Report</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; background: #0b1020; color: #e2e8f0; }
      h1, h2 { margin: 0 0 10px; }
      .muted { color: #94a3b8; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 12px; margin: 16px 0 24px; }
      .card { background: #111827; border: 1px solid #334155; border-radius: 8px; padding: 12px; }
      .value { font-size: 24px; font-weight: 700; margin-top: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { text-align: left; border-bottom: 1px solid #334155; padding: 8px; }
      th { color: #cbd5e1; }
      .warn { color: #f59e0b; }
      .error { color: #ef4444; }
    </style>
  </head>
  <body>
    <h1>Code2Node CI Report</h1>
    <p class="muted">Generated: ${escHtml(report.generatedAt)} | Project: ${escHtml(report.projectPath)}</p>

    <div class="grid">
      <div class="card"><div>Total Files</div><div class="value">${report.summary.totalFiles}</div></div>
      <div class="card"><div>Total Nodes</div><div class="value">${report.summary.totalNodes}</div></div>
      <div class="card"><div>Total Edges</div><div class="value">${report.summary.totalEdges}</div></div>
      <div class="card"><div>Total Cycles</div><div class="value ${report.summary.totalCycles > 0 ? 'warn' : ''}">${report.summary.totalCycles}</div></div>
      <div class="card"><div>High Severity Cycles</div><div class="value ${report.summary.highSeverityCycles > 0 ? 'error' : ''}">${report.summary.highSeverityCycles}</div></div>
      <div class="card"><div>Affected Files</div><div class="value">${report.summary.affectedFilesByCycles}</div></div>
    </div>

    <h2>Languages</h2>
    <ul>
      ${languages || '<li class="muted">No language data</li>'}
    </ul>

    <h2>Largest Cycles</h2>
    <table>
      <thead>
        <tr><th>Severity</th><th>Type</th><th>Nodes</th></tr>
      </thead>
      <tbody>
        ${cycleList || '<tr><td class="muted" colspan="3">No cycles found</td></tr>'}
      </tbody>
    </table>
  </body>
</html>`;
}

function buildReport(graph: ReturnType<typeof scanProject>) {
  const topCycles = [...(graph.cycles || [])]
    .sort((a, b) => b.nodes.length - a.nodes.length)
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      type: c.type,
      severity: c.severity,
      size: c.nodes.length,
    }));

  return {
    generatedAt: new Date().toISOString(),
    projectPath: graph.projectPath,
    summary: {
      totalFiles: graph.stats.totalFiles,
      totalNodes: graph.stats.totalNodes,
      totalEdges: graph.stats.totalEdges,
      totalCycles: graph.stats.cycles?.totalCycles || 0,
      highSeverityCycles: graph.stats.cycles?.highSeverity || 0,
      affectedFilesByCycles: graph.stats.cycles?.affectedFiles || 0,
      languages: graph.stats.languages,
      topCycles,
    },
  };
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const resolvedPath = path.resolve(options.projectPath);
    const outDir = path.resolve(options.outDir);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Project path not found: ${resolvedPath}`);
    }

    console.log(`Code2Node CI scan: ${resolvedPath}`);
    const graph = scanProject({ rootPath: resolvedPath });
    const report = buildReport(graph);

    ensureDir(outDir);

    const baseName = `code2node-report-${Date.now()}`;
    if (options.format === 'json' || options.format === 'both') {
      const jsonPath = path.join(outDir, `${baseName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`Wrote JSON report: ${jsonPath}`);
    }

    if (options.format === 'html' || options.format === 'both') {
      const htmlPath = path.join(outDir, `${baseName}.html`);
      fs.writeFileSync(htmlPath, renderHtmlReport(report), 'utf-8');
      console.log(`Wrote HTML report: ${htmlPath}`);
    }

    const highCycles = report.summary.highSeverityCycles;
    const totalCycles = report.summary.totalCycles;
    if (options.failOnHighCycles && highCycles > 0) {
      console.error(`Failing due to high-severity cycles: ${highCycles}`);
      process.exit(2);
    }

    if (options.maxHighCycles !== undefined && highCycles > options.maxHighCycles) {
      console.error(
        `Failing due to high-severity cycle threshold: found ${highCycles}, max allowed ${options.maxHighCycles}`,
      );
      process.exit(2);
    }

    if (options.maxTotalCycles !== undefined && totalCycles > options.maxTotalCycles) {
      console.error(
        `Failing due to total cycle threshold: found ${totalCycles}, max allowed ${options.maxTotalCycles}`,
      );
      process.exit(2);
    }

    console.log('CI scan completed successfully.');
  } catch (err) {
    console.error(`CI scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main();
