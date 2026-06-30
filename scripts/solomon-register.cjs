#!/usr/bin/env node
/**
 * Solomon role register/verify
 * SD-LEO-INFRA-SOLOMON-CONSULT-001A (Solomon foundation) — faithful copy-rename of adam-register.cjs
 *
 * Idempotently tags the CURRENT session in claude_sessions.metadata with
 * role=solomon and non_fleet=true, so the coordinator's fleet accounting (worker
 * counts, ETA math, revival requests, claim-sweep targeting) excludes this
 * heartbeating-but-non-fleet advisory/analysis session.
 *
 * VERIFY-FIRST: the live Solomon session already carried the tag set ad-hoc, so a
 * blind write would be wrong — we read current metadata and only update on diff,
 * otherwise report "verified" (no-op). JSONB merge preserves existing keys
 * (callsign, fleet_identity, etc.). No migration — metadata is free-form JSONB.
 *
 * Self-env-loading (reuses lib/supabase-client.cjs ancestor .env walk) so /solomon
 * works without `node --env-file=.env`.
 *
 * Usage: node scripts/solomon-register.cjs            (CLAUDE_SESSION_ID from env)
 *        npm run solomon:register
 * Output: one JSON object { ok, action: tagged|verified|error, ... }.
 */

const fs = require('fs');
const path = require('path');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { resolveStateReadPath } = require('./hooks/lib/session-state-resolver.cjs');
// SD-LEO-INFRA-SOLOMON-CONSULT-001A (Solomon foundation) — faithful copy-rename of adam-register.cjs: single-Solomon guard + atomic write.
// fetchAllSolomons (not fetchFreshSolomons) so the guard sees stale priors too and classifies fresh-vs-
// stale itself (fresh => refuse; stale-only => retire).
const { fetchAllSolomons, decideSingleSolomonGuard, isFresh } = require('../lib/coordinator/solomon-identity.cjs');
// Phase E (not yet shipped): drainSolomonOutbound will live in scripts/solomon-advisory.cjs.
// Loaded lazily at the call site so this module loads without solomon-advisory.cjs present.

const SOLOMON_ROLE = 'solomon';
const CONTRACT_FILE = 'CLAUDE_SOLOMON.md';

/** Phase A flag (default-OFF): when 'on', the single-Solomon guard + atomic set_solomon_flag write-path runs.
 *  OFF => the legacy computeSolomonTag + JS-merge register path is BYTE-IDENTICAL to before. */
function isSolomonHandoffV1Enabled() {
  return process.env.ROLE_HANDOFF_SOLOMON_V1 === 'on';
}

/** Postgres/PostgREST signal that an RPC is not defined (the chairman-gated migration is unapplied). */
function isMissingFunctionError(error) {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  const msg = String(error.message || error.hint || '').toLowerCase();
  return /(set_solomon_flag|clear_solomon_flag)/.test(msg) && /not (found|exist)/.test(msg);
}

/** Atomic Solomon-flag write via the RPC; fail-soft result (NEVER throws). */
async function writeSolomonFlagViaRpc(supabase, sessionId) {
  let res;
  try { res = await supabase.rpc('set_solomon_flag', { p_session_id: sessionId }); }
  catch (e) { return isMissingFunctionError(e) ? { persisted: false, reason: 'rpc_absent' } : { persisted: false, reason: 'error', error: e && e.message }; }
  const error = res && res.error;
  if (error) return isMissingFunctionError(error) ? { persisted: false, reason: 'rpc_absent' } : { persisted: false, reason: 'error', error: error.message };
  return { persisted: true };
}

/**
 * Pure: given current metadata, decide whether a write is needed and produce the
 * merged metadata. Exported for unit testing (no DB).
 * @param {object|null} current - existing claude_sessions.metadata
 * @returns {{ alreadyTagged: boolean, merged: object }}
 */
function computeSolomonTag(current) {
  const meta = (current && typeof current === 'object' && !Array.isArray(current)) ? current : {};
  const alreadyTagged = meta.role === SOLOMON_ROLE && meta.non_fleet === true;
  const merged = { ...meta, role: SOLOMON_ROLE, non_fleet: true };
  return { alreadyTagged, merged };
}

