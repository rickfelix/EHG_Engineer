#!/usr/bin/env node
/**
 * Michael role register/verify
 * SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (Michael foundation, FR-2) — faithful copy-rename of
 * scripts/solomon-register.cjs (SD-LEO-INFRA-SOLOMON-CONSULT-001A), itself a copy-rename of adam-register.cjs.
 * Divergences from the Solomon precedent, each named in the PRD: (1) metadata.account_profile is stamped
 * at register (role seats never run worker-checkin.cjs, so nothing else would populate it — spec §1.3),
 * as a PROFILE NAME only (SECURITY evidence 2ca8b0ee); (2) the retired-prior inbox drain hooks
 * scripts/michael-inbox.cjs (child G) instead of an advisory script.
 *
 * Idempotently tags the CURRENT session in claude_sessions.metadata with
 * role=michael and non_fleet=true, so the coordinator's fleet accounting (worker
 * counts, ETA math, revival requests, claim-sweep targeting) excludes this
 * heartbeating-but-non-fleet advisory/analysis session.
 *
 * VERIFY-FIRST: the live Michael session already carried the tag set ad-hoc, so a
 * blind write would be wrong — we read current metadata and only update on diff,
 * otherwise report "verified" (no-op). JSONB merge preserves existing keys
 * (callsign, fleet_identity, etc.). No migration — metadata is free-form JSONB.
 *
 * Self-env-loading (reuses lib/supabase-client.cjs ancestor .env walk) so /michael
 * works without `node --env-file=.env`.
 *
 * IDENTITY (SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001 FR-4): this script always tags
 * whatever session_id is in process.env.CLAUDE_SESSION_ID as-is. If that value and a
 * post-compact SessionStart-hook id ever diverge for the same logical session, the
 * documented+tested resolution rule lives in lib/session-identity-sot.js
 * (checkAgreement/reconcileAtBoot, canonical-marker-wins, gated by
 * SESSION_IDENTITY_SOT_ENABLED and wired into scripts/hooks/session-register.cjs) —
 * intentionally NOT re-implemented here, so Adam/Michael never diverge from the
 * fleet-wide SSOT for session identity.
 *
 * Usage: node scripts/michael-register.cjs            (CLAUDE_SESSION_ID from env)
 *        npm run michael:register
 * Output: one JSON object { ok, action: tagged|verified|error, ... }.
 */

const fs = require('fs');
const path = require('path');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { resolveStateReadPath } = require('./hooks/lib/session-state-resolver.cjs');
// SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-3: shared with adam-register.cjs — one verdict
// implementation for both roles.
const { contractReadVerdict, contractLineCount, singleReadFit } = require('../lib/protocol/contract-read-coverage.cjs');
// Single-Michael guard + atomic write, mirroring solomon-register.cjs (SD-LEO-INFRA-SOLOMON-CONSULT-001A).
// fetchAllMichaelsStrict (not fetchFreshMichaels) so the guard sees stale priors too and classifies
// fresh-vs-stale itself (fresh => refuse; stale-only => retire). STRICT (FR-6, count-truncation
// discipline review): a FAILED prior read must REFUSE registration, never read as "no priors".
const { fetchAllMichaelsStrict, decideSingleMichaelGuard, isFresh, isFreshAndActive, MICHAEL_FRESH_MS } = require('../lib/coordinator/michael-identity.cjs');
// QF-20260905-201: same-host dead-process proof (see scripts/adam-register.cjs for the measured specimen).
const { isSeatProcessDead } = require('../lib/coordinator/role-seat-liveness.cjs');
// Phase E (not yet shipped): drainMichaelOutbound will live in scripts/michael-advisory.cjs.
// Loaded lazily at the call site so this module loads without michael-advisory.cjs present.

const MICHAEL_ROLE = 'michael';
const CONTRACT_FILE = 'CLAUDE_MICHAEL.md';

