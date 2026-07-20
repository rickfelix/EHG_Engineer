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
 * reuses scripts/worker-signal.cjs (redact, capBody, awaitCoordinatorReply),
 * lib/coordinator/resolve.cjs (getActiveCoordinatorId, isTwoWayV2Enabled),
 * lib/coordinator/dispatch.cjs (insertCoordinationRow), and the existing
 * scripts/coordinator-reply.cjs for the reply leg. No migration.
 *
 * Usage:
 *   node scripts/adam-advisory.cjs send "<advisory body>"                          (fire-and-forget; replyable)
 *   node scripts/adam-advisory.cjs request "<question>" [--timeout 30000]          (awaits a coordinator reply; needs COORDINATOR_TWOWAY_V2=on)
 *   node scripts/adam-advisory.cjs replies                                         (drain ONLY the reply lane — kept for back-compat)
 *   node scripts/adam-advisory.cjs inbox                                           (FULL-LANE drain: replies + coordinator directives — the recurring inbox-monitor tick)
 *   node scripts/adam-advisory.cjs inbox --sweep [--window 24h]                    (QF-20260703-946: read-only window sweep, ALL directed rows regardless of read/ack stamps + unacked count — recovers a re-targeted backlog the normal drain's read_at filter would hide)
 *
 * SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: `send`/`request` accept `--to solomon` for
 * a DIRECT 1-hop write to Solomon's own session (no coordinator relay hop), gated by
 * ADAM_SOLOMON_TWOWAY_V1 (default ON since QF-20260705-488; 'off' is the explicit kill switch).
 * Omitting --to is byte-identical unchanged behavior —
 * the existing coordinator-relay path is the permanent fallback, never removed.
 *   node scripts/adam-advisory.cjs send --direct "<body>"                          (shorthand for --to solomon)
 *
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-4: `--to` also accepts the
 * relay-class peers eva/ceo (lib/coordinator/peer-target.cjs's PEER_KINDS registry) — these have no
 * live session, so they enqueue a tracked FR-1 relay-request instead of a direct write:
 *   node scripts/adam-advisory.cjs send --to eva "<body>"                          (relay-class peer: enqueues a tracked FR-1 relay-request instead of a direct insert)
 */

const crypto = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { redact, capBody, awaitCoordinatorReply, buildSolomonConsultPayload } = require('./worker-signal.cjs');
const { getActiveCoordinatorId, isTwoWayV2Enabled, isAdamSolomonTwoWayV1Enabled } = require('../lib/coordinator/resolve.cjs');
const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');
// QF-20260719-387: fail-closed sender-role guard + target-role assert at the send/request chokes.
const { assertSenderRole, assertTargetRole } = require('../lib/coordinator/role-comms-guard.cjs');
const { insertCoordinationRow, isSentinelTarget } = require('../lib/coordinator/dispatch.cjs');
const { detectVersionSkew } = require('../lib/coordinator/protocol-comms-version.cjs');
const { warnIfCheckoutStale } = require('../lib/coordinator/checkout-staleness.cjs');
const { PEER_KINDS } = require('../lib/coordinator/peer-target.cjs');
const { enqueueRelayRequest } = require('../lib/coordinator/relay-queue.cjs');
const { PAYLOAD_KINDS, DIRECTIVE_KINDS, ADAM_EXCLUDED_KINDS, DRAIN_SETS } = require('../lib/fleet/worker-status.cjs');
// SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C: fail-closed pick-vs-instrument routing predicate
// (consumes the -B framing_class contract; FRAMING_CLASSES matching now lives in the router).
const { routeFraming, FRAMING_ROUTES } = require('../lib/governance/fw3-framing-router.cjs');
// SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-2: canonical body read (payload.body
// primary, body-column fallback) — closes instance 4, the coordinator_request body-drop below.
const { readCanonicalBody } = require('../lib/coordination/lane-contract.cjs');
// SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: sender-stamped reply_class SSOT.
const { REPLY_CLASSES, isValidReplyClass, computeReplyExpectedBy, checkAndPingOverdueReplies } = require('../lib/coordinator/reply-class.cjs');
// SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001: reuse the canonical Adam-session resolver for the unattended
// full-lane tick (env vars are not reliably propagated to cron subprocesses).
const { resolveAdamSessionId } = require('./read-adam-directives.cjs');
// SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 — shared presence/read-receipt/working-signal lane.
const { getFleetPresence, getReadReceipts, getWorkingSignal } = require('../lib/coordinator/presence-grounding-signals.cjs');
const { writeWorkingSignal } = require('../lib/coordinator/working-signal-store.cjs');

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

/**
 * SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: pure target-resolution decision for the
 * new direct Adam->Solomon lane. Given the resolved live IDs (already fetched by the caller — no
 * I/O here), decides target_session and payload.via. `--to solomon` + the flag ON routes DIRECT to
 * the live Solomon session (or the broadcast-solomon fallback sentinel); every other combination
 * (flag off, or --to omitted) is the UNCHANGED coordinator-relay default — via stays null so
 * buildAdvisoryPayload never stamps the field.
 * @param {{toSolomon: boolean, flagOn: boolean, coordinatorId: string|null, solomonId: string|null}} args
 * @returns {{target: string, via: string|null}}
 */
function resolveAdamAdvisoryTarget({ toSolomon, flagOn, coordinatorId, solomonId }) {
  if (toSolomon && flagOn) {
    return { target: solomonId || 'broadcast-solomon', via: 'direct' };
  }
  return { target: coordinatorId || 'broadcast-coordinator', via: null };
}

/**
 * R1 (QF-20260703-964): pure --to <peerArg> classification for the direct-target path. No I/O.
 * Exported for testing — adversarial-review finding, deep-tier PR review: this exact decision
 * shipped un-unit-tested and silently admitted a SENTINEL_TARGETS value (e.g. broadcast-solomon)
 * as a "direct target", completely bypassing the ADAM_SOLOMON_TWOWAY_V1 gate that --to solomon is
 * deliberately subject to. Sentinels are NOT raw session_ids — isSentinelTarget() short-circuits
 * dispatch.cjs's live-session check, so they get the SAME hard-error treatment as
 * RESERVED_PEER_WORDS (role/sentinel resolution is out of R1 scope, raw session_id targets only).
 * @param {string|null} peerArg
 * @param {boolean} isRelayClassPeer
 * @returns {{isDirectTarget: boolean, isBlockedPeerWord: boolean}}
 */
function classifyDirectTarget(peerArg, isRelayClassPeer) {
  const RESERVED_PEER_WORDS = new Set(['coordinator', 'adam']);
  const isBlockedPeerWord = !!(peerArg && (RESERVED_PEER_WORDS.has(peerArg) || isSentinelTarget(peerArg)));
  const isDirectTarget = !!(peerArg && peerArg !== 'solomon' && !isRelayClassPeer && !isBlockedPeerWord);
  return { isDirectTarget, isBlockedPeerWord };
}

/**
 * QF-20260707-114: a caller sometimes embeds `--to <peer>` / `--direct` INSIDE the quoted body
 * instead of passing it as a separate CLI arg — live-confirmed on Adam->Solomon consult
 * messages, where the whole message ended in the literal trailing text "--to solomon" (or a raw
 * session_id). Because that text is never a standalone argv element, the normal --to/--direct
 * parsing finds nothing, peerArg silently stays null, and the advisory falls through to the
 * coordinator default with zero indication --to was ignored. This pure helper detects the same
 * trailing directive in the already-assembled body and honors it exactly like a real flag,
 * stripping it out. Only fires when no real --to/--direct flag was already found (rawPeerArg is
 * null) — byte-identical to prior behavior otherwise. Exported for testing.
 * @param {string|null} rawPeerArg - peerArg computed from real --to/--direct flags (null if none)
 * @param {string} rawBody - the flag-stripped body before this defensive re-scan
 * @returns {{peerArg: string|null, body: string}}
 */
function extractEmbeddedPeerDirective(rawPeerArg, rawBody) {
  if (rawPeerArg) return { peerArg: rawPeerArg, body: rawBody };
  const toMatch = rawBody.match(/\s+--to\s+(\S+)$/i);
  if (toMatch) return { peerArg: toMatch[1].toLowerCase(), body: rawBody.slice(0, -toMatch[0].length).trim() };
  if (/\s+--direct$/i.test(rawBody)) return { peerArg: 'solomon', body: rawBody.replace(/\s+--direct$/i, '').trim() };
  return { peerArg: null, body: rawBody };
}

// SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-2: the known-kinds allowlist a caller may
// explicitly stamp via --kind. Sourced from the SAME shared constants every drain already
// filters on (lib/fleet/worker-status.cjs) -- never a second hand-maintained list.
const KNOWN_SEND_KINDS = new Set([...Object.values(PAYLOAD_KINDS), ...DIRECTIVE_KINDS]);

function buildAdvisoryPayload({ body, senderCallsign, repo, correlationId, expectsReply, scopeKey, reuseClass, appliesToScopes, replyTo, via, replyClass, replyWindowMs, now, addressee, kind }) {
  // request mode (expectsReply) is always live-handshake (synchronous, bounded-timeout await);
  // send mode defaults to fire-and-forget unless the sender opts into reply-needed via --reply-class
  // (SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C).
  const resolvedReplyClass = expectsReply ? 'live-handshake' : (replyClass || 'fire-and-forget');
  const payload = {
    // FR-2: an explicit, validated --kind overrides the default; omitting --kind is
    // BYTE-IDENTICAL to pre-SD behavior (always adam_advisory, as it always has been).
    kind: kind || PAYLOAD_KINDS.ADAM_ADVISORY,
    sender_callsign: senderCallsign || null,
    repo: repo || null,
    reply_class: resolvedReplyClass,
  };
  if (resolvedReplyClass === 'reply-needed') payload.reply_expected_by = computeReplyExpectedBy(now, replyWindowMs);
  // FR-1 (SD-LEO-INFRA-ADAM-PREFERENCE-LEARNING-001) — scope-tagged surfacing. ADDITIVE
  // routing fields (no migration); scope_key reuses the lib/adam/scope-registry.js
  // vocabulary (harness | platform | venture:<id>). reuse_class classifies applicability
  // (scope_local | cross_scope); applies_to_scopes lists the scopes a cross-scope advisory
  // covers. The two-stage actioned_at ACK is unchanged.
  if (scopeKey) payload.scope_key = scopeKey;
  // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: 'direct' marks a row written straight
  // to the peer's session_id (--to solomon, ADAM_SOLOMON_TWOWAY_V1=on) instead of the default
  // coordinator-relay target. Additive/optional — undefined for every existing send path.
  if (via) payload.via = via;
  // R1 (QF-20260703-964): the WRITTEN addressee, stamped alongside target_session, so a reader
  // can see who this was explicitly sent to without re-deriving it from the resolved UUID.
  if (addressee) payload.addressee = addressee;
  if (reuseClass) payload.reuse_class = reuseClass;
  if (Array.isArray(appliesToScopes) && appliesToScopes.length) payload.applies_to_scopes = appliesToScopes;
  if (body) {
    // Prefix the body with [<scope_key>] so a delivered-but-ignored advisory stays
    // scannable by scope. Prefix BEFORE the hard-cap check so the tag counts against it.
    // QF-20260710-560: reject over-cap instead of silently clipping (this is the exact
    // site that clipped Solomon's FW-3 advisory tail).
    const tagged = scopeKey ? `[${scopeKey}] ${String(body)}` : String(body);
    payload.body = capBody(tagged);
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

async function drainReplies(supabase, sessionId, { background = false, windowMs = DEFAULT_DRAIN_WINDOW_MS } = {}) {
  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-4): the recoverable filter is
  // acknowledged_at IS NULL (never read_at IS NULL) — a reply a background/legacy pass
  // stamped read_at on stays surfaced until genuinely actioned. Window-scoped as a
  // backlog guard (default 7d); older unacked rows are counted loudly, never silent.
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, subject, body, payload, created_at, read_at')
    .eq('target_session', sessionId)
    .is('acknowledged_at', null)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) { console.error('ERROR: replies query failed:', error.message); process.exit(1); }
  const rows = (allRows || []).filter(isReplyRow);
  if (rows.length === 0) { console.log('(no unacked directed replies)'); return; }

  console.log(`${rows.length} unacked directed repl${rows.length === 1 ? 'y' : 'ies'} (ack via adam-advisory.cjs ack <id> once actioned):`);
  const ids = [];
  for (const r of rows) {
    const replyTo = (r.payload && r.payload.reply_to) || '?';
    const text = (r.payload && r.payload.body) || r.body || '(empty)';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    console.log(`  • [${String(replyTo).slice(0, 8)}] id=${r.id} (${ageMin}m) ${text}`);
    ids.push(r.id);
  }
  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-1): stamp routing by context.
  // Background/cron context: delivered_at only — read_at is reserved for a surface whose
  // content lands in an operator-visible turn. Interactive: read_at (this render IS the
  // operator-visible surface). Neither path ever stamps acknowledged_at (action-time only).
  await stampSurfaced(supabase, ids, { background });
}

// SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: interactive drain backlog-guard window.
const DEFAULT_DRAIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-1) — the single stamp-routing seam for
 * both drain lanes. background=true: stamp delivered_at (only where NULL; column added by
 * database/migrations/20260710_session_coordination_delivered_at.sql) and leave read_at
 * untouched. background=false (interactive): stamp read_at (only where NULL). Idempotent
 * either way; acknowledged_at is NEVER written here (see the `ack` subcommand).
 */
