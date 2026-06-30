#!/usr/bin/env node
/**
 * Adam advisory comms lane (clean, non-friction)
 * SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B
 * SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 — FR-3/FR-4/FR-6: every advisory is
 *   replyable (correlation_id ALWAYS, decoupled from the awaiting-sync `expects_reply`
 *   intent), a durable `replies` reader recovers coordinator replies that arrive after
 *   a sync await times out, and the advisory INSERT routes through the validated
 *   dispatch writer (a stale coordinator UUID is refused, not dead-lettered).
 *
 * Gives the Adam role a dedicated lane to send advisories to the coordinator
 * WITHOUT polluting the worker-friction signal-router. An advisory is a
 * session_coordination row: message_type=INFO + payload.kind=adam_advisory and
 * deliberately NO payload.signal_type (so lib/coordinator/signal-router.cjs
 * loadRecentSignals — which filters payload->>signal_type IS NOT NULL — never
 * scoops it) and NO payload.intent_action (so the deconfliction sweep ignores it).
 *
 * Builds on (does NOT duplicate) SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001:
 * reuses scripts/worker-signal.cjs (redact, BODY_HARD_CAP, awaitCoordinatorReply),
 * lib/coordinator/resolve.cjs (getActiveCoordinatorId, isTwoWayV2Enabled),
 * lib/coordinator/dispatch.cjs (insertCoordinationRow), and the existing
 * scripts/coordinator-reply.cjs for the reply leg. No migration.
 *
 * Usage:
 *   node scripts/adam-advisory.cjs send "<advisory body>"                          (fire-and-forget; replyable)
 *   node scripts/adam-advisory.cjs request "<question>" [--timeout 30000]          (awaits a coordinator reply; needs COORDINATOR_TWOWAY_V2=on)
 *   node scripts/adam-advisory.cjs replies                                         (drain ONLY the reply lane — kept for back-compat)
 *   node scripts/adam-advisory.cjs inbox                                           (FULL-LANE drain: replies + coordinator directives — the recurring inbox-monitor tick)
 */

