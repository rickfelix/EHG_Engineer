#!/usr/bin/env node

/**
 * Detect phantom worktrees — thin wrapper over scripts/worktree-reaper.mjs.
 *
 * A "phantom" worktree is one registered in `git worktree list` but whose
 * directory no longer exists on disk, or whose branch has been deleted /
 * marked prunable.
 *
 * History: this script was previously standalone (SD-NARRATIVE-KNOWLEDGE-
 * TO-ENFORCED-ORCH-001-B) and shipped in READ-ONLY mode with a hard rule
 * that it never deletes anything. That contract is preserved here — this
 * file still never writes to disk.
 *
 * As of SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001, phantom detection is a
 * specialized mode (`--phantom-only`) of the full reaper in
 * `scripts/worktree-reaper.mjs`. Operator muscle memory for
 *   `node scripts/cleanup-phantom-worktrees.js`
 * is preserved — this wrapper delegates, so the legacy CLI produces the
 * same output shape as before.
 *
 * Exit codes:
 *   0 — no phantoms found
 *   1 — phantoms detected (list printed to stdout)
 *   2 — reaper CWD guard failed (not running from main repo root)
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const REAPER_PATH = resolve(HERE, '..', 'worktree-reaper.mjs');

const res = spawnSync(process.execPath, [REAPER_PATH, '--phantom-only'], {
  stdio: 'inherit',
  windowsHide: true,
});

if (res.error) {
  console.error(`[cleanup-phantom-worktrees] delegation failed: ${res.error.message}`);
  process.exit(2);
}

process.exit(res.status ?? 0);