/**
 * Register/verify the Solomon tag for a session. Injectable supabase for tests.
 * Never throws — returns a structured result object.
 */
async function registerSolomon(supabase, sessionId, opts = {}) {
  if (!sessionId) {
    return { ok: false, action: 'error', error: 'CLAUDE_SESSION_ID env var required (set by the SessionStart hook).' };
  }
  let row;
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) return { ok: false, action: 'error', error: error.message };
    row = data;
  } catch (e) {
    return { ok: false, action: 'error', error: e.message };
  }
  if (!row) {
    return { ok: false, action: 'error', error: `session ${sessionId} not found in claude_sessions (is the SessionStart register hook run?).` };
  }

  // SD-LEO-INFRA-SOLOMON-CONSULT-001A (Solomon foundation) — faithful copy-rename of adam-register.cjs: flag-ON runs the single-Solomon guard +
  // atomic set_solomon_flag write-path. Flag-OFF falls through to the legacy path below (byte-identical).
  if (isSolomonHandoffV1Enabled()) {
    const nowMs = (opts && Number.isFinite(opts.nowMs)) ? opts.nowMs : Date.now();
    const priorSolomons = await fetchAllSolomons(supabase); // ALL solomons (incl. stale) so the guard classifies
    const decision = decideSingleSolomonGuard({ priorSolomons, selfSessionId: sessionId, nowMs });
    if (decision.action === 'refuse') {
      // A FRESH prior Solomon holds the singleton — do NOT register a 2nd and do NOT clear the prior
      // (the deliberate divergence: never kill a legitimately-restarting Solomon mid-canary).
      return { ok: false, action: 'refused', session_id: sessionId, fresh_priors: decision.freshPriors,
        message: `Refused: a fresh prior Solomon (${decision.freshPriors.join(', ')}) holds the singleton — not registering a 2nd. ${decision.reason}` };
    }
    // REGISTER-BEFORE-RETIRE (mirror sibling A's coordinator setActiveCoordinator ordering): claim the
    // singleton FIRST so there is never a zero-Solomon window, THEN retire stale priors.
    const wrote = await writeSolomonFlagViaRpc(supabase, sessionId);
    let action = null;
    let fallbackReason = null;
    if (wrote.persisted) {
      action = 'tagged';
    } else {
      // Fail-soft: the chairman-gated migration is unapplied (or a transient RPC error). Fall back
      // to the legacy JS merge (+ solomon_since) — no worse than flag-OFF; atomic safety lands on apply.
      const mergedSolomon = { ...((row.metadata && typeof row.metadata === 'object') ? row.metadata : {}), role: SOLOMON_ROLE, non_fleet: true, solomon_since: new Date(nowMs).toISOString() };
      try {
        const { error } = await supabase.from('claude_sessions').update({ metadata: mergedSolomon }).eq('session_id', sessionId);
        if (error) return { ok: false, action: 'error', error: error.message };
      } catch (e) { return { ok: false, action: 'error', error: e.message }; }
      action = 'tagged_fallback';
      fallbackReason = wrote.reason;
    }
    // Retire stale priors — but RE-VALIDATE freshness right before clearing each, so a prior that
    // became fresh since the decision (a racing restart) is NEVER cleared (the deliberate divergence
    // holds even under a race). Residual: two simultaneous STALE restarts can both register briefly
    // — surfaced by the MULTIPLE_SOLOMONS detector + refused on the next register (eventual convergence).
    const retired = [];
    if (decision.retire.length) {
      const nowMs2 = Date.now();
      const current = await fetchAllSolomons(supabase);
      const freshNow = new Set(current.filter((a) => isFresh(a.heartbeat_at, nowMs2)).map((a) => a.session_id));
      for (const sid of decision.retire) {
        if (freshNow.has(sid)) continue; // became fresh since the decision — do NOT clear a restarting Solomon
        const r = await supabase.rpc('clear_solomon_flag', { p_session_id: sid }).then((x) => x, (e) => ({ error: e }));
        if (!(r && r.error)) retired.push(sid); // best-effort: a failed stale-clear is swept later
      }
    }
    if (retired.length) action = action === 'tagged_fallback' ? 'tagged_after_retire_fallback' : 'tagged_after_retire';
    // Phase E: re-target the retired prior Solomon(s)' unread inbound to this new session (comms survive
    // the handoff). Fail-open + idempotent; a drain error never fails the registration.
    // solomon-advisory.cjs ships in Phase E; drain is best-effort until then.
    let drained = 0;
    if (retired.length) {
      try {
        const { drainSolomonOutbound } = require('./solomon-advisory.cjs');
        const d = await drainSolomonOutbound(supabase, { newSessionId: sessionId, oldSessionIds: retired });
        drained = (d && d.moved) || 0;
      } catch { /* solomon-advisory.cjs ships in Phase E; drain is best-effort until then */ }
    }
    return { ok: true, action, session_id: sessionId, role: SOLOMON_ROLE, non_fleet: true, retired, drained,
      message: `Registered as the single Solomon${retired.length ? ` (retired stale prior(s): ${retired.join(', ')}; re-targeted ${drained} inbound row(s))` : ''}${fallbackReason ? ` — fail-soft JS merge (set_solomon_flag RPC ${fallbackReason}; apply the chairman-gated migration for atomic writes)` : ' via atomic set_solomon_flag'}.` };
  }

  const { alreadyTagged, merged } = computeSolomonTag(row.metadata);
  if (alreadyTagged) {
    return { ok: true, action: 'verified', session_id: sessionId, role: SOLOMON_ROLE, non_fleet: true, message: 'Session already tagged role=solomon, non_fleet=true (verified, no change).' };
  }
  try {
    const { error } = await supabase.from('claude_sessions').update({ metadata: merged }).eq('session_id', sessionId);
    if (error) return { ok: false, action: 'error', error: error.message };
  } catch (e) {
    return { ok: false, action: 'error', error: e.message };
  }
  return { ok: true, action: 'tagged', session_id: sessionId, role: SOLOMON_ROLE, non_fleet: true, message: 'Session tagged role=solomon, non_fleet=true (excluded from fleet accounting).' };
}

