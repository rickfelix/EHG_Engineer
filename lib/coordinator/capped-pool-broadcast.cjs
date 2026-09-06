'use strict';
/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-2 — capped-pool broadcast.
 *
 * Replaces the originally-specified (and confirmed dead) target_session='broadcast' mechanism:
 * both LEAD-phase sub-agents and PLAN-phase TESTING independently confirmed zero worker read
 * path unions the bare sentinel. Instead, when the worktree pool has been over cap for more
 * than the hold window, this module fans out ONE directed INFO row per live seat (all sharing
 * one run_id), naming the slot-free-safe DB-resident LEAD/PLAN work and the reuse-by-checkout
 * procedure -- so the explanation is given once, fleet-wide, instead of seat by seat.
 *
 * DEDUPE IS EMISSION-RECENCY-BASED, NEVER ACKNOWLEDGEMENT-BASED (TST-P3). capped_pool_broadcast
 * is in BACKPRESSURE_EXEMPT_KINDS, which is spread into every role's DRAIN_SET -- so ANY seat can
 * drain (ack) its own copy. An acknowledged_at-IS-NULL dedupe (the emitReaperStarvationAlert
 * pattern this module otherwise mirrors) would self-clear the instant one seat acks, causing a
 * duplicate broadcast on the very next tick even though nothing about the pool changed. Instead,
 * a small JSON state file (mirroring scripts/fleet/worktree-reaper-tick.cjs's own readState/
 * writeState) tracks over_cap_since and last_emitted_at directly, independent of any seat's ack
 * state.
 *
 * @module lib/coordinator/capped-pool-broadcast
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { dispatchToWorker } = require('./dispatch.cjs');
const { PAYLOAD_KINDS } = require('../fleet/worker-status.cjs');

const DEFAULT_HOLD_MINUTES = 30;
const DEFAULT_REEMIT_HOURS = 6;
const STATE_SCHEMA_VERSION = 1;

function defaultStatePath(repoRoot) {
  return path.join(repoRoot, '.claude', 'capped-pool-broadcast-state.json');
}

/** Fail-open read, mirroring worktree-reaper-tick.cjs's readState: a missing/corrupt file
 *  reads as "never over cap, never emitted" rather than throwing. */
function readState(statePath) {
  if (!fs.existsSync(statePath)) {
    return { schema_version: STATE_SCHEMA_VERSION, over_cap_since: null, last_emitted_at: null, last_cleared_notice_at: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      schema_version: parsed.schema_version || STATE_SCHEMA_VERSION,
      over_cap_since: parsed.over_cap_since || null,
      last_emitted_at: parsed.last_emitted_at || null,
      last_cleared_notice_at: parsed.last_cleared_notice_at || null,
    };
  } catch {
    return { schema_version: STATE_SCHEMA_VERSION, over_cap_since: null, last_emitted_at: null, last_cleared_notice_at: null };
  }
}

/** Fail-soft, atomic write (temp file + rename), mirroring scripts/fleet/worktree-reaper-tick.cjs's
 *  own writeState exactly: a write failure (corrupt/read-only FS, concurrent writer) must never
 *  throw out of a coordinator sweep tick (adversarial post-merge review, PR #8356, WARNING
 *  finding -- the prior version was a bare writeFileSync with no temp+rename and no try/catch).
 *  If persistence fails, the counter resets on next tick -- same accepted trade-off as the
 *  reaper's own pattern. */
