import type { ProjectGraph } from '../shared/types';

export interface ProjectReport {
  generatedAt: string;
  projectPath: string;
  summary: {
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    totalCycles: number;
    highSeverityCycles: number;
    affectedFilesByCycles: number;
    languages: Record<string, number>;
    topCycles: Array<{
      id: string;
      type: string;
      severity: string;
      size: number;
    }>;
  };
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

export function buildProjectReport(graph: ProjectGraph): ProjectReport {
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

export function renderReportHtml(report: ProjectReport): string {
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
    <title>Code2Node Report</title>
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
    <h1>Code2Node Report</h1>
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

function downloadBlob(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function reportFileBaseName(report: ProjectReport): string {
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  return `code2node-report-${stamp}`;
}

export function downloadReportJson(graph: ProjectGraph): void {
  const report = buildProjectReport(graph);
  const fileName = `${reportFileBaseName(report)}.json`;
  downloadBlob(JSON.stringify(report, null, 2), fileName, 'application/json');
}

export function downloadReportHtml(graph: ProjectGraph): void {
  const report = buildProjectReport(graph);
  const fileName = `${reportFileBaseName(report)}.html`;
  downloadBlob(renderReportHtml(report), fileName, 'text/html');
}