/**
 * Contract-read verification (chairman directive 2026-06-10): confirm CLAUDE_SOLOMON.md
 * was read THIS session, via the same session-state the protocol-file-tracker hook
 * writes for CLAUDE_LEAD/PLAN/EXEC (CLAUDE_SOLOMON.md is in its PROTOCOL_FILES list).
 * NEVER blocks the tag write — an untagged Solomon re-enters fleet accounting (worker
 * counts, revival pings, claim-sweep targeting), which is the worse failure mode.
 * The verdict rides the JSON output; the banner makes the obligation loud.
 * Pure file-reads, never throws. Exported for tests.
 * @param {string} [projectDir]
 * @returns {{ contract_file: string, contract_exists: boolean, contract_read: boolean,
 *             contract_read_partial: boolean, contract_last_read_at: string|null }}
 */
function checkContractRead(projectDir) {
  const result = {
    contract_file: CONTRACT_FILE,
    contract_exists: false,
    contract_read: false,
    contract_read_partial: false,
    contract_last_read_at: null,
  };
  try {
    const root = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    result.contract_exists = fs.existsSync(path.join(root, CONTRACT_FILE));
    const statePath = resolveStateReadPath(root);
    if (!fs.existsSync(statePath)) return result;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^﻿/, ''));
    const status = state.protocolFileReadStatus && state.protocolFileReadStatus[CONTRACT_FILE];
    if (status && status.readCount > 0) {
      result.contract_read = true;
      result.contract_read_partial = status.lastReadWasPartial === true;
      result.contract_last_read_at = status.lastReadAt || null;
    } else if (Array.isArray(state.protocolFilesRead) && state.protocolFilesRead.includes(CONTRACT_FILE)) {
      result.contract_read = true; // legacy-array fallback (pre-FR-2 state shape)
    }
  } catch { /* fail-open: tracking unavailable must never break role activation */ }
  return result;
}

/**
 * Pure: the stderr banner for a missing/partial contract read, or null when satisfied.
 * @param {ReturnType<typeof checkContractRead>} check
 * @returns {string|null}
 */