function writeState(statePath, state) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tmpPath = `${statePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
    fs.renameSync(tmpPath, statePath);
  } catch {
    // Best-effort. If we can't persist, the counter resets on next tick.
  }
}

/**
 * Pure decision core. Given the current pool census and the persisted state, decide whether to
 * emit a fan-out now, emit a cleared-notice, or do nothing -- and the state to persist next.
 *
 * @param {{used:number, cap:number, state:object, nowMs?:number, holdMinutes?:number, reemitHours?:number}} args
 * @returns {{action:'emit'|'notify_clear'|'none', nextState:object}}
 */
function decide({ used, cap, state, nowMs = Date.now(), holdMinutes = DEFAULT_HOLD_MINUTES, reemitHours = DEFAULT_REEMIT_HOURS }) {
  const overCap = Number.isFinite(used) && Number.isFinite(cap) && used > cap;
  const holdMs = holdMinutes * 60 * 1000;
  const reemitMs = reemitHours * 60 * 60 * 1000;

  if (!overCap) {
    // Condition is clear. Send the one-more "clear" notice ONLY if an over-cap notice was
    // actually emitted for THIS episode (adversarial post-merge review, PR #8356, WARNING
    // finding: the prior version gated solely on over_cap_since != null, which is stamped on the
    // FIRST over-cap tick -- well before the hold window elapses -- so a brief over-cap blip that
    // never reached the emit threshold still fanned out a "no longer required" notice referring
    // to a notice nobody ever received). last_emitted_at must exist AND fall at/after this
    // episode's over_cap_since for the clear notice to be genuine.
    const emittedForThisEpisode = state.over_cap_since != null
      && state.last_emitted_at != null
      && Date.parse(state.last_emitted_at) >= Date.parse(state.over_cap_since);
    const shouldNotifyClear = emittedForThisEpisode
      && (state.last_cleared_notice_at == null || Date.parse(state.last_cleared_notice_at) < Date.parse(state.over_cap_since));
    return {
      action: shouldNotifyClear ? 'notify_clear' : 'none',
      nextState: {
        ...state,
        over_cap_since: null,
        ...(shouldNotifyClear ? { last_cleared_notice_at: new Date(nowMs).toISOString() } : {}),
      },
    };
  }

  const overCapSince = state.over_cap_since || new Date(nowMs).toISOString();
  const overCapDurationMs = nowMs - Date.parse(overCapSince);
  if (overCapDurationMs < holdMs) {
    return { action: 'none', nextState: { ...state, over_cap_since: overCapSince } };
  }

  const lastEmitMs = state.last_emitted_at ? Date.parse(state.last_emitted_at) : null;
  if (lastEmitMs != null && Number.isFinite(lastEmitMs) && (nowMs - lastEmitMs) < reemitMs) {
    return { action: 'none', nextState: { ...state, over_cap_since: overCapSince } };
  }

  return {
    action: 'emit',
    nextState: { ...state, over_cap_since: overCapSince, last_emitted_at: new Date(nowMs).toISOString() },
  };
}

function buildBroadcastBody({ used, cap, cleared }) {
  if (cleared) {
    return `The worktree pool is back at or under cap (${used}/${cap}). The slot-free path from the prior notice is no longer required, but reusing a preserved tree by checkout remains valid at any time.`;
  }
  return `The worktree pool has been over cap (${used}/${cap}) for more than ${DEFAULT_HOLD_MINUTES} minutes. `
    + 'Slot-free path: DB-resident LEAD/PLAN work (SD evaluation, PRD authoring, scope decisions) does not need a worktree -- '
    + 'drive it directly against strategic_directives_v2/product_requirements_v2. '
    + 'A preserved tree can be reused by checkout instead of provisioning a new worktree slot. '
    + 'This notice fans out once per re-emit window regardless of any seat\'s ack state -- draining it does not cause a resend.';
}

/**
 * Fan out ONE directed INFO row per live seat, all sharing one run_id. Fail-soft per-seat --
 * one refused dispatch (unknown/dead target) is counted as skipped and never stops the batch.
 *
 * @param {object} supabase
 * @param {{coordinatorId:string, seats:Array<{session_id:string}>, used:number, cap:number, cleared?:boolean}} args
 * @returns {Promise<{written:number, skipped:number, run_id:string}>}
 */
async function emitToLiveSeats(supabase, { coordinatorId, seats, used, cap, cleared = false }) {
  const runId = crypto.randomUUID();
  let written = 0;
  let skipped = 0;
  const subject = cleared
    ? '[CAPPED_POOL_BROADCAST] worktree pool back under cap'
    : '[CAPPED_POOL_BROADCAST] worktree pool over cap — slot-free work available';
  const body = buildBroadcastBody({ used, cap, cleared });

  for (const seat of seats || []) {
    if (!seat || !seat.session_id) { skipped++; continue; }
    try {
      await dispatchToWorker(supabase, {
        message_type: 'INFO',
        target_session: seat.session_id,
        sender_session: coordinatorId,
        subject,
        body,
        payload: {
          kind: PAYLOAD_KINDS.CAPPED_POOL_BROADCAST,
          producer: coordinatorId,
          run_id: runId,
          pool_used: used,
          pool_cap: cap,
          cleared,
        },
      });
      written++;
    } catch (e) {
      console.log(`  (capped_pool_broadcast write skipped for ${seat.session_id}: ${e.message || e})`);
      skipped++;
    }
  }
  return { written, skipped, run_id: runId };
}

/**
 * Composed tick: read the pool census + live seats, decide, act, persist state.
 * Fail-soft throughout -- a census/liveness/dispatch failure must never throw out of a
 * coordinator sweep tick.
 *
 * @param {object} supabase
 * @param {{repoRoot:string, coordinatorId:string, used:number, cap:number, statePath?:string, nowMs?:number}} args
 *   `used`/`cap` are pre-computed by the caller (countActiveWorktrees/MAX_WORKTREE_COUNT are ESM
 *   exports of lib/worktree-quota.js -- the caller dynamic-imports them, this module stays CJS
 *   and pure of that concern per TR-3).
 * @returns {Promise<{action:string, written:number, skipped:number, run_id:string|null}>}
 */
async function tick(supabase, { repoRoot, coordinatorId, used, cap, statePath, seats } = {}) {
  const resolvedStatePath = statePath || defaultStatePath(repoRoot);
  const state = readState(resolvedStatePath);
  const decision = decide({ used, cap, state });

  if (decision.action === 'none') {
    writeState(resolvedStatePath, decision.nextState);
    return { action: 'none', written: 0, skipped: 0, run_id: null };
  }

  const liveSeats = seats || [];
  const result = await emitToLiveSeats(supabase, {
    coordinatorId,
    seats: liveSeats,
    used,
    cap,
    cleared: decision.action === 'notify_clear',
  });

  // Adversarial post-merge review (PR #8356, WARNING finding): a fan-out that reached NO seat
  // (every dispatch refused/errored) must not burn the re-emit/clear-notice window -- otherwise a
  // transient coordinator-resolution or dispatch fault silently suppresses the real notice for
  // the full window with no operator-visible signal. Revert the action-specific timestamp this
  // tick would have stamped so the NEXT tick retries immediately.
  let nextState = decision.nextState;
  if (result.written === 0) {
    if (decision.action === 'emit') {
      nextState = { ...nextState, last_emitted_at: state.last_emitted_at };
    } else if (decision.action === 'notify_clear') {
      nextState = { ...nextState, last_cleared_notice_at: state.last_cleared_notice_at };
    }
  }
  writeState(resolvedStatePath, nextState);
  return { action: decision.action, ...result };
}

module.exports = { decide, emitToLiveSeats, tick, readState, writeState, defaultStatePath, buildBroadcastBody };
