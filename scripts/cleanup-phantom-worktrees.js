#!/usr/bin/env node

/**
 * Detect phantom worktrees — READ-ONLY mode.
 *
 * A "phantom" worktree is one registered in `git worktree list` but whose
 * directory no longer exists on disk, or whose branch has been deleted.
 *
 * This script NEVER deletes anything. It reports findings and exits:
 *   exit 0 — no phantoms found
 *   exit 1 — phantoms detected (list printed to stdout)
 *
 * SD: SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-B
 * @module scripts/cleanup-phantom-worktrees
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

function getWorktrees() {
  const raw = execSync('git worktree list --porcelain', {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });

  const worktrees = [];
  let current = {};

  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.slice(9).trim() };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).trim();
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }
  if (current.path) worktrees.push(current);

  return worktrees;
}

function detectPhantoms(worktrees) {
  const phantoms = [];

  for (const wt of worktrees) {
    // Skip the main worktree
    if (wt.path === REPO_ROOT) continue;

    const issues = [];

    if (!existsSync(wt.path)) {
      issues.push('directory missing');
    }

    if (wt.prunable) {
      issues.push('marked prunable by git');
    }

    if (issues.length > 0) {
      phantoms.push({ ...wt, issues });
    }
  }

  return phantoms;
}

// ── Main ────────────────────────────────────────────────────────────
const worktrees = getWorktrees();
const phantoms = detectPhantoms(worktrees);

console.log(`[cleanup-phantom-worktrees] Scanned ${worktrees.length} worktree(s)`);

if (phantoms.length === 0) {
  console.log('[cleanup-phantom-worktrees] No phantoms detected. All clean.');
  process.exit(0);
} else {
  console.log(`[cleanup-phantom-worktrees] Found ${phantoms.length} phantom(s):\n`);
  for (const p of phantoms) {
    console.log(`  Path:   ${p.path}`);
    console.log(`  Branch: ${p.branch || '(detached)'}`);
    console.log(`  Issues: ${p.issues.join(', ')}`);
    console.log(`  Fix:    git worktree remove "${p.path}" --force`);
    console.log();
  }
  console.log('[cleanup-phantom-worktrees] READ-ONLY mode — no changes made.');
  process.exit(1);
}
