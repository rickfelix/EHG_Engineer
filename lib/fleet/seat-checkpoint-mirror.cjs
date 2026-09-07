'use strict';

/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A FR-2/FR-3 -- mirror-write half.
 *
 * Given a fixed seat_name, resolves the newest candidate `.claude/*.md` file on disk (via
 * lib/fleet/seat-checkpoint-registry.cjs's shared file registry), guards against a torn read
 * (a mid-write overwrite by the seat's own live session), and dedup-writes it into
 * role_seat_checkpoints: a new row only when content_hash changes, but last_verified_at stamped
 * on EVERY tick regardless -- so an unchanged-but-alive seat never reads as stale, per the
 * PLAN-phase adversarial review that converged on this design (evidence 79b61564/3fb39af9/
 * 732f0d3f/6a201736).
 *
 * DELIBERATELY NO LIVENESS GATE: this module mirrors the newest file for a seat_name
 * unconditionally -- it does not call loadLiveSessionIds() to decide WHETHER to mirror (only,
 * optionally, to break an mtime tie and to fill the session_id provenance column). A round-2
 * design that gated mirroring on live-session status left Michael's seat (0 live sessions
 * measured) permanently unmirrored, defeating the SD's own purpose for that seat.
 *
 * Fail-soft throughout: every exported function returns a result object and never throws, so a
 * caller (scripts/stale-session-sweep.cjs's tick) can call this without its own try/catch risking
 * an uncaught rejection -- though the caller wraps it anyway per FR-3's own acceptance criteria.
 */
const fs = require('fs');
const path = require('path');
const { listCandidateFiles } = require('./seat-checkpoint-registry.cjs');

const TORN_READ_GAP_MS = 50;
// EXEC-TO-PLAN SECURITY evidence (2026-09-06): readStableFile reads the whole file twice into
// memory with no size cap -- a runaway seat file (bug, or a bloated paste) would be read twice
// and pushed through PostgREST as one oversized row. Measured live files run 4.5KB-407KB; 8MB is
// generous headroom while still bounding the worst case. A rejected file is skipped (reason
// 'oversize'), same fail-soft posture as an unreadable or torn-read file -- never a hard failure.
const MAX_CONTENT_BYTES = 8 * 1024 * 1024;

/**
 * Pick the newest candidate file for a seat, tie-broken by which live session was heard from most recently, when resolvable.
 * @param {string[]} candidatePaths
 * @param {Map<string,string>} [liveHeartbeatBySuffix] - optional suffix -> ISO last-heard-from-timestamp map
 * @returns {string|null}
 */
function pickNewestCandidate(candidatePaths, liveHeartbeatBySuffix = new Map()) {
  if (!Array.isArray(candidatePaths) || candidatePaths.length === 0) return null;
  const stats = candidatePaths
    .map((p) => {
      try {
        return { path: p, mtimeMs: fs.statSync(p).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (stats.length === 0) return null;
  if (stats.length === 1) return stats[0].path;

  const maxMtime = Math.max(...stats.map((s) => s.mtimeMs));
  const tied = stats.filter((s) => s.mtimeMs === maxMtime);
  if (tied.length === 1) return tied[0].path;

  // Tie-break: prefer the candidate whose file-suffix belongs to the session heard from most recently.
  let best = tied[0];
  let bestHeartbeat = -Infinity;
  for (const s of tied) {
    const base = path.basename(s.path, '.md');
    const suffix = base.slice(base.lastIndexOf('-') + 1);
    const hb = liveHeartbeatBySuffix.get(suffix);
    const hbMs = hb ? Date.parse(hb) : -Infinity;
    if (Number.isFinite(hbMs) && hbMs > bestHeartbeat) {
      bestHeartbeat = hbMs;
      best = s;
    }
  }
  return best.path;
}

/**
 * Read a file with a torn-write guard: read twice with a short gap, and refuse the content if
 * the two reads disagree (a mid-write overwrite by the seat's own live session).
 * @returns {Promise<{content: string|null, torn: boolean, oversize?: boolean}>}
 */
async function readStableFile(filePath, gapMs = TORN_READ_GAP_MS) {
  try {
    if (fs.statSync(filePath).size > MAX_CONTENT_BYTES) {
      return { content: null, torn: false, oversize: true };
    }
  } catch {
    return { content: null, torn: false };
  }
  let first;
  try {
    first = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { content: null, torn: false };
  }
  await new Promise((resolve) => setTimeout(resolve, gapMs));
  let second;
  try {
    second = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { content: null, torn: false };
  }
  if (first !== second) return { content: null, torn: true };
  return { content: first, torn: false };
}

/**
 * Dedup-write a seat's content into role_seat_checkpoints.
 * @param {object} supabase - service-role client
 * @param {{seatName: string, content: string, sessionId?: string|null, fileSuffix?: string|null}} args
 * @returns {Promise<{action: 'inserted'|'refreshed'|'skipped'|'error', reason?: string}>}
 */
async function writeSeatCheckpoint(supabase, { seatName, content, sessionId = null, fileSuffix = null }) {
  try {
    const { approvedArtifactHash } = await import('../../scripts/lib/approved-artifact-hash.js');
    const contentHash = approvedArtifactHash(content);
    const nowIso = new Date().toISOString();

    const { data: latest, error: selectError } = await supabase
      .from('role_seat_checkpoints')
      .select('id, content_hash')
      .eq('seat_name', seatName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selectError) return { action: 'error', reason: selectError.message };

    if (latest && latest.content_hash === contentHash) {
      const { error: updateError } = await supabase
        .from('role_seat_checkpoints')
        .update({ last_verified_at: nowIso })
        .eq('id', latest.id);
      if (updateError) return { action: 'error', reason: updateError.message };
      return { action: 'refreshed' };
    }

    const { error: insertError } = await supabase.from('role_seat_checkpoints').insert({
      seat_name: seatName,
      session_id: sessionId,
      file_suffix: fileSuffix,
      content,
      content_hash: contentHash,
      created_at: nowIso,
      last_verified_at: nowIso,
    });
    if (insertError) return { action: 'error', reason: insertError.message };
    return { action: 'inserted' };
  } catch (e) {
    return { action: 'error', reason: e && e.message ? e.message : 'unknown' };
  }
}

/**
 * Resolve, read (torn-guarded), and mirror the newest candidate file for one seat.
 * Fail-soft: never throws. A zero-candidate seat (currently unstaffed) is a silent no-op.
 * @param {object} supabase
 * @param {string} claudeDir - absolute path to `.claude/`
 * @param {string} seatName - one of SEAT_NAMES
 * @param {Map<string,string>} [liveHeartbeatBySuffix]
 * @returns {Promise<{action: string, reason?: string}>}
 */
async function mirrorSeat(supabase, claudeDir, seatName, liveHeartbeatBySuffix = new Map()) {
  try {
    const candidates = listCandidateFiles(claudeDir, seatName);
    const chosen = pickNewestCandidate(candidates, liveHeartbeatBySuffix);
    if (!chosen) return { action: 'no_candidate' };

    const { content, torn, oversize } = await readStableFile(chosen);
    if (oversize) return { action: 'skipped', reason: 'oversize' };
    if (torn) return { action: 'skipped', reason: 'torn_read' };
    if (content == null) return { action: 'skipped', reason: 'unreadable' };

    const base = path.basename(chosen, '.md');
    const fileSuffix = base.slice(base.lastIndexOf('-') + 1);
    return writeSeatCheckpoint(supabase, { seatName, content, fileSuffix, sessionId: null });
  } catch (e) {
    return { action: 'error', reason: e && e.message ? e.message : 'unknown' };
  }
}

module.exports = { pickNewestCandidate, readStableFile, writeSeatCheckpoint, mirrorSeat, TORN_READ_GAP_MS, MAX_CONTENT_BYTES };