const crypto = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { redact, BODY_HARD_CAP, awaitCoordinatorReply } = require('./worker-signal.cjs');
const { getActiveCoordinatorId, isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { PAYLOAD_KINDS, DIRECTIVE_KINDS } = require('../lib/fleet/worker-status.cjs');
// SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001: reuse the canonical Adam-session resolver for the unattended
// full-lane tick (env vars are not reliably propagated to cron subprocesses).
const { resolveAdamSessionId } = require('./read-adam-directives.cjs');

/**
 * Pure: build the advisory payload. INVARIANT: carries payload.kind=adam_advisory
 * and NEVER signal_type / intent_action (so neither the friction router nor the
 * intent sweep scoops it). Exported for tests.
 *
 * FR-3 (R2 decoupling): correlation_id makes the advisory REPLYABLE and is carried
 * whenever present (every send now generates one). expects_reply is a DISTINCT
 * signal — "the sender is synchronously awaiting a reply" — and is set ONLY for
 * request mode. Conflating them made every fire-and-forget send falsely advertise
 * Reply?=yes in printAdamInbox.
 */
// SD-LEO-INFRA-ADAM-ADVISORY-COMMS-001: durable delivery TTL, mode-INDEPENDENT. expires_at governs
// how long an advisory row stays discoverable (survives the expired-row sweep) — NOT how long the
// sender awaits a reply (that is timeoutMs, applied only to awaitCoordinatorReply). PURE for tests.
const ADVISORY_TTL_MS = 24 * 60 * 60_000; // 24h — same durable window send mode always had.
function advisoryExpiresAt(nowMs) {
  const base = Number.isFinite(nowMs) ? nowMs : Date.now();
  return new Date(base + ADVISORY_TTL_MS).toISOString();
}

// SD-REFILL-00XK256L: the 2-hypothesis-bar guard for Adam urgent operational broadcasts. Adam's web-
// research sweep has TWICE (2026-06-11 stall misdiagnosis; 2026-06-13 advisory 4f6082eb) produced a
// HALLUCINATED fleet-wide operational alarm — a fabricated "model cutoff" naming a NON-EXISTENT model
// ("Mythos 5") with invented anthropic.com/CNBC citations — broadcast BEFORE running the cheap
// discriminating observable (is the fleet completing work right now?). This PURE detector trips on the
// ALARM SHAPE only — an urgent MODEL-AVAILABILITY claim — the class that MUST clear the bar (a
// discriminator run + a real-model-name/citation sanity check) before broadcast. It flags the shape,
// not every advisory that merely mentions a model. Exported for tests.
const MODEL_AVAILABILITY_ALARM_RE = /\b(cut[-\s]?off|disabled|deprecat\w*|unavailable|shut[-\s]?down|revoked|killed|export[-\s]?control\w*|sunset\w*|discontinu\w*)\b/i;
const MODEL_TOKEN_RE = /\b(models?|fable|opus|sonnet|haiku|claude|gpt|llm|mythos)\b/i;
function sanityCheckUrgentAdvisory(body) {
  const text = String(body || '');
  const reasons = [];
  const modelRef = MODEL_TOKEN_RE.test(text);
  if (MODEL_AVAILABILITY_ALARM_RE.test(text) && modelRef) reasons.push('urgent model-availability / cutoff claim');
  if (/\bfleet[-\s]?wide\b/i.test(text) && modelRef) reasons.push('fleet-wide model-impact claim');
  return { tripped: reasons.length > 0, reasons };
}

function buildAdvisoryPayload({ body, senderCallsign, repo, correlationId, expectsReply, scopeKey, reuseClass, appliesToScopes, replyTo }) {
  const payload = {
    kind: PAYLOAD_KINDS.ADAM_ADVISORY,
    sender_callsign: senderCallsign || null,
    repo: repo || null,
  };
  // FR-1 (SD-LEO-INFRA-ADAM-PREFERENCE-LEARNING-001) — scope-tagged surfacing. ADDITIVE
  // routing fields (no migration); scope_key reuses the lib/adam/scope-registry.js
  // vocabulary (harness | platform | venture:<id>). reuse_class classifies applicability
  // (scope_local | cross_scope); applies_to_scopes lists the scopes a cross-scope advisory
  // covers. The two-stage actioned_at ACK is unchanged.
  if (scopeKey) payload.scope_key = scopeKey;
  if (reuseClass) payload.reuse_class = reuseClass;
  if (Array.isArray(appliesToScopes) && appliesToScopes.length) payload.applies_to_scopes = appliesToScopes;
  if (body) {
    // Prefix the body with [<scope_key>] so a delivered-but-ignored advisory stays
    // scannable by scope. Prefix BEFORE redact/slice so the tag survives the hard cap.
    const tagged = scopeKey ? `[${scopeKey}] ${String(body)}` : String(body);
    payload.body = redact(tagged).slice(0, BODY_HARD_CAP);
  }
  if (correlationId) payload.correlation_id = correlationId; // replyable (always)
  if (expectsReply) payload.expects_reply = true;            // awaiting a sync reply (request mode only)
  // FR-1 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): when this advisory ANSWERS an inbound
  // coordinator_request, echo that request's correlation under BOTH keys (reply_to +
  // correlation_id) so the awaiting side's forgiving matcher pairs it. The echo OVERRIDES the
  // fresh correlation_id above — a reply correlates to its request, not to itself.
  if (replyTo) {
    payload.reply_to = replyTo;
    payload.correlation_id = replyTo;
  }
  // INVARIANT: no signal_type, no intent_action.
  return payload;
}

/**
 * FR-1 — resolve the scope_key for an outgoing advisory from the SENDING repo, REUSING the
 * lib/adam/scope-registry.js vocabulary (harness | platform | venture:<id>) instead of
 * re-inventing it. The ESM registry is loaded via a string-LITERAL dynamic import (the
 * CJS->ESM WIRE_CHECK-safe form). Fail-soft: any resolution error returns {} so the advisory
 * still sends untagged (backward-compatible). Exported for tests.
 * @returns {Promise<{scopeKey?:string, reuseClass?:string, appliesToScopes?:string[]}>}
 */
async function resolveScopeForSend(supabase, repoPath) {
  try {
    const { enumerateScopes } = await import('../lib/adam/scope-registry.js');
    const scopes = await enumerateScopes(supabase);
    if (!Array.isArray(scopes) || scopes.length === 0) return {};
    // Canonicalize (forward-slash + strip any .worktrees/<sd> suffix) so a worker's worktree
    // cwd matches the registry's main-root repo_path. Mirrors lib/repo-paths toCanonicalRepoPath.
    const canon = (p) => String(p || '').replace(/\\/g, '/').replace(/\/\.worktrees\/[^/]+/, '').replace(/\/+$/, '');
    const here = canon(repoPath);
    // No 'platform' fallback: a repo that matches no enumerated scope stays UNTAGGED (honest)
    // rather than mislabeled — scope_key only appears when we can actually identify the scope.
    const mine = scopes.find((s) => canon(s.repo_path) === here) || null;
    if (!mine) return {};
    return { scopeKey: mine.scope_key, reuseClass: 'scope_local', appliesToScopes: [mine.scope_key] };
  } catch {
    return {};
  }
}

/**
 * FR-1 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001) — resolve `--reply-to <value>` to the
 * correlation to echo. The value may be EITHER a session_coordination row id (the inbound
 * coordinator_request row — we echo ITS payload.correlation_id) or a bare correlation id
 * (echoed as-is). Row lookup is best-effort: if no row matches, the value is treated as the
 * correlation itself. Throws only when a matching ROW exists but carries no correlation_id
 * (not replyable — surfacing that beats silently inventing a correlation). Exported for tests.
 */
async function resolveReplyToCorrelation(supabase, value) {
  if (!value) return null;
  let row = null;
  try {
    const { data } = await supabase
      .from('session_coordination')
      .select('id, payload')
      .eq('id', value)
      .maybeSingle();
    row = data || null;
  } catch { row = null; /* not a row id (or lookup failed) -> treat as correlation */ }
  if (row) {
    const corr = row.payload && row.payload.correlation_id;
    if (!corr) {
      const e = new Error(`row ${value} carries no payload.correlation_id (not replyable)`);
      e.code = 'REPLY_TO_NOT_REPLYABLE';
      throw e;
    }
    return corr;
  }
  return value;
}

async function snapshotSender(supabase, sessionId) {
  try {
    const { data } = await supabase.from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
    return data?.metadata?.fleet_identity?.callsign || data?.metadata?.callsign || null;
  } catch { return null; }
}

/**
 * FR-4 — durable reader: drain replies targeting THIS Adam session that were not consumed by an
 * in-flight sync await (read_at IS NULL). These are replies that arrived after `request` mode's
 * await timed out, or replies to fire-and-forget `send` advisories. Gates on read_at IS NULL
 * (same gate the inbox hook leaves NULL for an Adam session) so each reply is consumed EXACTLY
 * once. Stamps read_at to consume.
 *
 * SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-4) — FULL-LANE reader. This previously surfaced
 * ONLY payload.kind='coordinator_reply', so a reply to an Adam advisory that carries a correlation
 * (payload.reply_to) under any other kind was hidden — the reply-only blindspot. The fix fetches
 * this session's UNREAD rows with AND-only filters (target_session + read_at IS NULL) and selects
 * the reply lane IN JS: coordinator_reply OR any row carrying a payload.reply_to correlation. This
 * deliberately avoids a PostgREST .or() over a jsonb ->> extraction (the `not.is.null` form inside
 * .or() is brittle) and sidesteps any .or()+.eq() boolean-precedence question — lane separation is
 * GUARANTEED by the AND-only query (every returned row is scoped to THIS target_session). A
 * non-reply row is never surfaced, and the exactly-once read_at consume is unchanged. (Inbound
 * coordinator DIRECTIVES of all kinds remain covered by scripts/read-adam-directives.cjs + the
 * amAdam inbox carve-out; this closes the `replies` lane.)
 */
function isReplyRow(r) {
  const p = r && r.payload;
  if (!p) return false;
  return p.kind === 'coordinator_reply' || (p.reply_to != null && p.reply_to !== '');
}

async function drainReplies(supabase, sessionId) {
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, subject, body, payload, created_at')
    .eq('target_session', sessionId)
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) { console.error('ERROR: replies query failed:', error.message); process.exit(1); }
  const rows = (allRows || []).filter(isReplyRow);
  if (rows.length === 0) { console.log('(no unread directed replies)'); return; }

  console.log(`${rows.length} directed repl${rows.length === 1 ? 'y' : 'ies'}:`);
  const ids = [];
  for (const r of rows) {
    const replyTo = (r.payload && r.payload.reply_to) || '?';
    const text = (r.payload && r.payload.body) || r.body || '(empty)';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    console.log(`  • [${String(replyTo).slice(0, 8)}] (${ageMin}m) ${text}`);
    ids.push(r.id);
  }
  // Consume: stamp read_at only on rows still NULL (idempotent; mirrors the await consume).
  await supabase
    .from('session_coordination')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null);
}

