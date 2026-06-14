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
 *   node scripts/adam-advisory.cjs replies                                         (drain coordinator replies that arrived after any sync await timed out)
 */

const crypto = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { redact, BODY_HARD_CAP, awaitCoordinatorReply } = require('./worker-signal.cjs');
const { getActiveCoordinatorId, isTwoWayV2Enabled } = require('../lib/coordinator/resolve.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { PAYLOAD_KINDS } = require('../lib/fleet/worker-status.cjs');

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
 * FR-4 — durable reader: drain coordinator replies targeting THIS Adam session that
 * were not consumed by an in-flight sync await (read_at IS NULL). These are replies
 * that arrived after `request` mode's await timed out, or replies to fire-and-forget
 * `send` advisories. Gates on read_at IS NULL (same gate the inbox hook leaves NULL
 * for an Adam session) so each reply is consumed EXACTLY once. Stamps read_at to consume.
 */
async function drainReplies(supabase, sessionId) {
  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, subject, body, payload, created_at')
    .eq('target_session', sessionId)
    .eq('payload->>kind', 'coordinator_reply')
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) { console.error('ERROR: replies query failed:', error.message); process.exit(1); }
  if (!rows || rows.length === 0) { console.log('(no unread coordinator replies)'); return; }

  console.log(`${rows.length} coordinator repl${rows.length === 1 ? 'y' : 'ies'}:`);
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

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'send' && mode !== 'request' && mode !== 'replies') {
    console.error('Usage: node scripts/adam-advisory.cjs send "<body>" [--reply-to <correlation_or_row_id>]  |  request "<question>" [--timeout <ms>]  |  replies');
    process.exit(2);
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required (SessionStart hook).'); process.exit(1); }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  // FR-4 — durable reply reader.
  if (mode === 'replies') {
    await drainReplies(supabase, sessionId);
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
    if (result.timedOut) { console.log('⌛ No reply within timeout (reply may arrive later — drain it with `node scripts/adam-advisory.cjs replies`).'); process.exit(0); }
    // Consume: stamp read_at so neither the durable `replies` reader nor the inbox re-shows it.
    try { await supabase.from('session_coordination').update({ read_at: new Date().toISOString(), acknowledged_at: new Date().toISOString() }).eq('id', result.reply.id); } catch {}
    console.log('✓ Reply:', (result.reply.payload && result.reply.payload.body) || result.reply.body || '(empty)');
  }
}

module.exports = { buildAdvisoryPayload, advisoryExpiresAt, ADVISORY_TTL_MS, resolveScopeForSend, resolveReplyToCorrelation, drainReplies };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
