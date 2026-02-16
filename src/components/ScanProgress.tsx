import React from 'react';
import type { ScanProgress } from '../store';

interface Props {
  progress: ScanProgress;
}

const PHASE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  discovering: { label: 'Discovering Files', icon: '🔍', color: '#3b82f6' },
  parsing:     { label: 'Parsing Code',      icon: '⚡', color: '#14b8a6' },
  resolving:   { label: 'Resolving Links',   icon: '🔗', color: '#8b5cf6' },
  complete:    { label: 'Complete',           icon: '✓',  color: '#22c55e' },
  error:       { label: 'Error',             icon: '✕',  color: '#f43f5e' },
};

export default function ScanProgressPanel({ progress }: Props) {
  const phase = PHASE_INFO[progress.phase] || PHASE_INFO.discovering;

  const percentage = progress.totalFiles > 0
    ? Math.round((progress.filesParsed / progress.totalFiles) * 100)
    : 0;

  // Truncate long file paths to last 2-3 segments for readability
  const displayFile = progress.currentFile
    ? truncatePath(progress.currentFile, 50)
    : '';

  return (
    <div className="scan-progress-overlay">
      <div className="scan-progress-panel">
        {/* Phase header */}
        <div className="scan-progress-header">
          <div className="scan-phase-badge" style={{ borderColor: phase.color, color: phase.color }}>
            <span className="scan-phase-icon">{phase.icon}</span>
            <span>{phase.label}</span>
          </div>
          {progress.phase === 'parsing' && progress.totalFiles > 0 && (
            <span className="scan-percentage" style={{ color: phase.color }}>
              {percentage}%
            </span>
          )}
        </div>

        {/* Progress bar */}
        {progress.totalFiles > 0 && (
          <div className="scan-progress-bar-track">
            <div
              className="scan-progress-bar-fill"
              style={{
                width: `${progress.phase === 'complete' ? 100 : Math.max(percentage, 2)}%`,
                background: `linear-gradient(90deg, ${phase.color}, ${phase.color}cc)`,
              }}
            />
          </div>
        )}

        {/* Current file being processed */}
        {displayFile && progress.phase !== 'complete' && (
          <div className="scan-current-file">
            <span className="scan-current-label">
              {progress.phase === 'discovering' ? 'Scanning' : 'Parsing'}:
            </span>
            <span className="scan-current-path">{displayFile}</span>
          </div>
        )}

        {/* Message */}
        <div className="scan-message">{progress.message}</div>

        {/* Stats grid */}
        <div className="scan-stats-row">
          <div className="scan-stat">
            <span className="scan-stat-value">{progress.filesDiscovered}</span>
            <span className="scan-stat-label">Discovered</span>
          </div>
          {progress.totalFiles > 0 && (
            <div className="scan-stat">
              <span className="scan-stat-value">{progress.filesParsed}</span>
              <span className="scan-stat-label">Parsed</span>
            </div>
          )}
          {progress.nodesFound > 0 && (
            <div className="scan-stat">
              <span className="scan-stat-value">{progress.nodesFound}</span>
              <span className="scan-stat-label">Nodes</span>
            </div>
          )}
          {progress.edgesFound > 0 && (
            <div className="scan-stat">
              <span className="scan-stat-value">{progress.edgesFound}</span>
              <span className="scan-stat-label">Edges</span>
            </div>
          )}
        </div>

        {/* Languages found */}
        {Object.keys(progress.languages).length > 0 && (
          <div className="scan-languages">
            {Object.entries(progress.languages).map(([lang, count]) => (
              <span key={lang} className="scan-lang-tag">
                {lang}: {count}
              </span>
            ))}
          </div>
        )}

        {/* Activity indicator */}
        {progress.phase !== 'complete' && progress.phase !== 'error' && (
          <div className="scan-activity">
            <div className="scan-activity-dots">
              <span className="scan-dot" />
              <span className="scan-dot" />
              <span className="scan-dot" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function truncatePath(filePath: string, maxLen: number): string {
  if (filePath.length <= maxLen) return filePath;
  const parts = filePath.split('/');
  if (parts.length <= 2) return '…' + filePath.slice(-maxLen + 1);
  // Show last 2-3 segments
  let result = parts.slice(-3).join('/');
  if (result.length > maxLen) {
    result = parts.slice(-2).join('/');
  }
  return '…/' + result;
}
