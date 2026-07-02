#!/usr/bin/env node
/**
 * Solomon advisory comms lane (Phase E1 — SD-LEO-INFRA-SOLOMON-CONSULT-001E-A).
 *
 * Mirrors scripts/adam-advisory.cjs structurally to give the SOLOMON deep-reasoning oracle a
 * dedicated lane: drains `solomon_consult` requests directed at the canonical Solomon session and
 * emits answers as advisories. An answer is a session_coordination row, message_type=INFO +
 * payload.kind=adam_advisory (so the existing advisory-inbox plumbing surfaces it) + payload.oracle=true
 * (the Solomon marker) and NO payload.signal_type / intent_action (so the friction router + the
 * deconfliction sweep never scoop it). reply_to + correlation_id are echoed so the asking side pairs
 * the answer to its consult.
 *
 * Builds ON (does NOT duplicate) the Phase A-D Solomon infrastructure: reuses
 * lib/coordinator/solomon-identity.cjs (getActiveSolomonId), lib/coordinator/dispatch.cjs
 * (insertCoordinationRow), scripts/worker-signal.cjs (redact/BODY_HARD_CAP/awaitCoordinatorReply),
 * lib/coordinator/resolve.cjs (getActiveCoordinatorId/isTwoWayV2Enabled). Exports drainSolomonOutbound
 * to satisfy the existing solomon-register.cjs lazy-require. No migration.
 *
 * NET-NEW guards Adam's lane lacks (the oracle is expensive, so it must self-limit):
 *   - a dedup cache: never re-answer the same consult (durable: an advisory already echoing the
 *     consult's correlation; plus an in-sweep Set);
 *   - a per-SD and per-day quota on emitted answers;
 *   - a HARD per-sweep task_budget ceiling (count / wall-clock / token) enforced at sweep ENTRY,
 *     BEFORE any Read/Grep, so a runaway sweep is stopped before it spends.
 *
 * Usage:
 *   node scripts/solomon-advisory.cjs send "<advisory body>" [--reply-to <correlation_or_row_id>]
 *   node scripts/solomon-advisory.cjs request "<question>" [--timeout 30000]   (needs COORDINATOR_TWOWAY_V2=on)
 *   node scripts/solomon-advisory.cjs inbox [--quiet]                          (the recurring inbox-monitor tick)
 *
 * SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: `send`/`request` accept `--to adam` for a
 * DIRECT 1-hop write to Adam's own session (no coordinator relay hop), gated by
 * ADAM_SOLOMON_TWOWAY_V1=on (default OFF). Omitting --to is byte-identical unchanged behavior — the
 * existing coordinator-relay path is the permanent fallback, never removed.
 */