/**
 * SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001 — is this row a coordinator DIRECTIVE kind? Classifies by
 * the IMPORTED canonical DIRECTIVE_KINDS allowlist (QF-20260610-545: classify the KIND, never the
 * sender_type). Never duplicates the literals — source-pinned by coord-adam-comms-resilient.test.js.
 */
function isDirectiveRow(r) {
  const k = r && r.payload && r.payload.kind;
  return k != null && DIRECTIVE_KINDS.includes(k);
}

/**
 * SD-LEO-FIX-ADAM-INBOX-ALL-CLASSES-001 — the Adam inbox must drain ALL classes DIRECTED to the Adam
 * session, not just the reply lane + the shared DIRECTIVE_KINDS (which FULL-LANE already covered).
 * Live data showed several genuinely Adam-directed classes still undrained, so this Adam-SCOPED
 * allowlist = the imported DIRECTIVE_KINDS (workers consume that; we do NOT mutate it) PLUS the
 * chairman/coordinator-directed classes that target Adam directly. Classify the KIND via the allowlist
 * (QF-20260610-545), never a broad payload->>kind server filter.
 *
 * DELIBERATELY EXCLUDED (owned by dedicated handlers — the Adam inbox must never mark them read first):
 *   canary_request   -> the canary responder
 *   comms_check      -> /checkin roll-call
 *   ack / coordinator_ack -> terminal acknowledgements (nothing to action)
 *   (untyped: no payload.kind) -> roll_call + other untyped rows (NOT directed action items)
 */
