/**
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 — claim lifecycle release helpers.
 *
 * Closes 3 sibling feedback rows:
 *   - 7e4cce6f / 8ddfe2e8: claim release on PR-open (FR-1)
 *   - b3653308: --force-reclaim honors sd_key drift (FR-2; via re-export)
 *   - 8ddfe2e8: worker honors CLAIM_RELEASED inbox before re-claim (FR-3)
 *
 * Design constraints (validation-agent PRD-prospective id 1d3d1c5b):
 *   - Compare-and-set on EXISTING columns (claiming_session_id + claimed_at + heartbeat_at).
 *     No claim_version column exists; do not introduce one (Option B per validation-agent P1).
 *   - FR-3 inbox poll is READ-ONLY (no mark-read). TTL retires messages naturally.
 *     Marking-read would close the FR-1/FR-3 race window and reopen claim collisions.
 *   - detectSdKeyDrift is RE-EXPORTED, not re-implemented. Canonical lives in
 *     scripts/session-check-concurrency.js (shipped by SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 FR-7).
 *
 * 13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * TTL window for FR-3 CLAIM_RELEASED inbox poll.
 *
 * Source: feedback 8ddfe2e8 (worker re-claims within ~5min of CLAIM_RELEASED).
 * Worker tick budget rationale: workers poll inbox on each /coordinator tick;
 * 5min covers ~10 ticks worst-case before a CLAIM_RELEASED naturally retires.
 *
 * Externalized to avoid magic-number drift across consumers (FR-5).
 */
export const CLAIM_RELEASED_TTL_MS = 5 * 60 * 1000;

/**
 * Re-export of canonical sd_key drift detector. NEVER re-implement here.
 * Canonical signature:
 *   detectSdKeyDrift(session: {sd_key:string|null}, activeClaimSdKey: string) → 'drift'|'aligned'|'unknown'
 */
export { detectSdKeyDrift } from '../scripts/session-check-concurrency.js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[claim-lifecycle-release] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

/**
 * FR-1: capture pre-PR-create claim snapshot for compare-and-set release.
 *
 * Returns { sd_id, claiming_session_id, claimed_at, heartbeat_at } captured
 * BEFORE gh pr create runs, so a same-session re-assert AFTER PR-open mutates
 * claimed_at/heartbeat_at and the captured-snapshot UPDATE returns 0 rows.
 *
 * @param {string} sdId — SD UUID or sd_key
 * @returns {Promise<null|{id, claiming_session_id, claimed_at, heartbeat_at}>}
 *          null if SD not found or no active claim
 */
export async function captureClaimSnapshot(sdId) {
  const sb = getSupabase();
  // Resolve to UUID if sd_key was passed (sd_key starts with SD-).
  const filter = String(sdId).startsWith('SD-')
    ? sb.from('strategic_directives_v2').select('id,claiming_session_id,claimed_at,heartbeat_at').eq('sd_key', sdId)
    : sb.from('strategic_directives_v2').select('id,claiming_session_id,claimed_at,heartbeat_at').eq('id', sdId);
  const { data, error } = await filter.limit(1).single();
  if (error || !data || !data.claiming_session_id) return null;
  return data;
}

/**
 * FR-1 + FR-4: release a claim on PR-open via WHERE-pinned UPDATE.
 *
 * Idempotency contract (FR-4 / AC-1.2):
 *   - 0 rows affected → already released or re-asserted post-capture → exit clean,
 *     return { released: false, reason: 'already_released_or_reasserted' }.
 *   - >=1 row affected → returns { released: true, sd_id }.
 *   - DB error → throws (no swallow). Caller decides whether to fail-soft (AC-1.6).
 *
 * Compare-and-set on (claiming_session_id, claimed_at, heartbeat_at) — the captured
 * snapshot from `captureClaimSnapshot()`. If the same session re-asserted post-PR-open,
 * heartbeat_at advances and the UPDATE WHERE-clause no longer matches.
 *
 * @param {{id, claiming_session_id, claimed_at, heartbeat_at}} snapshot
 * @returns {Promise<{released: boolean, sd_id?: string, reason?: string}>}
 */
