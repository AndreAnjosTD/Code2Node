import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { browseDirectory, scanProjectWithProgress, getInstalledIDEs, validateIDECommand, type InstalledIDE } from '../api';
import type { NodeKind } from '../../shared/types';
import { NODE_COLORS } from '../layout';

const KIND_LABELS: Record<string, { label: string; icon: string }> = {
  file:      { label: 'Files', icon: '📄' },
  class:     { label: 'Classes', icon: '◆' },
  function:  { label: 'Functions', icon: '⚡' },
  interface: { label: 'Interfaces', icon: '◇' },
  enum:      { label: 'Enums', icon: '≡' },
};

type PanelId = 'project' | 'outliner' | 'shortcuts';

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

  const activePanel = activeSidebarPanel as PanelId | null;
  const [pathInput, setPathInput] = useState(projectPath || '');
  const [browsing, setBrowsing] = useState(false);
  const [browseItems, setBrowseItems] = useState<Array<{ name: string; path: string }>>([]);
  const [browsePath, setBrowsePath] = useState('');
  const [browseParent, setBrowseParent] = useState('');
  const [installedIDEs, setInstalledIDEs] = useState<InstalledIDE[]>([]);
  const [idesLoading, setIdesLoading] = useState(true);

  // Custom IDE form state
  const [showAddIDE, setShowAddIDE] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customCmd, setCustomCmd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [customValidating, setCustomValidating] = useState(false);

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
              <div key={item.path} className="browser-item">
                <span onClick={() => handleBrowse(item.path)}>📁 {item.name}</span>
                <button
                  className="select-btn"
                  onClick={() => handleSelectDir(item.path)}
                >
                  Select
                </button>
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
          <div className="language-tags">
            {Object.entries(graph.stats.languages).map(([lang, count]) => (
              <span key={lang} className="language-tag">
                {lang}: {count}
              </span>
            ))}
          </div>
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
            <label className="section-label">Search</label>
            <input
              type="text"
              className="text-input outliner-search-input"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
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
    </div>
  );
}