const ADAM_INBOX_KINDS = Object.freeze([
  ...DIRECTIVE_KINDS,
  'chairman_heads_up',
  'chairman_handoff',
  'coordinator_advisory',
  // SD-LEO-FEAT-ADAM-INBOX-CONSUMPTION-001 (verify-the-premise): the coordinator hourly-review dispatches
  // Adam a payload.kind='coordinator_reminder' ('review your Adam responsibilities'). This kind is ALREADY
  // drained by the Adam inbox because it lives in the shared DIRECTIVE_KINDS (worker-status.cjs, added by
  // #4610 on 2026-06-10) which is spread into ADAM_INBOX_KINDS above — live data confirms 0 unread. It is
  // intentionally NOT re-listed here to avoid a misleading duplicate; the coupling is pinned by
  // tests/unit/adam-inbox-coordinator-reminder.test.js so a future DIRECTIVE_KINDS edit can't silently
  // break Adam's drain of it.
  'coordinator_adam_feedback',
  'assist_request',
  'reconcile_consult',
  // SD-LEO-INFRA-ADAM-INBOX-KINDS-SOURCE-REQUEST-001: the coordinator's belt-low source-to-capacity
  // handshake dispatches Adam a payload.kind='coordinator_source_request'. Without it in this allowlist,
  // isAdamInboxRow returned false and the normal drain skipped it — it only reached Adam via the degraded
  // orphan/visibility-recovery fallback. A coordinator->Adam directive-to-action (sibling of
  // coordinator_advisory / coordinator_adam_feedback), so it belongs here, NOT in EXCLUDED_KINDS.
  'coordinator_source_request',
]);

/**
 * Is this row a directed Adam-inbox message? True when its payload.kind is in the Adam-scoped
 * ADAM_INBOX_KINDS allowlist (a SUPERSET of DIRECTIVE_KINDS). Untyped rows (no payload.kind) and any
 * excluded/responder-owned kind return false (never drained by the Adam inbox).
 */