const crypto = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { redact, BODY_HARD_CAP, awaitCoordinatorReply } = require('./worker-signal.cjs');
const { getActiveCoordinatorId, isTwoWayV2Enabled, isAdamSolomonTwoWayV1Enabled } = require('../lib/coordinator/resolve.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { PAYLOAD_KINDS, DIRECTIVE_KINDS } = require('../lib/fleet/worker-status.cjs');
const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');
const { getActiveAdamId } = require('../lib/coordinator/adam-identity.cjs');
// SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: sender-stamped reply_class SSOT.
const {
  REPLY_CLASSES, isValidReplyClass, computeReplyExpectedBy, checkAndPingOverdueReplies,
  alreadyAnswered: sharedAlreadyAnswered,
} = require('../lib/coordinator/reply-class.cjs');
// SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 — same shared presence/read-receipt/working-signal
// lane Adam wires (lib/coordinator/presence-grounding-signals.cjs) — no per-role reimplementation.
const { getFleetPresence, getReadReceipts, getWorkingSignal } = require('../lib/coordinator/presence-grounding-signals.cjs');
const { writeWorkingSignal } = require('../lib/coordinator/working-signal-store.cjs');

// The consult kind the Solomon lane drains (a deep-reasoning request routed to the oracle).
const SOLOMON_CONSULT_KIND = 'solomon_consult';

const ADVISORY_TTL_MS = 24 * 60 * 60_000; // 24h durable delivery window (mirrors the Adam lane).
function advisoryExpiresAt(nowMs) {
  const base = Number.isFinite(nowMs) ? nowMs : Date.now();
  return new Date(base + ADVISORY_TTL_MS).toISOString();
}

// HARD per-sweep ceiling defaults. A Solomon sweep is expensive (deep Read/Grep), so the budget is
// checked at ENTRY before any work. Overridable via env for ops tuning.
const SOLOMON_SWEEP_BUDGET = Object.freeze({
  maxCount: Number(process.env.SOLOMON_SWEEP_MAX_COUNT) || 5,            // consults answered per sweep
  maxWallClockMs: Number(process.env.SOLOMON_SWEEP_MAX_MS) || 8 * 60_000, // 8 min wall-clock
  maxTokens: Number(process.env.SOLOMON_SWEEP_MAX_TOKENS) || 200_000,    // token ceiling
});
const SOLOMON_PER_SD_MAX = Number(process.env.SOLOMON_PER_SD_MAX) || 2;   // answers per SD
const SOLOMON_PER_DAY_MAX = Number(process.env.SOLOMON_PER_DAY_MAX) || 20; // answers per UTC day

/**
 * Pure: build the Solomon advisory payload. INVARIANT: payload.kind=adam_advisory (reuses the
 * advisory-inbox plumbing), payload.oracle=true (the Solomon marker), and NEVER signal_type /
 * intent_action. correlation_id makes the answer replyable; a reply_to (the consult's correlation)
 * is echoed under BOTH keys so the asking side's matcher pairs the answer to its consult. Exported.
 */
function buildAdvisoryPayload({ body, senderCallsign, repo, correlationId, expectsReply, replyTo, via, replyClass, replyWindowMs, now }) {
  // An answer to a consult (replyTo set) is terminal -- always fire-and-forget. Otherwise: request
  // mode (expectsReply) is live-handshake; send mode defaults fire-and-forget unless the sender
  // opts into reply-needed via --reply-class (SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C).
  const resolvedReplyClass = replyTo ? 'fire-and-forget' : (expectsReply ? 'live-handshake' : (replyClass || 'fire-and-forget'));
  const payload = {
    kind: PAYLOAD_KINDS.ADAM_ADVISORY, // reuse the advisory inbox lane
    oracle: true,                       // Solomon marker (distinguishes an oracle answer from an Adam advisory)
    sender_callsign: senderCallsign || null,
    repo: repo || null,
    reply_class: resolvedReplyClass,
  };
  if (body) payload.body = redact(String(body)).slice(0, BODY_HARD_CAP);
  if (correlationId) payload.correlation_id = correlationId; // replyable (always)
  if (expectsReply) payload.expects_reply = true;            // sync await (request mode only)
  if (replyTo) {
    payload.reply_to = replyTo;
    payload.correlation_id = replyTo; // a reply correlates to its consult, not to itself
  }
  // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: 'direct' marks a row written straight to
  // Adam's session_id (--to adam, ADAM_SOLOMON_TWOWAY_V1=on) instead of the default coordinator-relay
  // target. Additive/optional — undefined for every existing send path.
  if (via) payload.via = via;
  if (resolvedReplyClass === 'reply-needed') payload.reply_expected_by = computeReplyExpectedBy(now, replyWindowMs);
  // INVARIANT: no signal_type, no intent_action.
  return payload;
}

/**
 * SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: pure target-resolution decision for the
 * new direct Solomon->Adam lane — mirrors scripts/adam-advisory.cjs's resolveAdamAdvisoryTarget.
 * `--to adam` + the flag ON routes DIRECT to the live Adam session (or the broadcast-adam fallback
 * sentinel); every other combination is the UNCHANGED coordinator-relay default.
 * @param {{toAdam: boolean, flagOn: boolean, coordinatorId: string|null, adamId: string|null}} args
 * @returns {{target: string, via: string|null}}
 */
function resolveSolomonAdvisoryTarget({ toAdam, flagOn, coordinatorId, adamId }) {
  if (toAdam && flagOn) {
    return { target: adamId || 'broadcast-adam', via: 'direct' };
  }
  return { target: coordinatorId || 'broadcast-coordinator', via: null };
}

// ── consult classification (mirrors the Adam inbox lane, scoped to Solomon) ─────────────────────────
function isReplyRow(r) {
  const p = r && r.payload;
  if (!p) return false;
  return p.kind === 'coordinator_reply' || (p.reply_to != null && p.reply_to !== '');
}

// A Solomon-inbox row = a consult OR any shared coordinator DIRECTIVE kind, directed at the Solomon session.
const SOLOMON_INBOX_KINDS = Object.freeze([...DIRECTIVE_KINDS, SOLOMON_CONSULT_KIND]);
function isSolomonInboxRow(r) {
  const k = r && r.payload && r.payload.kind;
  return k != null && SOLOMON_INBOX_KINDS.includes(k);
}

// Handler-owned kinds the Solomon inbox must never consume (mirrors the Adam EXCLUDED_KINDS).
const EXCLUDED_KINDS = Object.freeze(['canary_request', 'comms_check', 'ack', 'coordinator_ack']);
function isOrphanedSolomonRow(r) {
  if (!r) return false;
  if (isReplyRow(r) || isSolomonInboxRow(r)) return false;
  const k = r.payload && r.payload.kind;
  if (k != null && EXCLUDED_KINDS.includes(k)) return false; // handler-owned → never touch
  return true; // untyped / unknown typed kind directed at Solomon → orphaned delivery (surface, don't consume)
}

/**
 * Pure: a stable signature for a consult, for dedup. Prefers the consult's correlation_id (the
 * natural reply key); falls back to a content hash of sd_key + question body so two distinct consults
 * never collide and a re-sent identical consult dedups. Exported for tests.
 */
function computeConsultSignature(row) {
  const p = (row && row.payload) || {};
  if (p.correlation_id) return `corr:${p.correlation_id}`;
  const sd = p.sd_key || p.sd_id || (row && row.target_sd) || '';
  const q = String(p.body || p.question || (row && row.subject) || '');
  return `hash:${crypto.createHash('sha256').update(`${sd} ${q}`).digest('hex').slice(0, 32)}`;
}

/**
 * Pure: enforce the HARD per-sweep ceiling at sweep ENTRY. Given the budget and what has been spent
 * SO FAR (count of answers, elapsed wall-clock, tokens), returns whether the sweep may continue. The
 * caller checks this BEFORE any Read/Grep so a runaway sweep is stopped before it spends. Exported.
 */
function enforceSweepBudget(budget, spent) {
  const b = budget || SOLOMON_SWEEP_BUDGET;
  const s = spent || {};
  if (Number.isFinite(b.maxCount) && (s.count || 0) >= b.maxCount) {
    return { withinBudget: false, reason: `count ceiling reached (${s.count}/${b.maxCount})` };
  }
  if (Number.isFinite(b.maxWallClockMs) && (s.elapsedMs || 0) >= b.maxWallClockMs) {
    return { withinBudget: false, reason: `wall-clock ceiling reached (${s.elapsedMs}ms/${b.maxWallClockMs}ms)` };
  }
  if (Number.isFinite(b.maxTokens) && (s.tokens || 0) >= b.maxTokens) {
    return { withinBudget: false, reason: `token ceiling reached (${s.tokens}/${b.maxTokens})` };
  }
  return { withinBudget: true };
}

/**
 * Durable dedup: has this consult already been answered? True when an advisory row already echoes the
 * consult's correlation under payload.reply_to. Delegates to the shared reply-class module
 * (SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C) -- this is no longer a separate
 * implementation, just a locally-named re-export so existing call sites/imports are unchanged.
 * Fail-open to NOT-answered on a query error (better to risk a rare duplicate answer than to
 * silently drop a real consult). Exported.
 */
const alreadyAnswered = sharedAlreadyAnswered;

/**
 * Quota: may the oracle answer another consult for this SD today? Counts emitted Solomon answers
 * (payload.oracle=true) for the SD (per-SD ceiling) and total since UTC midnight (per-day ceiling).
 * Fail-open to ALLOWED on a query error (a transient DB fault must not starve the oracle). Exported.
 */
async function checkConsultQuota(supabase, { sdKey = null, perSdMax = SOLOMON_PER_SD_MAX, perDayMax = SOLOMON_PER_DAY_MAX } = {}) {
  try {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id, payload, created_at')
      .eq('payload->>oracle', 'true')
      .gte('created_at', since.toISOString())
      .limit(1000);
    if (error) return { allowed: true };
    const rows = data || [];
    if (rows.length >= perDayMax) return { allowed: false, reason: `per-day quota reached (${rows.length}/${perDayMax})` };
    if (sdKey) {
      const perSd = rows.filter((r) => r.payload && (r.payload.sd_key === sdKey || r.payload.sd_id === sdKey)).length;
      if (perSd >= perSdMax) return { allowed: false, reason: `per-SD quota reached for ${sdKey} (${perSd}/${perSdMax})` };
    }
    return { allowed: true };
  } catch { return { allowed: true }; }
}

/**
 * Drain the Solomon inbox: consults + coordinator directives directed at THIS Solomon session.
 * AND-only server query (target_session + read_at IS NULL); lane classified in JS; orphans surfaced
 * (WARN, not consumed); surfaced rows stamped read_at = DELIVERED (two-stage ACK — acknowledged_at
 * withheld so a delivered-but-unactioned consult stays recoverable). Mirrors drainInbox in adam-advisory.
 */
async function drainInbox(supabase, sessionId, { quiet = false } = {}) {
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, message_type, subject, body, payload, created_at')
    .eq('target_session', sessionId)
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) { console.error('ERROR: solomon inbox query failed:', error.message); process.exit(1); }

  const rows = (allRows || []).filter((r) => isReplyRow(r) || isSolomonInboxRow(r));
  const orphaned = (allRows || []).filter(isOrphanedSolomonRow);
  if (orphaned.length > 0) {
    console.warn(`⚠ ${orphaned.length} unread Solomon-directed row${orphaned.length === 1 ? '' : 's'} with unrecognized/untyped kind NOT auto-drained (visibility — NOT consumed):`);
    for (const r of orphaned) {
      const kind = (r.payload && r.payload.kind) || '(untyped)';
      const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
      const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
      console.warn(`  ⚠ [orphan/${kind}] id=${r.id} (${ageMin}m) ${text}`);
    }
  }

  if (rows.length === 0) { if (!quiet) console.log('(no unread directed Solomon inbox rows — consults or directives)'); return; }

  console.log(`${rows.length} Solomon inbox row${rows.length === 1 ? '' : 's'} (consults + directives):`);
  const ids = [];
  for (const r of rows) {
    const lane = isReplyRow(r) ? 'reply' : ((r.payload && r.payload.kind) === SOLOMON_CONSULT_KIND ? 'consult' : 'directive');
    const kind = (r.payload && r.payload.kind) || r.message_type || '?';
    const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    console.log(`  • [${lane}/${kind}] (${ageMin}m) ${text}`);
    ids.push(r.id);
  }
  // Two-stage ACK: stamp read_at = DELIVERED only; withhold acknowledged_at (recoverable until actioned).
  await supabase
    .from('session_coordination')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null);
}