/** The literal meaning "no CLAUDE_CONFIG_DIR isolation" — mirrors lib/fleet/build-session-launch.cjs HOST_DEFAULT_PROFILE. */
const HOST_DEFAULT_PROFILE = 'host-default';
/** Mirrors lib/fleet/build-session-launch.cjs PROFILE_NAME_RE: a profile is a directory NAME, never a path. */
const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Pure: the account-profile NAME to stamp on this seat (FR-2). The basename of CLAUDE_CONFIG_DIR when
 * one is set and well-formed, else the 'host-default' sentinel. Never an email, a token, or a path —
 * a malformed value degrades to the sentinel rather than leaking the raw string. Exported for tests.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function resolveAccountProfileName(env = process.env) {
  const raw = env && typeof env.CLAUDE_CONFIG_DIR === 'string' ? env.CLAUDE_CONFIG_DIR.trim() : '';
  if (!raw) return HOST_DEFAULT_PROFILE;
  const name = path.basename(raw.replace(/[\\/]+$/, ''));
  return PROFILE_NAME_RE.test(name) ? name : HOST_DEFAULT_PROFILE;
}

/** Postgres/PostgREST signal that an RPC is not defined (the chairman-gated migration is unapplied). */
function isMissingFunctionError(error) {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  const msg = String(error.message || error.hint || '').toLowerCase();
  return /(set_michael_flag|clear_michael_flag)/.test(msg) && /not (found|exist)/.test(msg);
}