function isAdamInboxRow(r) {
  const k = r && r.payload && r.payload.kind;
  return k != null && ADAM_INBOX_KINDS.includes(k);
}

/**
 * SD-FDBK-INFRA-ADAM-INBOX-ADAM-001 — handler-owned kinds the Adam inbox must NEVER surface or
 * consume (each has a dedicated responder that owns the row; the Adam inbox marking it read first
 * would break that handler). Mirrors the "DELIBERATELY EXCLUDED" list in the ADAM_INBOX_KINDS doc.
 */
const EXCLUDED_KINDS = Object.freeze(['canary_request', 'comms_check', 'ack', 'coordinator_ack']);

/**
 * SD-FDBK-INFRA-ADAM-INBOX-ADAM-001 — is this an ORPHANED Adam-directed row? A row targeting the
 * Adam session (the drainInbox query already scopes target_session) that the two drain lanes both
 * miss: NOT a reply, NOT an Adam-directive (kind not in ADAM_INBOX_KINDS), and NOT a handler-owned
 * kind. This catches BOTH untyped rows (payload.kind null — the live 2026-06-20 enforcer-verdict
 * blindspot) AND unknown typed kinds (e.g. coordinator_alert) that no allowlist covers. These are
 * genuine deliveries, not noise — drainInbox WARNS about them (visibility) but does NOT consume
 * them, preserving the deliberate non-consume invariant (SD-LEO-FIX-ADAM-INBOX-ALL-CLASSES-001).
 * PURE. @param {object} r @returns {boolean}
 */
function isOrphanedAdamRow(r) {
  if (!r) return false;
  if (isReplyRow(r) || isAdamInboxRow(r)) return false; // already drained by a real lane
  const k = r.payload && r.payload.kind;
  if (k != null && EXCLUDED_KINDS.includes(k)) return false; // handler-owned → never touch
  return true; // untyped, or an unknown typed kind targeting Adam → orphaned delivery
}

/**
 * SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001 — unified FULL-LANE inbox drain (the corrective for the
 * reply-only blindspot that left SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001's full-lane criterion
 * unmet). `drainReplies` surfaces ONLY the reply lane, so coordinator DIRECTIVE-kind rows (any
 * payload.kind in the imported DIRECTIVE_KINDS allowlist) targeting the Adam session were never
 * drained by the recurring inbox-monitor tick.
 *
 * This drains BOTH lanes for THIS Adam session. It fetches this session's UNREAD rows with AND-ONLY
 * server filters (target_session + read_at IS NULL) — NEVER a payload->>kind .or()/.in() (the
 * ambiguous-PostgREST trap PR #4770 hit) — and classifies the lane IN JS:
 *   reply lane     = isReplyRow(r)            (coordinator_reply OR a payload.reply_to correlation)
 *   directive lane = isDirectiveRow(r)        (payload.kind in the IMPORTED DIRECTIVE_KINDS)
 * Lane separation is GUARANTEED by the AND-only target_session scope (every returned row is THIS
 * session's). Surfaced rows are stamped read_at = DELIVERED. acknowledged_at / payload.actioned_at
 * are WITHHELD (two-stage ACK, mirroring classifyInboxMessage's {markRead:true, markAck:false}) so a
 * DELIVERED-but-unacked directive stays recoverable via scripts/read-adam-directives.cjs (the
 * acknowledged_at IS NULL tier) until Adam genuinely acts.
 */
