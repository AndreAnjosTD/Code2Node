import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAppStore } from '../store';
import type { CodeViewerConnection } from '../store';
import { fetchFileContent } from '../api';
import { EDGE_COLORS } from '../layout';

/** Per-line highlight info computed by scanning code for dependency names */
interface LineHighlight {
  connections: { name: string; edgeKind: string; label?: string }[];
}

export default function CodeViewer() {
  const node = useAppStore(s => s.codeViewerNode);
  const setCodeViewerNode = useAppStore(s => s.setCodeViewerNode);
  const connections = useAppStore(s => s.codeViewerConnections);
  const setCodeViewerConnections = useAppStore(s => s.setCodeViewerConnections);

  const [code, setCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startLine, setStartLine] = useState(1);

  // Connection tree collapse / resize
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [treeHeight, setTreeHeight] = useState(140);
  const treeResizing = useRef(false);
  const treeStartY = useRef(0);
  const treeStartH = useRef(0);

  // Selected dependency for arrow-key cycling
  const [selectedDepKey, setSelectedDepKey] = useState<string | null>(null);
  const [selectedDepLineIdx, setSelectedDepLineIdx] = useState(0);

  // Copy context menu
  const [copyMenu, setCopyMenu] = useState<{ x: number; y: number } | null>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  // Refs for scrolling
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const codeBodyRef = useRef<HTMLDivElement>(null);

  const projectPath = useAppStore(s => s.graph?.projectPath || '');

  useEffect(() => {
    if (!node) return;
    setLoading(true);
    setError(null);
    setCode('');

    const fullPath = projectPath
      ? `${projectPath}/${node.filePath}`
      : node.filePath;

    fetchFileContent(fullPath, node.lineNumber, node.endLine)
      .then(result => {
        setCode(result.content);
        setStartLine(result.startLine);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [node, projectPath]);

  // Close copy context menu on outside click
  useEffect(() => {
    if (!copyMenu) return;
    const close = (e: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setCopyMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [copyMenu]);

  // Connection tree resize drag handlers
  const onTreeResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    treeResizing.current = true;
    treeStartY.current = e.clientY;
    treeStartH.current = treeHeight;

    const onMove = (ev: MouseEvent) => {
      if (!treeResizing.current) return;
      const delta = ev.clientY - treeStartY.current;
      setTreeHeight(Math.max(60, Math.min(400, treeStartH.current + delta)));
    };
    const onUp = () => {
      treeResizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [treeHeight]);

  // Compute per-line highlights by searching the code for dependency names
  const lineHighlights = useMemo<Map<number, LineHighlight>>(() => {
    const map = new Map<number, LineHighlight>();
    if (!connections || connections.length === 0 || !code) return map;

    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = startLine + i;

      for (const conn of connections) {
        const regex = new RegExp(`\\b${conn.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (regex.test(line)) {
          if (!map.has(lineNum)) {
            map.set(lineNum, { connections: [] });
          }
          map.get(lineNum)!.connections.push({
            name: conn.name,
            edgeKind: conn.edgeKind,
            label: conn.label,
          });
        }
      }
    }
    return map;
  }, [code, connections, startLine]);

  // Build a summary: per-connection, how many lines reference it
  const connectionSummary = useMemo(() => {
    if (!connections || connections.length === 0) return [];
    const counts = new Map<string, { conn: CodeViewerConnection; lines: number[] }>();
    for (const [lineNum, info] of lineHighlights) {
      for (const c of info.connections) {
        const key = `${c.edgeKind}:${c.name}`;
        if (!counts.has(key)) {
          counts.set(key, { conn: c as CodeViewerConnection, lines: [] });
        }
        counts.get(key)!.lines.push(lineNum);
      }
    }
    return Array.from(counts.values());
  }, [connections, lineHighlights]);

  // Auto-scroll to first highlighted line after code loads
  useEffect(() => {
    if (!loading && lineHighlights.size > 0) {
      const firstLine = Math.min(...lineHighlights.keys());
      requestAnimationFrame(() => {
        scrollToLine(firstLine);
      });
    }
  }, [loading, lineHighlights, code]);

  // Scroll to a specific line number
  const scrollToLine = useCallback((lineNum: number) => {
    const el = lineRefs.current.get(lineNum);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Handle clicking a dependency in the tree — select it and jump to first line
  const handleDepClick = useCallback((key: string, lines: number[]) => {
    setSelectedDepKey(key);
    setSelectedDepLineIdx(0);
    if (lines.length > 0) {
      scrollToLine(lines[0]);
    }
  }, [scrollToLine]);

  // Handle clicking a specific line number in the tree
  const handleLineClick = useCallback((key: string, lines: number[], lineNum: number) => {
    setSelectedDepKey(key);
    const idx = lines.indexOf(lineNum);
    setSelectedDepLineIdx(idx >= 0 ? idx : 0);
    scrollToLine(lineNum);
  }, [scrollToLine]);

  // Copy handler: copies selected text or all visible code
  const handleCopy = useCallback(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const textToCopy = selectedText.length > 0 ? selectedText : code;
    navigator.clipboard.writeText(textToCopy).catch(() => {});
    setCopyMenu(null);
  }, [code]);

  const handleCodeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCopyMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Keyboard handler: Escape, Ctrl+C, Arrow up/down for cycling dep lines
  // (must be after connectionSummary, scrollToLine, handleCopy declarations)
  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setCodeViewerNode(null);
        setCodeViewerConnections(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCopy();
        return;
      }
      // Arrow up/down to cycle through lines of the selected dependency
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!selectedDepKey || connectionSummary.length === 0) return;
        const entry = connectionSummary.find(s => `${s.conn.edgeKind}:${s.conn.name}` === selectedDepKey);
        if (!entry || entry.lines.length <= 1) return;
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const newIdx = Math.max(0, Math.min(entry.lines.length - 1, selectedDepLineIdx + dir));
        setSelectedDepLineIdx(newIdx);
        scrollToLine(entry.lines[newIdx]);
        return;
      }
      // Block all other keys from reaching canvas while viewer is open
      e.stopImmediatePropagation();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [node, setCodeViewerNode, setCodeViewerConnections, code, selectedDepKey, selectedDepLineIdx, connectionSummary, scrollToLine, handleCopy]);

  // Store a ref for a line div
  const setLineRef = useCallback((lineNum: number, el: HTMLDivElement | null) => {
    if (el) {
      lineRefs.current.set(lineNum, el);
    } else {
      lineRefs.current.delete(lineNum);
    }
  }, []);

  if (!node) return null;

  const ext = node.filePath.split('.').pop() || '';
  const langLabel = node.language || ext;
  const hasHighlights = lineHighlights.size > 0;
  const codeLines = code.split('\n');

  const handleClose = () => {
    setCodeViewerNode(null);
    setCodeViewerConnections(null);
  };

  return (
    <div className="code-viewer-overlay" onClick={handleClose}>
      <div className="code-viewer-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="code-viewer-header">
          <div className="code-viewer-title">
            <span className="code-viewer-icon">📝</span>
            <span className="code-viewer-name">{node.name}</span>
            <span className="code-viewer-lang">{langLabel}</span>
          </div>
          <div className="code-viewer-meta">
            <span className="code-viewer-path" title={node.filePath}>{node.filePath}</span>
            {node.lineNumber && (
              <span className="code-viewer-lines">
                Lines {node.lineNumber}{node.endLine ? `–${node.endLine}` : ''}
              </span>
            )}
          </div>
          <button className="code-viewer-close" onClick={handleClose} title="Close (Esc)">✕</button>
        </div>

        {/* Connection tree */}
        {hasHighlights && connectionSummary.length > 0 && (
          <div className="code-viewer-connection-tree">
            <div className="connection-tree-header">
              <span className="connection-tree-title">🔗 Dependencies found in code</span>
              <button
                className="connection-tree-toggle"
                onClick={() => setTreeCollapsed(c => !c)}
                title={treeCollapsed ? 'Expand' : 'Collapse'}
              >
                {treeCollapsed ? '▸' : '▾'}
              </button>
            </div>
            {!treeCollapsed && (
              <>
                <div
                  className="connection-tree-list"
                  style={{ maxHeight: treeHeight }}
                >
                  {connectionSummary.map(({ conn, lines }, idx) => {
                    const depKey = `${conn.edgeKind}:${conn.name}`;
                    const isSelected = selectedDepKey === depKey;
                    return (
                      <div
                        key={idx}
                        className={`connection-tree-item${isSelected ? ' connection-tree-item-selected' : ''}`}
                        onClick={() => handleDepClick(depKey, lines)}
                        title={lines.length > 1 ? 'Click to select · Use ↑↓ to cycle lines' : `Jump to line ${lines[0]}`}
                      >
                        <span
                          className="connection-tree-dot"
                          style={{ background: EDGE_COLORS[conn.edgeKind] || '#666' }}
                        />
                        <span className="connection-tree-kind">{conn.edgeKind}</span>
                        <span className="connection-tree-name">{conn.name}</span>
                        {lines.length > 1 && (
                          <span className="connection-tree-count">{lines.length} refs</span>
                        )}
                        <span className="connection-tree-lines">
                          {lines.length === 1 ? (
                            `line ${lines[0]}`
                          ) : (
                            lines.map((ln, li) => (
                              <span key={li}>
                                {li > 0 && ', '}
                                <span
                                  className={`connection-tree-line-link${isSelected && selectedDepLineIdx === li ? ' connection-tree-line-active' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); handleLineClick(depKey, lines, ln); }}
                                  title={`Jump to line ${ln}`}
                                >
                                  {ln}
                                </span>
                              </span>
                            ))
                          )}
                        </span>
                        {isSelected && lines.length > 1 && (
                          <span className="connection-tree-nav-hint">↑↓</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Resize handle */}
                <div
                  className="connection-tree-resize-handle"
                  onMouseDown={onTreeResizeStart}
                />
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="code-viewer-body" ref={codeBodyRef} onContextMenu={handleCodeContextMenu}>
          {loading && (
            <div className="code-viewer-loading">
              <div className="loading-spinner" />
              Loading source code…
            </div>
          )}
          {error && (
            <div className="code-viewer-error">
              ⚠ {error}
            </div>
          )}
          {!loading && !error && (
            <div className="code-viewer-content">
              {codeLines.map((line, i) => {
                const lineNum = startLine + i;
                const highlight = lineHighlights.get(lineNum);
                const color = highlight
                  ? (EDGE_COLORS[highlight.connections[0].edgeKind] || '#6366f1')
                  : undefined;

                return (
                  <div
                    key={i}
                    ref={(el) => setLineRef(lineNum, el)}
                    className={`code-viewer-line${highlight ? ' code-viewer-line-highlighted' : ''}`}
                    style={highlight ? {
                      borderLeftColor: color,
                      '--hl-color': `${color}18`,
                    } as React.CSSProperties : undefined}
                    title={highlight ? highlight.connections.map(c => c.label || `${c.edgeKind}: ${c.name}`).join(', ') : undefined}
                  >
                    <span className={`code-viewer-line-number${highlight ? ' code-viewer-gutter-hl' : ''}`}>
                      {lineNum}
                    </span>
                    <span className="code-viewer-line-text">
                      {line}
                      {highlight && highlight.connections.length > 1 && (
                        <span className="code-viewer-line-ref-count">
                          {highlight.connections.length}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Copy context menu */}
        {copyMenu && (
          <div
            ref={copyMenuRef}
            className="code-viewer-copy-menu"
            style={{ top: copyMenu.y, left: copyMenu.x }}
          >
            <button className="code-viewer-copy-menu-item" onClick={handleCopy}>
              📋 Copy {window.getSelection()?.toString() ? 'Selection' : 'All Code'}
              <span className="code-viewer-copy-shortcut">Ctrl+C</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
