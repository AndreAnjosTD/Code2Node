import type { ScanResponse, ProjectGraph } from '../shared/types';
import type { ScanProgress } from './store';

const API_BASE = '/api';

export async function scanProject(path: string): Promise<ScanResponse> {
  const response = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return response.json();
}

/**
 * Scan a project with real-time progress via Server-Sent Events.
 */
export function scanProjectWithProgress(
  projectPath: string,
  onProgress: (progress: ScanProgress) => void,
  onComplete: (graph: ProjectGraph) => void,
  onError: (error: string) => void,
): () => void {
  const url = `${API_BASE}/scan-stream?path=${encodeURIComponent(projectPath)}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    try {
      const progress: ScanProgress = JSON.parse(e.data);
      onProgress(progress);
    } catch {
      // ignore parse errors
    }
  });

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    try {
      const result = JSON.parse(e.data);
      if (result.success && result.graph) {
        onComplete(result.graph);
      } else {
        onError(result.error || 'Scan failed');
      }
    } catch {
      onError('Failed to parse scan result');
    }
    eventSource.close();
  });

  eventSource.addEventListener('error', (e: any) => {
    // Check if it's a server-sent error event with data
    if (e.data) {
      try {
        const result = JSON.parse(e.data);
        onError(result.error || 'Scan failed');
      } catch {
        onError('Connection error');
      }
    } else {
      onError('Connection to server lost');
    }
    eventSource.close();
  });

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string;
  items: Array<{ name: string; path: string; isDirectory: boolean }>;
}

export async function browseDirectory(path?: string): Promise<BrowseResult> {
  const url = path ? `${API_BASE}/browse?path=${encodeURIComponent(path)}` : `${API_BASE}/browse`;
  const response = await fetch(url);
  return response.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export interface FileContentResult {
  filePath: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
}

export async function fetchFileContent(
  filePath: string,
  startLine?: number,
  endLine?: number,
): Promise<FileContentResult> {
  const params = new URLSearchParams({ path: filePath });
  if (startLine !== undefined) params.set('startLine', String(startLine));
  if (endLine !== undefined) params.set('endLine', String(endLine));
  const response = await fetch(`${API_BASE}/file-content?${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to fetch file content');
  }
  return response.json();
}

export async function openFileInIDE(
  filePath: string,
  line?: number,
  ide?: string,
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${API_BASE}/open-in-ide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, line, ide }),
  });
  return response.json();
}

export interface InstalledIDE {
  cmd: string;
  label: string;
  custom?: boolean;
}

export async function validateIDECommand(cmd: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/validate-ide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd }),
    });
    return response.json();
  } catch {
    return { valid: false, error: 'Failed to reach server' };
  }
}

export async function getInstalledIDEs(): Promise<InstalledIDE[]> {
  try {
    const response = await fetch(`${API_BASE}/installed-ides`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.ides || [];
  } catch {
    return [];
  }
}
