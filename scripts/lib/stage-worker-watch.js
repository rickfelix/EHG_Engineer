/**
 * Stage-worker supervisor watch-set composition (pure).
 *
 * SD-FDBK-FIX-STAGE-TEMPLATE-FIXES-001
 *
 * The stage-execution-worker supervised by scripts/start-stage-worker.js auto-restarts
 * the worker (child_process.fork — fresh V8, clean module cache) when watched source
 * changes. The original watch-set covered only three paths
 * (lib/eva/stage-execution-worker.js, lib/eva/bridge/, lib/eva/artifact-persistence-service.js),
 * but a dependency-graph audit found the worker's runtime spans ~90% of lib/eva: the
 * eva-orchestrator + ~20 core modules, ALL stage templates in lib/eva/stage-templates/
 * (the reported symptom), and the utils/, contracts/, quality-findings/, config/
 * directories those templates import. Synced fixes to any of those were on-disk-correct
 * but never hot-reloaded (Adam's deploy-gap canary, 2026-06-07).
 *
 * Watching the lib/eva ROOT recursively is the single robust watch that (a) subsumes the
 * prior three paths, (b) covers the entire runtime graph, and (c) stays correct as new
 * stage templates are added — without enumerating fragile per-file paths. This module is
 * pure (no IO, no process/fs side effects) so the watch-set is unit-testable.
 *
 * @module scripts/lib/stage-worker-watch
 */

import { resolve, sep } from 'path';

/**
 * The chokidar watch roots for the stage-worker supervisor. The whole lib/eva tree is the
 * worker's runtime source, so watching its root triggers a respawn on any runtime-relevant
 * change (stage templates + every dependency) and never goes stale as files are added.
 *
 * @param {string} projectRoot - absolute path to the repo root
 * @returns {string[]} absolute watch roots
 */
export function buildWatchPaths(projectRoot) {
  return [resolve(projectRoot, 'lib', 'eva')];
}

/**
 * Pure predicate: is `filePath` inside one of the watch roots? Uses path-segment-aware
 * containment (root, or root + sep prefix) so a sibling directory that merely shares the
 * root's name prefix (e.g. lib/eva-extra vs lib/eva) is NOT considered watched.
 *
 * @param {string[]} watchPaths - watch roots (from buildWatchPaths)
 * @param {string} filePath - candidate path
 * @returns {boolean}
 */
export function isPathWatched(watchPaths, filePath) {
  if (!filePath) return false;
  const target = resolve(filePath);
  return (watchPaths || []).some((root) => {
    const r = resolve(root);
    return target === r || target.startsWith(r + sep);
  });
}
