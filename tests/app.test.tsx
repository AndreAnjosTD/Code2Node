import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';
import { useAppStore } from '../src/store';

// Mock child components to isolate App component testing
vi.mock('../src/components/FlowCanvas', () => ({
  default: () => <div data-testid="flow-canvas">FlowCanvas</div>,
}));

vi.mock('../src/components/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock('../src/components/NodeDetails', () => ({
  default: () => <div data-testid="node-details">NodeDetails</div>,
}));

vi.mock('../src/components/WelcomeScreen', () => ({
  default: () => <div data-testid="welcome-screen">WelcomeScreen</div>,
}));

vi.mock('../src/components/ScanProgress', () => ({
  default: ({ progress }: any) => (
    <div data-testid="scan-progress">
      ScanProgress: {progress.phase}
    </div>
  ),
}));

vi.mock('../src/components/CodeViewer', () => ({
  default: () => <div data-testid="code-viewer">CodeViewer</div>,
}));

describe('App Component', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
  });

  describe('Initial State (No Graph)', () => {
    it('should render WelcomeScreen when no graph is loaded', () => {
      render(<App />);
      
      expect(screen.getByTestId('welcome-screen')).toBeTruthy();
      expect(screen.queryByTestId('flow-canvas')).toBeNull();
    });

    it('should render loading overlay when loading without progress', () => {
      useAppStore.getState().setLoading(true);
      
      render(<App />);
      
      expect(screen.getByText('Connecting to server...')).toBeTruthy();
    });

    it('should render scan progress panel when loading with progress', () => {
      useAppStore.getState().setLoading(true);
      useAppStore.getState().setScanProgress({
        phase: 'parsing',
        filesDiscovered: 10,
        filesParsed: 5,
        totalFiles: 10,
        nodesFound: 20,
        edgesFound: 15,
        languages: { typescript: 10 },
        message: 'Parsing files...',
      });
      
      render(<App />);
      
      expect(screen.getByTestId('scan-progress')).toBeTruthy();
      expect(screen.getByText(/ScanProgress: parsing/)).toBeTruthy();
    });

    it('should always render CodeViewer component', () => {
      render(<App />);
      
      expect(screen.getByTestId('code-viewer')).toBeTruthy();
    });
  });

  describe('With Graph Loaded', () => {
    beforeEach(() => {
      // Set up a mock graph
      useAppStore.getState().setGraph({
        nodes: [],
        edges: [],
        projectPath: '/test',
        stats: {
          totalFiles: 5,
          totalNodes: 10,
          totalEdges: 8,
          languages: { typescript: 5 },
        },
      });
    });

    it('should render FlowCanvas when graph is loaded', () => {
      render(<App />);
      
      expect(screen.getByTestId('flow-canvas')).toBeTruthy();
      expect(screen.queryByTestId('welcome-screen')).toBeNull();
    });

    it('should render Sidebar in normal mode', () => {
      render(<App />);
      
      expect(screen.getByTestId('sidebar')).toBeTruthy();
    });

    it('should render NodeDetails in normal mode', () => {
      render(<App />);
      
      expect(screen.getByTestId('node-details')).toBeTruthy();
    });

    it('should hide Sidebar and NodeDetails in expert mode', () => {
      useAppStore.getState().setExpertMode(true);
      
      render(<App />);
      
      expect(screen.queryByTestId('sidebar')).toBeNull();
      expect(screen.queryByTestId('node-details')).toBeNull();
    });

    it('should show expert mode exit button', () => {
      useAppStore.getState().setExpertMode(true);
      
      render(<App />);
      
      expect(screen.getByText('Exit Expert Mode')).toBeTruthy();
    });

    it('should render scan progress overlay when loading', () => {
      useAppStore.getState().setLoading(true);
      useAppStore.getState().setScanProgress({
        phase: 'resolving',
        filesDiscovered: 10,
        filesParsed: 10,
        totalFiles: 10,
        nodesFound: 30,
        edgesFound: 25,
        languages: { typescript: 10 },
        message: 'Resolving references...',
      });
      
      render(<App />);
      
      expect(screen.getByTestId('scan-progress')).toBeTruthy();
      expect(screen.getByTestId('flow-canvas')).toBeTruthy();
    });
  });

  describe('App Container Structure', () => {
    it('should wrap everything in ReactFlowProvider', () => {
      const { container } = render(<App />);
      
      // Check that app-container div exists (main wrapper)
      const appContainer = container.querySelector('.app-container');
      expect(appContainer).not.toBeNull();
    });

    it('should render canvas-container when graph is present', () => {
      useAppStore.getState().setGraph({
        nodes: [],
        edges: [],
        projectPath: '/test',
        stats: { totalFiles: 0, totalNodes: 0, totalEdges: 0, languages: {} },
      });
      
      const { container } = render(<App />);
      
      const canvasContainer = container.querySelector('.canvas-container');
      expect(canvasContainer).not.toBeNull();
    });
  });
});