async function drainInbox(supabase, sessionId, { quiet = false } = {}) {
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, message_type, subject, body, payload, created_at')
    .eq('target_session', sessionId)
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) { console.error('ERROR: inbox query failed:', error.message); process.exit(1); }

  // SD-LEO-FIX-ADAM-INBOX-ALL-CLASSES-001: widen the drain to ALL directed Adam classes
  // (isAdamInboxRow ⊇ DIRECTIVE_KINDS) — responder-owned + untyped rows stay untouched.
  const rows = (allRows || []).filter((r) => isReplyRow(r) || isAdamInboxRow(r));

  // SD-FDBK-INFRA-ADAM-INBOX-ADAM-001: surface (WARN, do NOT consume) orphaned Adam-directed rows the
  // two drain lanes miss — untyped (payload.kind null) or unknown typed kinds (e.g. coordinator_alert),
  // minus the handler-owned EXCLUDED_KINDS. These are real deliveries (live 2026-06-20: untyped enforcer
  // verdicts left Adam 40m blind). WARN keeps them VISIBLE without consuming, preserving the deliberate
  // non-consume invariant (read_at stays NULL → recoverable; pinned by adam-inbox-all-classes.test.js).
  const orphaned = (allRows || []).filter(isOrphanedAdamRow);
  if (orphaned.length > 0) {
    console.warn(`⚠ ${orphaned.length} unread Adam-directed row${orphaned.length === 1 ? '' : 's'} with unrecognized/untyped kind NOT auto-drained (visibility — NOT consumed, still recoverable):`);
    for (const r of orphaned) {
      const kind = (r.payload && r.payload.kind) || '(untyped)';
      const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
      const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
      console.warn(`  ⚠ [orphan/${kind}] id=${r.id} (${ageMin}m) ${text}`);
    }
    console.warn('  → these target the Adam session but match no drain lane; fix the producer to use a typed ADAM_INBOX_KINDS kind, or read via the durable reader.');
  }

  // SD-REFILL-00YJS6VB: the recurring inbox-monitor tick fires every few minutes and was a
  // no-op narration line ("(no unread...)") when the lane is empty — churn during quiescent /
  // chairman-attached work. With --quiet (the recurring tick), stay SILENT on a fully-empty lane
  // (mirrors the belt-countdown/offer-help silence-by-default). Manual `inbox` keeps the
  // confirmation line. Orphaned-row WARNINGs above are NEVER suppressed (real unread deliveries).
  if (rows.length === 0) { if (!quiet) console.log('(no unread directed inbox rows — replies or directed classes)'); return; }

  console.log(`${rows.length} inbox row${rows.length === 1 ? '' : 's'} (full lane — replies + all directed classes):`);
  const ids = [];
  for (const r of rows) {
    const lane = isReplyRow(r) ? 'reply' : (isDirectiveRow(r) ? 'directive' : 'adam-directed');
    const kind = (r.payload && r.payload.kind) || r.message_type || '?';
    const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    console.log(`  • [${lane}/${kind}] (${ageMin}m) ${text}`);
    ids.push(r.id);
  }
  // Consume: stamp read_at = DELIVERED on surfaced rows still NULL (idempotent). Deliberately do NOT
  // set acknowledged_at / payload.actioned_at — directives stay in the read-but-unacked tier
  // (read-adam-directives.cjs) until genuinely actioned (two-stage ACK).
  await supabase
    .from('session_coordination')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null);
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'send' && mode !== 'request' && mode !== 'replies' && mode !== 'inbox') {
    console.error('Usage: node scripts/adam-advisory.cjs send "<body>" [--reply-to <correlation_or_row_id>]  |  request "<question>" [--timeout <ms>]  |  replies  |  inbox');
    process.exit(2);
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  // FR-4 — durable reply reader (reply lane only; kept for back-compat).
  if (mode === 'replies') {
    await drainReplies(supabase, sessionId);
    return;
  }

  // SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001 — unified FULL-LANE drain (replies + coordinator directives).
  // Resolve the CANONICAL Adam session (CLAUDE_SESSION_ID only if it IS the Adam session, else the
  // most-recent role='adam' session) so the unattended cron tick can't drain the wrong/empty session
  // if the env var didn't propagate; falls back to the env sessionId.
  if (mode === 'inbox') {
    const adamId = (await resolveAdamSessionId(supabase)) || sessionId;
    await drainInbox(supabase, adamId, { quiet: argv.includes('--quiet') });
    return;
  }

  const tIdx = argv.indexOf('--timeout');
  const timeoutMs = tIdx >= 0 ? Number(argv[tIdx + 1]) || 30000 : 30000;
  // FR-1 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): `send --reply-to <correlation_or_row_id>`
  // — answer an inbound coordinator_request, echoing its correlation (resolved below).
  const rIdx = argv.indexOf('--reply-to');
  const replyToArg = rIdx >= 0 ? argv[rIdx + 1] || null : null;
  const flagValueIdxs = new Set([tIdx, tIdx + 1, rIdx, rIdx + 1].filter(i => i >= 0));
  const body = argv.slice(1).filter((a, i) => !flagValueIdxs.has(i + 1)).join(' ').trim();
  if (!body) { console.error('ERROR: advisory body required.'); process.exit(2); }

  const coordinatorId = await getActiveCoordinatorId(supabase);
  const target = coordinatorId || 'broadcast-coordinator';
  const senderCallsign = await snapshotSender(supabase, sessionId);

  if (mode === 'request' && !isTwoWayV2Enabled()) {
    console.error('ERROR: request/await is gated by COORDINATOR_TWOWAY_V2=on (currently OFF). Use `send` for fire-and-forget.');
    process.exit(3);
  }

  // FR-3: every advisory carries a correlation_id (replyable); only request mode
  // sets expects_reply (it synchronously awaits).
  const correlationId = crypto.randomUUID();
  const expectsReply = mode === 'request';
  // FR-1 (COORD-ADAM-COMMS-RESILIENT): resolve --reply-to (row id OR correlation) to the
  // correlation to echo. Send-mode only; a hard failure here is surfaced, not swallowed.
  let replyTo = null;
  if (replyToArg && mode === 'send') {
    try { replyTo = await resolveReplyToCorrelation(supabase, replyToArg); }
    catch (e) { console.error(`ERROR: --reply-to ${replyToArg} — ${e.message}`); process.exit(2); }
  }
  // FR-1: scope-tag the advisory from the sending repo (reuse-first, fail-soft).
  const { scopeKey, reuseClass, appliesToScopes } = await resolveScopeForSend(supabase, process.cwd());
  const payload = buildAdvisoryPayload({ body, senderCallsign, repo: process.cwd(), correlationId, expectsReply, scopeKey, reuseClass, appliesToScopes, replyTo });
  // SD-REFILL-00XK256L: the 2-hypothesis-bar GATE. Block an UNATTESTED urgent model-availability
  // broadcast — Adam's research sweep has twice fabricated a fleet-wide "model cutoff" and broadcast it
  // before running the cheap discriminator. The sender attests the bar was cleared with --alarm-verified.
  const alarmCheck = sanityCheckUrgentAdvisory(payload.body);
  const alarmAttested = argv.includes('--alarm-verified') || process.env.ADAM_ALARM_VERIFIED === '1';
  if (alarmCheck.tripped && !alarmAttested) {
    console.error(
      `\n[adam-advisory] ⛔ 2-HYPOTHESIS BAR (SD-REFILL-00XK256L): this advisory makes an urgent ` +
      `${alarmCheck.reasons.join(' + ')}. Adam's research sweep has TWICE broadcast a HALLUCINATED fleet-wide ` +
      `"model cutoff" (a non-existent model + fabricated citations) BEFORE checking the cheap discriminator.\n` +
      `Before broadcasting, CLEAR THE BAR:\n` +
      `  (a) DISCRIMINATING OBSERVABLE — is the fleet COMPLETING work right now? A fresh sd_phase_handoffs / LFA in the\n` +
      `      last ~90min FALSIFIES a "fleet-wide model cutoff".\n` +
      `  (b) CITATION/MODEL SANITY — every model name must be REAL (Fable 5 / Opus 4.x / Sonnet 4.x / Haiku 4.x — NOT a\n` +
      `      hallucinated name like "Mythos 5") and every citation must resolve to a real source.\n` +
      `Then re-send with --alarm-verified (or ADAM_ALARM_VERIFIED=1) to attest the bar was cleared.\n`
    );
    process.exit(3);
  }
  const subject = `[ADAM_ADVISORY] ${payload.body.slice(0, 80)}`;
  // SD-LEO-INFRA-ADAM-ADVISORY-COMMS-001 (RCA 076cf785): expires_at is the DURABLE delivery TTL
  // (how long the row stays discoverable / survives the expired-row sweep) and is decoupled from
  // the synchronous await window. The old `mode === 'request' ? timeoutMs + 5min` gave a
  // request-mode advisory only ~5.5min — swept BEFORE the ~15min coordinator inbox poll (the 5th
  // Adam->coordinator comms-loss mode). ALL modes now get a durable 24h TTL; `timeoutMs` continues
  // to bound ONLY awaitCoordinatorReply below.
  const expiresAt = advisoryExpiresAt(Date.now());

  // FR-6: route through the validated dispatch writer. insertCoordinationRow THROWS
  // (DISPATCH_TARGET_*) on a bad/dead target instead of returning {error}, so wrap it
  // and map err.code to a clean message + non-zero exit (no raw stack, no silent loss).
  // The 'broadcast-coordinator' sentinel short-circuits validation (no live coordinator).
  let inserted;
  try {
    const { data, error } = await insertCoordinationRow(
      supabase,
      { sender_session: sessionId, sender_type: 'adam', target_session: target, message_type: 'INFO', subject, body: payload.body, payload, expires_at: expiresAt },
      { select: 'id', single: true }
    );
    if (error) { console.error('ERROR: failed to insert advisory:', error.message); process.exit(1); }
    inserted = data;
  } catch (e) {
    const code = e && e.code ? `${e.code}: ` : '';
    console.error(`ERROR: advisory not sent — ${code}${(e && e.message) || e}`);
    process.exit(1);
  }

  console.log('✓ Adam advisory sent');
  console.log('  advisory_id:', inserted.id);
  console.log('  target:', target);
  console.log('  correlation_id:', payload.correlation_id, replyTo ? '(echoed from --reply-to)' : '(replyable)');
  if (replyTo) console.log('  reply_to:', replyTo);
  console.log('  callsign:', senderCallsign || '(none)');

  if (mode === 'request') {
    console.log('  — awaiting coordinator reply…');
    const result = await awaitCoordinatorReply(supabase, { sessionId, correlationId, timeoutMs });
    if (result.timedOut) { console.log('⌛ No reply within timeout (reply may arrive later — drain it with `node scripts/adam-advisory.cjs inbox`).'); process.exit(0); }
    // Consume: stamp read_at so neither the durable `replies` reader nor the inbox re-shows it.
    try { await supabase.from('session_coordination').update({ read_at: new Date().toISOString(), acknowledged_at: new Date().toISOString() }).eq('id', result.reply.id); } catch {}
    console.log('✓ Reply:', (result.reply.payload && result.reply.payload.body) || result.reply.body || '(empty)');
  }
}

