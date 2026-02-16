import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanProject,
  browseDirectory,
  healthCheck,
  fetchFileContent,
  openFileInIDE,
  validateIDECommand,
  getInstalledIDEs,
} from '../src/api';
import type { ScanResponse, ProjectGraph } from '../shared/types';

// Mock fetch globally
global.fetch = vi.fn();

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scanProject', () => {
    it('should make POST request to /api/scan', async () => {
      const mockGraph: ProjectGraph = {
        nodes: [],
        edges: [],
        projectPath: '/test',
        stats: {
          totalFiles: 5,
          totalNodes: 10,
          totalEdges: 8,
          languages: { typescript: 5 },
        },
      };

      const mockResponse: ScanResponse = {
        success: true,
        graph: mockGraph,
      };

      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse,
      });

      const result = await scanProject('/test/path');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/scan',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: '/test/path' }),
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle error response', async () => {
      const mockResponse: ScanResponse = {
        success: false,
        error: 'Directory not found',
      };

      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse,
      });

      const result = await scanProject('/invalid/path');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Directory not found');
    });
  });

  describe('browseDirectory', () => {
    it('should fetch directory contents', async () => {
      const mockResult = {
        currentPath: '/test',
        parentPath: '/',
        items: [
          { name: 'file.ts', path: '/test/file.ts', isDirectory: false },
          { name: 'src', path: '/test/src', isDirectory: true },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResult,
      });

      const result = await browseDirectory('/test');

      expect(global.fetch).toHaveBeenCalledWith('/api/browse?path=%2Ftest');
      expect(result).toEqual(mockResult);
    });

    it('should handle root directory request', async () => {
      const mockResult = {
        currentPath: '/',
        parentPath: '',
        items: [],
      };

      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResult,
      });

      await browseDirectory();

      expect(global.fetch).toHaveBeenCalledWith('/api/browse');
    });
  });

  describe('healthCheck', () => {
    it('should return true when server is healthy', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const result = await healthCheck();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/health');
    });

    it('should return false when server is down', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('fetchFileContent', () => {
    it('should fetch file content with line range', async () => {
      const mockResult = {
        filePath: '/test/file.ts',
        startLine: 1,
        endLine: 10,
        totalLines: 100,
        content: 'file content here',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await fetchFileContent('/test/file.ts', 1, 10);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/file-content')
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw error on failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'File not found' }),
      });

      await expect(fetchFileContent('/invalid/file.ts')).rejects.toThrow('File not found');
    });

    it('should handle missing line parameters', async () => {
      const mockResult = {
        filePath: '/test/file.ts',
        startLine: 1,
        endLine: 100,
        totalLines: 100,
        content: 'full file content',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      await fetchFileContent('/test/file.ts');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('path=%2Ftest%2Ffile.ts')
      );
    });
  });

  describe('openFileInIDE', () => {
    it('should send POST request to open file', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse,
      });

      const result = await openFileInIDE('/test/file.ts', 42, 'code');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/open-in-ide',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: '/test/file.ts', line: 42, ide: 'code' }),
        })
      );

      expect(result.success).toBe(true);
    });

    it('should handle IDE open failure', async () => {
      const mockResponse = { success: false, error: 'IDE not found' };

      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse,
      });

      const result = await openFileInIDE('/test/file.ts', 1, 'invalid-ide');

      expect(result.success).toBe(false);
      expect(result.error).toBe('IDE not found');
    });
  });

  describe('validateIDECommand', () => {
    it('should validate IDE command', async () => {
      const mockResponse = { valid: true };

      (global.fetch as any).mockResolvedValueOnce({
        json: async () => mockResponse,
      });

      const result = await validateIDECommand('code');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/validate-ide',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cmd: 'code' }),
        })
      );

      expect(result.valid).toBe(true);
    });

    it('should return invalid on network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await validateIDECommand('code');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Failed to reach server');
    });
  });

  describe('getInstalledIDEs', () => {
    it('should fetch list of installed IDEs', async () => {
      const mockIDEs = [
        { cmd: 'code', label: 'Visual Studio Code' },
        { cmd: 'vim', label: 'Vim' },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ides: mockIDEs }),
      });

      const result = await getInstalledIDEs();

      expect(global.fetch).toHaveBeenCalledWith('/api/installed-ides');
      expect(result).toEqual(mockIDEs);
    });

    it('should return empty array on error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
      });

      const result = await getInstalledIDEs();

      expect(result).toEqual([]);
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await getInstalledIDEs();

      expect(result).toEqual([]);
    });
  });
});
