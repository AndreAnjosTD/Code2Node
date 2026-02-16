import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CodeNode as CodeNodeType, NodeKind } from '../../../shared/types';
import { useAppStore } from '../../store';
import { openFileInIDE } from '../../api';

interface CodeNodeData {
  // CodeNode fields
  id: string;
  name: string;
  kind: NodeKind;
  filePath: string;
  language: string;
  lineNumber: number;
  endLine?: number;
  properties?: string[];
  parameters?: string[];
  returnType?: string;
  modifiers?: string[];
  documentation?: string;
  // Visual fields
  colors: { bg: string; border: string; text: string; icon: string };
  width: number;
  height: number;
  // Reference info
  referenceCount: number;
  isFocused?: boolean;
}

const KIND_ICONS: Record<NodeKind, string> = {
  file: '📄',
  class: '◆',
  function: '⚡',
  interface: '◇',
  enum: '≡',
  variable: '●',
  module: '📦',
};

function CodeNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CodeNodeData;
  const setSelectedNode = useAppStore((s: any) => s.setSelectedNode);
  const setCodeViewerNode = useAppStore((s: any) => s.setCodeViewerNode);
  const setCodeViewerConnections = useAppStore((s: any) => s.setCodeViewerConnections);
  const setFocusedNodeId = useAppStore((s: any) => s.setFocusedNodeId);
  const focusedNodeId = useAppStore((s: any) => s.focusedNodeId);
  const graph = useAppStore((s: any) => s.graph);
  const ideCommand = useAppStore((s: any) => s.ideCommand);
  const projectPath = useAppStore((s: any) => s.graph?.projectPath || '');
  const { colors } = nodeData;

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNode(nodeData);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  const handleViewCode = useCallback(() => {
    setCtxMenu(null);
    setCodeViewerNode(nodeData as unknown as CodeNodeType);

    // When in connections mode, highlight dependency usages on the dependent's code
    if (focusedNodeId && graph) {
      // Find outgoing edges from THIS node (this node is the dependent/source)
      const outgoingEdges = graph.edges.filter(
        (e: any) =>
          e.source === nodeData.id &&
          e.kind !== 'contains'
      );

      if (outgoingEdges.length > 0) {
        const connections = outgoingEdges.map((e: any) => {
          const targetNode = graph.nodes.find((n: any) => n.id === e.target);
          // Use the simple name (last part after '.' for methods)
          const name = targetNode
            ? (targetNode.name.includes('.') ? targetNode.name.split('.').pop()! : targetNode.name)
            : '';
          return { name, edgeKind: e.kind, label: e.label };
        }).filter((c: any) => c.name.length > 0);

        setCodeViewerConnections(connections.length > 0 ? connections : null);
      } else {
        setCodeViewerConnections(null);
      }
    } else {
      setCodeViewerConnections(null);
    }
  }, [nodeData, setCodeViewerNode, setCodeViewerConnections, focusedNodeId, graph]);

  const handleOpenInIDE = useCallback(() => {
    setCtxMenu(null);
    const fullPath = projectPath
      ? `${projectPath}/${nodeData.filePath}`
      : nodeData.filePath;
    openFileInIDE(fullPath, nodeData.lineNumber, ideCommand).catch(err => {
      console.error('Failed to open in IDE:', err);
    });
  }, [nodeData, projectPath, ideCommand]);

  const handleShowConnections = useCallback(() => {
    setCtxMenu(null);
    setFocusedNodeId(nodeData.id);
  }, [nodeData.id, setFocusedNodeId]);

  const kindLabel = nodeData.kind.charAt(0).toUpperCase() + nodeData.kind.slice(1);
  const displayName = nodeData.name.length > 24
    ? nodeData.name.slice(0, 22) + '…'
    : nodeData.name;

  const hasDetails = (nodeData.parameters?.length ?? 0) > 0 ||
    (nodeData.kind === 'class' && (nodeData.properties?.length ?? 0) > 0);

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className="code-node"
      style={{
        background: colors.bg,
        borderColor: selected ? '#fff' : colors.border,
        borderWidth: selected ? 2 : 1,
        borderStyle: 'solid',
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 180,
        maxWidth: 260,
        cursor: 'pointer',
        boxShadow: selected
          ? `0 0 20px ${colors.border}60, 0 4px 16px rgba(0,0,0,0.4)`
          : `0 2px 8px rgba(0,0,0,0.3)`,
        transition: 'all 0.2s ease',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 8, height: 8, border: '2px solid #0f172a' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{KIND_ICONS[nodeData.kind]}</span>
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.border,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {kindLabel}
        </span>
        {nodeData.modifiers?.includes('export') && (
          <span style={{
            fontSize: 8,
            background: `${colors.border}30`,
            color: colors.border,
            padding: '1px 4px',
            borderRadius: 4,
            fontWeight: 500,
          }}>
            export
          </span>
        )}
        {nodeData.modifiers?.includes('async') && (
          <span style={{
            fontSize: 8,
            background: '#14b8a630',
            color: '#14b8a6',
            padding: '1px 4px',
            borderRadius: 4,
            fontWeight: 500,
          }}>
            async
          </span>
        )}
        {/* Reference count badge */}
        {nodeData.referenceCount > 0 && (
          <span
            className="ref-count-badge"
            title={`Referenced ${nodeData.referenceCount} time${nodeData.referenceCount > 1 ? 's' : ''}`}
            style={{ marginLeft: 'auto' }}
          >
            {nodeData.referenceCount} ref{nodeData.referenceCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Name */}
      <div 
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: colors.text,
          fontFamily: "'JetBrains Mono', monospace",
          marginBottom: hasDetails ? 6 : 0,
          lineHeight: 1.3,
        }}
        title={nodeData.name.length > 24 ? nodeData.name : undefined}
      >
        {displayName}
      </div>

      {/* Parameters */}
      {nodeData.parameters && nodeData.parameters.length > 0 && (
        <div style={{
          borderTop: `1px solid ${colors.border}30`,
          paddingTop: 5,
          marginTop: 2,
        }}>
          <div style={{
            fontSize: 8,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: `${colors.text}60`,
            marginBottom: 2,
          }}>
            Params
          </div>
          {nodeData.parameters.slice(0, 5).map((param: string, idx: number) => (
            <div 
              key={idx} 
              style={{
                fontSize: 10,
                color: `${colors.text}99`,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={param.length > 35 ? param : undefined}
            >
              {param.length > 35 ? param.slice(0, 33) + '…' : param}
            </div>
          ))}
          {nodeData.parameters.length > 5 && (
            <div style={{ fontSize: 9, color: `${colors.text}60`, marginTop: 1 }}>
              +{nodeData.parameters.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* Properties (classes) */}
      {nodeData.properties && nodeData.properties.length > 0 && nodeData.kind === 'class' && (
        <div style={{
          borderTop: `1px solid ${colors.border}30`,
          paddingTop: 5,
          marginTop: 2,
        }}>
          <div style={{
            fontSize: 8,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: `${colors.text}60`,
            marginBottom: 2,
          }}>
            Properties
          </div>
          {nodeData.properties.slice(0, 4).map((prop: string, idx: number) => (
            <div 
              key={idx} 
              style={{
                fontSize: 10,
                color: `${colors.text}99`,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={prop.length > 35 ? prop : undefined}
            >
              {prop.length > 35 ? prop.slice(0, 33) + '…' : prop}
            </div>
          ))}
          {nodeData.properties.length > 4 && (
            <div style={{ fontSize: 9, color: `${colors.text}60`, marginTop: 1 }}>
              +{nodeData.properties.length - 4} more
            </div>
          )}
        </div>
      )}

      {/* Return type */}
      {nodeData.returnType && (
        <div style={{
          fontSize: 9,
          color: `${colors.text}70`,
          fontFamily: "'JetBrains Mono', monospace",
          marginTop: 3,
        }}>
          → {nodeData.returnType}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 8, height: 8, border: '2px solid #0f172a' }} />

      {/* Context menu */}
      {ctxMenu && ReactDOM.createPortal(
        <div
          ref={ctxRef}
          className="node-context-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button className="node-context-menu-item" onClick={handleViewCode}>
            <span className="node-context-menu-icon">📝</span>
            View Code
          </button>
          <button className="node-context-menu-item" onClick={handleOpenInIDE}>
            <span className="node-context-menu-icon">🚀</span>
            Open in IDE
          </button>
          <div className="node-context-menu-divider" />
          <button className="node-context-menu-item" onClick={handleShowConnections}>
            <span className="node-context-menu-icon">🔗</span>
            Show Connections
            {nodeData.referenceCount > 0 && (
              <span className="node-context-menu-badge">{nodeData.referenceCount}</span>
            )}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(CodeNodeComponent);
