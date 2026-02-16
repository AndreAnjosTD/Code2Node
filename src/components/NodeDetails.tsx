import React, { useMemo } from 'react';
import { useAppStore } from '../store';
import { NODE_COLORS } from '../layout';

export default function NodeDetails() {
  const selectedNode = useAppStore(s => s.selectedNode);
  const detailsOpen = useAppStore(s => s.detailsOpen);
  const setDetailsOpen = useAppStore(s => s.setDetailsOpen);
  const setSelectedNode = useAppStore(s => s.setSelectedNode);
  const graph = useAppStore(s => s.graph);
  const setFocusedNodeId = useAppStore(s => s.setFocusedNodeId);

  // Compute references for this node (must be before early return to satisfy hooks rules)
  const references = useMemo(() => {
    if (!graph || !selectedNode) return { referencedBy: [], referencesTo: [] };
    const referencedBy = graph.edges
      .filter(e => e.target === selectedNode.id && (e.kind === 'references' || e.kind === 'calls'))
      .map(e => {
        const sourceNode = graph.nodes.find(n => n.id === e.source);
        return sourceNode ? { edge: e, node: sourceNode } : null;
      })
      .filter(Boolean) as Array<{ edge: typeof graph.edges[0]; node: typeof graph.nodes[0] }>;

    const referencesTo = graph.edges
      .filter(e => e.source === selectedNode.id && (e.kind === 'references' || e.kind === 'calls'))
      .map(e => {
        const targetNode = graph.nodes.find(n => n.id === e.target);
        return targetNode ? { edge: e, node: targetNode } : null;
      })
      .filter(Boolean) as Array<{ edge: typeof graph.edges[0]; node: typeof graph.nodes[0] }>;

    return { referencedBy, referencesTo };
  }, [graph, selectedNode]);

  if (!detailsOpen || !selectedNode) return null;

  const colors = NODE_COLORS[selectedNode.kind];

  const handleClose = () => {
    setDetailsOpen(false);
    setSelectedNode(null);
  };

  return (
    <div className="details-panel" style={{ borderColor: colors.border }}>
      <div className="details-header">
        <div>
          <div className="details-kind" style={{ color: colors.border }}>
            {selectedNode.kind.toUpperCase()}
          </div>
          <div className="details-name" style={{ color: colors.text }}>
            {selectedNode.name}
          </div>
        </div>
        <button className="icon-btn" onClick={handleClose}>✕</button>
      </div>

      <div className="details-body">
        {/* File path */}
        <div className="details-row">
          <span className="details-label">File</span>
          <span className="details-value">{selectedNode.filePath}</span>
        </div>

        {/* Line number */}
        <div className="details-row">
          <span className="details-label">Line</span>
          <span className="details-value">
            {selectedNode.lineNumber}
            {selectedNode.endLine ? ` — ${selectedNode.endLine}` : ''}
          </span>
        </div>

        {/* Language */}
        <div className="details-row">
          <span className="details-label">Language</span>
          <span className="details-value">{selectedNode.language}</span>
        </div>

        {/* Modifiers */}
        {selectedNode.modifiers && selectedNode.modifiers.length > 0 && (
          <div className="details-row">
            <span className="details-label">Modifiers</span>
            <div className="details-tags">
              {selectedNode.modifiers.map((mod, i) => (
                <span key={i} className="detail-tag" style={{ borderColor: colors.border }}>
                  {mod}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Parameters */}
        {selectedNode.parameters && selectedNode.parameters.length > 0 && (
          <div className="details-row">
            <span className="details-label">Parameters</span>
            <div className="details-code-list">
              {selectedNode.parameters.map((param, i) => {
                // Parse "name: type = default" patterns
                const parts = param.match(/^(\w+)\s*(?::\s*(.+?))?(?:\s*=\s*(.+))?$/);
                if (parts) {
                  const [, name, type, def] = parts;
                  return (
                    <code key={i} className="param-item">
                      <span className="param-name">{name}</span>
                      {type && <span className="param-type">: {type.trim()}</span>}
                      {def && <span className="param-default"> = {def.trim()}</span>}
                    </code>
                  );
                }
                return <code key={i}>{param}</code>;
              })}
            </div>
          </div>
        )}

        {/* Return type */}
        {selectedNode.returnType && (
          <div className="details-row">
            <span className="details-label">Returns</span>
            <code className="details-value">{selectedNode.returnType}</code>
          </div>
        )}

        {/* Properties */}
        {selectedNode.properties && selectedNode.properties.length > 0 && (
          <div className="details-row">
            <span className="details-label">Properties</span>
            <div className="details-code-list">
              {selectedNode.properties.map((prop, i) => (
                <code key={i}>{prop}</code>
              ))}
            </div>
          </div>
        )}

        {/* Documentation */}
        {selectedNode.documentation && (
          <div className="details-row">
            <span className="details-label">Documentation</span>
            <p className="details-doc">{selectedNode.documentation}</p>
          </div>
        )}

        {/* References */}
        {(references.referencedBy.length > 0 || references.referencesTo.length > 0) && (
          <>
            <div className="details-separator" />

            {references.referencedBy.length > 0 && (
              <div className="details-row">
                <span className="details-label">Referenced by ({references.referencedBy.length})</span>
                <div className="details-ref-list">
                  {references.referencedBy.slice(0, 10).map(({ node }, i) => (
                    <div key={i} className="details-ref-item" onClick={() => setSelectedNode(node)}>
                      <span className="details-ref-kind">{node.kind}</span>
                      <span className="details-ref-name">{node.name}</span>
                      <span className="details-ref-file">{node.filePath.split('/').pop()}</span>
                    </div>
                  ))}
                  {references.referencedBy.length > 10 && (
                    <div className="details-ref-more">+{references.referencedBy.length - 10} more</div>
                  )}
                </div>
              </div>
            )}

            {references.referencesTo.length > 0 && (
              <div className="details-row">
                <span className="details-label">References ({references.referencesTo.length})</span>
                <div className="details-ref-list">
                  {references.referencesTo.slice(0, 10).map(({ node }, i) => (
                    <div key={i} className="details-ref-item" onClick={() => setSelectedNode(node)}>
                      <span className="details-ref-kind">{node.kind}</span>
                      <span className="details-ref-name">{node.name}</span>
                      <span className="details-ref-file">{node.filePath.split('/').pop()}</span>
                    </div>
                  ))}
                  {references.referencesTo.length > 10 && (
                    <div className="details-ref-more">+{references.referencesTo.length - 10} more</div>
                  )}
                </div>
              </div>
            )}

            <button
              className="details-show-connections-btn"
              onClick={() => setFocusedNodeId(selectedNode.id)}
            >
              🔗 Show Connections on Graph
            </button>
          </>
        )}
      </div>
    </div>
  );
}
