import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CodeNodeComponent from './nodes/CodeNode';
import { useAppStore, RENDER_TELEMETRY_INITIAL } from '../store';
import { buildFlowGraph, NODE_COLORS, EDGE_COLORS, resolveEffectiveViewMode } from '../layout';
import { openFileInIDE } from '../api';

const nodeTypes: NodeTypes = {
  codeNode: CodeNodeComponent,
};

const PAN_STEP = 80;
const ALL_KINDS = new Set(['file', 'class', 'function', 'interface', 'enum']);

export default function FlowCanvas() {
  const graph = useAppStore(s => s.graph);
  const filterKinds = useAppStore(s => s.filterKinds);
  const searchQuery = useAppStore(s => s.searchQuery);
  const selectedNode = useAppStore(s => s.selectedNode);
  const setSelectedNode = useAppStore(s => s.setSelectedNode);
  const focusedNodeId = useAppStore(s => s.focusedNodeId);
  const setFocusedNodeId = useAppStore(s => s.setFocusedNodeId);
  const highlightedCycle = useAppStore(s => s.highlightedCycle);
  const setHighlightedCycle = useAppStore(s => s.setHighlightedCycle);
  const expertMode = useAppStore(s => s.expertMode);
  const setExpertMode = useAppStore(s => s.setExpertMode);
  const codeViewerNode = useAppStore(s => s.codeViewerNode);
  const setCodeViewerNode = useAppStore(s => s.setCodeViewerNode);
  const setCodeViewerConnections = useAppStore(s => s.setCodeViewerConnections);
  const setActiveSidebarPanel = useAppStore(s => s.setActiveSidebarPanel);
  const ideCommand = useAppStore(s => s.ideCommand);
  const projectPath = useAppStore(s => s.projectPath);
  const toggleFilterKind = useAppStore(s => s.toggleFilterKind);
  const setFilterKinds = useAppStore(s => s.setFilterKinds);
  const graphViewMode = useAppStore(s => s.graphViewMode);
  const progressiveLoadingEnabled = useAppStore(s => s.progressiveLoadingEnabled);
  const progressiveInitialNodes = useAppStore(s => s.progressiveInitialNodes);
  const renderNodeLimit = useAppStore(s => s.renderNodeLimit);
  const autoClusterEnabled = useAppStore(s => s.autoClusterEnabled);
  const autoClusterThreshold = useAppStore(s => s.autoClusterThreshold);
  const setRenderTelemetry = useAppStore(s => s.setRenderTelemetry);

  const { setCenter, getNodes, fitView, zoomIn, zoomOut, setViewport, getViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Save viewport before entering connections mode so we can restore on exit
  const preFocusViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const preFocusNodeIdRef = useRef<string | null>(null);

  const activeFilterRef = useRef<string | null>(null);

  // Rebuild layout when graph or filters change
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      setRenderTelemetry({ ...RENDER_TELEMETRY_INITIAL, updatedAt: Date.now() });
      return;
    }

    const effectiveViewMode = resolveEffectiveViewMode(
      graphViewMode,
      autoClusterEnabled,
      autoClusterThreshold,
      graph.nodes.length,
    );

    const progressiveActive =
      progressiveLoadingEnabled
      && effectiveViewMode === 'detailed'
      && !focusedNodeId
      && !highlightedCycle;

    const nodeLimit = progressiveActive
      ? (renderNodeLimit ?? Math.min(progressiveInitialNodes, graph.nodes.length))
      : undefined;

    const startedAt = performance.now();
    const { nodes: flowNodes, edges: flowEdges, meta } = buildFlowGraph(
      graph,
      filterKinds,
      searchQuery,
      focusedNodeId,
      highlightedCycle,
      effectiveViewMode,
      { nodeLimit },
    );
    const layoutMs = performance.now() - startedAt;

    setNodes(flowNodes);
    setEdges(flowEdges);
    setRenderTelemetry({
      layoutMs: Number(layoutMs.toFixed(2)),
      sourceNodes: graph.nodes.length,
      sourceEdges: graph.edges.length,
      visibleNodes: meta.visibleNodes,
      visibleEdges: meta.visibleEdges,
      hiddenNodes: meta.hiddenNodes,
      hiddenEdges: meta.hiddenEdges,
      effectiveViewMode,
      progressiveActive,
      updatedAt: Date.now(),
    });
  }, [
    graph,
    filterKinds,
    searchQuery,
    focusedNodeId,
    highlightedCycle,
    graphViewMode,
    progressiveLoadingEnabled,
    progressiveInitialNodes,
    renderNodeLimit,
    autoClusterEnabled,
    autoClusterThreshold,
    setNodes,
    setEdges,
    setRenderTelemetry,
  ]);

  // Auto-fit view when entering focus/connections mode, restore viewport on exit
  const prevFocusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusedNodeId && focusedNodeId !== prevFocusedRef.current) {
      // Save current viewport before entering connections mode
      preFocusViewportRef.current = getViewport();
      preFocusNodeIdRef.current = focusedNodeId;
      // Wait a frame for nodes to render then fit
      requestAnimationFrame(() => {
        fitView({ padding: 0.3, duration: 500, maxZoom: 1.5 });
      });
    } else if (!focusedNodeId && prevFocusedRef.current) {
      // Exiting connections mode — wait for layout rebuild then center on the original node
      const nodeId = preFocusNodeIdRef.current;
      const savedViewport = preFocusViewportRef.current;
      requestAnimationFrame(() => {
        const flowNode = getNodes().find(n => n.id === nodeId);
        if (flowNode) {
          const w = flowNode.measured?.width ?? flowNode.width ?? 200;
          const h = flowNode.measured?.height ?? flowNode.height ?? 100;
          setCenter(flowNode.position.x + w / 2, flowNode.position.y + h / 2, { duration: 400, zoom: savedViewport?.zoom ?? 1 });
        } else if (savedViewport) {
          setViewport(savedViewport, { duration: 400 });
        }
      });
      preFocusViewportRef.current = null;
      preFocusNodeIdRef.current = null;
    }
    prevFocusedRef.current = focusedNodeId;
  }, [focusedNodeId, nodes, fitView, getViewport, setViewport, setCenter, getNodes]);

  // Auto-fit view when highlighting a cycle
  const prevCycleRef = useRef<{ nodeIds: string[]; edgeIds: string[] } | null>(null);
  useEffect(() => {
    if (highlightedCycle && highlightedCycle !== prevCycleRef.current) {
      // Wait a frame for nodes to render then fit
      requestAnimationFrame(() => {
        fitView({ padding: 0.3, duration: 500, maxZoom: 1.5 });
      });
    }
    prevCycleRef.current = highlightedCycle;
  }, [highlightedCycle, fitView]);

  // When a node is selected from the sidebar, pan to it and mark it selected on the canvas
  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedNode || selectedNode.id === prevSelectedIdRef.current) return;
    prevSelectedIdRef.current = selectedNode.id;

    const flowNode = getNodes().find(n => n.id === selectedNode.id);
    if (!flowNode) return;

    setNodes(nds =>
      nds.map(n => ({ ...n, selected: n.id === selectedNode.id }))
    );

    const nodeWidth = (flowNode.measured?.width ?? flowNode.width ?? 200);
    const nodeHeight = (flowNode.measured?.height ?? flowNode.height ?? 100);
    setCenter(
      flowNode.position.x + nodeWidth / 2,
      flowNode.position.y + nodeHeight / 2,
      { duration: 400, zoom: 1.2 }
    );
  }, [selectedNode, getNodes, setCenter, setNodes]);

  useEffect(() => {
    if (!selectedNode) prevSelectedIdRef.current = null;
  }, [selectedNode]);

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Don't handle shortcuts while the Code Viewer modal is open
      if (codeViewerNode) return;

      const key = e.key.toLowerCase();

      switch (key) {
        case 'f': {
          // Focus selected node, or fit all
          e.preventDefault();
          if (selectedNode) {
            const flowNode = getNodes().find(n => n.id === selectedNode.id);
            if (flowNode) {
              const w = flowNode.measured?.width ?? flowNode.width ?? 200;
              const h = flowNode.measured?.height ?? flowNode.height ?? 100;
              setCenter(flowNode.position.x + w / 2, flowNode.position.y + h / 2, { duration: 400, zoom: 1.2 });
            }
          } else {
            fitView({ padding: 0.2, duration: 400, maxZoom: 1.5 });
          }
          break;
        }
        case 'escape': {
          // Exit connections/focus mode or cycle highlight mode
          if (focusedNodeId) {
            e.preventDefault();
            setFocusedNodeId(null);
          } else if (highlightedCycle) {
            e.preventDefault();
            setHighlightedCycle(null);
          }
          break;
        }
        case 'v': {
          // View code
          e.preventDefault();
          if (selectedNode) {
            setCodeViewerNode(selectedNode);
            // In connections mode, highlight dependency usages on the dependent's code
            if (focusedNodeId && graph) {
              const outgoingEdges = graph.edges.filter(
                (edge: any) => edge.source === selectedNode.id && edge.kind !== 'contains'
              );
              if (outgoingEdges.length > 0) {
                const connections = outgoingEdges.map((edge: any) => {
                  const targetNode = graph.nodes.find((n: any) => n.id === edge.target);
                  const name = targetNode
                    ? (targetNode.name.includes('.') ? targetNode.name.split('.').pop()! : targetNode.name)
                    : '';
                  return { name, edgeKind: edge.kind, label: edge.label };
                }).filter((c: any) => c.name.length > 0);
                setCodeViewerConnections(connections.length > 0 ? connections : null);
              } else {
                setCodeViewerConnections(null);
              }
            } else {
              setCodeViewerConnections(null);
            }
          }
          break;
        }
        case 'o': {
          // Open in IDE
          e.preventDefault();
          if (selectedNode) {
            const fullPath = projectPath
              ? `${projectPath}/${selectedNode.filePath}`
              : selectedNode.filePath;
            openFileInIDE(fullPath, selectedNode.lineNumber, ideCommand).catch(err => {
              console.error('Failed to open in IDE:', err);
            });
          }
          break;
        }
        case 's': {
          // Open search
          e.preventDefault();
          if (expertMode) setExpertMode(false);
          setActiveSidebarPanel('outliner');
          // Focus the search input after panel opens
          requestAnimationFrame(() => {
            const el = document.querySelector('.outliner-search-input') as HTMLInputElement;
            el?.focus();
          });
          break;
        }
        case '+':
        case '=': {
          e.preventDefault();
          zoomIn({ duration: 200 });
          break;
        }
        case '-': {
          e.preventDefault();
          zoomOut({ duration: 200 });
          break;
        }
        case 'arrowup': {
          e.preventDefault();
          const vp1 = getViewport();
          setViewport({ x: vp1.x, y: vp1.y + PAN_STEP, zoom: vp1.zoom }, { duration: 150 });
          break;
        }
        case 'arrowdown': {
          e.preventDefault();
          const vp2 = getViewport();
          setViewport({ x: vp2.x, y: vp2.y - PAN_STEP, zoom: vp2.zoom }, { duration: 150 });
          break;
        }
        case 'arrowleft': {
          e.preventDefault();
          const vp3 = getViewport();
          setViewport({ x: vp3.x + PAN_STEP, y: vp3.y, zoom: vp3.zoom }, { duration: 150 });
          break;
        }
        case 'arrowright': {
          e.preventDefault();
          const vp4 = getViewport();
          setViewport({ x: vp4.x - PAN_STEP, y: vp4.y, zoom: vp4.zoom }, { duration: 150 });
          break;
        }
        case 'e': {
          e.preventDefault();
          setExpertMode(!expertMode);
          break;
        }
        case '1': {
          e.preventDefault();
          if (activeFilterRef.current === 'class') {
            setFilterKinds(new Set(ALL_KINDS));
            activeFilterRef.current = null;
          } else {
            setFilterKinds(new Set(['class']));
            activeFilterRef.current = 'class';
          }
          break;
        }
        case '2': {
          e.preventDefault();
          if (activeFilterRef.current === 'function') {
            setFilterKinds(new Set(ALL_KINDS));
            activeFilterRef.current = null;
          } else {
            setFilterKinds(new Set(['function']));
            activeFilterRef.current = 'function';
          }
          break;
        }
        case '3': {
          e.preventDefault();
          if (activeFilterRef.current === 'file') {
            setFilterKinds(new Set(ALL_KINDS));
            activeFilterRef.current = null;
          } else {
            setFilterKinds(new Set(['file']));
            activeFilterRef.current = 'file';
          }
          break;
        }
        case '4': {
          e.preventDefault();
          if (activeFilterRef.current === 'interface') {
            setFilterKinds(new Set(ALL_KINDS));
            activeFilterRef.current = null;
          } else {
            setFilterKinds(new Set(['interface']));
            activeFilterRef.current = 'interface';
          }
          break;
        }
        case '5': {
          e.preventDefault();
          if (activeFilterRef.current === 'enum') {
            setFilterKinds(new Set(ALL_KINDS));
            activeFilterRef.current = null;
          } else {
            setFilterKinds(new Set(['enum']));
            activeFilterRef.current = 'enum';
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, focusedNodeId, expertMode, ideCommand, projectPath,
      getNodes, setCenter, fitView, zoomIn, zoomOut, getViewport, setViewport,
      setFocusedNodeId, codeViewerNode, setCodeViewerNode, setCodeViewerConnections, setExpertMode, setActiveSidebarPanel,
      setFilterKinds, toggleFilterKind]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const focusedNodeName = useMemo(() => {
    if (!focusedNodeId || !graph) return '';
    const node = graph.nodes.find(n => n.id === focusedNodeId);
    return node?.name || '';
  }, [focusedNodeId, graph]);

  const minimapNodeColor = useCallback((node: Node) => {
    const kind = (node.data as any)?.kind;
    return NODE_COLORS[kind as keyof typeof NODE_COLORS]?.border || '#475569';
  }, []);

  if (!graph) return null;

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
        minZoom={0.05}
        maxZoom={3}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#0a0e1a' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1e293b"
        />
        <Controls
          position="bottom-right"
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
          }}
        />
        <MiniMap
          position="bottom-left"
          nodeColor={minimapNodeColor}
          nodeStrokeColor={minimapNodeColor}
          nodeStrokeWidth={2}
          nodeBorderRadius={4}
          maskColor="rgba(10, 14, 26, 0.85)"
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            width: 180,
            height: 130,
          }}
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Connection mode banner */}
      {focusedNodeId && (
        <div className="connection-mode-banner">
          <span className="connection-mode-icon">🔗</span>
          <span>Showing connections for <strong>{focusedNodeName}</strong></span>
          <button
            className="connection-mode-close"
            onClick={() => setFocusedNodeId(null)}
            title="Exit connection view"
          >
            ✕ Show All
          </button>
        </div>
      )}

      {/* Edge legend */}
      {focusedNodeId && edges.length > 0 && (
        <div className="edge-legend">
          {Array.from(new Set(edges.map(e => {
            const data = graph?.edges.find(ge => ge.id === e.id);
            return data?.kind || 'unknown';
          }))).filter(k => k !== 'unknown').map(kind => (
            <div key={kind} className="edge-legend-item">
              <span className="edge-legend-line" style={{ background: EDGE_COLORS[kind] || '#666' }} />
              <span>{kind}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
