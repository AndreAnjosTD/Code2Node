import React, { useState, useEffect, useMemo } from 'react';
import {
  useAppStore,
  PROGRESSIVE_INITIAL_NODES_OPTIONS,
  PROGRESSIVE_LOAD_STEP_OPTIONS,
  AUTO_CLUSTER_THRESHOLD_OPTIONS,
} from '../store';
import { browseDirectory, scanProjectWithProgress, getInstalledIDEs, validateIDECommand, type InstalledIDE } from '../api';
import type { NodeKind } from '../../shared/types';
import { NODE_COLORS } from '../layout';
import { getSearchSuggestions } from '../semanticSearch';
import { addScanSnapshot, getScanSnapshots, type ScanSnapshot } from '../scanSnapshots';
import { downloadReportHtml, downloadReportJson } from '../reportExport';
import { downloadGraphPng, downloadGraphSvg } from '../graphExport';

const KIND_LABELS: Record<string, { label: string; icon: string }> = {
  file:      { label: 'Files', icon: '📄' },
  module:    { label: 'Modules', icon: '📦' },
  class:     { label: 'Classes', icon: '◆' },
  function:  { label: 'Functions', icon: '⚡' },
  interface: { label: 'Interfaces', icon: '◇' },
  enum:      { label: 'Enums', icon: '≡' },
  variable:  { label: 'Variables', icon: '📌' },
};

type PanelId = 'project' | 'outliner' | 'shortcuts' | 'cycles' | 'export';

/* ─── SVG Icon Components ─── */

function ProjectIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function OutlinerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1.5" fill="currentColor" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ShortcutsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="6" y1="8" x2="6" y2="8" strokeWidth="2" strokeLinecap="round" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="18" y1="8" x2="18" y2="8" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function CyclesIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6" />
      <path d="M2.5 22v-6h6" />
      <path d="M2 11.5a10 10 0 0118.8-4.3L21.5 8" />
      <path d="M22 12.5a10 10 0 01-18.8 4.2L2.5 16" />
    </svg>
  );
}

function ExportIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function Sidebar() {
  const graph = useAppStore(s => s.graph);
  const loading = useAppStore(s => s.loading);
  const error = useAppStore(s => s.error);
  const projectPath = useAppStore(s => s.projectPath);
  const searchQuery = useAppStore(s => s.searchQuery);
  const filterKinds = useAppStore(s => s.filterKinds);
  const setGraph = useAppStore(s => s.setGraph);
  const setLoading = useAppStore(s => s.setLoading);
  const setError = useAppStore(s => s.setError);
  const setProjectPath = useAppStore(s => s.setProjectPath);
  const setSearchQuery = useAppStore(s => s.setSearchQuery);
  const toggleFilterKind = useAppStore(s => s.toggleFilterKind);
  const setSelectedNode = useAppStore(s => s.setSelectedNode);
  const setScanProgress = useAppStore(s => s.setScanProgress);
  const ideCommand = useAppStore(s => s.ideCommand);
  const setIdeCommand = useAppStore(s => s.setIdeCommand);
  const activeSidebarPanel = useAppStore(s => s.activeSidebarPanel);
  const setActiveSidebarPanel = useAppStore(s => s.setActiveSidebarPanel);
  const setHighlightedCycle = useAppStore(s => s.setHighlightedCycle);
  const setFocusedNodeId = useAppStore(s => s.setFocusedNodeId);
  const graphViewMode = useAppStore(s => s.graphViewMode);
  const setGraphViewMode = useAppStore(s => s.setGraphViewMode);
  const progressiveLoadingEnabled = useAppStore(s => s.progressiveLoadingEnabled);
  const progressiveInitialNodes = useAppStore(s => s.progressiveInitialNodes);
  const progressiveLoadStep = useAppStore(s => s.progressiveLoadStep);
  const autoClusterEnabled = useAppStore(s => s.autoClusterEnabled);
  const autoClusterThreshold = useAppStore(s => s.autoClusterThreshold);
  const renderTelemetry = useAppStore(s => s.renderTelemetry);
  const setProgressiveLoadingEnabled = useAppStore(s => s.setProgressiveLoadingEnabled);
  const setProgressiveInitialNodes = useAppStore(s => s.setProgressiveInitialNodes);
  const setProgressiveLoadStep = useAppStore(s => s.setProgressiveLoadStep);
  const setAutoClusterEnabled = useAppStore(s => s.setAutoClusterEnabled);
  const setAutoClusterThreshold = useAppStore(s => s.setAutoClusterThreshold);
  const loadMoreRenderNodes = useAppStore(s => s.loadMoreRenderNodes);

  const activePanel = activeSidebarPanel as PanelId | null;
  const [pathInput, setPathInput] = useState(projectPath || '');
  const [browsing, setBrowsing] = useState(false);
  const [browseItems, setBrowseItems] = useState<Array<{ name: string; path: string; isDirectory: boolean }>>([]);
  const [browsePath, setBrowsePath] = useState('');
  const [browseParent, setBrowseParent] = useState('');
  const [installedIDEs, setInstalledIDEs] = useState<InstalledIDE[]>([]);
  const [idesLoading, setIdesLoading] = useState(true);
  const [scanSnapshots, setScanSnapshots] = useState<ScanSnapshot[]>([]);

  // Custom IDE form state
  const [showAddIDE, setShowAddIDE] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customCmd, setCustomCmd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [customValidating, setCustomValidating] = useState(false);

  const actionableInsights = useMemo(() => {
    if (!graph) {
      return {
        topFanIn: [] as Array<{ filePath: string; count: number }>,
        topFanOut: [] as Array<{ filePath: string; count: number }>,
        topCycleFiles: [] as Array<{ filePath: string; count: number }>,
        largestCycle: null as null | { nodes: number; type: string; severity: string },
        hotFiles: [] as Array<{ filePath: string; score: number; in: number; out: number; cycles: number }>,
        fileSignals: new Map<string, { in: number; out: number; cycles: number; score: number }>(),
      };
    }

    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    const incomingByFile = new Map<string, number>();
    const outgoingByFile = new Map<string, number>();

    for (const edge of graph.edges) {
      if (edge.kind === 'contains') continue;
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;
      outgoingByFile.set(source.filePath, (outgoingByFile.get(source.filePath) || 0) + 1);
      incomingByFile.set(target.filePath, (incomingByFile.get(target.filePath) || 0) + 1);
    }

    const topFanIn = Array.from(incomingByFile.entries())
      .map(([filePath, count]) => ({ filePath, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const topFanOut = Array.from(outgoingByFile.entries())
      .map(([filePath, count]) => ({ filePath, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const cycleFileCounts = new Map<string, number>();
    for (const cycle of graph.cycles || []) {
      const uniqueCycleFiles = new Set(
        cycle.nodes
          .map(nodeId => nodeMap.get(nodeId)?.filePath)
          .filter((filePath): filePath is string => !!filePath)
      );
      for (const filePath of uniqueCycleFiles) {
        cycleFileCounts.set(filePath, (cycleFileCounts.get(filePath) || 0) + 1);
      }
    }

    const topCycleFiles = Array.from(cycleFileCounts.entries())
      .map(([filePath, count]) => ({ filePath, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const largest = [...(graph.cycles || [])].sort((a, b) => b.nodes.length - a.nodes.length)[0];
    const largestCycle = largest
      ? { nodes: largest.nodes.length, type: largest.type, severity: largest.severity }
      : null;

    const candidateFiles = new Set<string>([
      ...Array.from(incomingByFile.keys()),
      ...Array.from(outgoingByFile.keys()),
      ...Array.from(cycleFileCounts.keys()),
    ]);

    const fileSignals = new Map<string, { in: number; out: number; cycles: number; score: number }>();

    const hotFiles = Array.from(candidateFiles)
      .map(filePath => {
        const inbound = incomingByFile.get(filePath) || 0;
        const outbound = outgoingByFile.get(filePath) || 0;
        const cycles = cycleFileCounts.get(filePath) || 0;
        const signal = {
          filePath,
          in: inbound,
          out: outbound,
          cycles,
          score: inbound + outbound + cycles * 4,
        };
        fileSignals.set(filePath, {
          in: signal.in,
          out: signal.out,
          cycles: signal.cycles,
          score: signal.score,
        });
        return signal;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      topFanIn,
      topFanOut,
      topCycleFiles,
      largestCycle,
      hotFiles,
      fileSignals,
    };
  }, [graph]);

  // Load custom IDEs from localStorage
  const loadCustomIDEs = (): InstalledIDE[] => {
    try {
      const raw = localStorage.getItem('code2node_custom_ides');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveCustomIDEs = (ides: InstalledIDE[]) => {
    localStorage.setItem('code2node_custom_ides', JSON.stringify(ides));
  };

  // Fetch installed IDEs on mount, merge with custom
  useEffect(() => {
    getInstalledIDEs().then(detected => {
      const custom = loadCustomIDEs();
      const merged = [...detected, ...custom];
      setInstalledIDEs(merged);
      if (merged.length > 0 && !merged.some(i => i.cmd === ideCommand)) {
        setIdeCommand(merged[0].cmd);
      }
      setIdesLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!projectPath) {
      setScanSnapshots([]);
      return;
    }
    setScanSnapshots(getScanSnapshots(projectPath).slice(0, 5));
  }, [projectPath, graph]);

  const handleAddCustomIDE = async () => {
    if (!customLabel.trim() || !customCmd.trim()) {
      setCustomError('Both fields are required');
      return;
    }

    setCustomValidating(true);
    setCustomError(null);

    const result = await validateIDECommand(customCmd.trim());
    setCustomValidating(false);

    if (!result.valid) {
      setCustomError(result.error || 'Command not found');
      return;
    }

    const newIDE: InstalledIDE = { cmd: customCmd.trim(), label: customLabel.trim(), custom: true };
    const custom = [...loadCustomIDEs(), newIDE];
    saveCustomIDEs(custom);
    setInstalledIDEs(prev => [...prev, newIDE]);
    setIdeCommand(newIDE.cmd);
    setCustomLabel('');
    setCustomCmd('');
    setShowAddIDE(false);
  };

  const handleRemoveCustomIDE = (cmd: string) => {
    const custom = loadCustomIDEs().filter(i => i.cmd !== cmd);
    saveCustomIDEs(custom);
    setInstalledIDEs(prev => prev.filter(i => i.cmd !== cmd || !i.custom));
    if (ideCommand === cmd) {
      const remaining = installedIDEs.filter(i => i.cmd !== cmd);
      if (remaining.length > 0) setIdeCommand(remaining[0].cmd);
    }
  };

  const handleScan = () => {
    if (!pathInput.trim()) return;
    setLoading(true);
    setError(null);
    setScanProgress(null);

    scanProjectWithProgress(
      pathInput.trim(),
      (progress) => {
        setScanProgress(progress);
      },
      (graph) => {
        setGraph(graph);
        setProjectPath(pathInput.trim());
        setLoading(false);
        setScanProgress(null);
        addScanSnapshot(pathInput.trim(), graph);
        setScanSnapshots(getScanSnapshots(pathInput.trim()).slice(0, 5));
      },
      (error) => {
        setError(error);
        setLoading(false);
        setScanProgress(null);
      },
    );
  };

  const handleBrowse = async (path?: string) => {
    try {
      const result = await browseDirectory(path);
      setBrowseItems(result.items);
      setBrowsePath(result.currentPath);
      setBrowseParent(result.parentPath);
      setBrowsing(true);
    } catch {
      // ignore
    }
  };

  const handleSelectDir = (dirPath: string) => {
    setPathInput(dirPath);
    setBrowsing(false);
  };

  const togglePanel = (panel: PanelId) => {
    setActiveSidebarPanel(activePanel === panel ? null : panel);
  };

  const formatDelta = (current: number, previous: number): string => {
    const delta = current - previous;
    if (delta === 0) return '±0';
    return delta > 0 ? `+${delta}` : `${delta}`;
  };

  const handleGraphExport = async (format: 'png' | 'svg') => {
    try {
      if (format === 'png') {
        await downloadGraphPng();
      } else {
        await downloadGraphSvg();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to export graph image';
      setError(msg);
    }
  };

  const handleInsightFileClick = (filePath: string) => {
    if (!graph) return;

    if (graphViewMode !== 'detailed') {
      setGraphViewMode('detailed');
    }

    const targetNode =
      graph.nodes.find(n => n.kind === 'file' && n.filePath === filePath)
      || graph.nodes.find(n => n.filePath === filePath);

    if (!targetNode) return;

    setSelectedNode(targetNode);
    setFocusedNodeId(targetNode.id);
    setHighlightedCycle(null);
  };



  const getInsightTooltip = (filePath: string): string => {
    const signal = actionableInsights.fileSignals.get(filePath) || { in: 0, out: 0, cycles: 0, score: 0 };
    return [
      `Focus ${filePath}`,
      `Inbound deps: ${signal.in}`,
      `Outbound deps: ${signal.out}`,
      `Cycle involvement: ${signal.cycles}`,
      `Risk score: ${signal.score}`,
    ].join('\n');
  };

  /* ─── Panel: Project Settings ─── */
  const renderProjectPanel = () => (
    <div className="ab-panel">
      <div className="ab-panel-header">
        <span className="ab-panel-title">Project Settings</span>
        <button className="icon-btn" onClick={() => setActiveSidebarPanel(null)} title="Close panel">✕</button>
      </div>

      {/* Path Input */}
      <div className="sidebar-section">
        <label className="section-label">Project Path</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="text-input"
            placeholder="C:\path\to\project"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleScan()}
          />
          <button className="icon-btn" onClick={() => handleBrowse()} title="Browse">
            📁
          </button>
        </div>
        <button
          className="primary-btn"
          onClick={handleScan}
          disabled={loading || !pathInput.trim()}
        >
          {loading ? '⏳ Scanning...' : '🔍 Scan Project'}
        </button>

        {/* Directory Browser */}
        {browsing && (
          <div className="browser-panel">
            <div className="browser-header">
              <span className="browser-path">{browsePath}</span>
              <button className="icon-btn" onClick={() => setBrowsing(false)}>✕</button>
            </div>
            {browseParent !== browsePath && (
              <div className="browser-item" onClick={() => handleBrowse(browseParent)}>
                📁 ..
              </div>
            )}
            {browseItems.map(item => (
              <div key={item.path} className={`browser-item${item.isDirectory ? '' : ' browser-file'}`}>
                {item.isDirectory ? (
                  <>
                    <span onClick={() => handleBrowse(item.path)}>📁 {item.name}</span>
                    <button
                      className="select-btn"
                      onClick={() => handleSelectDir(item.path)}
                    >
                      Select
                    </button>
                  </>
                ) : (
                  <span className="browser-file-name">📄 {item.name}</span>
                )}
              </div>
            ))}
            <button
              className="primary-btn"
              onClick={() => handleSelectDir(browsePath)}
              style={{ marginTop: 8 }}
            >
              📌 Select Current
            </button>
          </div>
        )}
      </div>

      {/* IDE Setting */}
      <div className="sidebar-section">
        <label className="section-label">IDE / Editor</label>
        {idesLoading ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>Detecting installed editors…</div>
        ) : installedIDEs.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--accent-amber)', padding: '6px 0' }}>No supported editors detected</div>
        ) : (
          <div className="ide-select-row">
            <select
              className="text-input"
              value={ideCommand}
              onChange={e => setIdeCommand(e.target.value)}
              style={{ cursor: 'pointer', flex: 1 }}
            >
              {installedIDEs.map(ide => (
                <option key={ide.cmd} value={ide.cmd}>
                  {ide.label}{ide.custom ? ' ✦' : ''}
                </option>
              ))}
            </select>
            {installedIDEs.find(i => i.cmd === ideCommand)?.custom && (
              <button
                className="ide-remove-btn"
                title="Remove this custom IDE"
                onClick={() => handleRemoveCustomIDE(ideCommand)}
              >
                ✕
              </button>
            )}
          </div>
        )}
        <button
          className="ide-add-btn"
          onClick={() => setShowAddIDE(!showAddIDE)}
        >
          {showAddIDE ? '− Cancel' : '+ Add IDE'}
        </button>

        {showAddIDE && (
          <div className="ide-add-form">
            <input
              className="text-input"
              placeholder="Label (e.g. Sublime Text)"
              value={customLabel}
              onChange={e => { setCustomLabel(e.target.value); setCustomError(null); }}
            />
            <input
              className="text-input"
              placeholder="Command or path to executable"
              value={customCmd}
              onChange={e => { setCustomCmd(e.target.value); setCustomError(null); }}
            />
            {customError && (
              <div className="ide-add-error">⚠ {customError}</div>
            )}
            <button
              className="scan-btn"
              style={{ padding: '6px 10px', fontSize: 11 }}
              onClick={handleAddCustomIDE}
              disabled={customValidating}
            >
              {customValidating ? 'Validating…' : 'Add Editor'}
            </button>
          </div>
        )}
      </div>

      {/* View Mode */}
      <div className="sidebar-section">
        <label className="section-label">Graph View</label>
        <div className="export-btn-row">
          <button
            className="scan-btn"
            style={{ flex: 1, opacity: graphViewMode === 'detailed' ? 1 : 0.7 }}
            onClick={() => setGraphViewMode('detailed')}
          >
            Detailed
          </button>
          <button
            className="scan-btn"
            style={{ flex: 1, opacity: graphViewMode === 'folder' ? 1 : 0.7 }}
            onClick={() => setGraphViewMode('folder')}
          >
            Folder Clusters
          </button>
        </div>
      </div>

      {/* Repo-Scale Controls */}
      <div className="sidebar-section">
        <label className="section-label">Repo-Scale Controls</label>

        <label className="repo-toggle-row">
          <input
            type="checkbox"
            checked={progressiveLoadingEnabled}
            onChange={e => setProgressiveLoadingEnabled(e.target.checked)}
          />
          <span>Progressive node loading</span>
        </label>

        <div className="repo-control-grid">
          <div className="repo-control-item">
            <span>Initial nodes</span>
            <select
              className="text-input repo-control-select"
              value={progressiveInitialNodes}
              onChange={e => setProgressiveInitialNodes(Number(e.target.value))}
              disabled={!progressiveLoadingEnabled}
            >
              {PROGRESSIVE_INITIAL_NODES_OPTIONS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className="repo-control-item">
            <span>Load step</span>
            <select
              className="text-input repo-control-select"
              value={progressiveLoadStep}
              onChange={e => setProgressiveLoadStep(Number(e.target.value))}
              disabled={!progressiveLoadingEnabled}
            >
              {PROGRESSIVE_LOAD_STEP_OPTIONS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="repo-toggle-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={autoClusterEnabled}
            onChange={e => setAutoClusterEnabled(e.target.checked)}
          />
          <span>Auto-cluster large repos</span>
        </label>

        <div className="repo-control-item" style={{ marginTop: 6 }}>
          <span>Auto-cluster threshold</span>
          <select
            className="text-input repo-control-select"
            value={autoClusterThreshold}
            onChange={e => setAutoClusterThreshold(Number(e.target.value))}
            disabled={!autoClusterEnabled}
          >
            {AUTO_CLUSTER_THRESHOLD_OPTIONS.map(v => (
              <option key={v} value={v}>{v} nodes</option>
            ))}
          </select>
        </div>

        {graph && renderTelemetry.progressiveActive && renderTelemetry.hiddenNodes > 0 && (
          <button className="scan-btn repo-load-more-btn" onClick={() => loadMoreRenderNodes()}>
            Load More Nodes (+{progressiveLoadStep})
          </button>
        )}

        {graph && (
          <div className="repo-telemetry-card">
            <div className="repo-telemetry-title">Performance Telemetry</div>
            <div className="repo-telemetry-grid">
              <span>Layout</span><strong>{renderTelemetry.layoutMs.toFixed(2)} ms</strong>
              <span>Mode</span><strong>{renderTelemetry.effectiveViewMode}</strong>
              <span>Nodes</span><strong>{renderTelemetry.visibleNodes} / {renderTelemetry.sourceNodes}</strong>
              <span>Edges</span><strong>{renderTelemetry.visibleEdges} / {renderTelemetry.sourceEdges}</strong>
              <span>Hidden Nodes</span><strong>{renderTelemetry.hiddenNodes}</strong>
              <span>Hidden Edges</span><strong>{renderTelemetry.hiddenEdges}</strong>
            </div>
            {autoClusterEnabled && graphViewMode === 'detailed' && renderTelemetry.effectiveViewMode === 'folder' && (
              <div className="repo-telemetry-note">
                Auto-cluster active (repo exceeded {autoClusterThreshold} nodes).
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Stats */}
      {graph && (
        <div className="sidebar-section">
          <label className="section-label">Project Stats</label>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{graph.stats.totalFiles}</span>
              <span className="stat-label">Files</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{graph.stats.totalNodes}</span>
              <span className="stat-label">Nodes</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{graph.stats.totalEdges}</span>
              <span className="stat-label">Edges</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{Object.keys(graph.stats.languages).length}</span>
              <span className="stat-label">Languages</span>
            </div>
          </div>

          {/* Code Metrics */}
          {graph.stats.metrics && (
            <>
              <label className="section-label" style={{ marginTop: '16px' }}>Code Metrics</label>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-value">{graph.stats.metrics.totalLines.toLocaleString()}</span>
                  <span className="stat-label">Total Lines</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{graph.stats.metrics.codeLines.toLocaleString()}</span>
                  <span className="stat-label">Code Lines</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{graph.stats.metrics.commentLines.toLocaleString()}</span>
                  <span className="stat-label">Comments</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{graph.stats.metrics.averageLinesPerFile}</span>
                  <span className="stat-label">Avg Lines/File</span>
                </div>
              </div>

              {/* Code Composition Bar */}
              <div className="code-composition">
                <div className="composition-bar">
                  <div
                    className="composition-segment code"
                    style={{
                      width: `${(graph.stats.metrics.codeLines / graph.stats.metrics.totalLines) * 100}%`,
                    }}
                    title={`Code: ${graph.stats.metrics.codeLines} lines`}
                  />
                  <div
                    className="composition-segment comment"
                    style={{
                      width: `${(graph.stats.metrics.commentLines / graph.stats.metrics.totalLines) * 100}%`,
                    }}
                    title={`Comments: ${graph.stats.metrics.commentLines} lines`}
                  />
                  <div
                    className="composition-segment blank"
                    style={{
                      width: `${(graph.stats.metrics.blankLines / graph.stats.metrics.totalLines) * 100}%`,
                    }}
                    title={`Blank: ${graph.stats.metrics.blankLines} lines`}
                  />
                </div>
                <div className="composition-legend">
                  <span className="legend-item">
                    <span className="legend-dot code"></span>
                    Code {Math.round((graph.stats.metrics.codeLines / graph.stats.metrics.totalLines) * 100)}%
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot comment"></span>
                    Comments {Math.round((graph.stats.metrics.commentLines / graph.stats.metrics.totalLines) * 100)}%
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot blank"></span>
                    Blank {Math.round((graph.stats.metrics.blankLines / graph.stats.metrics.totalLines) * 100)}%
                  </span>
                </div>
              </div>

              {/* File Highlights */}
              {(graph.stats.metrics.largestFile || graph.stats.metrics.mostComplexFile) && (
                <div className="file-highlights">
                  {graph.stats.metrics.largestFile && (
                    <div className="highlight-item">
                      <span className="highlight-label">📄 Largest File:</span>
                      <span className="highlight-value" title={graph.stats.metrics.largestFile.path}>
                        {graph.stats.metrics.largestFile.path.split('/').pop()} 
                        <span className="highlight-meta"> ({graph.stats.metrics.largestFile.lines} lines)</span>
                      </span>
                    </div>
                  )}
                  {graph.stats.metrics.mostComplexFile && graph.stats.metrics.mostComplexFile.nodes > 0 && (
                    <div className="highlight-item">
                      <span className="highlight-label">⚡ Most Complex:</span>
                      <span className="highlight-value" title={graph.stats.metrics.mostComplexFile.path}>
                        {graph.stats.metrics.mostComplexFile.path.split('/').pop()}
                        <span className="highlight-meta"> ({graph.stats.metrics.mostComplexFile.nodes} nodes)</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="language-tags">
            {Object.entries(graph.stats.languages).map(([lang, count]) => (
              <span key={lang} className="language-tag">
                {lang}: {count}
              </span>
            ))}
          </div>

          {/* Scan Snapshot History */}
          {scanSnapshots.length > 0 && (
            <>
              <label className="section-label" style={{ marginTop: '16px' }}>Recent Scan Snapshots</label>
              <div className="snapshot-list">
                {scanSnapshots.map((snapshot, index) => {
                  const previous = scanSnapshots[index + 1];
                  return (
                    <div key={snapshot.id} className="snapshot-card">
                      <div className="snapshot-date">
                        {new Date(snapshot.createdAt).toLocaleString()}
                      </div>
                      <div className="snapshot-metrics">
                        <span>
                          N {snapshot.totalNodes}
                          {previous && <span className="snapshot-delta"> ({formatDelta(snapshot.totalNodes, previous.totalNodes)})</span>}
                        </span>
                        <span>
                          E {snapshot.totalEdges}
                          {previous && <span className="snapshot-delta"> ({formatDelta(snapshot.totalEdges, previous.totalEdges)})</span>}
                        </span>
                        <span>
                          C {snapshot.totalCycles}
                          {previous && <span className="snapshot-delta"> ({formatDelta(snapshot.totalCycles, previous.totalCycles)})</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Actionable Insights */}
          <label className="section-label" style={{ marginTop: '16px' }}>Actionable Insights</label>
          <div className="insight-cards">
            <div className="insight-card">
              <div className="insight-card-label">Highest Fan-In (most depended-on files)</div>
              {actionableInsights.topFanIn.length === 0 ? (
                <div className="insight-empty">No dependency edges yet</div>
              ) : actionableInsights.topFanIn.map(item => (
                <button
                  key={`in-${item.filePath}`}
                  type="button"
                  className="insight-row"
                  onClick={() => handleInsightFileClick(item.filePath)}
                  title={getInsightTooltip(item.filePath)}
                >
                  <span className="insight-row-name" title={item.filePath}>{item.filePath.split('/').pop()}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>

            <div className="insight-card">
              <div className="insight-card-label">Highest Fan-Out (most dependent files)</div>
              {actionableInsights.topFanOut.length === 0 ? (
                <div className="insight-empty">No dependency edges yet</div>
              ) : actionableInsights.topFanOut.map(item => (
                <button
                  key={`out-${item.filePath}`}
                  type="button"
                  className="insight-row"
                  onClick={() => handleInsightFileClick(item.filePath)}
                  title={getInsightTooltip(item.filePath)}
                >
                  <span className="insight-row-name" title={item.filePath}>{item.filePath.split('/').pop()}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>

            <div className="insight-card">
              <div className="insight-card-label">Cycle Pressure</div>
              {actionableInsights.largestCycle ? (
                <div className="insight-card-label" style={{ opacity: 1 }}>
                  Largest cycle: <strong>{actionableInsights.largestCycle.nodes} nodes</strong> ({actionableInsights.largestCycle.type}, {actionableInsights.largestCycle.severity})
                </div>
              ) : (
                <div className="insight-empty">No cycles detected</div>
              )}
              {actionableInsights.topCycleFiles.slice(0, 2).map(item => (
                <button
                  key={`cycle-${item.filePath}`}
                  type="button"
                  className="insight-row"
                  onClick={() => handleInsightFileClick(item.filePath)}
                  title={getInsightTooltip(item.filePath)}
                >
                  <span className="insight-row-name" title={item.filePath}>{item.filePath.split('/').pop()}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>

            <div className="insight-card">
              <div className="insight-card-label">Refactor Hotspots (risk score)</div>
              {actionableInsights.hotFiles.length === 0 ? (
                <div className="insight-empty">Not enough signals yet</div>
              ) : actionableInsights.hotFiles.map(item => (
                <button
                  key={`hot-${item.filePath}`}
                  type="button"
                  className="insight-row"
                  onClick={() => handleInsightFileClick(item.filePath)}
                  title={getInsightTooltip(item.filePath)}
                >
                  <span className="insight-row-name" title={item.filePath}>{item.filePath.split('/').pop()}</span>
                  <strong>{item.score}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ─── Panel: Export ─── */
  const renderExportPanel = () => (
    <div className="ab-panel">
      <div className="ab-panel-header">
        <span className="ab-panel-title">Export</span>
        <button className="icon-btn" onClick={() => setActiveSidebarPanel(null)} title="Close panel">✕</button>
      </div>

      {graph ? (
        <>
          {/* Report Export */}
          <div className="sidebar-section">
            <label className="section-label">Project Report</label>
            <div className="export-section">
              <div className="export-btn-row">
                <button
                  className="scan-btn"
                  onClick={() => downloadReportJson(graph)}
                  title="Download current scan report as JSON"
                >
                  📄 JSON Report
                </button>
                <button
                  className="scan-btn"
                  onClick={() => downloadReportHtml(graph)}
                  title="Download current scan report as HTML"
                >
                  🌐 HTML Report
                </button>
              </div>
            </div>
          </div>

          {/* Graph Snapshot */}
          <div className="sidebar-section">
            <label className="section-label">Graph Snapshot</label>
            <div className="export-section">
              <div className="export-btn-row">
                <button
                  className="scan-btn"
                  onClick={() => handleGraphExport('png')}
                  title="Download current graph canvas as PNG (2× resolution)"
                >
                  🖼️ PNG Image
                </button>
                <button
                  className="scan-btn"
                  onClick={() => handleGraphExport('svg')}
                  title="Download current graph canvas as SVG (vector)"
                >
                  📐 SVG Vector
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="sidebar-section" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Scan a project to enable exports.
        </div>
      )}
    </div>
  );

  /* ─── Panel: Outliner ─── */
  const renderOutlinerPanel = () => (
    <div className="ab-panel">
      <div className="ab-panel-header">
        <span className="ab-panel-title">Outliner</span>
        <button className="icon-btn" onClick={() => setActiveSidebarPanel(null)} title="Close panel">✕</button>
      </div>

      {graph ? (
        <>
          {/* Search */}
          <div className="sidebar-section">
            <label className="section-label">
              Search
              <span style={{ fontSize: '0.85em', opacity: 0.6, marginLeft: '6px' }}>
                (supports concepts & fuzzy)
              </span>
            </label>
            <input
              type="text"
              className="text-input outliner-search-input"
              placeholder="Try: constructor, async, handler..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              title="Semantic search: understands code concepts, handles typos, searches properties & docs"
            />
          </div>

          {/* Filters */}
          <div className="sidebar-section">
            <label className="section-label">Filter by Type</label>
            <div className="filter-grid">
              {Object.entries(KIND_LABELS).map(([kind, { label, icon }]) => {
                const active = filterKinds.has(kind);
                const colors = NODE_COLORS[kind as NodeKind];
                const count = graph.nodes.filter(n => n.kind === kind).length;
                return (
                  <button
                    key={kind}
                    className={`filter-btn ${active ? 'active' : ''}`}
                    onClick={() => toggleFilterKind(kind)}
                    style={{
                      borderColor: active ? colors.border : 'transparent',
                      background: active ? `${colors.border}20` : 'transparent',
                    }}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                    <span className="filter-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Node List */}
          <div className="sidebar-section node-list-section">
            <label className="section-label">
              Nodes ({graph.nodes.filter(n => filterKinds.has(n.kind)).length})
            </label>
            <div className="node-list">
              {graph.nodes
                .filter(n => filterKinds.has(n.kind))
                .filter(n => !searchQuery || n.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 100)
                .map(node => {
                  const colors = NODE_COLORS[node.kind];
                  return (
                    <div
                      key={node.id}
                      className="node-list-item"
                      onClick={() => setSelectedNode(node)}
                    >
                      <span style={{ color: colors.border, fontSize: 11 }}>
                        {KIND_LABELS[node.kind]?.icon || '●'}
                      </span>
                      <span className="node-list-name">{node.name}</span>
                      <span className="node-list-line">L{node.lineNumber}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      ) : (
        <div className="sidebar-section" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Scan a project to see nodes here.
        </div>
      )}
    </div>
  );

  /* ─── Panel: Shortcuts ─── */
  const SHORTCUTS = [
    { key: 'F', label: 'Focus selected node / Fit all', section: 'Canvas' },
    { key: 'Esc', label: 'Exit connections mode', section: 'Canvas' },
    { key: '+', label: 'Zoom in', section: 'Canvas' },
    { key: '−', label: 'Zoom out', section: 'Canvas' },
    { key: '↑', label: 'Pan canvas up', section: 'Canvas' },
    { key: '↓', label: 'Pan canvas down', section: 'Canvas' },
    { key: '←', label: 'Pan canvas left', section: 'Canvas' },
    { key: '→', label: 'Pan canvas right', section: 'Canvas' },
    { key: 'V', label: 'View code of selected node', section: 'Canvas' },
    { key: 'O', label: 'Open in IDE / Editor', section: 'Canvas' },
    { key: 'S', label: 'Open search & focus input', section: 'Canvas' },
    { key: 'E', label: 'Toggle Expert Mode (fullscreen)', section: 'Canvas' },
    { key: '1', label: 'Filter: Classes only', section: 'Filters' },
    { key: '2', label: 'Filter: Functions only', section: 'Filters' },
    { key: '3', label: 'Filter: Files only', section: 'Filters' },
    { key: '4', label: 'Filter: Interfaces only', section: 'Filters' },
    { key: '5', label: 'Filter: Enums only', section: 'Filters' },
    { key: 'Esc', label: 'Close code viewer', section: 'Code Viewer' },
    { key: 'Ctrl+C', label: 'Copy selection or all code', section: 'Code Viewer' },
    { key: '↑', label: 'Previous line of selected dependency', section: 'Code Viewer' },
    { key: '↓', label: 'Next line of selected dependency', section: 'Code Viewer' },
  ];

  const renderShortcutsPanel = () => {
    const sections = ['Canvas', 'Code Viewer', 'Filters'];
    return (
      <div className="ab-panel">
        <div className="ab-panel-header">
          <span className="ab-panel-title">Shortcuts</span>
          <button className="icon-btn" onClick={() => setActiveSidebarPanel(null)} title="Close panel">✕</button>
        </div>
        <div className="shortcuts-panel-body">
          {sections.map(section => (
            <div key={section} className="sidebar-section">
              <label className="section-label">{section}</label>
              <div className="shortcut-list">
                {SHORTCUTS.filter(s => s.section === section).map(s => (
                  <div key={s.key} className="shortcut-row">
                    <kbd className="shortcut-key">{s.key}</kbd>
                    <span className="shortcut-desc">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ─── Panel: Cycles ─── */
  const renderCyclesPanel = () => {
    if (!graph) {
      return (
        <div className="ab-panel">
          <div className="ab-panel-header">
            <span className="ab-panel-title">Dependency Cycles</span>
            <button className="icon-btn" onClick={() => setActiveSidebarPanel(null)} title="Close panel">✕</button>
          </div>
          <div className="ab-panel-body">
            <p style={{ opacity: 0.6, padding: '20px', textAlign: 'center' }}>No project scanned</p>
          </div>
        </div>
      );
    }

    const cycles = graph.cycles || [];
    const cycleStats = graph.stats.cycles;

    const getSeverityColor = (severity: 'high' | 'medium' | 'low') => {
      switch (severity) {
        case 'high': return '#ef4444';
        case 'medium': return '#f59e0b';
        case 'low': return '#10b981';
      }
    };

    const getSeverityIcon = (severity: 'high' | 'medium' | 'low') => {
      switch (severity) {
        case 'high': return '🔴';
        case 'medium': return '🟡';
        case 'low': return '🟢';
      }
    };

    return (
      <div className="ab-panel">
        <div className="ab-panel-header">
          <span className="ab-panel-title">Dependency Cycles</span>
          <button className="icon-btn" onClick={() => setActiveSidebarPanel(null)} title="Close panel">✕</button>
        </div>
        <div className="ab-panel-body">
          {/* Summary Stats */}
          {cycleStats && (
            <div className="sidebar-section">
              <label className="section-label">Summary</label>
              <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="stat-item">
                  <div className="stat-value">{cycleStats.totalCycles}</div>
                  <div className="stat-label">Total Cycles</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{cycleStats.affectedFiles}</div>
                  <div className="stat-label">Affected Files</div>
                </div>
                <div className="stat-item" style={{ opacity: cycleStats.highSeverity > 0 ? 1 : 0.5 }}>
                  <div className="stat-value" style={{ color: '#ef4444' }}>{cycleStats.highSeverity}</div>
                  <div className="stat-label">High Severity</div>
                </div>
                <div className="stat-item" style={{ opacity: cycleStats.mediumSeverity > 0 ? 1 : 0.5 }}>
                  <div className="stat-value" style={{ color: '#f59e0b' }}>{cycleStats.mediumSeverity}</div>
                  <div className="stat-label">Medium Severity</div>
                </div>
              </div>
            </div>
          )}

          {/* Affected Files */}
          {cycles.length > 0 && (
            <div className="sidebar-section">
              <label className="section-label">
                Affected Files ({cycleStats?.affectedFiles || 0})
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                {Array.from(new Set(
                  cycles.flatMap(cycle => 
                    cycle.nodes.map(nodeId => {
                      const node = graph.nodes.find(n => n.id === nodeId);
                      return node?.filePath;
                    }).filter(Boolean)
                  )
                )).sort().map((filePath, idx) => {
                  // Get relative path from project root
                  const relativePath = filePath?.replace(graph.projectPath, '').replace(/^[\\\/]/, '') || filePath;
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '4px',
                        fontSize: '0.85em',
                        fontFamily: 'monospace',
                        opacity: 0.9,
                        wordBreak: 'break-all',
                      }}
                      title={filePath}
                    >
                      📄 {relativePath}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cycle List */}
          <div className="sidebar-section">
            <label className="section-label">
              Detected Cycles {cycles.length > 0 && `(${cycles.length})`}
              {cycles.length > 0 && (
                <span style={{ fontSize: '0.85em', opacity: 0.6, marginLeft: '6px', fontWeight: 'normal' }}>
                  — click to view
                </span>
              )}
            </label>
            {cycles.length === 0 ? (
              <div style={{ 
                padding: '20px', 
                textAlign: 'center', 
                opacity: 0.6,
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '6px',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                <div>No dependency cycles detected!</div>
                <div style={{ fontSize: '0.85em', marginTop: '4px' }}>Your codebase has a clean dependency structure.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cycles.slice(0, 20).map(cycle => {
                  const nodeNames = cycle.nodes.map(nodeId => {
                    const node = graph.nodes.find(n => n.id === nodeId);
                    return node ? node.name : nodeId;
                  });

                  return (
                    <div
                      key={cycle.id}
                      className="cycle-item"
                      onClick={() => {
                        setHighlightedCycle({
                          nodeIds: cycle.nodes,
                          edgeIds: cycle.edges,
                        });
                      }}
                      title="Click to visualize this cycle on the canvas"
                      style={{
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${getSeverityColor(cycle.severity)}40`,
                        borderRadius: '6px',
                        fontSize: '0.9em',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.borderColor = `${getSeverityColor(cycle.severity)}80`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = `${getSeverityColor(cycle.severity)}40`;
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        marginBottom: '6px',
                        fontWeight: 500 
                      }}>
                        <span>{getSeverityIcon(cycle.severity)}</span>
                        <span style={{ color: getSeverityColor(cycle.severity), textTransform: 'capitalize' }}>
                          {cycle.severity}
                        </span>
                        <span style={{ opacity: 0.6 }}>•</span>
                        <span style={{ opacity: 0.8, textTransform: 'capitalize' }}>{cycle.type}</span>
                      </div>
                      <div style={{ opacity: 0.8, fontSize: '0.9em', fontFamily: 'monospace' }}>
                        {nodeNames.slice(0, 3).join(' → ')}
                        {nodeNames.length > 3 && ` → ... (${nodeNames.length} nodes)`}
                      </div>
                    </div>
                  );
                })}
                {cycles.length > 20 && (
                  <div style={{ padding: '10px', textAlign: 'center', opacity: 0.6, fontSize: '0.9em' }}>
                    ... and {cycles.length - 20} more cycles
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="sidebar-wrapper">
      {/* Activity Bar */}
      <div className="activity-bar">
        <div className="ab-logo" title="Code2Node">⬡</div>
        <div className="ab-buttons">
          <button
            className={`ab-btn ${activePanel === 'project' ? 'active' : ''}`}
            onClick={() => togglePanel('project')}
            title="Project Settings"
          >
            <ProjectIcon />
          </button>
          <button
            className={`ab-btn ${activePanel === 'outliner' ? 'active' : ''}`}
            onClick={() => togglePanel('outliner')}
            title="Outliner"
          >
            <OutlinerIcon />
          </button>
          <button
            className={`ab-btn ${activePanel === 'cycles' ? 'active' : ''}`}
            onClick={() => togglePanel('cycles')}
            title="Dependency Cycles"
          >
            <CyclesIcon />
          </button>
          <button
            className={`ab-btn ${activePanel === 'export' ? 'active' : ''}`}
            onClick={() => togglePanel('export')}
            title="Export"
          >
            <ExportIcon />
          </button>
          <button
            className={`ab-btn ${activePanel === 'shortcuts' ? 'active' : ''}`}
            onClick={() => togglePanel('shortcuts')}
            title="Keyboard Shortcuts"
          >
            <ShortcutsIcon />
          </button>
        </div>
      </div>

      {/* Panel */}
      {activePanel === 'project' && renderProjectPanel()}
      {activePanel === 'outliner' && renderOutlinerPanel()}
      {activePanel === 'shortcuts' && renderShortcutsPanel()}
      {activePanel === 'cycles' && renderCyclesPanel()}
      {activePanel === 'export' && renderExportPanel()}
    </div>
  );
}