async function stampSurfaced(supabase, ids, { background = false } = {}) {
  if (!ids || ids.length === 0) return;
  const now = new Date().toISOString();
  if (background) {
    await supabase
      .from('session_coordination')
      .update({ delivered_at: now })
      .in('id', ids)
      .is('delivered_at', null);
  } else {
    await supabase
      .from('session_coordination')
      .update({ read_at: now })
      .in('id', ids)
      .is('read_at', null);
  }
}

/**
 * SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-4) — `ack <id...>`: the single
 * sanctioned action-time stamp for the Adam lane (chairman directives keep
 * scripts/ack-chairman-directive.cjs). Stamps acknowledged_at (only where NULL) and
 * backfills read_at where NULL (an actioned row was necessarily seen). Idempotent.
 */
async function ackRows(supabase, ids, { expectedTarget = null } = {}) {
  const now = new Date().toISOString();
  let acked = 0;
  for (const id of ids) {
    // Ownership guard (adversarial review of PR #5802): only rows targeting THIS Adam
    // session may be acked — a mistyped foreign UUID must not drop another session's row
    // out of ITS acknowledged_at-IS-NULL recovery tier.
    let q = supabase
      .from('session_coordination')
      .update({ acknowledged_at: now })
      .eq('id', id)
      .is('acknowledged_at', null);
    if (expectedTarget) q = q.eq('target_session', expectedTarget);
    const { data, error } = await q.select('id, read_at');
    if (error) { console.error(`ERROR: ack failed for ${id}: ${error.message}`); continue; }
    if (data && data.length > 0) {
      acked += 1;
      if (data[0].read_at == null) {
        await supabase.from('session_coordination').update({ read_at: now }).eq('id', id).is('read_at', null);
      }
      console.log(`  ✓ acked ${id}`);
    } else {
      console.log(`  • ${id} already acked, not found, or not targeted at this Adam session — no-op`);
    }
  }
  console.log(`${acked}/${ids.length} row(s) newly acknowledged.`);
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
 * SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: canonical home moved to
 * lib/fleet/worker-status.cjs (ADAM_EXCLUDED_KINDS) so read-adam-directives.cjs and
 * adam-quiet-tick.mjs share the list without a require cycle. Export name preserved.
 */
const EXCLUDED_KINDS = ADAM_EXCLUDED_KINDS;

/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-2: the Adam-scoped recognized-kinds
 * default, DERIVED from DRAIN_SETS.adam (the registry-reader's own fallback SSOT) minus
 * ADAM_EXCLUDED_KINDS (canary_request/comms_check/ack/coordinator_ack/cross_party_ping —
 * handler-owned rows the generic inbox must never consume). This is no longer a
 * hand-authored allowlist (the former ADAM_INBOX_KINDS constant) — it is a live view over
 * the shared DRAIN_SETS.adam constant (reconciled by FR-1), computed synchronously at
 * module load so lib/coordinator/dispatch.cjs's existing zero-arg isAdamInboxRow(row) call
 * site (a send-time guard) keeps working unchanged.
 *
 * drainInbox (below) resolves a LIVE kinds array via the registry-reader
 * (lib/fleet/drain-set-registry.js's resolveRecognizedKinds) and passes it explicitly to
 * isAdamInboxRow/isOrphanedAdamRow, so once role_drain_sets is applied, the drain reflects
 * the live table; until then it fails open to this same derived default.
 */
const ADAM_INBOX_KINDS = Object.freeze(DRAIN_SETS.adam.filter((k) => !ADAM_EXCLUDED_KINDS.includes(k)));

/**
 * Is this row a directed Adam-inbox message? True when its payload.kind is in the resolved
 * recognized-kinds set (default: ADAM_INBOX_KINDS, the DRAIN_SETS.adam-minus-excluded view;
 * drainInbox passes an explicit registry-resolved array instead). Untyped rows (no
 * payload.kind) and any excluded/responder-owned kind return false.
 * @param {object} r
 * @param {string[]} [recognizedKinds] defaults to ADAM_INBOX_KINDS
 */
function isAdamInboxRow(r, recognizedKinds = ADAM_INBOX_KINDS) {
  const k = r && r.payload && r.payload.kind;
  return k != null && recognizedKinds.includes(k);
}

/**
 * SD-FDBK-INFRA-ADAM-INBOX-ADAM-001 — is this an ORPHANED Adam-directed row? A row targeting the
 * Adam session (the drainInbox query already scopes target_session) that the two drain lanes both
 * miss: NOT a reply, NOT an Adam-directive (kind not in the recognized-kinds set), and NOT a
 * handler-owned kind. This catches BOTH untyped rows (payload.kind null — the live 2026-06-20
 * enforcer-verdict blindspot) AND unknown typed kinds (e.g. coordinator_alert) that no allowlist
 * covers. These are genuine deliveries, not noise — drainInbox WARNS about them (visibility) but
 * does NOT consume them, preserving the deliberate non-consume invariant
 * (SD-LEO-FIX-ADAM-INBOX-ALL-CLASSES-001).
 * PURE. @param {object} r @param {string[]} [recognizedKinds] @returns {boolean}
 */
function isOrphanedAdamRow(r, recognizedKinds = ADAM_INBOX_KINDS) {
  if (!r) return false;
  if (isReplyRow(r) || isAdamInboxRow(r, recognizedKinds)) return false; // already drained by a real lane
  const k = r.payload && r.payload.kind;
  if (k != null && EXCLUDED_KINDS.includes(k)) return false; // handler-owned → never touch
  return true; // untyped, or an unknown typed kind targeting Adam → orphaned delivery
}

/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1 — FIRST-CLASS chairman-directive partition.
 * Surfaces broadcast chairman_directive rows ABOVE the normal advisory drain, with Adam's per-directive
 * OUTSTANDING/ACKED status (latest issued_at per directive_id — SUPERSEDES). READ-ONLY / non-consuming
 * (the broadcast row must survive so coordinator + Solomon also surface it). Adam acks a directive it
 * has actioned via scripts/ack-chairman-directive.cjs --role adam. Fail-open (renders nothing on error).
 */
async function renderChairmanDirectives(supabase, role, { quiet = false } = {}) {
  const { loadRoleDirectiveStatus } = require('../lib/coordinator/chairman-directive-gauge.cjs');
  const rows = await loadRoleDirectiveStatus(supabase, role);
  if (rows.length === 0) { if (!quiet) console.log('(no chairman directives outstanding for this role)'); return; }
  const outstanding = rows.filter((r) => r.status === 'outstanding');
  console.log(`★ ${rows.length} CHAIRMAN DIRECTIVE(s) for ${role} — ${outstanding.length} OUTSTANDING (ack via scripts/ack-chairman-directive.cjs --role ${role}):`);
  for (const r of rows) {
    const ageMin = Math.floor((r.ageMs || 0) / 60_000);
    console.log(`  ★ [${r.status.toUpperCase()}] ${r.directiveId} (issued ${ageMin}m ago)`);
  }
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
/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C (FR-2/FR-3): record a chairman-escalation
 * pending decision for a pick/unproven oracle framing. Idempotent per advisory row id
 * (probe-before-insert on brief_data->context->>advisory_row_id; drainInbox is
 * single-process so retries serialize). Returns true iff the row is durably queued
 * (pre-existing counts). NEVER throws — fail-soft for drain liveness, loud on failure.
 */
async function recordFramingEscalation(supabase, r, routed) {
  try {
    const { data: existing } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('brief_data->context->>advisory_row_id', String(r.id))
      .limit(1);
    if (existing && existing.length > 0) return true; // already queued (idempotent)
    const body = (r.payload && r.payload.body) || r.body || r.subject || '';
    const { recordPendingDecision } = await import('../lib/chairman/record-pending-decision.mjs');
    const res = await recordPendingDecision(supabase, {
      title: `Framing escalation (${routed.reason}): ${String(body).slice(0, 120) || '(no body)'}`,
      // RISK condition (a): blocking:false + non-session_question decisionType makes
      // shouldAutoEscalate() provably false — queue-only, zero per-row standout email/SMS.
      decisionType: 'framing_escalation',
      blocking: false,
      raisedBy: 'adam',
      context: {
        advisory_row_id: String(r.id),
        framing_class: (r.payload && r.payload.framing_class) || 'unproven',
        reason: routed.reason,
        lane_analog: routed.laneAnalog,
        sender_session: r.sender_session || null,
        excerpt: String(body).slice(0, 400),
      },
    });
    if (!res || res.recorded !== true) {
      console.error(`  ✖ ESCALATION WRITE FAILED (id=${r.id}): ${(res && res.error) || 'unknown'}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`  ✖ ESCALATION WRITE FAILED (id=${r.id}): ${(e && e.message) || e}`);
    return false;
  }
}

async function drainInbox(supabase, sessionId, { quiet = false, background = false, windowMs = DEFAULT_DRAIN_WINDOW_MS } = {}) {
  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-4): recoverable filter is
  // acknowledged_at IS NULL — a row any background/legacy pass read-stamped still surfaces
  // until actioned (the read-stamped-not-processed class, chairman-caught 2026-07-10, is
  // structurally unreachable). Window-scoped (default 7d) as a backlog guard; older
  // unacked rows are COUNTED below, never silently invisible.
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();
  const { data: allRows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, message_type, subject, body, payload, created_at, read_at')
    .eq('target_session', sessionId)
    .is('acknowledged_at', null)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) { console.error('ERROR: inbox query failed:', error.message); process.exit(1); }

  // Within-window overflow visibility (adversarial review of PR #5802): oldest-first +
  // limit(100) + never-auto-ack means >100 unacked rows would re-surface the same oldest
  // 100 every pass — say so loudly instead of silently starving newer rows.
  if ((allRows || []).length === 100) {
    console.warn('⚠ inbox fetch cap hit (100, oldest-first) — newer unacked rows exist beyond this page; ack surfaced rows or use --sweep to see the full window.');
  }

  // Backlog-guard visibility: unacked rows OLDER than the window are reported by count so
  // they cannot rot invisibly; recover them via `--window <Nd>` or the stampless `--sweep`.
  try {
    const { count: olderCount } = await supabase
      .from('session_coordination')
      .select('id', { count: 'exact', head: true })
      .eq('target_session', sessionId)
      .is('acknowledged_at', null)
      .lt('created_at', cutoffIso);
    if (olderCount > 0) {
      console.warn(`⚠ ${olderCount} unacked directed row(s) OLDER than the ${Math.round(windowMs / 86_400_000)}d drain window — widen with --window <Nd> or inspect via --sweep.`);
    }
  } catch { /* count is advisory — never blocks the drain */ }

  // SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-2: resolve the live recognized-kinds
  // set via the registry-reader (fails open to ADAM_INBOX_KINDS while role_drain_sets remains
  // unapplied), subtracting ADAM_EXCLUDED_KINDS so handler-owned kinds are never consumed here.
  const { resolveRecognizedKinds } = await import('../lib/fleet/drain-set-registry.js');
  const resolvedAdamKinds = (await resolveRecognizedKinds({ supabase, role: 'adam' }))
    .filter((k) => !ADAM_EXCLUDED_KINDS.includes(k));

  // SD-LEO-FIX-ADAM-INBOX-ALL-CLASSES-001: widen the drain to ALL directed Adam classes
  // (isAdamInboxRow ⊇ DIRECTIVE_KINDS) — responder-owned + untyped rows stay untouched.
  const rows = (allRows || []).filter((r) => isReplyRow(r) || isAdamInboxRow(r, resolvedAdamKinds));

  // SD-FDBK-INFRA-ADAM-INBOX-ADAM-001: surface (WARN, do NOT consume) orphaned Adam-directed rows the
  // two drain lanes miss — untyped (payload.kind null) or unknown typed kinds (e.g. coordinator_alert),
  // minus the handler-owned EXCLUDED_KINDS. These are real deliveries (live 2026-06-20: untyped enforcer
  // verdicts left Adam 40m blind). WARN keeps them VISIBLE without consuming, preserving the deliberate
  // non-consume invariant (read_at stays NULL → recoverable; pinned by adam-inbox-all-classes.test.js).
  // QF-20260702-414: an orphan that no producer ever fixes recirculates FOREVER (28 rows re-printed
  // ~50KB every tick, unchanged across 6+ drains, risking burial of new lane traffic). Print each
  // orphan row ONCE — payload.orphan_seen_at (a visibility marker, NEVER read_at) is stamped after
  // the first warn so a re-run stays silent about it while it remains genuinely recoverable/unread.
  const orphaned = (allRows || []).filter((r) => isOrphanedAdamRow(r, resolvedAdamKinds));
  const freshOrphans = orphaned.filter((r) => !(r.payload && r.payload.orphan_seen_at));
  if (freshOrphans.length > 0) {
    console.warn(`⚠ ${freshOrphans.length} unread Adam-directed row${freshOrphans.length === 1 ? '' : 's'} with unrecognized/untyped kind NOT auto-drained (visibility — NOT consumed, still recoverable):`);
    for (const r of freshOrphans) {
      const kind = (r.payload && r.payload.kind) || '(untyped)';
      const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
      const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
      console.warn(`  ⚠ [orphan/${kind}] id=${r.id} (${ageMin}m) ${text}`);
    }
    console.warn('  → these target the Adam session but match no drain lane; fix the producer to use a typed ADAM_INBOX_KINDS kind, or read via the durable reader.');
    const seenAt = new Date().toISOString();
    for (const r of freshOrphans) {
      await supabase.from('session_coordination').update({ payload: { ...(r.payload || {}), orphan_seen_at: seenAt } }).eq('id', r.id);
    }
  }

  // SD-REFILL-00YJS6VB: the recurring inbox-monitor tick fires every few minutes and was a
  // no-op narration line ("(no unread...)") when the lane is empty — churn during quiescent /
  // chairman-attached work. With --quiet (the recurring tick), stay SILENT on a fully-empty lane
  // (mirrors the belt-countdown/offer-help silence-by-default). Manual `inbox` keeps the
  // confirmation line. Orphaned-row WARNINGs above are NEVER suppressed (real unread deliveries).
  if (rows.length === 0) { if (!quiet) console.log('(no unacked directed inbox rows — replies or directed classes)'); return; }

  console.log(`${rows.length} unacked inbox row${rows.length === 1 ? '' : 's'} (full lane — replies + all directed classes; ack via adam-advisory.cjs ack <id> once actioned):`);
  const ids = [];
  for (const r of rows) {
    const lane = isReplyRow(r) ? 'reply' : (isDirectiveRow(r) ? 'directive' : 'adam-directed');
    const kind = (r.payload && r.payload.kind) || r.message_type || '?';
    const text = (r.payload && r.payload.body) || r.body || r.subject || '(empty)';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    // FR-2 (SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C): detect a stale-singleton version skew
    // instead of silently misreading the row — surfaced, not consumed-differently (still drained).
    const skew = detectVersionSkew(r.payload);
    if (skew) console.warn(`  ⚠ PROTOCOL VERSION SKEW: sender v${skew.senderVersion}, receiver v${skew.receiverVersion} (id=${r.id})`);
    // SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C: fail-closed pick-vs-instrument ROUTING
    // (supersedes the -B interim PICK-CLASS warn). pick/unproven oracle framings route to the
    // chairman-escalation fork (recordPendingDecision -> decision-scheduler surfacing) with
    // EXPLICIT non-auto-escalating params (blocking:false, decisionType:'framing_escalation')
    // so shouldAutoEscalate() is provably false — rows QUEUE, no per-row standout email/SMS
    // (RISK conditions a+b). instrument framings render sourcing-eligible and flow as today.
    // Escalation writes are fail-SOFT for drain liveness but LOUD on failure, and a failed
    // write is rendered routing:escalation-write-failed — never as safely routed.
    const framingClass = r.payload && r.payload.framing_class;
    const framingTag = framingClass ? ` framing:${framingClass}` : '';
    const routed = routeFraming(r);
    let routingTag = '';
    if (routed.route === FRAMING_ROUTES.CHAIRMAN_ESCALATION) {
      const ok = await recordFramingEscalation(supabase, r, routed);
      routingTag = ok ? ' routing:chairman-escalation' : ' routing:escalation-write-failed';
    } else if (routed.route === FRAMING_ROUTES.ADAM_SOURCING) {
      routingTag = ' routing:adam-sourcing';
    }
    console.log(`  • [${lane}/${kind}${framingTag}${routingTag}] id=${r.id} (${ageMin}m) ${text}`);
    ids.push(r.id);
  }
  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-1): stamp routing by context —
  // background/cron passes stamp delivered_at only; interactive render stamps read_at.
  // acknowledged_at / payload.actioned_at are NEVER set here (action-time only, `ack`).
  await stampSurfaced(supabase, ids, { background });
}

const DEFAULT_SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * QF-20260703-946 — parse `--window <Nh|Nm|Nd>` into ms; defaults to 24h. Fail-open on garbage
 * (falls back to the default rather than throwing), since the sweep is a visibility tool.
 */
function parseSweepWindowMs(argv) {
  const idx = argv.indexOf('--window');
  if (idx < 0) return DEFAULT_SWEEP_WINDOW_MS;
  const raw = argv[idx + 1] || '';
  const m = /^(\d+)(h|m|d)$/.exec(raw.trim());
  if (!m) return DEFAULT_SWEEP_WINDOW_MS;
  const n = Number(m[1]);
  const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * unitMs;
}

/**
 * QF-20260703-946 — CLAUDE_ADAM.md FULL-INBOX SWEEP mandate: the known auto-ack bug
 * (QF-20260610-623) stamps read_at/acknowledged_at on rows Adam never actually processed, so
 * `drainInbox`'s read_at-IS-NULL filter can silently hide a re-targeted backlog (live 2026-07-03:
 * 1020 rows stranded on a dead prior Adam session read as "no unread inbox rows"). This lists
 * EVERY directed row in the window by created_at, REGARDLESS of read/ack stamps, with those stamps
 * shown, plus an unacked-count so accumulation is visible (D6 close-loops signal). Read-only —
 * never consumes rows (`--sweep` is a visibility tool, not a drain lane).
 */
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 (real bug, adjacent to this
// site): was 2000. PostgREST's server-side db-max-rows cap silently clamps ANY unranged
// read at 1000 regardless of a higher client .limit() — so the truncation check below
// (`descRows.length === SWEEP_ROW_LIMIT`) could never fire; a truncated 1000-row page read
// as "complete" up to 2000. Corrected to the real cap so the tripwire actually trips.
const SWEEP_ROW_LIMIT = 1000;

async function windowSweep(supabase, sessionId, { windowMs = DEFAULT_SWEEP_WINDOW_MS, quiet = false } = {}) {
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();
  // Newest-first + limit: if the window ever exceeds SWEEP_ROW_LIMIT, truncation drops the
  // OLDEST rows (still-visible recent activity), never the newest (which ascending+limit would).
  const { data: descRows, error } = await supabase
    .from('session_coordination')
    .select('id, payload, message_type, subject, created_at, read_at, acknowledged_at')
    .eq('target_session', sessionId)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(SWEEP_ROW_LIMIT);
  if (error) { console.error('ERROR: window sweep query failed:', error.message); process.exit(1); }

  const windowHuman = `${Math.round(windowMs / 3_600_000 * 10) / 10}h`;
  if (!descRows || descRows.length === 0) {
    if (!quiet) console.log(`(window sweep: no directed rows in the last ${windowHuman})`);
    return;
  }
  if (descRows.length === SWEEP_ROW_LIMIT) {
    console.warn(`⚠ window sweep hit the ${SWEEP_ROW_LIMIT}-row cap — oldest rows in this window were dropped; narrow --window to see them.`);
  }
  const rows = [...descRows].reverse(); // display oldest-first within the (possibly capped) set

  const unacked = rows.filter((r) => !r.acknowledged_at);
  console.log(`WINDOW SWEEP (last ${windowHuman}): ${rows.length} directed row${rows.length === 1 ? '' : 's'}, ${unacked.length} unacked`);
  for (const r of rows) {
    const kind = (r.payload && r.payload.kind) || r.message_type || '(untyped)';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    const readStamp = r.read_at ? 'read' : 'UNREAD';
    const ackStamp = r.acknowledged_at ? 'acked' : 'UNACKED';
    // SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-2 (instance 4): this print path
    // previously checked payload.body only, never the body COLUMN -- a coordinator_request row
    // with an 858-char body in the column printed as if empty. readCanonicalBody() dual-reads
    // (payload.body primary, body-column fallback) before falling back to subject/'(empty)'.
    const canonicalBody = readCanonicalBody(r);
    const text = canonicalBody || r.subject || '(empty)';
    console.log(`  • [${kind}] (${ageMin}m) ${readStamp}/${ackStamp} id=${r.id} ${text}`);
  }
}

// SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 (FR-6) — presence + read-receipt + working-signal
// status verb. `status` prints the coordinator's presence + Adam's own sent-message read-receipts +
// Adam's current working-signal; `status --working "<body>" [--eta <ms>]` stamps a new working-signal
// (via the atomic RPC — see lib/coordinator/working-signal-store.cjs, never a raw metadata update).
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
  warnIfCheckoutStale('adam-advisory.cjs');
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'send' && mode !== 'request' && mode !== 'replies' && mode !== 'inbox' && mode !== 'status' && mode !== 'ack') {
    console.error('Usage: node scripts/adam-advisory.cjs send "<body>" [--reply-to <correlation_or_row_id>] [--to solomon|<session_id>] [--kind <recognized_kind>]  |  request "<question>" [--timeout <ms>] [--to solomon|<session_id>] [--kind <recognized_kind>]  |  replies [--background]  |  inbox [--background] [--window <Nh|Nd>] [--sweep [--window 24h]]  |  ack <row-id...>  |  status [--working "<body>" [--eta <ms>]]');
    process.exit(2);
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: --background marks a cron/monitor
  // context whose stdout no reasoning turn sees — such passes stamp delivered_at only.
  const isBackground = argv.includes('--background');

  // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-4): `ack <id...>` — the action-time
  // acknowledged_at stamp. Ids are positional args (flags filtered out).
  if (mode === 'ack') {
    const ids = argv.slice(1).filter((a) => !a.startsWith('--'));
    if (ids.length === 0) { console.error('Usage: node scripts/adam-advisory.cjs ack <row-id...>'); process.exit(2); }
    // Ownership guard: acks are scoped to rows targeting the canonical Adam session.
    const adamTarget = (await resolveAdamSessionId(supabase)) || sessionId;
    await ackRows(supabase, ids, { expectedTarget: adamTarget });
    return;
  }

  // FR-4 — durable reply reader (reply lane only; kept for back-compat).
  if (mode === 'replies') {
    await drainReplies(supabase, sessionId, { background: isBackground });
    return;
  }

  // SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001 — unified FULL-LANE drain (replies + coordinator directives).
  // Resolve the CANONICAL Adam session (CLAUDE_SESSION_ID only if it IS the Adam session, else the
  // most-recent role='adam' session) so the unattended cron tick can't drain the wrong/empty session
  // if the env var didn't propagate; falls back to the env sessionId.
  if (mode === 'inbox') {
    const adamId = (await resolveAdamSessionId(supabase)) || sessionId;
    // FR-1: surface broadcast chairman directives FIRST-CLASS (above normal advisories) with Adam's
    // per-directive ack status, BEFORE the normal target_session-scoped drain.
    await renderChairmanDirectives(supabase, 'adam', { quiet: argv.includes('--quiet') });
    // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: --window (when given without --sweep)
    // widens/narrows the interactive drain's backlog-guard window; default 7d.
    const drainWindowMs = argv.includes('--window') && !argv.includes('--sweep')
      ? parseSweepWindowMs(argv)
      : DEFAULT_DRAIN_WINDOW_MS;
    await drainInbox(supabase, adamId, { quiet: argv.includes('--quiet'), background: isBackground, windowMs: drainWindowMs });
    // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C: PING-ON-SILENCE — check MY OWN sent
    // reply-needed advisories for ones left unanswered past their window. Never suppressed by
    // --quiet (a real overdue reply is a genuine delivery, not routine tick noise).
    const pingResult = await checkAndPingOverdueReplies(supabase, { sessionId: adamId, senderType: 'adam' });
    if (pingResult.pinged > 0) {
      console.warn(`⚠ PING-ON-SILENCE: ${pingResult.pinged} reply-needed advisor${pingResult.pinged === 1 ? 'y' : 'ies'} unanswered past window — pinged (ids: ${pingResult.pingedIds.join(', ')})`);
    }
    // QF-20260703-946: `--sweep [--window 24h]` — CLAUDE_ADAM.md FULL-INBOX SWEEP mandate.
    // Additive, read-only: lists ALL directed rows in the window regardless of read/ack stamps,
    // so a re-targeted-but-already-stamped backlog can't hide behind the normal read_at filter.
    if (argv.includes('--sweep')) {
      await windowSweep(supabase, adamId, { windowMs: parseSweepWindowMs(argv), quiet: argv.includes('--quiet') });
    }
    return;
  }

  // SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 — same canonical-identity resolution as `inbox`
  // (a cron tick's env var is not reliably propagated).
  if (mode === 'status') {
    const adamId = (await resolveAdamSessionId(supabase)) || sessionId;
    await printStatus(supabase, adamId, argv.slice(1));
    return;
  }

  const tIdx = argv.indexOf('--timeout');
  const timeoutMs = tIdx >= 0 ? Number(argv[tIdx + 1]) || 30000 : 30000;
  // FR-1 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): `send --reply-to <correlation_or_row_id>`
  // — answer an inbound coordinator_request, echoing its correlation (resolved below).
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
  // SD-LEO-INFRA-COMMS-DELIVERY-CONTRACT-001 / FR-2: --kind is OPTIONAL (omitting it is
  // byte-identical to pre-SD behavior); an EXPLICITLY-supplied value must be a recognized
  // kind or the send is rejected (never a silently-inserted garbage kind no drain matches).
  const kIdx = argv.indexOf('--kind');
  const kindArg = kIdx >= 0 ? argv[kIdx + 1] || null : null;
  if (kindArg && !KNOWN_SEND_KINDS.has(kindArg)) {
    console.error(`ERROR: --kind "${kindArg}" is not a recognized kind (see PAYLOAD_KINDS/DIRECTIVE_KINDS in lib/fleet/worker-status.cjs).`);
    process.exit(2);
  }
  // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: `send/request --to solomon` — direct
  // 1-hop channel, gated by ADAM_SOLOMON_TWOWAY_V1 (default ON since QF-20260705-488; 'off' kills it).
  // SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-4: --to also accepts
  // the relay-class peers eva/ceo (lib/coordinator/peer-target.cjs's PEER_KINDS registry) —
  // these enqueue a tracked FR-1 relay-request instead of a direct write. --direct is
  // shorthand for --to solomon (Adam's one lateral session-class peer).
  const toIdx = argv.indexOf('--to');
  // Lowercased at the CLI boundary so `--to EVA`/`--to Eva` aren't rejected here while
  // resolvePeerTarget() would have resolved them fine (it's explicitly case-insensitive) --
  // adversarial-review finding, deep-tier PR review: the two layers previously disagreed.
  const toArg = toIdx >= 0 ? (argv[toIdx + 1] || '').toLowerCase() || null : null;
  const directIdx = argv.indexOf('--direct');
  const rawPeerArg = toArg || (directIdx >= 0 ? 'solomon' : null);
  const flagValueIdxs = new Set([tIdx, tIdx + 1, rIdx, rIdx + 1, rcIdx, rcIdx + 1, rwIdx, rwIdx + 1, toIdx, toIdx + 1, directIdx, kIdx, kIdx + 1].filter(i => i >= 0));
  const rawBody = argv.slice(1).filter((a, i) => !flagValueIdxs.has(i + 1)).join(' ').trim();
  // QF-20260707-114: a caller (confirmed live: Adam) sometimes embeds `--to <peer>` / `--direct`
  // INSIDE the quoted body instead of passing it as a separate CLI arg (the whole message ends
  // in the literal trailing text "--to solomon"). argv.indexOf('--to') then finds nothing (it's
  // not a standalone argv element), peerArg silently stays null, and the advisory falls through
  // to the coordinator default with no indication --to was ignored. Detect + honor the same
  // trailing directive here, stripped from the body, so it resolves exactly like a real flag.
  const { peerArg, body } = extractEmbeddedPeerDirective(rawPeerArg, rawBody);
  if (!body) { console.error('ERROR: advisory body required.'); process.exit(2); }

  const isRelayClassPeer = !!(peerArg && PEER_KINDS[peerArg] && PEER_KINDS[peerArg].class === 'relay');
  // R1 (QF-20260703-964, crew-comms audit finding-008): 'coordinator'/'adam'/sentinels need proper
  // role-alias resolution (out of R1 scope — no live-lookup wiring here); any OTHER --to value
  // (e.g. a reasoner's raw session_id) is now accepted as a DIRECT target instead of hard-erroring
  // — the root incident: Adam had no way to address a specific reasoner/Solomon-bound session
  // directly, so those messages silently misrouted to the coordinator via the old hardcoded default.
  // insertCoordinationRow already REFUSES a non-UUID/non-sentinel target_session (DISPATCH_TARGET_INVALID),
  // so a mistyped nickname fails loud rather than dead-lettering silently. See classifyDirectTarget.
  const { isDirectTarget, isBlockedPeerWord } = classifyDirectTarget(peerArg, isRelayClassPeer);
  if (peerArg && peerArg !== 'solomon' && !isRelayClassPeer && isBlockedPeerWord) {
    console.error(`ERROR: --to ${peerArg} needs role-alias resolution not yet supported (R1 scope: raw session_id targets only). Omit --to for the default coordinator relay.`);
    process.exit(2);
  }
  const twoWayV1On = isAdamSolomonTwoWayV1Enabled();
  if (peerArg === 'solomon' && !twoWayV1On) {
    console.error('ERROR: --to solomon is disabled by ADAM_SOLOMON_TWOWAY_V1=off (direct lane is ON by default since QF-20260705-488). Omit --to to route via the coordinator.');
    process.exit(3);
  }

  // QF-20260719-387 (chairman-directed after live misroute d442d8ec): this is ADAM's outbound
  // lane — a non-Adam session running it silently applies Adam's routing defaults (the mirror
  // of Adam running solomon-advisory.cjs, the incident shape). Hard-error (fail-closed) unless
  // the invoking session's registered role is adam; covers send + request (relay path included).
  await assertSenderRole(supabase, { sessionId, requiredRole: 'adam', toolName: 'adam-advisory.cjs' });

  // FR-4 relay-class path: eva/ceo have no live session, so a relay-class --to enqueues a
  // tracked FR-1 relay_request via the coordinator queue instead of a direct insert — the
  // coordinator's relay-drain tick (FR-1/FR-2) performs the actual delivery + writes the
  // CONFIRM-ON-RELAY receipt. This is a fundamentally different row shape than a direct
  // advisory, so it short-circuits here, before any target/session resolution below.
  if (isRelayClassPeer) {
    const relayCorrelationId = crypto.randomUUID();
    const { data, error } = await enqueueRelayRequest(supabase, {
      senderSession: sessionId,
      senderType: 'adam',
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
  const toSolomon = peerArg === 'solomon';
  const solomonId = toSolomon && twoWayV1On ? await getActiveSolomonId(supabase).catch(() => null) : null;
  const { target: defaultTarget, via: defaultVia } = resolveAdamAdvisoryTarget({ toSolomon, flagOn: twoWayV1On, coordinatorId, solomonId });
  // R1: an explicit non-solomon/non-relay --to overrides the coordinator-relay default with a
  // direct session_id target. Additive — every existing caller (no --to, or --to solomon) is
  // byte-identical to before.
  const target = isDirectTarget ? peerArg : defaultTarget;
  const via = isDirectTarget ? 'direct' : defaultVia;
  // QF-20260719-387: read back the resolved target's registered role and hard-error on a
  // recipient-class mismatch (--to solomon -> role=solomon; default -> the active coordinator).
  // An R1 direct raw-session target has no recipient class (expectedRole null -> print-only).
  await assertTargetRole(supabase, { target, expectedRole: isDirectTarget ? null : (toSolomon ? 'solomon' : 'coordinator') });
  const addressee = peerArg || 'coordinator';
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
  const payload = buildAdvisoryPayload({ body, senderCallsign, repo: process.cwd(), correlationId, expectsReply, scopeKey, reuseClass, appliesToScopes, replyTo, via, replyClass: replyClassArg, replyWindowMs, addressee, kind: kindArg });
  // R1 (QF-20260703-964): the addressee-vs-target divergence WARN lives ONE place — the
  // insertCoordinationRow choke point (lib/coordinator/dispatch.cjs) — not duplicated here.
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
  // SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-D: the ADAM OUTBOUND GATE. Runs over EVERY Adam outbound
  // right after the alarm bar and before dispatch, mirroring the sanityCheckUrgentAdvisory precedent.
  // Pure classifier composing lib/adam authorities (classifyDecision + rationale-bar) into three
  // checks: advisory rationale bar (BLOCK), should-answer rubric (BLOCK), Solomon-review (WARN).
  // WIRE_CHECK-safe string-literal dynamic import (CJS->ESM, same form as scope-registry at ~L230).
  // A tripped BLOCK is overridable with --outbound-verified / ADAM_OUTBOUND_VERIFIED=1 (audit-logged,
  // mirrors --alarm-verified). Degrade-safe: any gate error fails OPEN — a gate bug never hard-blocks Adam.
  try {
    const { checkAdamOutbound } = await import('../lib/coordinator/adam-outbound-gate.js');
    const gate = checkAdamOutbound(
      { body: payload.body, kind: payload.kind, addressee, expectsReply, mode },
      {},
    );
    if (gate.tripped) {
      const outboundAttested = argv.includes('--outbound-verified') || process.env.ADAM_OUTBOUND_VERIFIED === '1';
      if (gate.verdict === 'block' && !outboundAttested) {
        console.error(`\n[adam-advisory] ⛔ ADAM OUTBOUND GATE blocked this send:\n  - ${gate.reasons.join('\n  - ')}\n` +
          `Fix the outbound (add rationale / own the decision / consult Solomon), or attest with --outbound-verified (or ADAM_OUTBOUND_VERIFIED=1).\n`);
        process.exit(4);
      }
      // WARN-only (or attested block): surface the reasons, do not block.
      console.error(`[adam-advisory] ⚠️  Adam Outbound Gate ${outboundAttested ? 'BYPASSED (attested)' : 'warning'}: ${gate.reasons.join('; ')}`);
    }
  } catch (err) {
    console.error(`[adam-advisory] Adam Outbound Gate skipped (fail-open): ${err.message}`);
  }
  const subject = `[ADAM_ADVISORY] ${payload.body.slice(0, 80)}`;
  // SD-LEO-INFRA-ADAM-ADVISORY-COMMS-001 (RCA 076cf785): expires_at is the DURABLE delivery TTL
  // (how long the row stays discoverable / survives the expired-row sweep) and is decoupled from
  // the synchronous await window. The old `mode === 'request' ? timeoutMs + 5min` gave a
  // request-mode advisory only ~5.5min — swept BEFORE the ~15min coordinator inbox poll (the 5th
  // Adam->coordinator comms-loss mode). ALL modes now get a durable 24h TTL; `timeoutMs` continues
  // to bound ONLY awaitCoordinatorReply below.
  const expiresAt = advisoryExpiresAt(Date.now());

  // SD-LEO-INFRA-ADAM-PRE-SEND-001 (FR-1/3/4/5): PRE-SEND Solomon-consult gate at the send
  // choke — mirrors the sanityCheckUrgentAdvisory precedent (runs AFTER payload build, BEFORE
  // insertCoordinationRow). ALL logic lives in the unit-tested lib/adam/should-consult-solomon.js;
  // this is the minimal live-path wiring. Skips a send that IS a consult to Solomon (no recursion).
  // Default ACTIVE (kill switch: ADAM_PRE_SEND_CONSULT=off) and DEGRADE-SAFE: any gate error
  // fails OPEN so a gate bug can never block Adam's send (Adam is never hard-blocked on Solomon).
  if ((process.env.ADAM_PRE_SEND_CONSULT || 'on') !== 'off' && peerArg !== 'solomon') {
    try {
      const { evaluatePreSendConsult, performBoundedConsult } = await import('../lib/adam/should-consult-solomon.js');
      // Adam advisories target the coordinator/Solomon, never the chairman directly, so this
      // send path is not chairman-targeted (a chairman-facing send path would pass true).
      const gateInput = { title: subject, body: payload.body, isChairmanTargeted: false };
      if (evaluatePreSendConsult(gateInput).action === 'consult-then-send') {
        const consultTimeoutMs = Number(process.env.ADAM_PRE_SEND_CONSULT_TIMEOUT_MS) || 8000;
        const outcome = await performBoundedConsult(gateInput, {
          timeoutMs: consultTimeoutMs,
          // deps.consult — the REAL solomon_consult lane (buildSolomonConsultPayload + insert),
          // bounded by awaitCoordinatorReply; null on timeout/absence => module fails OPEN.
          consult: async () => {
            let solomonId = null;
            try { solomonId = await getActiveSolomonId(supabase); } catch { solomonId = null; }
            const correlationId = crypto.randomUUID();
            const cp = buildSolomonConsultPayload({ correlationId, body: `[PRE-SEND CONSULT] ${payload.body.slice(0, 300)}`, senderCallsign, repo: process.cwd(), severity: 'high', isAwait: true });
            await insertCoordinationRow(supabase, { sender_session: sessionId, sender_type: 'adam', target_session: solomonId || 'broadcast-solomon', message_type: 'INFO', subject: `[SOLOMON_CONSULT] pre-send`, body: cp.body, payload: cp, expires_at: expiresAt }, { targetRoleHint: 'solomon' });
            const reply = await awaitCoordinatorReply(supabase, { sessionId, correlationId, timeoutMs: consultTimeoutMs });
            return reply.timedOut ? null : ((reply.reply && (readCanonicalBody(reply.reply) || reply.reply.body)) || { received: true });
          },
          // deps.recordLedger — adam_adherence_ledger capture (existing columns, no new ones).
          recordLedger: async (l) => { await supabase.from('adam_adherence_ledger').insert({ run_id: crypto.randomUUID(), probe: l.probe, duty: l.duty || 'pre_send_consult', verdict: l.verdict, detail: l.detail, remediation_ref: l.remediation_ref || null }); },
          // FR-6: near-miss feeder — a verdict-delta writes a governance situation to the
          // shared issue_patterns ledger (the sink SD-2's learning loop rides), using SD-2's
          // metadata convention {class, catch_layer}. catch_layer='solomon' (Solomon caught it).
          captureNearMiss: async (nm) => {
            await supabase.from('issue_patterns').insert({
              pattern_id: `NEARMISS-ADAM-CONSULT-${Date.now()}`,
              category: 'governance_near_miss',
              severity: 'high',
              // redact() so no secret from the raw subject/body leaks into the ledger (parity with the consult lane).
              issue_summary: redact(`${nm.summary}${nm.title ? ` [${String(nm.title).slice(0, 80)}]` : ''}`),
              source: 'adam_pre_send_consult',
              metadata: { class: 'near_miss', catch_layer: 'solomon', hardening_ref: null, source_sd: 'SD-LEO-INFRA-ADAM-PRE-SEND-001', origin: 'verdict_delta' },
            });
          },
        });
        if (outcome.action === 'hold-and-surface') { console.error('[adam-advisory] ⛔ PRE-SEND HOLD: consequential chairman-surface send held pending Solomon (degraded) — re-send once the consult resolves.'); process.exit(3); }
        if (outcome.degraded) console.warn('[adam-advisory] ⚠ PRE-SEND DEGRADED-PROCEED: Solomon consult timed out; proceeding with caution — adam_adherence_ledger capture on record + consult row queued for async review.');
        else console.log('[adam-advisory] ✓ PRE-SEND CONSULT recorded — Solomon verdict received; sending.');
      }
    } catch (e) {
      console.warn(`[adam-advisory] pre-send consult gate error (failing OPEN, send proceeds): ${(e && e.message) || e}`);
    }
  } else if ((process.env.ADAM_PRE_SEND_CONSULT || 'on') === 'off') {
    // Never let a silently-off safety gate leave no trace (security-review finding #5).
    console.warn('[adam-advisory] ⚠ PRE-SEND CONSULT GATE DISABLED (ADAM_PRE_SEND_CONSULT=off) — sending without Solomon-consult review.');
  }

  // FR-6: route through the validated dispatch writer. insertCoordinationRow THROWS
  // (DISPATCH_TARGET_*) on a bad/dead target instead of returning {error}, so wrap it
  // and map err.code to a clean message + non-zero exit (no raw stack, no silent loss).
  // The 'broadcast-coordinator' sentinel short-circuits validation (no live coordinator).
  let inserted;
  try {
    const { data, error } = await insertCoordinationRow(
      supabase,
      { sender_session: sessionId, sender_type: 'adam', target_session: target, message_type: 'INFO', subject, body: payload.body, payload, expires_at: expiresAt },
      // SD-LEO-INFRA-SEND-TIME-TARGET-001 / FR-2: `--to solomon` is statically a Solomon-role
      // target — hint the target-drain warn so a resolved UUID needs no identity lookup.
      { select: 'id', single: true, targetRoleHint: toSolomon ? 'solomon' : undefined }
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
 * FAIL-OPEN: returns { moved:0, error? } on any error, never throws. Invoked unconditionally by
 * adam-register's registerAdam() whenever a stale prior Adam was retired.
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

module.exports = { buildAdvisoryPayload, advisoryExpiresAt, ADVISORY_TTL_MS, sanityCheckUrgentAdvisory, resolveScopeForSend, resolveReplyToCorrelation, drainReplies, isReplyRow, drainInbox, isDirectiveRow, isAdamInboxRow, ADAM_INBOX_KINDS, drainAdamOutbound, isOrphanedAdamRow, EXCLUDED_KINDS, resolveAdamAdvisoryTarget, classifyDirectTarget, extractEmbeddedPeerDirective, windowSweep, parseSweepWindowMs, DEFAULT_SWEEP_WINDOW_MS, stampSurfaced, ackRows, DEFAULT_DRAIN_WINDOW_MS, KNOWN_SEND_KINDS };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