/**
 * FR-4 (SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C): on an Adam (re)register/restart, re-target
 * UNREAD session_coordination rows destined for an OLD Adam session to the NEW Adam session, so a
 * restarted Adam receives replies/directives the prior session never consumed. Mirrors the
 * coordinator broadcast-drain (lib/coordinator/resolve.cjs:233-238). IDEMPOTENT: gates on
 * read_at IS NULL and re-targets old->new, so a re-run matches nothing (no loop, no duplicate).
 * FAIL-OPEN: returns { moved:0, error? } on any error, never throws. The caller (adam-register)
 * only invokes this under the ROLE_HANDOFF_ADAM_V1 flag.
 * @param {object} supabase
 * @param {{ newSessionId: string, oldSessionIds: string[] }} p
 * @returns {Promise<{ moved: number, error?: string }>}
 */
async function drainAdamOutbound(supabase, { newSessionId, oldSessionIds } = {}) {
  if (!supabase || !newSessionId || !Array.isArray(oldSessionIds)) return { moved: 0 };
  const olds = oldSessionIds.filter((s) => typeof s === 'string' && s && s !== newSessionId);
  if (!olds.length) return { moved: 0 };
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      .update({ target_session: newSessionId })
      .in('target_session', olds)
      .is('read_at', null)            // only UNREAD rows → idempotent (consumed rows never re-move)
      .gte('created_at', cutoff)
      .select('id');
    if (error) return { moved: 0, error: error.message };
    return { moved: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return { moved: 0, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = { buildAdvisoryPayload, advisoryExpiresAt, ADVISORY_TTL_MS, sanityCheckUrgentAdvisory, resolveScopeForSend, resolveReplyToCorrelation, drainReplies, isReplyRow, drainInbox, isDirectiveRow, isAdamInboxRow, ADAM_INBOX_KINDS, drainAdamOutbound, isOrphanedAdamRow, EXCLUDED_KINDS };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