export async function releaseClaimOnPROpen(snapshot) {
  if (!snapshot || !snapshot.id || !snapshot.claiming_session_id) {
    return { released: false, reason: 'no_snapshot' };
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('strategic_directives_v2')
    .update({ claiming_session_id: null, claimed_at: null, heartbeat_at: null })
    .eq('id', snapshot.id)
    .eq('claiming_session_id', snapshot.claiming_session_id)
    .eq('claimed_at', snapshot.claimed_at)
    .eq('heartbeat_at', snapshot.heartbeat_at)
    .select('id');

  if (error) {
    // No swallow per AC-4.2 — caller decides whether to soft-fail (AC-1.6 in ShippingExecutor).
    throw new Error(`[claim-lifecycle-release] release failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    // Compare-and-set mismatch: claim re-asserted or already released.
    return { released: false, reason: 'already_released_or_reasserted', sd_id: snapshot.id };
  }
  return { released: true, sd_id: snapshot.id };
}

/**
 * FR-3: read-only poll for recent CLAIM_RELEASED messages on a target SD.
 *
 * **CRITICAL READ-ONLY CONTRACT** (validation-agent drift catch (d)):
 *   This function MUST NEVER UPDATE/INSERT/DELETE on session_coordination.
 *   Marking the message read here closes the FR-1/FR-3 race window: if the
 *   original consumer dies before its retry, the next consumer would not see
 *   the (now-marked-read) message and claim collision reopens.
 *
 * The TTL window naturally retires the message; no consumer-side flagging.
 *
 * Schema (validation-agent P1 correction):
 *   - target_sd: SD-key (NOT subject column)
 *   - message_type: top-level column (NOT payload.event_type)
 *
 * @param {string} sdKey — SD-key to filter on (must match target_sd column)
 * @returns {Promise<{recent: boolean, msSinceCreated?: number, ttlRemainingMs?: number}>}
 */
export async function hasRecentClaimReleased(sdKey) {
  if (!sdKey) return { recent: false };
  const sb = getSupabase();
  const cutoffIso = new Date(Date.now() - CLAIM_RELEASED_TTL_MS).toISOString();
  // SELECT-only — see READ-ONLY CONTRACT above.
  const { data, error } = await sb
    .from('session_coordination')
    .select('id,created_at')
    .eq('target_sd', sdKey)
    .eq('message_type', 'CLAIM_RELEASED')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    // Fail-open: if the inbox check itself errors, do not block claim attempts.
    // Logged for observability but not fatal (network/transient errors).
    return { recent: false, error: error.message };
  }
  if (!data || data.length === 0) return { recent: false };
  const msg = data[0];
  const msSinceCreated = Date.now() - new Date(msg.created_at).getTime();
  const ttlRemainingMs = Math.max(0, CLAIM_RELEASED_TTL_MS - msSinceCreated);
  return { recent: true, msSinceCreated, ttlRemainingMs };
}

/**
 * Format `hasRecentClaimReleased` result into the operator-facing abort message
 * specified in AC-3.1. Kept as a small pure helper for testability.
 *
 * @param {string} sdKey
 * @param {{recent:boolean,msSinceCreated?:number,ttlRemainingMs?:number}} probe
 * @returns {string|null} null when not recent
 */
export function formatClaimReleasedAbort(sdKey, probe) {
  if (!probe?.recent) return null;
  const ago = Math.floor((probe.msSinceCreated ?? 0) / 1000);
  const remaining = Math.ceil((probe.ttlRemainingMs ?? 0) / 1000);
  const minutes = Math.floor(ago / 60);
  const seconds = ago % 60;
  const agoLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return `Peer is releasing claim for ${sdKey} (received ${agoLabel} ago); retry in ${remaining}s`;
}