async function snapshotSender(supabase, sessionId) {
  try {
    const { data } = await supabase.from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
    return data?.metadata?.fleet_identity?.callsign || data?.metadata?.callsign || null;
  } catch { return null; }
}

/**
 * Resolve `--reply-to <value>` (a row id OR a bare correlation) to the correlation to echo. Mirrors
 * adam-advisory.resolveReplyToCorrelation. Throws only when a matching row carries no correlation_id.
 */
async function resolveReplyToCorrelation(supabase, value) {
  if (!value) return null;
  let row = null;
  try {
    const { data } = await supabase.from('session_coordination').select('id, payload').eq('id', value).maybeSingle();
    row = data || null;
  } catch { row = null; }
  if (row) {
    const corr = row.payload && row.payload.correlation_id;
    if (!corr) { const e = new Error(`row ${value} carries no payload.correlation_id (not replyable)`); e.code = 'REPLY_TO_NOT_REPLYABLE'; throw e; }
    return corr;
  }
  return value;
}

/**
 * Fail-open capture: upsert a solomon_advice_outcome_ledger row for this advisory send/request,
 * keyed on payload.correlation_id (idempotent — ON CONFLICT DO NOTHING). NEVER throws or blocks the
 * advisory send — a ledger write failure (table not yet applied, transient DB error) must not
 * prevent the advisory from being sent. Mirrors the alreadyAnswered/checkConsultQuota fail-open
 * style above. SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-2, TR-2). Exported for tests.
 */
