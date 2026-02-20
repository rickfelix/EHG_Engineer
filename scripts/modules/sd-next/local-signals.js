/**
 * Local Signal Detection for SD-Next
 * SD-LEO-INFRA-SESSION-COMPACTION-CLAIM-001
 *
 * Scans local filesystem for evidence of SD work that survives context
 * compaction (worktrees, auto-proceed-state). This closes the gap where
 * a compacted session loses its database claim but local artifacts remain.
 */

import fs from 'fs';
import path from 'path';

/**
 * Detect local signals for all SDs. Returns a Map of sd_key -> signals.
 *
 * Signals checked:
 * 1. Worktree directories in .worktrees/ (naming convention: SD-KEY)
 * 2. auto-proceed-state.json currentSd field
 *
 * @param {string} repoRoot - Absolute path to the repo root
 * @returns {Map<string, { worktree: boolean, autoProceedState: boolean, worktreePath?: string, staleWorktree?: boolean }>}
 */
export function detectLocalSignals(repoRoot) {
  const signals = new Map();

  // 1. Scan .worktrees/ directory
  const worktreeDir = path.join(repoRoot, '.worktrees');
  if (fs.existsSync(worktreeDir)) {
    try {
      const entries = fs.readdirSync(worktreeDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sdKey = entry.name; // Worktree dirs are named after SD keys
        if (!sdKey.startsWith('SD-')) continue;

        const wtPath = path.join(worktreeDir, sdKey);
        const isStale = isWorktreeStale(wtPath);

        const existing = signals.get(sdKey) || { worktree: false, autoProceedState: false };
        existing.worktree = true;
        existing.worktreePath = wtPath;
        existing.staleWorktree = isStale;
        signals.set(sdKey, existing);
      }
    } catch {
      // Non-fatal: worktree scan failure
    }
  }

  // 2. Check auto-proceed-state.json
  const apStatePath = path.join(repoRoot, '.claude', 'auto-proceed-state.json');
  if (fs.existsSync(apStatePath)) {
    try {
      const content = fs.readFileSync(apStatePath, 'utf8');
      const state = JSON.parse(content);
      if (state.currentSd && state.isActive) {
        const sdKey = state.currentSd;
        const existing = signals.get(sdKey) || { worktree: false, autoProceedState: false };
        existing.autoProceedState = true;
        existing.lastUpdatedAt = state.lastUpdatedAt;
        signals.set(sdKey, existing);
      }
    } catch {
      // Non-fatal: auto-proceed-state parse failure
    }
  }

  return signals;
}

/**
 * Check if a worktree directory is stale (no modifications in >24 hours).
 * This prevents false positives from abandoned worktrees.
 *
 * @param {string} wtPath - Path to the worktree directory
 * @returns {boolean} true if stale (>24h since last modification)
 */
function isWorktreeStale(wtPath) {
  try {
    // Check the .git file (updated on checkout/commit operations)
    const gitFile = path.join(wtPath, '.git');
    if (fs.existsSync(gitFile)) {
      const stat = fs.statSync(gitFile);
      const ageMs = Date.now() - stat.mtimeMs;
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      return ageMs > TWENTY_FOUR_HOURS;
    }
    return true; // No .git file = definitely stale
  } catch {
    return true; // Can't stat = treat as stale
  }
}
