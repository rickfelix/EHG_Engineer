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
 * (insertCoordinationRow), scripts/worker-signal.cjs (capBody/awaitCoordinatorReply),
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
 * ADAM_SOLOMON_TWOWAY_V1 (default ON since QF-20260705-488; 'off' is the explicit kill switch).
 * Omitting --to is byte-identical unchanged behavior — the existing coordinator-relay path is
 * the permanent fallback, never removed.
 *   node scripts/solomon-advisory.cjs send --direct "<body>"                   (shorthand for --to adam)
 *
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-4: `--to` also accepts the
 * relay-class peers eva/ceo (lib/coordinator/peer-target.cjs's PEER_KINDS registry) — these enqueue
 * a tracked FR-1 relay-request instead of a direct write.
 */

const crypto = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { capBody, awaitCoordinatorReply } = require('./worker-signal.cjs');
const { getActiveCoordinatorId, isTwoWayV2Enabled, isAdamSolomonTwoWayV1Enabled } = require('../lib/coordinator/resolve.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { detectVersionSkew } = require('../lib/coordinator/protocol-comms-version.cjs');
const { warnIfCheckoutStale } = require('../lib/coordinator/checkout-staleness.cjs');
const { PAYLOAD_KINDS, DIRECTIVE_KINDS, FRAMING_CLASSES, DRAIN_SETS } = require('../lib/fleet/worker-status.cjs');
const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');
const { getActiveAdamId } = require('../lib/coordinator/adam-identity.cjs');
// QF-20260719-387: fail-closed sender-role guard + target-role assert at the send/request chokes.
const { assertSenderRole, assertTargetRole } = require('../lib/coordinator/role-comms-guard.cjs');
const { PEER_KINDS } = require('../lib/coordinator/peer-target.cjs');
const { enqueueRelayRequest } = require('../lib/coordinator/relay-queue.cjs');
// SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: sender-stamped reply_class SSOT.
const {
  REPLY_CLASSES, isValidReplyClass, computeReplyExpectedBy, checkAndPingOverdueReplies,
  alreadyAnswered: sharedAlreadyAnswered,
} = require('../lib/coordinator/reply-class.cjs');
// SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 — same shared presence/read-receipt/working-signal
// lane Adam wires (lib/coordinator/presence-grounding-signals.cjs) — no per-role reimplementation.
const { getFleetPresence, getReadReceipts, getWorkingSignal } = require('../lib/coordinator/presence-grounding-signals.cjs');
const { writeWorkingSignal } = require('../lib/coordinator/working-signal-store.cjs');
// SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 (W3, FR-6/TR-4): authoritative session cost telemetry
// read at ledger-write time (fail-soft — a telemetry miss never blocks the write).
const { readSessionCostTelemetry } = require('../lib/telemetry/session-cost.cjs');

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

// SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-2: mirrors adam-advisory.cjs's KNOWN_SEND_KINDS
// allowlist exactly -- same shared source (lib/fleet/worker-status.cjs), never a second list.
const KNOWN_SEND_KINDS = new Set([...Object.values(PAYLOAD_KINDS), ...DIRECTIVE_KINDS]);

/**
 * Build the Solomon advisory payload. INVARIANT: payload.kind=adam_advisory by default (reuses the
 * advisory-inbox plumbing), payload.oracle=true (the Solomon marker), and NEVER signal_type /
 * intent_action. correlation_id makes the answer replyable; a reply_to (the consult's correlation)
 * is echoed under BOTH keys so the asking side's matcher pairs the answer to its consult. Exported.
 * QF-20260711-596: body sizing now goes through the shared capBody() hard-error helper (matches
 * adam-advisory.cjs/coordinator-reply.cjs/worker-signal.cjs since QF-20260710-560) instead of a
 * silent .slice() -- throws a BODY_TOO_LONG error (never silently clips) for an over-cap body.
 * FR-2 (SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001): an explicit, validated --kind overrides the
 * default; omitting --kind is BYTE-IDENTICAL to pre-SD behavior. An answer to a consult (replyTo
 * set) ignores kind and always reuses the advisory lane.
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B: an optional framingClass ('instrument'|'pick', see
 * FRAMING_CLASSES) is stamped as payload.framing_class alongside payload.oracle=true — a
 * sub-discriminator on the SAME leg (no new kind), per FW-3 design doc §6c. Omitted entirely when
 * not provided (byte-identical to pre-SD behavior for every existing sender).
 */
function buildAdvisoryPayload({ body, senderCallsign, repo, correlationId, expectsReply, replyTo, via, replyClass, replyWindowMs, now, kind, framingClass }) {
  // An answer to a consult (replyTo set) is terminal -- always fire-and-forget. Otherwise: request
  // mode (expectsReply) is live-handshake; send mode defaults fire-and-forget unless the sender
  // opts into reply-needed via --reply-class (SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C).
  const resolvedReplyClass = replyTo ? 'fire-and-forget' : (expectsReply ? 'live-handshake' : (replyClass || 'fire-and-forget'));
  const payload = {
    kind: replyTo ? PAYLOAD_KINDS.ADAM_ADVISORY : (kind || PAYLOAD_KINDS.ADAM_ADVISORY), // reuse the advisory inbox lane
    oracle: true,                       // Solomon marker (distinguishes an oracle answer from an Adam advisory)
    sender_callsign: senderCallsign || null,
    repo: repo || null,
    reply_class: resolvedReplyClass,
  };
  if (framingClass) payload.framing_class = framingClass;
  if (body) payload.body = capBody(String(body));
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
// SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1: chairman_directive is already a shared
// DIRECTIVE_KIND (spread below) — Solomon drains it via the shared allowlist (no re-list). Its FIRST-CLASS
// render partition (renderChairmanDirectives, wired into the inbox mode) surfaces it above consults so a
// chairman baseline directive can never silently die at Solomon's last hop (the 2h-non-compliant incident).
// Handler-owned kinds the Solomon inbox must never consume (mirrors the Adam EXCLUDED_KINDS).
const EXCLUDED_KINDS = Object.freeze(['canary_request', 'comms_check', 'ack', 'coordinator_ack']);

/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-3: the Solomon-scoped recognized-kinds
 * default, DERIVED from DRAIN_SETS.solomon (the registry-reader's own fallback SSOT) minus
 * comms_check -- DRAIN_SETS.solomon includes comms_check because SOME Solomon-side lane drains
 * it (the dedicated first-class branch in drainInbox below), but the GENERIC inbox filter must
 * never fold it in, exactly as the former hand-authored SOLOMON_INBOX_KINDS never did. No
 * longer hand-authored -- a live view over the shared DRAIN_SETS.solomon constant.
 */
const SOLOMON_INBOX_KINDS = Object.freeze(DRAIN_SETS.solomon.filter((k) => k !== 'comms_check'));

/**
 * A Solomon-inbox row = a consult OR any shared coordinator DIRECTIVE kind, directed at the
 * Solomon session. @param {object} r @param {string[]} [recognizedKinds] defaults to SOLOMON_INBOX_KINDS
 */
function isSolomonInboxRow(r, recognizedKinds = SOLOMON_INBOX_KINDS) {
  const k = r && r.payload && r.payload.kind;
  return k != null && recognizedKinds.includes(k);
}

function isOrphanedSolomonRow(r, recognizedKinds = SOLOMON_INBOX_KINDS) {
  if (!r) return false;
  if (isReplyRow(r) || isSolomonInboxRow(r, recognizedKinds)) return false;
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
    // QF-20260705-488 (adversarial-review W2): an answer's originator CC copy also carries
    // payload.oracle=true — exclude via='cc_originator' rows so a CC'd answer consumes ONE
    // quota slot, not two (the per-day ceiling would otherwise halve in practice).
    const rows = (data || []).filter((r) => !(r.payload && r.payload.via === 'cc_originator'));
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
/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1 — FIRST-CLASS chairman-directive partition for
 * Solomon. Surfaces broadcast chairman_directive rows ABOVE consults, with Solomon's per-directive
 * OUTSTANDING/ACKED status (latest issued_at per directive_id — SUPERSEDES). READ-ONLY / non-consuming
 * (the broadcast row must survive for Adam + coordinator too). Solomon acks via
 * scripts/ack-chairman-directive.cjs --role solomon. Fail-open. Mirrors renderChairmanDirectives in
 * adam-advisory. This is the SOLOMON-LAST-HOP fix: the incident had Solomon run 2h non-compliant.
 */
async function renderChairmanDirectives(supabase, { quiet = false } = {}) {
  const { loadRoleDirectiveStatus } = require('../lib/coordinator/chairman-directive-gauge.cjs');
  const rows = await loadRoleDirectiveStatus(supabase, 'solomon');
  if (rows.length === 0) { if (!quiet) console.log('(no chairman directives outstanding for solomon)'); return; }
  const outstanding = rows.filter((r) => r.status === 'outstanding');
  console.log(`★ ${rows.length} CHAIRMAN DIRECTIVE(s) for solomon — ${outstanding.length} OUTSTANDING (ack via scripts/ack-chairman-directive.cjs --role solomon):`);
  for (const r of rows) {
    const ageMin = Math.floor((r.ageMs || 0) / 60_000);
    console.log(`  ★ [${r.status.toUpperCase()}] ${r.directiveId} (issued ${ageMin}m ago)`);
  }
}

async function drainInbox(supabase, sessionId, { quiet = false, background = false } = {}) {
  // QF-20260710-593 (mirrors adam-advisory drainInbox / SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001):
  // recoverable filter is acknowledged_at IS NULL, never read_at IS NULL — a row this drain surfaces but
  // the reasoning turn doesn't genuinely act on must stay recoverable on the NEXT drain instead of
  // silently vanishing the moment it's first read-stamped.
  // Adversarial-review fix (PR #6170): also read the 'broadcast-solomon' sentinel lane.
  // Senders fall back to that sentinel exactly when Solomon's identity is transiently
  // unresolvable (adam-advisory resolveAdamAdvisoryTarget) — the overnight/canary scenario —
  // and no Solomon-side consumer read those rows at all, so a fallback comms_check/consult
  // orphaned silently while DRAIN_SETS.solomon vouched for delivery. Solomon IS the intended
  // consumer of its own sentinel; drain both lanes.
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, message_type, subject, body, payload, created_at')
    .in('target_session', [sessionId, 'broadcast-solomon'])
    .is('acknowledged_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) { console.error('ERROR: solomon inbox query failed:', error.message); process.exit(1); }

  // SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-3: resolve the live recognized-kinds set
  // via the registry-reader (fails open to SOLOMON_INBOX_KINDS while role_drain_sets remains
  // unapplied), subtracting comms_check so the dedicated first-class branch below stays the
  // ONLY thing that ever surfaces it.
  const { resolveRecognizedKinds } = await import('../lib/fleet/drain-set-registry.js');
  const resolvedSolomonKinds = (await resolveRecognizedKinds({ supabase, role: 'solomon' }))
    .filter((k) => k !== 'comms_check');

  const rows = (allRows || []).filter((r) => isReplyRow(r) || isSolomonInboxRow(r, resolvedSolomonKinds));
  // SD-LEO-INFRA-SEND-TIME-TARGET-001 / FR-3: Solomon-directed canary coverage. comms_check
  // was listed handler-owned (EXCLUDED_KINDS) but NO Solomon-side handler existed — a
  // comms_check sent to Solomon orphaned silently (the exact class this SD closes send-side).
  // Surface it FIRST-CLASS with the ack instruction; never consumed here (ack via `ack <id>`
  // or a /signal reply, mirroring the worker comms-check contract).
  const commsChecks = (allRows || []).filter((r) => r && r.payload && r.payload.kind === 'comms_check');
  if (commsChecks.length > 0) {
    console.log(`📡 ${commsChecks.length} comms_check (radio check) directed at Solomon — reply to confirm the two-way link:`);
    for (const r of commsChecks) {
      const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
      const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
      console.log(`  📡 [comms_check] id=${r.id} (${ageMin}m) ${text}`);
      console.log(`     Ack: node scripts/solomon-advisory.cjs ack ${r.id}  (or reply on the sender's channel)`);
    }
  }
  const orphaned = (allRows || []).filter((r) => isOrphanedSolomonRow(r, resolvedSolomonKinds));
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
    // FR-2 (SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C): Solomon is the named live example of a
    // long-lived singleton misreading rows from boot-time-stale code — detect, don't silently drop.
    const skew = detectVersionSkew(r.payload);
    if (skew) console.warn(`  ⚠ PROTOCOL VERSION SKEW: sender v${skew.senderVersion}, receiver v${skew.receiverVersion} (id=${r.id})`);
    console.log(`  • [${lane}/${kind}] (${ageMin}m) ${text}`);
    ids.push(r.id);
  }
  // QF-20260710-593: stamp routing by context — background/cron passes (no reasoning turn sees
  // stdout) stamp delivered_at only; interactive render stamps read_at. acknowledged_at is NEVER
  // set here (action-time only, see ackRows below).
  await stampSurfaced(supabase, ids, { background });
}

/**
 * QF-20260710-593 (mirrors adam-advisory.stampSurfaced) — the single stamp-routing seam for
 * drainInbox. background=true: stamp delivered_at (only where NULL). background=false
 * (interactive): stamp read_at (only where NULL). Idempotent either way; acknowledged_at is
 * NEVER written here (see ackRows).
 */
async function stampSurfaced(supabase, ids, { background = false } = {}) {
  if (!ids || ids.length === 0) return;
  const now = new Date().toISOString();
  if (background) {
    await supabase.from('session_coordination').update({ delivered_at: now }).in('id', ids).is('delivered_at', null);
  } else {
    await supabase.from('session_coordination').update({ read_at: now }).in('id', ids).is('read_at', null);
  }
}

/**
 * QF-20260710-593 (mirrors adam-advisory.ackRows) — the single sanctioned action-time stamp for
 * the Solomon lane. Stamps acknowledged_at (only where NULL) and backfills read_at where NULL (an
 * actioned row was necessarily seen). Ownership-scoped when expectedTarget is given. Idempotent.
 */
async function ackRows(supabase, ids, { expectedTarget = null } = {}) {
  const now = new Date().toISOString();
  let acked = 0;
  for (const id of ids) {
    let q = supabase
      .from('session_coordination')
      .update({ acknowledged_at: now })
      .eq('id', id)
      .is('acknowledged_at', null);
    // Adversarial-review fix (PR #6170): drainInbox now also surfaces the 'broadcast-solomon'
    // sentinel lane (Solomon is that sentinel's intended consumer), so the ownership scope
    // must admit those rows too or a surfaced fallback row could never be acked.
    if (expectedTarget) q = q.in('target_session', [expectedTarget, 'broadcast-solomon']);
    const { data, error } = await q.select('id, read_at');
    if (error) { console.error(`ERROR: ack failed for ${id}: ${error.message}`); continue; }
    if (data && data.length > 0) {
      acked += 1;
      if (data[0].read_at == null) {
        await supabase.from('session_coordination').update({ read_at: now }).eq('id', id).is('read_at', null);
      }
      console.log(`  ✓ acked ${id}`);
    } else {
      console.log(`  • ${id} already acked, not found, or not targeted at this Solomon session — no-op`);
    }
  }
  console.log(`${acked}/${ids.length} row(s) newly acknowledged.`);
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
 * QF-20260705-488: resolve the session that ORIGINATED a consult, from the same value
 * `--reply-to` accepts (a consult row id OR a bare correlation id). Prefers an explicit
 * payload.origin_session (set by relay paths that preserve the true originator), else the
 * consult row's sender_session. Null when unresolvable — the caller treats that as
 * "no CC" (fail-open). Exported for tests.
 */
async function resolveConsultOriginator(supabase, value) {
  if (!value) return null;
  try {
    const { data: byId } = await supabase
      .from('session_coordination')
      .select('sender_session, payload')
      .eq('id', value)
      .maybeSingle();
    if (byId) {
      const p = byId.payload || {};
      // Adversarial-review I4: CC is scoped to CONSULTS only — the correlation branch below
      // already filters on kind; without this symmetric check, replying to a non-consult row
      // by id would CC that row's sender (an undocumented side effect on non-consult flows).
      if (p.kind !== SOLOMON_CONSULT_KIND) return null;
      return p.origin_session || byId.sender_session || null;
    }
  } catch { /* fall through to correlation match */ }
  try {
    const { data } = await supabase
      .from('session_coordination')
      .select('sender_session, payload, created_at')
      .eq('payload->>correlation_id', String(value))
      .eq('payload->>kind', SOLOMON_CONSULT_KIND)
      .order('created_at', { ascending: false })
      .limit(1);
    const row = Array.isArray(data) && data[0] ? data[0] : null;
    if (row) return (row.payload && row.payload.origin_session) || row.sender_session || null;
  } catch { /* fail-open: no CC */ }
  return null;
}

/**
 * QF-20260705-488: deliver the originator's CC copy of a consult answer, idempotently.
 * Resolves the consult's originating session, prefers the LIVE session for that role
 * (adversarial-review W3: a consult-time session id may be dead — an Adam restart would
 * otherwise dead-letter the CC into a session nobody polls), skips when the originator IS
 * the answer target or Solomon itself, and skips when a row for this reply already targets
 * the originator (idempotent — makes the dedup-branch re-run heal a previously FAILED CC,
 * adversarial-review W1, instead of stranding it behind the primary-answer dedup forever).
 * Never throws (fail-open). Exported for tests.
 * @returns {Promise<{inserted: boolean, originator: string|null, error?: string}>}
 */
async function ensureOriginatorCc(supabase, { replyRef, replyTo, target, sessionId, subject, payload, expiresAt }, { getLiveAdamId = getActiveAdamId, insertRow = insertCoordinationRow } = {}) {
  try {
    let originator = await resolveConsultOriginator(supabase, replyRef);
    if (!originator) return { inserted: false, originator: null };
    // W3: map a dead consult-time session id to the LIVE session of the same role. Adam is
    // the one lateral peer whose consults this lane answers; other roles keep the raw id
    // (their outbound drains re-target unread rows on restart).
    try {
      const { data: sess } = await supabase.from('claude_sessions').select('metadata').eq('session_id', originator).maybeSingle();
      if (sess && sess.metadata && sess.metadata.role === 'adam') {
        originator = (await getLiveAdamId(supabase).catch(() => null)) || originator;
      }
    } catch { /* keep the raw originator */ }
    if (originator === target || originator === sessionId) return { inserted: false, originator };
    // Idempotence: a row for this reply already targeting the originator (a prior CC, or the
    // primary answer itself under --to adam) means delivered — never duplicate.
    try {
      const { data: existing } = await supabase
        .from('session_coordination')
        .select('id')
        .eq('target_session', originator)
        .eq('payload->>reply_to', String(replyTo))
        .limit(1);
      if (Array.isArray(existing) && existing.length > 0) return { inserted: false, originator };
    } catch { /* fail-open: attempt the CC */ }
    const { error: ccErr } = await insertRow(
      supabase,
      { sender_session: sessionId, sender_type: 'solomon', target_session: originator, message_type: 'INFO', subject, body: payload.body, payload: { ...payload, via: 'cc_originator' }, expires_at: expiresAt },
      { select: 'id', single: true }
    );
    if (ccErr) return { inserted: false, originator, error: (ccErr && ccErr.message) || String(ccErr) };
    return { inserted: true, originator };
  } catch (e) {
    return { inserted: false, originator: null, error: (e && e.message) || String(e) };
  }
}

/**
 * Fail-open capture: upsert a solomon_advice_outcome_ledger row for this advisory send/request,
 * keyed on payload.correlation_id (idempotent — ON CONFLICT DO NOTHING). NEVER throws or blocks the
 * advisory send — a ledger write failure (table not yet applied, transient DB error) must not
 * prevent the advisory from being sent. Mirrors the alreadyAnswered/checkConsultQuota fail-open
 * style above. SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-2, TR-2). Exported for tests.
 *
 * SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 (W3, FR-6/TR-4): also captures cost_tokens + cost_wall_ms
 * from the writing session's authoritative telemetry AT WRITE TIME. FAIL-SOFT: when telemetry is
 * unavailable the row still lands with cost_tokens/cost_wall_ms=null and the durable cost_captured=false
 * marker, so a missing datum never blocks a write nor silently distorts the budget rollup (which counts
 * only cost_captured rows). `readTelemetry` is injectable for tests.
 */
async function captureLedgerRow(
  supabase,
  { advisoryId, correlationId, sdKey, body, sessionId } = {},
  { readTelemetry = readSessionCostTelemetry } = {}
) {
  if (!correlationId) return { captured: false, reason: 'no correlation_id' };
  // Read cost telemetry BEFORE the write; fully fail-soft (the reader never throws, but guard anyway).
  let tele;
  try { tele = readTelemetry({ sessionId }) || { captured: false }; }
  catch { tele = { captured: false }; }
  const costCaptured = tele.captured === true;
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
          cost_tokens: costCaptured ? tele.costTokens : null,
          cost_wall_ms: costCaptured ? tele.wallMs : null,
          cost_captured: costCaptured,
        },
        { onConflict: 'correlation_id', ignoreDuplicates: true }
      );
    if (error) return { captured: false, reason: error.message };
    return { captured: true, costCaptured };
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
  warnIfCheckoutStale('solomon-advisory.cjs');
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'send' && mode !== 'request' && mode !== 'inbox' && mode !== 'status' && mode !== 'ack') {
    console.error('Usage: node scripts/solomon-advisory.cjs send "<body>" [--reply-to <id>] [--to adam] [--kind <recognized_kind>] [--framing-class instrument|pick]  |  request "<q>" [--timeout <ms>] [--to adam] [--kind <recognized_kind>]  |  inbox [--quiet] [--background]  |  ack <row-id...>  |  status [--working "<body>" [--eta <ms>]]');
    process.exit(2);
  }
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  // QF-20260710-593: --background marks a cron/monitor context whose stdout no reasoning turn
  // sees — such passes stamp delivered_at only (mirrors adam-advisory).
  const isBackground = argv.includes('--background');

  // QF-20260710-593 — `ack <id...>`: the action-time acknowledged_at stamp. Ids are positional
  // args (flags filtered out).
  if (mode === 'ack') {
    const ids = argv.slice(1).filter((a) => !a.startsWith('--'));
    if (ids.length === 0) { console.error('Usage: node scripts/solomon-advisory.cjs ack <row-id...>'); process.exit(2); }
    const solomonTarget = (await getActiveSolomonId(supabase)) || sessionId;
    await ackRows(supabase, ids, { expectedTarget: solomonTarget });
    return;
  }

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
    // FR-1: surface broadcast chairman directives FIRST-CLASS (above consults) with Solomon's per-directive
    // ack status, BEFORE the normal target_session-scoped drain — the Solomon-last-hop compliance fix.
    await renderChairmanDirectives(supabase, { quiet: argv.includes('--quiet') });
    await drainInbox(supabase, solomonId, { quiet: argv.includes('--quiet'), background: isBackground });
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
  // SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B: optional pick-vs-instrument sub-discriminator,
  // stamped as payload.framing_class alongside payload.oracle=true (no new kind). Omitting it
  // is byte-identical to pre-SD behavior.
  const fcIdx = argv.indexOf('--framing-class');
  const framingClassArg = fcIdx >= 0 ? argv[fcIdx + 1] || null : null;
  const validFramingClasses = Object.values(FRAMING_CLASSES);
  if (framingClassArg && !validFramingClasses.includes(framingClassArg)) {
    console.error(`ERROR: --framing-class must be one of ${validFramingClasses.join(', ')} (got "${framingClassArg}").`);
    process.exit(2);
  }
  // SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-2: --kind is OPTIONAL (omitting it is
  // byte-identical to pre-SD behavior); an EXPLICITLY-supplied value must be a recognized
  // kind or the send is rejected. Mirrors adam-advisory.cjs exactly.
  const kIdx = argv.indexOf('--kind');
  const kindArg = kIdx >= 0 ? argv[kIdx + 1] || null : null;
  if (kindArg && !KNOWN_SEND_KINDS.has(kindArg)) {
    console.error(`ERROR: --kind "${kindArg}" is not a recognized kind (see PAYLOAD_KINDS/DIRECTIVE_KINDS in lib/fleet/worker-status.cjs).`);
    process.exit(2);
  }
  // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: `send/request --to adam` — direct 1-hop
  // channel, gated by ADAM_SOLOMON_TWOWAY_V1 (default ON since QF-20260705-488; 'off' kills it).
  // SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-4: --to also accepts
  // the relay-class peers eva/ceo (lib/coordinator/peer-target.cjs's PEER_KINDS registry) —
  // these enqueue a tracked FR-1 relay-request instead of a direct write. --direct is
  // shorthand for --to adam (Solomon's one lateral session-class peer).
  const toIdx = argv.indexOf('--to');
  // Lowercased at the CLI boundary so `--to EVA`/`--to Eva` aren't rejected here while
  // resolvePeerTarget() would have resolved them fine (it's explicitly case-insensitive) --
  // adversarial-review finding, deep-tier PR review: the two layers previously disagreed.
  const toArg = toIdx >= 0 ? (argv[toIdx + 1] || '').toLowerCase() || null : null;
  const directIdx = argv.indexOf('--direct');
  const peerArg = toArg || (directIdx >= 0 ? 'adam' : null);
  const flagValueIdxs = new Set([tIdx, tIdx + 1, rIdx, rIdx + 1, rcIdx, rcIdx + 1, rwIdx, rwIdx + 1, toIdx, toIdx + 1, directIdx, kIdx, kIdx + 1].filter((i) => i >= 0));
  const body = argv.slice(1).filter((a, i) => !flagValueIdxs.has(i + 1)).join(' ').trim();
  if (!body) { console.error('ERROR: advisory body required.'); process.exit(2); }

  if (mode === 'request' && !isTwoWayV2Enabled()) {
    console.error('ERROR: request/await is gated by COORDINATOR_TWOWAY_V2=on (currently OFF). Use `send` for fire-and-forget.');
    process.exit(3);
  }
  const isRelayClassPeer = !!(peerArg && PEER_KINDS[peerArg] && PEER_KINDS[peerArg].class === 'relay');
  if (peerArg && peerArg !== 'adam' && !isRelayClassPeer) {
    const relayPeers = Object.keys(PEER_KINDS).filter((k) => PEER_KINDS[k].class === 'relay').join(', ');
    console.error(`ERROR: --to ${peerArg} is not supported (one of "adam", ${relayPeers} — omit --to for the default coordinator-relay target).`);
    process.exit(2);
  }
  const twoWayV1On = isAdamSolomonTwoWayV1Enabled();
  if (peerArg === 'adam' && !twoWayV1On) {
    console.error('ERROR: --to adam is disabled by ADAM_SOLOMON_TWOWAY_V1=off (direct lane is ON by default since QF-20260705-488). Omit --to to route via the coordinator.');
    process.exit(3);
  }

  // QF-20260719-387 (chairman-directed after live misroute d442d8ec): this is SOLOMON's outbound
  // lane — a non-Solomon session running it silently applies Solomon's routing defaults, so an
  // Adam->Solomon proposal landed on the coordinator lane. Hard-error (fail-closed) unless the
  // invoking session's registered role is solomon; covers send + request (relay path included).
  await assertSenderRole(supabase, { sessionId, requiredRole: 'solomon', toolName: 'solomon-advisory.cjs' });

  // FR-4 relay-class path: eva/ceo have no live session, so a relay-class --to enqueues a
  // tracked FR-1 relay_request via the coordinator queue instead of a direct insert — the
  // coordinator's relay-drain tick (FR-1/FR-2) performs the actual delivery + writes the
  // CONFIRM-ON-RELAY receipt. This is a fundamentally different row shape than a direct
  // advisory (no consult-dedup, no ledger capture), so it short-circuits here.
  if (isRelayClassPeer) {
    const relayCorrelationId = crypto.randomUUID();
    const { data, error } = await enqueueRelayRequest(supabase, {
      senderSession: sessionId,
      senderType: 'solomon',
      relayTo: peerArg,
      body,
      correlationId: relayCorrelationId,
    });
    if (error) { console.error('ERROR: failed to enqueue relay-request:', error); process.exit(1); }
    console.log('✓ Relay-request enqueued (tracked -- coordinator will drain + confirm)');
    console.log('  relay_request_id:', data.id);
    console.log('  relay_to:', peerArg);
    console.log('  correlation_id:', relayCorrelationId);
    return;
  }

  const coordinatorId = await getActiveCoordinatorId(supabase);
  const toAdam = peerArg === 'adam';
  const adamId = toAdam && twoWayV1On ? await getActiveAdamId(supabase).catch(() => null) : null;
  const { target, via } = resolveSolomonAdvisoryTarget({ toAdam, flagOn: twoWayV1On, coordinatorId, adamId });
  // QF-20260719-387: read back the resolved target's registered role and hard-error on a
  // recipient-class mismatch (--to adam -> role=adam; default -> the active coordinator).
  await assertTargetRole(supabase, { target, expectedRole: toAdam ? 'adam' : 'coordinator' });
  const senderCallsign = await snapshotSender(supabase, sessionId);
  const correlationId = crypto.randomUUID();
  const expectsReply = mode === 'request';
  let replyTo = null;
  if (replyToArg && mode === 'send') {
    try { replyTo = await resolveReplyToCorrelation(supabase, replyToArg); }
    catch (e) { console.error(`ERROR: --reply-to ${replyToArg} — ${e.message}`); process.exit(2); }
  }
  // QF-20260711-596: capBody() (called inside buildAdvisoryPayload) hard-errors on an over-4096
  // body instead of silently clipping. Caught here (not left to the generic top-level UNHANDLED
  // handler) so an oversize send fails LOUDLY with the same BODY_TOO_LONG/exit-2 contract
  // worker-signal.cjs already uses -- never a silent clip, never a crash-shaped stack trace.
  let payload;
  try {
    payload = buildAdvisoryPayload({ body, senderCallsign, repo: process.cwd(), correlationId, expectsReply, replyTo, via, replyClass: replyClassArg, replyWindowMs, kind: kindArg, framingClass: framingClassArg });
  } catch (e) {
    if (e && e.code === 'BODY_TOO_LONG') { console.error('ERROR:', e.message); process.exit(2); }
    throw e;
  }
  const subject = `[SOLOMON_ORACLE] ${payload.body.slice(0, 80)}`;
  const expiresAt = advisoryExpiresAt(Date.now());

  // Durable dedup: never re-answer a consult already answered (when replying to one).
  // QF-20260705-488 (adversarial-review W1): this return previously made a FAILED originator
  // CC permanently unrecoverable — the primary answer existed, so a re-run short-circuited
  // here and the originator never got its copy (the exact hand-relay gap this QF closes).
  // The dedup branch now heals a missing CC (idempotent) before returning.
  if (replyTo && (await alreadyAnswered(supabase, replyTo))) {
    const healed = await ensureOriginatorCc(supabase, { replyRef: replyToArg || replyTo, replyTo, target, sessionId, subject, payload, expiresAt });
    console.log(`(dedup) consult ${String(replyTo).slice(0, 8)} already answered — not re-sending.${healed.inserted ? ` (healed missing originator CC -> ${healed.originator})` : ''}`);
    if (healed.error) console.error('WARN: originator CC heal failed (re-run the same --reply-to to retry):', healed.error);
    return;
  }

  let inserted;
  try {
    const { data, error } = await insertCoordinationRow(
      supabase,
      { sender_session: sessionId, sender_type: 'solomon', target_session: target, message_type: 'INFO', subject, body: payload.body, payload, expires_at: expiresAt },
      // SD-LEO-INFRA-SEND-TIME-TARGET-001 / FR-2: `--to adam` is statically an Adam-role
      // target — hint the target-drain warn so a resolved UUID needs no identity lookup.
      { select: 'id', single: true, targetRoleHint: toAdam ? 'adam' : undefined }
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
    sessionId, // W3 (FR-6): key cost telemetry to the writing session at write time
  });
  if (!ledgerResult.captured) {
    ledgerCaptureFailures += 1;
    console.error(`WARN: ledger capture failed (${ledgerCaptureFailures} this run) — ${ledgerResult.reason}`);
  }

  // QF-20260705-488 (chairman-caught): a consult ANSWER must also land in the ORIGINATOR's
  // inbox — answer d7f5401c targeted only the coordinator while the consult came from Adam,
  // and the chairman had to hand-relay the verdict. Fail-open: a CC failure warns, never
  // blocks the primary send; a re-run of the same --reply-to heals a missing CC (W1).
  if (replyTo) {
    const cc = await ensureOriginatorCc(supabase, { replyRef: replyToArg || replyTo, replyTo, target, sessionId, subject, payload, expiresAt });
    if (cc.inserted) console.log('  cc_originator:', cc.originator);
    else if (cc.error) console.error('WARN: originator CC failed (primary send unaffected; re-run the same --reply-to to retry):', cc.error);
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
  checkLedgerCaptureHealth, resolveSolomonAdvisoryTarget, resolveConsultOriginator, ensureOriginatorCc,
  stampSurfaced, ackRows, KNOWN_SEND_KINDS,
};

if (require.main === module) {
  main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
