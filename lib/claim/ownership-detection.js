/**
 * Unified Claim Ownership Detection
 * SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-3
 *
 * Single source of truth for "who currently holds this SD?" detection across the sweep,
 * dashboard, sd-start, and handoff infrastructure.
 *
 * BEFORE this helper, the same question was answered by reading different subsets of
 * claude_sessions columns (claiming_session_id, active_session_id, is_working_on, is_alive,
 * has_uncommitted_changes) across N call sites. Each picked 1-2 signals; combinations
 * differed; liveness thresholds (300s LIVENESS / 600s DISPLAY) were duplicated inline.
 *
 * PER LEAD DESIGN Q3: uncached by default. Inputs are sdKey strings (not sd objects),
 * consumers poll, claim state mutates frequently. Different access pattern than the
 * Cluster A sd-type helper which uses WeakMap. Optional getClaimHolderCached() with
 * Map+ttlMs is exposed for handoff sub-call bursts.
 *
 * Re-exports CLAIM_HOLDING_STATUSES from lib/claim/holding-statuses.cjs so consumers
 * have a single import surface.
 */

import { createRequire } from 'node:module';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: getLiveClaimHolders scans
// ALL claude_sessions rows with a non-null sd_key (dead/stale sessions retain sd_key, so
// the set grows unboundedly). The sweep and dashboard derive "who holds what" from it —
// a silent 1000-row cap could hide a LIVE holder and let its SD be treated as unclaimed.
// Paginate to completion; the pre-existing fail-open []-on-error policy is preserved.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
const require = createRequire(import.meta.url);
const { CLAIM_HOLDING_STATUSES, computeClaimedSdKeys } = require('./holding-statuses.cjs');

export { CLAIM_HOLDING_STATUSES, computeClaimedSdKeys };

/**
 * Liveness thresholds (seconds). Documented at the helper boundary so consumers
 * don't reimplement them inline. Two thresholds per SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001
 * (board decision 20260406):
 *   LIVENESS  = 300s — heartbeat staleness for "still holding" classification
 *   DISPLAY   = 600s — heartbeat staleness for UI render-as-active
 */
export const LIVENESS_THRESHOLD_SECONDS = 300;
export const DISPLAY_THRESHOLD_SECONDS = 600;

/**
 * Optional Map-keyed TTL cache for getClaimHolderCached. Default getClaimHolder
 * does NOT use this cache.
 */
const ttlCache = new Map();

function cacheKey(sdKey) {
  return `claim:${sdKey}`;
}

/**
 * Returns the claim holder for a given SD, or null if unclaimed.
 *
 * @param {string} sdKey
 * @param {Object} supabase
 * @returns {Promise<null | {session_id: string, sd_key: string, status: string, is_alive: boolean, has_uncommitted_changes: boolean, holding_status: string}>}
 */
export async function getClaimHolder(sdKey, supabase) {
  if (!sdKey || !supabase) return null;

  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, claiming_session_id')
    .eq('sd_key', sdKey)
    .maybeSingle();

  if (sdErr || !sd || !sd.claiming_session_id) return null;

  const { data: session, error: sessErr } = await supabase
    .from('claude_sessions')
    // last_heartbeat is a pre-existing-on-main phantom column (claude_sessions has heartbeat_at);
    // fixing the classification input is out of batch-8 scope — flagged in the batch report.
    .select('session_id, sd_key, status, is_alive, has_uncommitted_changes, last_heartbeat') // schema-lint-disable-line
    .eq('session_id', sd.claiming_session_id)
    .maybeSingle();

  if (sessErr || !session) return null;

  const holdingStatus = classifyHoldingStatus(session);

  return {
    session_id: session.session_id,
    sd_key: session.sd_key,
    status: session.status,
    is_alive: session.is_alive === true,
    has_uncommitted_changes: session.has_uncommitted_changes === true,
    holding_status: holdingStatus,
  };
}

/**
 * Returns true iff the SD is currently claimed by the given session.
 *
 * @param {string} sdKey
 * @param {string} sessionId
 * @param {Object} supabase
 * @returns {Promise<boolean>}
 */