async function captureLedgerRow(supabase, { advisoryId, correlationId, sdKey, body } = {}) {
  if (!correlationId) return { captured: false, reason: 'no correlation_id' };
  try {
    const { error } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
      .upsert(
        {
          advisory_id: advisoryId || null,
          correlation_id: correlationId,
          sd_key: sdKey || null,
          proposal_summary: String(body || '').slice(0, 4000),
          proposal_kind: 'advisory',
        },
        { onConflict: 'correlation_id', ignoreDuplicates: true }
      );
    if (error) return { captured: false, reason: error.message };
    return { captured: true };
  } catch (e) {
    return { captured: false, reason: (e && e.message) || String(e) };
  }
}

// QF-20260701-289: cheap in-memory counter of captureLedgerRow(captured:false) results this process
// run — the "not-flying-blind" instrument was itself flying blind (the caller discarded the result).
let ledgerCaptureFailures = 0;

/**
 * Cheap health gauge for the ledger's OWN capture pipeline (QF-20260701-289): confirms
 * solomon_advice_outcome_ledger is reachable (not PGRST205/missing) and reports its current row
 * count. Stateless (one cheap head-count SELECT) — callers compare successive counts over time to
 * confirm the count is advancing. Fail-open: never throws. Exported for tests.
 */
async function checkLedgerCaptureHealth(supabase) {
  try {
    const { count, error } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — same table as captureLedgerRow above
      .select('id', { count: 'exact', head: true });
    if (error) return { healthy: false, reason: error.message };
    return { healthy: true, rowCount: count ?? 0 };
  } catch (e) {
    return { healthy: false, reason: (e && e.message) || String(e) };
  }
}

