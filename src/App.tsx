import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from './components/FlowCanvas';
import Sidebar from './components/Sidebar';
import NodeDetails from './components/NodeDetails';
import WelcomeScreen from './components/WelcomeScreen';
import ScanProgressPanel from './components/ScanProgress';
import CodeViewer from './components/CodeViewer';
import { useAppStore } from './store';
import './styles.css';

export default function App() {
  const graph = useAppStore(s => s.graph);
  const loading = useAppStore(s => s.loading);
  const scanProgress = useAppStore(s => s.scanProgress);
  const expertMode = useAppStore(s => s.expertMode);
  const setExpertMode = useAppStore(s => s.setExpertMode);

  return (
    <ReactFlowProvider>
      <div className="app-container">
        {graph ? (
          <>
            {!expertMode && <Sidebar />}
            <div className="canvas-container">
              {loading && scanProgress && (
                <ScanProgressPanel progress={scanProgress} />
              )}
              {loading && !scanProgress && (
                <div className="loading-overlay">
                  <div className="loading-spinner" />
                  <span>Scanning project...</span>
                </div>
              )}
              <FlowCanvas />
              {expertMode && (
                <button
                  className="expert-exit-btn"
                  onClick={() => setExpertMode(false)}
                  title="Exit Expert Mode (E)"
                >
                  Exit Expert Mode
                </button>
              )}
            </div>
            {!expertMode && <NodeDetails />}
          </>
        ) : (
          <>
            {loading && scanProgress && (
              <ScanProgressPanel progress={scanProgress} />
            )}
            {loading && !scanProgress && (
              <div className="loading-overlay">
                <div className="loading-spinner" />
                <span>Connecting to server...</span>
              </div>
            )}
            <WelcomeScreen />
          </>
        )}
        <CodeViewer />
      </div>
    </ReactFlowProvider>
  );
}
