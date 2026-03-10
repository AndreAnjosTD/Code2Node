import React, { useState, useEffect } from 'react';
import { scanProjectWithProgress, browseDirectory } from '../api';
import { useAppStore } from '../store';
import { addScanSnapshot } from '../scanSnapshots';
import ScanProgressPanel from './ScanProgress';

const RECENT_PROJECTS_KEY = 'code2node_recent_projects';
const MAX_RECENT_PROJECTS = 5;

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

function getRecentProjects(): RecentProject[] {
  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentProject(path: string) {
  const projects = getRecentProjects();
  const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
  
  // Remove existing entry for this path
  const filtered = projects.filter(p => p.path !== path);
  
  // Add to front
  const updated = [{ path, name, lastOpened: Date.now() }, ...filtered];
  
  // Keep only the most recent N projects
  const trimmed = updated.slice(0, MAX_RECENT_PROJECTS);
  
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
}

export default function WelcomeScreen() {
  const setGraph = useAppStore(s => s.setGraph);
  const setLoading = useAppStore(s => s.setLoading);
  const setError = useAppStore(s => s.setError);
  const setProjectPath = useAppStore(s => s.setProjectPath);
  const setScanProgress = useAppStore(s => s.setScanProgress);
  const loading = useAppStore(s => s.loading);
  const scanProgress = useAppStore(s => s.scanProgress);
  const error = useAppStore(s => s.error);

  const [pathInput, setPathInput] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [browseItems, setBrowseItems] = useState<Array<{ name: string; path: string; isDirectory: boolean }>>([]);
  const [browsePath, setBrowsePath] = useState('');
  const [browseParent, setBrowseParent] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    setRecentProjects(getRecentProjects());
  }, []);

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
        // Add to recent projects
        addRecentProject(pathInput.trim());
        addScanSnapshot(pathInput.trim(), graph);
      },
      (error) => {
        setError(error);
        setLoading(false);
        setScanProgress(null);
      },
    );
  };

  const handleRecentProjectClick = (path: string) => {
    setPathInput(path);
  };

  const handleRemoveRecentProject = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const projects = getRecentProjects().filter(p => p.path !== path);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects));
    setRecentProjects(projects);
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

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-logo">
          <div className="logo-icon">⬡</div>
          <h1>Code2Node</h1>
          <p className="welcome-subtitle">
            Transform your codebase into an interactive visual graph
          </p>
        </div>

        <div className="welcome-features">
          <div className="feature-card">
            <span className="feature-icon">🔍</span>
            <h3>Parse</h3>
            <p>Analyze classes, functions, imports, and inheritance across your codebase</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🔗</span>
            <h3>Connect</h3>
            <p>Discover relationships, dependencies, and hierarchies between code elements</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🎯</span>
            <h3>Visualize</h3>
            <p>Interactive, zoomable node graph with drag, search, and filter capabilities</p>
          </div>
        </div>

        {recentProjects.length > 0 && (
          <div className="welcome-recent-projects">
            <h3>Recent Projects</h3>
            <div className="recent-projects-list">
              {recentProjects.map(project => (
                <div
                  key={project.path}
                  className="recent-project-item"
                  onClick={() => handleRecentProjectClick(project.path)}
                  title={project.path}
                >
                  <span className="recent-project-icon">📁</span>
                  <div className="recent-project-info">
                    <div className="recent-project-name">{project.name}</div>
                    <div className="recent-project-path">{project.path}</div>
                  </div>
                  <button
                    className="recent-project-remove"
                    onClick={(e) => handleRemoveRecentProject(project.path, e)}
                    title="Remove from recent"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="welcome-input-section">
          <label>Enter a project path to get started</label>
          <div className="welcome-input-row">
            <input
              type="text"
              className="text-input welcome-input"
              placeholder="C:\path\to\your\project"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleScan()}
              disabled={loading}
            />
            <button
              className="icon-btn welcome-browse-btn"
              onClick={() => handleBrowse()}
              title="Browse file system"
              disabled={loading}
            >
              📁
            </button>
            <button
              className="primary-btn welcome-btn"
              onClick={handleScan}
              disabled={loading}
            >
              {loading ? '⏳ Scanning...' : '🚀 Visualize'}
            </button>
          </div>

          {/* Inline scan progress on the welcome screen */}
          {loading && scanProgress && (
            <div className="welcome-scan-progress">
              <ScanProgressPanel progress={scanProgress} />
            </div>
          )}

          {/* Loading without detailed progress (initial connect) */}
          {loading && !scanProgress && (
            <div className="welcome-loading-hint">
              <div className="loading-spinner" />
              <span>Connecting to server...</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="welcome-error">
              <span className="welcome-error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Directory Browser */}
          {browsing && (
            <div className="welcome-browser">
              <div className="browser-header">
                <span className="browser-path">{browsePath}</span>
                <button className="icon-btn" onClick={() => setBrowsing(false)}>✕</button>
              </div>
              {browseParent !== browsePath && (
                <div className="browser-item" onClick={() => handleBrowse(browseParent)}>
                  📁 ..
                </div>
              )}
              <div className="welcome-browser-list">
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
              </div>
              <button
                className="primary-btn"
                onClick={() => handleSelectDir(browsePath)}
                style={{ margin: '8px 10px 10px' }}
              >
                📌 Select Current Directory
              </button>
            </div>
          )}
        </div>

        <div className="welcome-supported">
          <span>Supported languages:</span>
          <span className="lang-badge ts">TypeScript / JavaScript</span>
          <span className="lang-badge py">Python</span>
          <span className="lang-badge cpp">C / C++</span>
        </div>
      </div>
    </div>
  );
}
