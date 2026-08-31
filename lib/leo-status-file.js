/**
 * Per-worktree LEO status-file writer/clearer.
 * SD-LEO-INFRA-LEO-PHASE-TAGGED-001 (FR-1)
 *
 * .leo-status.json in a worktree's cwd was already read (.claude/statusline.cjs:202-217,
 * scripts/leo-status-line.js legacy fallback, server/state.js, server/index.js) but had no
 * writer anywhere in the codebase (confirmed by PLAN-phase TESTING sub-agent evidence
 * ebbdddc5-5e78-4416-8641-3d68e6e1255e). This is the first writer. Atomic tmp+rename avoids
 * a torn read by a concurrent statusline-hook tick; merge-not-clobber preserves any existing
 * autoProceed block a different writer may add later.
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE_NAME = '.leo-status.json';

function readExisting(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function atomicWrite(filePath, data) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Write current sd_key + leo_phase into the worktree's state file.
 * Fail-soft: never throws. Callers must not let this affect their own exit code.
 */
export function writeLeoStatusFile(cwd, { sdKey, leoPhase }) {
  if (!cwd || !sdKey || !leoPhase) return { ok: false, reason: 'missing_args' };
  try {
    const filePath = path.join(cwd, FILE_NAME);
    const next = {
      ...readExisting(filePath),
      sd_key: sdKey,
      leo_phase: leoPhase,
      updated_at: new Date().toISOString(),
    };
    atomicWrite(filePath, next);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

/**
 * Clear sd_key/leo_phase at a terminal phase (LEAD-FINAL-APPROVAL) so a worktree later
 * reused by a different SD doesn't tag stray ticks with a dead sd_key/phase.
 */
export function clearLeoStatusFile(cwd) {
  if (!cwd) return { ok: false, reason: 'missing_cwd' };
  try {
    const filePath = path.join(cwd, FILE_NAME);
    const existing = readExisting(filePath);
    if (existing.sd_key == null && existing.leo_phase == null) return { ok: true, reason: 'noop' };
    const next = { ...existing, sd_key: null, leo_phase: null, updated_at: new Date().toISOString() };
    atomicWrite(filePath, next);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}
