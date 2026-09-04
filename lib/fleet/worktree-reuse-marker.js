/**
 * Worktree reuse marker (SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001, FR-2).
 *
 * The slot-free worktree-reuse policy checks out a new branch inside a tree whose directory
 * name still names the PREVIOUS occupant. scripts/hooks/pre-tool-enforce.cjs's ENFORCEMENT-4
 * prefers the tree's checked-out branch to resolve the current key, but a branch that is not
 * itself key-shaped (a coordinator reuse handoff mid-flight, before the new branch is checked
 * out) has no signal to fall back on except the stale directory name. This marker is the
 * second-priority source: a small, best-effort, gitignored file the coordinator's reuse
 * tooling writes naming the new key.
 *
 * Mirrors lib/worktree-reaper/reap-eligible-marker.js's established shape (best-effort write,
 * JSON payload, TTL-checked on read) rather than inventing a new convention.
 */
import fs from 'fs';
import path from 'path';

export const WORKTREE_REUSE_MARKER_FILENAME = '.worktree-reuse.json';
export const DEFAULT_MARKER_TTL_MIN = 120;

/**
 * Write the reuse marker at the worktree root. Best-effort -- a write failure must never fail
 * the reuse operation that called it.
 * @param {string} treePath - worktree root
 * @param {{ key: string, writerSession?: string|null }} fields
 * @returns {{ written: boolean, markerPath: string|null, error: string|null }}
 */
export function writeReuseMarker(treePath, fields = {}) {
  const markerPath = path.join(treePath, WORKTREE_REUSE_MARKER_FILENAME);
  try {
    const payload = {
      key: fields.key ?? null,
      writer_session: fields.writerSession ?? process.env.CLAUDE_SESSION_ID ?? null,
      marked_at: new Date().toISOString(),
    };
    fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2), 'utf8');
    return { written: true, markerPath, error: null };
  } catch (e) {
    return { written: false, markerPath: null, error: e?.message || String(e) };
  }
}

/**
 * Read the marker if present, parseable, and within its TTL. Returns null otherwise (absent,
 * corrupt, or stale markers all read as "no marker" -- a stale marker naming a since-superseded
 * key must not carry authority indefinitely; see reap-eligible-marker.js's header for the
 * incident class this TTL check exists to prevent).
 * @param {string} treePath - worktree root
 * @param {{ nowMs?: number, ttlMin?: number }} [options]
 * @returns {{ key: string, writer_session: string|null, marked_at: string }|null}
 */
export function readReuseMarker(treePath, options = {}) {
  const { nowMs = Date.now() } = options;
  const ttlMin = Number.isFinite(options.ttlMin) && options.ttlMin > 0 ? options.ttlMin : DEFAULT_MARKER_TTL_MIN;
  try {
    const raw = fs.readFileSync(path.join(treePath, WORKTREE_REUSE_MARKER_FILENAME), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.key !== 'string' || !parsed.key) return null;
    const markedAt = Date.parse(parsed.marked_at || '');
    if (!Number.isFinite(markedAt)) return null;
    const ageMs = Math.max(0, nowMs - markedAt);
    if (ageMs > ttlMin * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default { WORKTREE_REUSE_MARKER_FILENAME, DEFAULT_MARKER_TTL_MIN, writeReuseMarker, readReuseMarker };
