import type { ProjectGraph } from '../shared/types';

const SCAN_SNAPSHOTS_KEY = 'code2node_scan_snapshots';
const MAX_SNAPSHOTS = 25;

export interface ScanSnapshot {
  id: string;
  projectPath: string;
  createdAt: number;
  totalFiles: number;
  totalNodes: number;
  totalEdges: number;
  totalCycles: number;
}

function readSnapshots(): ScanSnapshot[] {
  try {
    const raw = localStorage.getItem(SCAN_SNAPSHOTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots: ScanSnapshot[]): void {
  localStorage.setItem(SCAN_SNAPSHOTS_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
}

export function addScanSnapshot(projectPath: string, graph: ProjectGraph): ScanSnapshot {
  const totalCycles = graph.stats.cycles?.totalCycles ?? graph.cycles?.length ?? 0;
  const snapshot: ScanSnapshot = {
    id: `${projectPath}:${Date.now()}`,
    projectPath,
    createdAt: Date.now(),
    totalFiles: graph.stats.totalFiles,
    totalNodes: graph.stats.totalNodes,
    totalEdges: graph.stats.totalEdges,
    totalCycles,
  };

  const existing = readSnapshots().filter(s => s.projectPath !== projectPath || Date.now() - s.createdAt > 1000);
  writeSnapshots([snapshot, ...existing]);
  return snapshot;
}

export function getScanSnapshots(projectPath?: string): ScanSnapshot[] {
  const snapshots = readSnapshots().sort((a, b) => b.createdAt - a.createdAt);
  if (!projectPath) return snapshots;
  return snapshots.filter(s => s.projectPath === projectPath);
}