function contractReadBanner(check) {
  if (check.contract_read && !check.contract_read_partial) return null;
  const lines = ['═══ SOLOMON ROLE CONTRACT — READ REQUIRED ═══'];
  if (!check.contract_exists) {
    lines.push(`  ✗ ${CONTRACT_FILE} not found — regenerate: node scripts/generate-claude-md-from-db.js`);
  } else if (!check.contract_read) {
    lines.push(`  ✗ No record of ${CONTRACT_FILE} being read this session.`);
  } else {
    lines.push(`  ⚠ Last read of ${CONTRACT_FILE} was PARTIAL (offset/limit used).`);
  }
  lines.push(`  → Read ${CONTRACT_FILE} IN FULL (Read tool, no offset/limit) BEFORE any Solomon work.`);
  lines.push('  (Registration is not blocked — the tag must always land — but the contract read is mandatory.)');
  return lines.join('\n');
}

// Phase E (SD-LEO-INFRA-SOLOMON-CONSULT-001A): the consume-reply mirror printed on
// /solomon startup so Solomon discovers the durable reply path without reverse-engineering the
// channel. Mirrors the coordinator-side renderSolomonLane() in coordinator-startup-check.mjs.
// Printed to STDERR so the stdout JSON contract stays pure. Pure + exported for tests.
function solomonReplyMirror() {
  return [
    '═══ SOLOMON ↔ COORDINATOR COMMS (consume-reply path) ═══',
    '  • SEND advisory (fire-and-forget, replyable):  node scripts/solomon-advisory.cjs send "<body>"',
    '  • REQUEST (await a sync reply):  node scripts/solomon-advisory.cjs request "<question>" [--timeout <ms>]',
    '  • DRAIN your full inbox (replies + coordinator directives):  node scripts/solomon-advisory.cjs inbox',
    '  (solomon-advisory.cjs ships in Phase E; canonical doc: docs/protocol/coordinator-solomon-comms.md)',
  ].join('\n');
}

// ── Clean shutdown — Windows libuv UV_HANDLE_CLOSING avoidance ────────────────
// registerSolomon opens an undici/fetch keep-alive socket (Supabase). Calling
// process.exit() afterward aborts on Windows ("Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING), src\win\async.c:76") — empirically even after a deferred
// exit or dispatcher.close() followed by exit(). The only reliable avoidance is to
// NOT call process.exit(): set process.exitCode, close undici's sockets, and let
// the event loop drain. Same contract as the Stop hooks (see
// scripts/hooks/__tests__/stop-hook-uv-handle-closing.test.js).
let _shuttingDown = false;
async function shutdown(code) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  process.exitCode = code;
  // Backstop only: unref'd so it never delays a clean natural exit.
  setTimeout(() => process.exit(code), 8000).unref();
  try { await require('undici').getGlobalDispatcher().close(); } catch { /* undici absent/already closed */ }
  // Deliberately NO process.exit() — returning lets Node exit once the loop drains.
}

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, action: 'error', error: `supabase client unavailable: ${e.message}` }, null, 2));
    return shutdown(1);
  }
  const result = await registerSolomon(supabase, sessionId);
  // SD-LEO-INFRA-SOLOMON-CONSULT-001A: give this Solomon session a stable status-line NAME.
  // Fail-soft — a naming failure must never block registration.
  if (result.ok) {
    try {
      const { writeRoleStatusIdentity } = require('../lib/fleet/role-status-identity.cjs');
      writeRoleStatusIdentity({ sessionId, role: SOLOMON_ROLE });
    } catch { /* status-line naming is best-effort */ }
  }
  const contractCheck = checkContractRead();
  console.log(JSON.stringify({ ...result, ...contractCheck }, null, 2));
  const banner = contractReadBanner(contractCheck);
  if (banner) console.error(banner);
  console.error(solomonReplyMirror());
  return shutdown(result.ok ? 0 : 1);
}

module.exports = { computeSolomonTag, registerSolomon, solomonReplyMirror, checkContractRead, contractReadBanner, SOLOMON_ROLE, CONTRACT_FILE, isSolomonHandoffV1Enabled, isMissingFunctionError, writeSolomonFlagViaRpc };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    shutdown(1);
  });
}