/** Atomic Michael-flag write via the RPC; fail-soft result (NEVER throws). */
async function writeMichaelFlagViaRpc(supabase, sessionId) {
  let res;
  try { res = await supabase.rpc('set_michael_flag', { p_session_id: sessionId }); }
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
function computeMichaelTag(current) {
  const meta = (current && typeof current === 'object' && !Array.isArray(current)) ? current : {};
  const alreadyTagged = meta.role === MICHAEL_ROLE && meta.non_fleet === true;
  const merged = { ...meta, role: MICHAEL_ROLE, non_fleet: true };
  return { alreadyTagged, merged };
}

/**
 * Register/verify the Michael tag for a session. Injectable supabase for tests.
 * Never throws — returns a structured result object.
 *
 * FR-1 (SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001): the single-Michael guard + atomic set_michael_flag
 * write-path is now UNCONDITIONAL (the ROLE_HANDOFF_MICHAEL_V1 flag and its legacy
 * computeMichaelTag JS-merge fallback were retired — the flag was permanently 'on' in every real
 * environment, so the "OFF" branch was dead code that only ever ran in tests). A session with NO
 * existing claude_sessions row is no longer an error: set_michael_flag creates the row (INSERT
 * ... ON CONFLICT), so a never-registered session is the common first-boot case, not a fault.
 */
async function registerMichael(supabase, sessionId, opts = {}) {
  if (!sessionId) {
    return { ok: false, action: 'error', error: 'CLAUDE_SESSION_ID env var required (set by the SessionStart hook).' };
  }
  let row = null;
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

  const nowMs = (opts && Number.isFinite(opts.nowMs)) ? opts.nowMs : Date.now();
  // ALL michaels (incl. stale) so the guard classifies. STRICT read (FR-6): a failed read must
  // REFUSE — treating it as "no priors" would let a 2nd Michael register past a fresh prior on a
  // transient DB fault (fail-closed, the safe direction for a singleton guard).
  const priorRead = await fetchAllMichaelsStrict(supabase);
  if (priorRead.error) {
    return { ok: false, action: 'refused', session_id: sessionId, fresh_priors: [],
      message: `Refused: prior-Michael freshness read failed (${priorRead.error}) — cannot verify the singleton is free; not registering (fail-closed).` };
  }
  const priorMichaels = priorRead.rows;
  const decision = decideSingleMichaelGuard({ priorMichaels, selfSessionId: sessionId, nowMs, isProcessDead: isSeatProcessDead });
  if (decision.action === 'refuse') {
    // A FRESH prior Michael holds the singleton — do NOT register a 2nd and do NOT clear the prior
    // (the deliberate divergence: never kill a legitimately-restarting Michael mid-canary).
    return { ok: false, action: 'refused', session_id: sessionId, fresh_priors: decision.freshPriors,
      message: `Refused: a fresh prior Michael (${decision.freshPriors.join(', ')}) holds the singleton — not registering a 2nd. ${decision.reason}` };
  }
  // REGISTER-BEFORE-RETIRE (mirror sibling A's coordinator setActiveCoordinator ordering): claim the
  // singleton FIRST so there is never a zero-Michael window, THEN retire stale priors.
  const wrote = await writeMichaelFlagViaRpc(supabase, sessionId);
  let action = null;
  let fallbackReason = null;
  if (wrote.persisted) {
    action = 'tagged';
  } else {
    // Fail-soft: the chairman-gated migration is unapplied (or a transient RPC error). Fall back to a
    // JS merge (+ michael_since). INSERT (not update) when the row is absent — update().eq() on a
    // non-existent row matches zero rows and silently no-ops instead of creating one.
    const mergedMichael = { ...((row && row.metadata && typeof row.metadata === 'object') ? row.metadata : {}), role: MICHAEL_ROLE, non_fleet: true, michael_since: new Date(nowMs).toISOString() };
    try {
      const { error } = row
        ? await supabase.from('claude_sessions').update({ metadata: mergedMichael }).eq('session_id', sessionId)
        : await supabase.from('claude_sessions').insert({ session_id: sessionId, metadata: mergedMichael });
      if (error) return { ok: false, action: 'error', error: error.message };
    } catch (e) { return { ok: false, action: 'error', error: e.message }; }
    action = 'tagged_fallback';
    fallbackReason = wrote.reason;
  }

  // QF-20260727-909: stamp model/effort on this role session. CHAIRMAN-REPORTED — the sessions
  // page rendered adam/michael as '--/--' PERMANENTLY, because the only two writers of
  // metadata.model are the SessionStart hook (stamps only when stdin carries a model) and
  // worker-checkin's --model self-report, which ONLY workers run. A non_fleet role session runs
  // neither, so no path would EVER populate it. Distinct from the neighbouring account column,
  // where a blank self-heals on restart; this one does not.
  //
  // Reuses the worker path's EXISTING writer rather than adding a third. The QF asked to
  // establish how the coordinator gets a stamp before inventing one — measured: its
  // effort_source reads 'worker_self_report', i.e. it has no special role-stamping path, it
  // simply runs the worker check-in. So there was nothing to copy, only this writer to share.
  //
  // Placed AFTER the role tag is persisted and OUTSIDE the RPC/fallback branch, deliberately:
  // the set_michael_flag RPC is the PRIMARY path and the JS merge only its fail-soft, so
  // stamping inside the fallback would become dead code the moment the chairman-approved
  // migration lands.
  //
  // Fail-soft throughout — a missing model stamp must never block role registration.
  try {
    const { parseCheckinArgs, mergeCheckinModelEffort } = require('./worker-checkin.cjs');
    const { model, effort } = parseCheckinArgs(process.argv.slice(2));
    if (model || effort) {
      const { data: cur } = await supabase.from('claude_sessions')
        .select('metadata').eq('session_id', sessionId).maybeSingle();
      const { metadata: stamped, changed } = mergeCheckinModelEffort(cur?.metadata || {}, { model, effort });
      if (changed) {
        await supabase.from('claude_sessions').update({ metadata: stamped }).eq('session_id', sessionId);
      }
    }
  } catch { /* never block registration on a stamp */ }

  // SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A FR-2 (spec §1.3, acceptance test "account independence"):
  // stamp metadata.account_profile so the michael-account-independence gauge (child G) can count
  // consecutive registrations on one profile. Role seats never run worker-checkin.cjs, which is
  // the only other place a profile could land, so this is the sole writer for Michael. NAME ONLY
  // (SECURITY evidence 2ca8b0ee, high): the basename of CLAUDE_CONFIG_DIR, or the literal
  // 'host-default' sentinel when no isolation dir is set (lib/fleet/build-session-launch.cjs
  // HOST_DEFAULT_PROFILE) — never resolveAccountFromConfigDir output, which carries the account
  // email that claude_sessions' authenticated_select policy exposes to every authenticated reader.
  // Read-modify-merge on the live row; fail-soft — a missing stamp must never block registration.
  try {
    const profile = resolveAccountProfileName((opts && opts.env) || process.env);
    const { data: cur } = await supabase.from('claude_sessions')
      .select('metadata').eq('session_id', sessionId).maybeSingle();
    const curMeta = (cur && cur.metadata && typeof cur.metadata === 'object') ? cur.metadata : {};
    if (curMeta.account_profile !== profile) {
      await supabase.from('claude_sessions').update({ metadata: { ...curMeta, account_profile: profile } }).eq('session_id', sessionId);
    }
  } catch { /* never block registration on a stamp */ }
  // Retire stale priors — but RE-VALIDATE freshness right before clearing each, so a prior that
  // became fresh since the decision (a racing restart) is NEVER cleared (the deliberate divergence
  // holds even under a race). Residual: two simultaneous STALE restarts can both register briefly.
  // NOTE (adversarial review, SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001): unlike adam-register.cjs's
  // parallel loop (QF-20260703-883), this loop has NO JS-merge fallback when clear_michael_flag
  // errors/is absent — a failed clear silently leaves that prior tagged role=michael forever, with
  // no detector backstop (no MULTIPLE_MICHAELS detector exists in lib/coordinator/detectors.cjs,
  // unlike MULTIPLE_ADAMS). Tracked as a follow-up (see this SD's retrospective action items) to
  // bring this loop to parity with adam-register.cjs rather than silently claiming a backstop that
  // does not exist.
  const retired = [];
  if (decision.retire.length) {
    // Injectable (defaults to a fresh Date.now() read, unchanged production behavior) so tests can
    // control the elapsed-time gap between the initial decision and this re-validation, mirroring
    // adam-register.cjs's opts.nowMs2 (ADVERSARIAL REVIEW, PR #7369).
    const nowMs2 = (opts && Number.isFinite(opts.nowMs2)) ? opts.nowMs2 : Date.now();
    // STRICT re-check (FR-6): if the freshness re-validation read fails, SKIP retiring — clearing
    // a prior based on a failed read could kill a legitimately-restarting Michael. Priors left
    // tagged are swept later (same best-effort posture as a failed clear below).
    const currentRead = await fetchAllMichaelsStrict(supabase);
    if (currentRead.error) {
      console.warn(`GUARD_UNAVAILABLE: stale-prior Michael retire skipped — freshness re-check failed (${currentRead.error})`);
    } else {
      // QF-20260822-719: isFresh(heartbeatAt, nowMs, freshMs) has no default for freshMs — the
      // missing 3rd arg made this always false (identical class fixed in adam-register.cjs).
      //
      // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (FR-3, REVISED after implementation-time measurement,
      // then AGAIN after F-7, evidence d9d88102-2dfe-49bb-b319-887db2b361bd): this PRD originally
      // proposed ORing in lib/fleet/genuine-worker.mjs's isKnownWedged here; measured wrong. A
      // SECOND, deeper defect was then found by end-to-end probing: decision.retire can contain a
      // session with a STILL-FRESH heartbeat -- decideSingleMichaelGuard's FR-2 fix excludes a
      // heartbeat-fresh-but-tool-STUCK prior from `fresh`, placing it in `retire` for a TOOL
      // ACTIVITY reason, not a heartbeat reason. Re-checking such an entry's heartbeat here would
      // ALWAYS find it fresh (that is the defining property of a heartbeating shell) and skip it
      // FOREVER, leaving a confirmed-dead session permanently role-tagged. See the identical,
      // longer rationale in scripts/adam-register.cjs. decision.retireToolStuck (FR-2) names these
      // entries so they can be re-validated on tool activity instead of heartbeat.
      const bySessionId = new Map(currentRead.rows.map((a) => [a.session_id, a]));
      const freshNow = new Set(currentRead.rows.filter((a) => isFresh(a.heartbeat_at, nowMs2, MICHAEL_FRESH_MS)).map((a) => a.session_id));
      const toolStuckSet = new Set(decision.retireToolStuck || []);
      // QF-20260905-201: dead-process entries re-validate on the PROCESS, never heartbeat (frozen fresh).
      const deadProcessSet = new Set(decision.retireDeadProcess || []);
      const deadProcessStillDead = new Set(
        (decision.retireDeadProcess || []).filter((sid) => isSeatProcessDead(bySessionId.get(sid))),
      );
      const toolStuckRacedBack = new Set(
        (decision.retireToolStuck || []).filter((sid) => {
          const row = bySessionId.get(sid);
          return row && isFreshAndActive(row, nowMs2, MICHAEL_FRESH_MS);
        }),
      );
      for (const sid of decision.retire) {
        const skip = deadProcessSet.has(sid)
          ? !deadProcessStillDead.has(sid)
          : (toolStuckSet.has(sid) ? toolStuckRacedBack.has(sid) : freshNow.has(sid));
        if (skip) continue; // became fresh since the decision — do NOT clear a restarting Michael
        const r = await supabase.rpc('clear_michael_flag', { p_session_id: sid }).then((x) => x, (e) => ({ error: e }));
        if (!(r && r.error)) retired.push(sid); // best-effort: a failed stale-clear is swept later
      }
    }
  }
  if (retired.length) action = action === 'tagged_fallback' ? 'tagged_after_retire_fallback' : 'tagged_after_retire';
  // Re-target the retired prior Michael(s)' unread inbound to this new session (comms survive the
  // handoff). Fail-open + idempotent; a drain error never fails the registration.
  // scripts/michael-inbox.cjs ships in child G (spec §1.2); drain is best-effort until then.
  let drained = 0;
  if (retired.length) {
    try {
      const { drainMichaelOutbound } = require('./michael-inbox.cjs');
      const d = await drainMichaelOutbound(supabase, { newSessionId: sessionId, oldSessionIds: retired });
      drained = (d && d.moved) || 0;
    } catch { /* michael-inbox.cjs ships in child G; drain is best-effort until then */ }
  }

  // FR-2: mandatory fail-loud readback. A write that silently didn't land (RLS, CHECK constraint,
  // enum mismatch — supabase-js .update()/.insert() do not throw on these) must never be reported
  // as ok:true; verify the tag is actually on the row before declaring success.
  let readbackMeta;
  try {
    const { data, error } = await supabase.from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
    if (error) return { ok: false, action: 'error', error: `readback failed after registration write (action=${action}): ${error.message}` };
    readbackMeta = data && data.metadata;
  } catch (e) {
    return { ok: false, action: 'error', error: `readback failed after registration write (action=${action}): ${e.message}` };
  }
  if (!readbackMeta || readbackMeta.role !== MICHAEL_ROLE || readbackMeta.non_fleet !== true) {
    return { ok: false, action: 'error', error: `readback verification failed after registration write (action=${action}): tag not confirmed on the row.` };
  }

  return { ok: true, action, session_id: sessionId, role: MICHAEL_ROLE, non_fleet: true, retired, drained,
    retired_dead_process: (decision.retireDeadProcess || []).filter((sid) => retired.includes(sid)),
    message: `Registered as the single Michael${retired.length ? ` (retired stale prior(s): ${retired.join(', ')}; re-targeted ${drained} inbound row(s))` : ''}${fallbackReason ? ` — fail-soft JS merge (set_michael_flag RPC ${fallbackReason}; apply the chairman-gated migration for atomic writes)` : ' via atomic set_michael_flag'}.` };
}

/**
 * Contract-read verification (chairman directive 2026-06-10): confirm CLAUDE_MICHAEL.md
 * was read THIS session, via the same session-state the protocol-file-tracker hook
 * writes for CLAUDE_LEAD/PLAN/EXEC (CLAUDE_MICHAEL.md is in its PROTOCOL_FILES list).
 * NEVER blocks the tag write — an untagged Michael re-enters fleet accounting (worker
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
      // SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-3 — identical fix to adam-register.cjs, from
      // one shared implementation. This path had NO test coverage at all before this SD, which is
      // part of why the inversion survived here as long as it did.
      const fit = singleReadFit(root, CONTRACT_FILE);
      const verdict = contractReadVerdict(status, contractLineCount(root, CONTRACT_FILE), { singleReadFit: fit });
      result.contract_read = verdict.read;
      // FR-2 (SD-LEO-INFRA-CONTRACT-READ-FIT-001): assert PARTIAL only on POSITIVE disproof of a full
      // read, OR when the contract is CONFIDENTLY over the single-read cap (fit.fits === false) and the
      // read was not confirmed full. A near-cap MARGINAL prediction (fit.fits === null) with no disproof
      // reads "unconfirmed" — this is the exact false PARTIAL every /michael full read used to emit.
      result.contract_read_partial = verdict.confirmed_partial === true
        || (fit.fits === false && verdict.fully_read !== true);
      result.contract_coverage_pct = verdict.coverage_pct;
      result.contract_read_basis = verdict.basis;
      result.contract_last_read_at = status.lastReadAt || null;
    } else if (Array.isArray(state.protocolFilesRead) && state.protocolFilesRead.includes(CONTRACT_FILE)) {
      // Legacy pre-FR-2 state shape: a bare filename list carrying no coverage information at all.
      // Sufficient ONLY when the contract fits in a single Read. For an over-cap contract it cannot
      // distinguish a full read from a silently truncated one, which is the defect this SD closes.
      // Measured on TOKENS, not bytes: the byte proxy this replaced disarmed CLAUDE_MICHAEL.md
      // (67,501 B but only 15,965 tokens) even though it reads in one call.
      // A bare filename list carries no coverage evidence, so the fit prediction is the only signal.
      // Assert PARTIAL only when the contract is CONFIDENTLY over-cap (fits === false); a marginal
      // (null) or fitting (true) prediction cannot support a partial assertion (FR-2).
      const fit = singleReadFit(root, CONTRACT_FILE);
      result.contract_read = true;
      result.contract_read_partial = fit.fits === false;
      result.contract_read_basis = fit.fits === true ? 'legacy_array_single_read_safe'
        : fit.fits === false ? 'legacy_array_no_evidence' : 'legacy_array_marginal_unconfirmed';
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
  const lines = ['═══ MICHAEL ROLE CONTRACT — READ REQUIRED ═══'];
  if (!check.contract_exists) {
    lines.push(`  ✗ ${CONTRACT_FILE} not found — regenerate: node scripts/generate-claude-md-from-db.js`);
  } else if (!check.contract_read) {
    lines.push(`  ✗ No record of ${CONTRACT_FILE} being read this session.`);
  } else {
    lines.push(`  ⚠ Last read of ${CONTRACT_FILE} was PARTIAL (offset/limit used).`);
  }
  lines.push(`  → Read ${CONTRACT_FILE} IN FULL (Read tool, no offset/limit) BEFORE any Michael work.`);
  lines.push('  (Registration is not blocked — the tag must always land — but the contract read is mandatory.)');
  return lines.join('\n');
}

// The inbox mirror printed on /michael startup so the seat discovers its drain path without
// reverse-engineering the channel (spec §1.2 and §1.4: Michael's inbound is the michael_handoff
// kind, drained by scripts/michael-inbox.cjs; Michael never sends advisories — silent outside a
// chairman-initiated exchange). Printed to STDERR so the stdout JSON contract stays pure.
// Pure + exported for tests.
function michaelReplyMirror() {
  return [
    '═══ MICHAEL INBOX (michael_handoff rows + coordinator directives) ═══',
    '  • DRAIN your inbox:  node scripts/michael-inbox.cjs   (quiet-tick form: --quiet)',
    '  • Michael SENDS nothing to the fleet: fleet-class items reach Adam as chairman_handoff rows',
    '    with origin michael, batched once per morning by the feeders (spec §1.2).',
    '  (michael-inbox.cjs ships in child G; until then the drain is a documented no-op.)',
  ].join('\n');
}

// ── Clean shutdown — Windows libuv UV_HANDLE_CLOSING avoidance ────────────────
// registerMichael opens an undici/fetch keep-alive socket (Supabase). Calling
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
  const result = await registerMichael(supabase, sessionId);
  // SD-LEO-INFRA-SOLOMON-CONSULT-001A: give this Michael session a stable status-line NAME.
  // Fail-soft — a naming failure must never block registration.
  if (result.ok) {
    try {
      const { writeRoleStatusIdentity } = require('../lib/fleet/role-status-identity.cjs');
      writeRoleStatusIdentity({ sessionId, role: MICHAEL_ROLE });
    } catch { /* status-line naming is best-effort */ }
  }
  const contractCheck = checkContractRead();
  console.log(JSON.stringify({ ...result, ...contractCheck }, null, 2));
  const banner = contractReadBanner(contractCheck);
  if (banner) console.error(banner);
  console.error(michaelReplyMirror());
  return shutdown(result.ok ? 0 : 1);
}

module.exports = { computeMichaelTag, registerMichael, michaelReplyMirror, checkContractRead, contractReadBanner, resolveAccountProfileName, HOST_DEFAULT_PROFILE, MICHAEL_ROLE, CONTRACT_FILE, isMissingFunctionError, writeMichaelFlagViaRpc };

if (require.main === module) {
  main().catch(err => {
    console.log(JSON.stringify({ ok: false, action: 'error', error: err.message || String(err) }, null, 2));
    shutdown(1);
  });
}