/**
 * On a Solomon (re)register/restart, re-target UNREAD rows destined for an OLD Solomon session to the
 * NEW one (comms survive the handoff). Mirrors drainAdamOutbound: idempotent (read_at IS NULL gate),
 * fail-open (never throws). Required by solomon-register.cjs's lazy-require. Exported.
 */
async function drainSolomonOutbound(supabase, { newSessionId, oldSessionIds } = {}) {
  if (!supabase || !newSessionId || !Array.isArray(oldSessionIds)) return { moved: 0 };
  const olds = oldSessionIds.filter((s) => typeof s === 'string' && s && s !== newSessionId);
  if (!olds.length) return { moved: 0 };
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      .update({ target_session: newSessionId })
      .in('target_session', olds)
      .is('read_at', null)
      .gte('created_at', cutoff)
      .select('id');
    if (error) return { moved: 0, error: error.message };
    return { moved: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return { moved: 0, error: e && e.message ? e.message : String(e) };
  }
}

// SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 (FR-7) — mirrors adam-advisory.cjs's printStatus
// exactly, using the SAME shared helper (no per-role reimplementation).
function formatPresence(p) {
  if (!p) return 'unknown';
  if (p.state === 'active_now') return 'active now';
  if (p.state === 'parked') return `parked (~${Math.round((p.expectationWindowMs || 0) / 60000)}min)`;
  return 'away';
}