export async function isClaimedBy(sdKey, sessionId, supabase) {
  if (!sdKey || !sessionId || !supabase) return false;
  const holder = await getClaimHolder(sdKey, supabase);
  return holder !== null && holder.session_id === sessionId;
}

/**
 * Returns all currently-live claim holders (those whose holding_status is in
 * CLAIM_HOLDING_STATUSES). Used by sweep and dashboard to render active workers.
 *
 * @param {Object} supabase
 * @returns {Promise<Array<{sd_key: string, session_id: string, holding_status: string}>>}
 */
export async function getLiveClaimHolders(supabase) {
  if (!supabase) return [];
  let sessions;
  try {
    // last_heartbeat: pre-existing-on-main phantom column (see getClaimHolder note above)
    sessions = await fetchAllPaginated(() => supabase
      .from('claude_sessions')
      .select('session_id, sd_key, status, is_alive, has_uncommitted_changes, last_heartbeat') // schema-lint-disable-line
      .not('sd_key', 'is', null)
      .order('session_id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch {
    return []; // prior fail-open (error || !Array.isArray) policy preserved
  }
  if (!Array.isArray(sessions)) return [];

  const out = [];
  for (const session of sessions) {
    const holdingStatus = classifyHoldingStatus(session);
    if (CLAIM_HOLDING_STATUSES.has(holdingStatus)) {
      out.push({
        sd_key: session.sd_key,
        session_id: session.session_id,
        holding_status: holdingStatus,
      });
    }
  }
  return out;
}

/**
 * Classify a claude_sessions row into one of the holding statuses.
 *   ALIVE_SOURCE_SIDE  — has uncommitted_changes (source-side evidence overrides heartbeat staleness)
 *   ACTIVE             — heartbeat fresher than LIVENESS_THRESHOLD_SECONDS
 *   ALIVE_NO_HEARTBEAT — is_alive flag true OR heartbeat fresher than DISPLAY_THRESHOLD_SECONDS but stale beyond LIVENESS
 *   STALE_UNKNOWN      — heartbeat older than DISPLAY threshold
 *
 * @param {Object} session - claude_sessions row
 * @returns {string} status code
 */
export function classifyHoldingStatus(session) {
  if (!session) return 'STALE_UNKNOWN';
  if (session.has_uncommitted_changes === true) return 'ALIVE_SOURCE_SIDE';

  const heartbeatSec = heartbeatAgeSeconds(session.last_heartbeat);
  if (heartbeatSec !== null && heartbeatSec <= LIVENESS_THRESHOLD_SECONDS) return 'ACTIVE';
  if (session.is_alive === true) return 'ALIVE_NO_HEARTBEAT';
  if (heartbeatSec !== null && heartbeatSec <= DISPLAY_THRESHOLD_SECONDS) return 'ALIVE_NO_HEARTBEAT';
  return 'STALE_UNKNOWN';
}

function heartbeatAgeSeconds(timestamp) {
  if (!timestamp) return null;
  const t = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp;
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 1000);
}

/**
 * Optional cached variant of getClaimHolder for handoff sub-call bursts where
 * multiple gates query the same sdKey in quick succession. TTL defaults to
 * 5000ms — short enough that stale results are rare, long enough to amortize
 * DB cost across a single handoff execution.
 *
 * @param {string} sdKey
 * @param {Object} options - { supabase, ttlMs? }
 * @returns {Promise<null|Object>}
 */
export async function getClaimHolderCached(sdKey, { supabase, ttlMs = 5000 } = {}) {
  if (!sdKey || !supabase) return null;
  const key = cacheKey(sdKey);
  const entry = ttlCache.get(key);
  if (entry && Date.now() - entry.t < ttlMs) return entry.v;

  const value = await getClaimHolder(sdKey, supabase);
  ttlCache.set(key, { t: Date.now(), v: value });
  return value;
}

/**
 * Test helper: clear the TTL cache. Production code should never call this.
 */
export function _clearCache() {
  ttlCache.clear();
}