async function printStatus(supabase, sessionId, argv) {
  const workingIdx = argv.indexOf('--working');
  if (workingIdx >= 0) {
    const etaIdx = argv.indexOf('--eta');
    const etaMs = etaIdx >= 0 ? Number(argv[etaIdx + 1]) || null : null;
    const flagValueIdxs = new Set([etaIdx, etaIdx + 1].filter(i => i >= 0));
    const body = argv.slice(workingIdx + 1).filter((a, i) => !flagValueIdxs.has(i + 1 + workingIdx)).join(' ').trim();
    const res = await writeWorkingSignal(supabase, sessionId, { body, etaMs });
    console.log(res.persisted
      ? `Working-signal set: "${body}"${etaMs ? ` (ETA ~${Math.round(etaMs / 60000)}min)` : ''}`
      : (res.warn || `Working-signal not persisted: ${res.reason}`));
    return;
  }

  const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);
  const presenceMap = await getFleetPresence(supabase, [coordinatorId, sessionId].filter(Boolean));
  console.log(coordinatorId
    ? `Coordinator presence: ${formatPresence(presenceMap.get(coordinatorId))}`
    : 'Coordinator presence: no active coordinator resolved');

  const receipts = await getReadReceipts(supabase, sessionId, { limit: 10 });
  console.log(receipts.length === 0
    ? 'Read receipts: none of your recent sent messages have been read yet'
    : `Read receipts (${receipts.length} recently read):`);
  for (const r of receipts) console.log(`  - "${r.subject || '(no subject)'}" read at ${r.read_at}`);

  const { data: ownRow } = await supabase.from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
  const workingSignal = getWorkingSignal(ownRow, {});
  console.log(`Your working-signal: ${workingSignal ? `"${workingSignal.body}"` : 'none set'}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'send' && mode !== 'request' && mode !== 'inbox' && mode !== 'status') {
    console.error('Usage: node scripts/solomon-advisory.cjs send "<body>" [--reply-to <id>] [--to adam]  |  request "<q>" [--timeout <ms>] [--to adam]  |  inbox [--quiet]  |  status [--working "<body>" [--eta <ms>]]');
    process.exit(2);
  }
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  if (mode === 'inbox') {
    // Resolve the CANONICAL Solomon session (env var may not propagate to a cron subprocess).
    const solomonId = (await getActiveSolomonId(supabase)) || sessionId;
    // QF-20260701-289: periodic ledger-capture gauge — the recurring inbox-monitor tick doubles as
    // "startup" (its first fire after Solomon starts) AND "periodic" (every subsequent fire). Always
    // loud (not --quiet-suppressed): a silent capture gap must never hide behind routine quiet mode.
    const ledgerHealth = await checkLedgerCaptureHealth(supabase);
    if (!ledgerHealth.healthy) {
      console.error(`WARN: solomon_advice_outcome_ledger capture gauge UNHEALTHY — ${ledgerHealth.reason} (advisories are NOT being captured; QF-20260701-289)`);
    }
    await drainInbox(supabase, solomonId, { quiet: argv.includes('--quiet') });
    // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: PING-ON-SILENCE — check MY OWN sent
    // reply-needed advisories for ones left unanswered past their window. Never suppressed by
    // --quiet (a real overdue reply is a genuine delivery, not routine tick noise).
    const pingResult = await checkAndPingOverdueReplies(supabase, { sessionId: solomonId, senderType: 'solomon' });
    if (pingResult.pinged > 0) {
      console.warn(`⚠ PING-ON-SILENCE: ${pingResult.pinged} reply-needed advisor${pingResult.pinged === 1 ? 'y' : 'ies'} unanswered past window — pinged (ids: ${pingResult.pingedIds.join(', ')})`);
    }
    return;
  }

  // SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 — same canonical-identity resolution as `inbox`.
  if (mode === 'status') {
    const solomonId = (await getActiveSolomonId(supabase)) || sessionId;
    await printStatus(supabase, solomonId, argv.slice(1));
    return;
  }

  const tIdx = argv.indexOf('--timeout');
  const timeoutMs = tIdx >= 0 ? Number(argv[tIdx + 1]) || 30000 : 30000;
  const rIdx = argv.indexOf('--reply-to');
  const replyToArg = rIdx >= 0 ? argv[rIdx + 1] || null : null;
  // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: `send` opt-in to reply-needed
  // (default remains fire-and-forget when omitted — byte-identical to pre-fix behavior).
  const rcIdx = argv.indexOf('--reply-class');
  const replyClassArg = rcIdx >= 0 ? argv[rcIdx + 1] || null : null;
  const rwIdx = argv.indexOf('--reply-window-ms');
  const replyWindowMs = rwIdx >= 0 ? Number(argv[rwIdx + 1]) || undefined : undefined;
  if (replyClassArg && !isValidReplyClass(replyClassArg)) {
    console.error(`ERROR: --reply-class must be one of ${REPLY_CLASSES.join(', ')} (got "${replyClassArg}").`);
    process.exit(2);
  }
  // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: `send/request --to adam` — direct 1-hop
  // channel, gated by ADAM_SOLOMON_TWOWAY_V1 (default OFF; omitting --to is unchanged).
  const toIdx = argv.indexOf('--to');
  const toArg = toIdx >= 0 ? argv[toIdx + 1] || null : null;
  const flagValueIdxs = new Set([tIdx, tIdx + 1, rIdx, rIdx + 1, rcIdx, rcIdx + 1, rwIdx, rwIdx + 1, toIdx, toIdx + 1].filter((i) => i >= 0));
  const body = argv.slice(1).filter((a, i) => !flagValueIdxs.has(i + 1)).join(' ').trim();
  if (!body) { console.error('ERROR: advisory body required.'); process.exit(2); }

  if (mode === 'request' && !isTwoWayV2Enabled()) {
    console.error('ERROR: request/await is gated by COORDINATOR_TWOWAY_V2=on (currently OFF). Use `send` for fire-and-forget.');
    process.exit(3);
  }
  if (toArg && toArg !== 'adam') {
    console.error(`ERROR: --to ${toArg} is not supported (only "adam" — omit --to for the default coordinator-relay target).`);
    process.exit(2);
  }
  const twoWayV1On = isAdamSolomonTwoWayV1Enabled();
  if (toArg === 'adam' && !twoWayV1On) {
    console.error('ERROR: --to adam is gated by ADAM_SOLOMON_TWOWAY_V1=on (currently OFF). Omit --to to route via the coordinator.');
    process.exit(3);
  }

  const coordinatorId = await getActiveCoordinatorId(supabase);
  const toAdam = toArg === 'adam';
  const adamId = toAdam && twoWayV1On ? await getActiveAdamId(supabase).catch(() => null) : null;
  const { target, via } = resolveSolomonAdvisoryTarget({ toAdam, flagOn: twoWayV1On, coordinatorId, adamId });
  const senderCallsign = await snapshotSender(supabase, sessionId);
  const correlationId = crypto.randomUUID();
  const expectsReply = mode === 'request';
  let replyTo = null;
  if (replyToArg && mode === 'send') {
    try { replyTo = await resolveReplyToCorrelation(supabase, replyToArg); }
    catch (e) { console.error(`ERROR: --reply-to ${replyToArg} — ${e.message}`); process.exit(2); }
  }
  // Durable dedup: never re-answer a consult already answered (when replying to one).
  if (replyTo && (await alreadyAnswered(supabase, replyTo))) {
    console.log(`(dedup) consult ${String(replyTo).slice(0, 8)} already answered — not re-sending.`);
    return;
  }
  const payload = buildAdvisoryPayload({ body, senderCallsign, repo: process.cwd(), correlationId, expectsReply, replyTo, via, replyClass: replyClassArg, replyWindowMs });
  const subject = `[SOLOMON_ORACLE] ${payload.body.slice(0, 80)}`;
  const expiresAt = advisoryExpiresAt(Date.now());

  let inserted;
  try {
    const { data, error } = await insertCoordinationRow(
      supabase,
      { sender_session: sessionId, sender_type: 'solomon', target_session: target, message_type: 'INFO', subject, body: payload.body, payload, expires_at: expiresAt },
      { select: 'id', single: true }
    );
    if (error) { console.error('ERROR: failed to insert advisory:', error.message); process.exit(1); }
    inserted = data;
  } catch (e) {
    const code = e && e.code ? `${e.code}: ` : '';
    console.error(`ERROR: advisory not sent — ${code}${(e && e.message) || e}`);
    process.exit(1);
  }

  // Fail-open ledger capture — never blocks or fails the advisory send (SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001).
  // QF-20260701-289: the result was previously discarded, so a capture failure (e.g. PGRST205 table-
  // missing) was completely silent. Warn loudly + count it — the "not-flying-blind" instrument was
  // itself flying blind.
  const ledgerResult = await captureLedgerRow(supabase, {
    advisoryId: inserted.id,
    correlationId: payload.correlation_id,
    sdKey: process.env.SD_KEY || null,
    body: payload.body,
  });
  if (!ledgerResult.captured) {
    ledgerCaptureFailures += 1;
    console.error(`WARN: ledger capture failed (${ledgerCaptureFailures} this run) — ${ledgerResult.reason}`);
  }

  console.log('✓ Solomon oracle advisory sent');
  console.log('  advisory_id:', inserted.id);
  console.log('  target:', target);
  console.log('  correlation_id:', payload.correlation_id, replyTo ? '(echoed from --reply-to)' : '(replyable)');
  if (replyTo) console.log('  reply_to:', replyTo);

  if (mode === 'request') {
    console.log('  — awaiting coordinator reply…');
    const result = await awaitCoordinatorReply(supabase, { sessionId, correlationId, timeoutMs });
    if (result.timedOut) { console.log('⌛ No reply within timeout (drain later with `node scripts/solomon-advisory.cjs inbox`).'); process.exit(0); }
    try { await supabase.from('session_coordination').update({ read_at: new Date().toISOString(), acknowledged_at: new Date().toISOString() }).eq('id', result.reply.id); } catch {}
    console.log('✓ Reply:', (result.reply.payload && result.reply.payload.body) || result.reply.body || '(empty)');
  }
}

module.exports = {
  buildAdvisoryPayload, advisoryExpiresAt, ADVISORY_TTL_MS,
  isReplyRow, isSolomonInboxRow, isOrphanedSolomonRow, SOLOMON_INBOX_KINDS, EXCLUDED_KINDS, SOLOMON_CONSULT_KIND,
  computeConsultSignature, enforceSweepBudget, SOLOMON_SWEEP_BUDGET, alreadyAnswered, checkConsultQuota,
  drainInbox, resolveReplyToCorrelation, drainSolomonOutbound, captureLedgerRow,
  checkLedgerCaptureHealth, resolveSolomonAdvisoryTarget,
};

if (require.main === module) {
  main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
