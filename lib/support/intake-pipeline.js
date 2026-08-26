/**
 * Venture-SCOPED customer-support intake -> triage -> route pipeline (happy-path zero-touch).
 * SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001 (load-bearing-for-first-dollar), re-scoped per-venture by
 * SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001 (chairman-ratified, deep-dive ed675631 Section 5, Solomon F12).
 *
 * Four composable seams, DB INJECTED (normalize/triage stay pure + unit-testable without a DB):
 *   1. normalizeSupportTicket(raw)            — channel-neutral capture -> normalized ticket (FR-1)
 *   2. resolveVentureContext(sb, ticket)      — venture_id + rail-address + armed-flag lookup (FR-4/5)
 *   3. triageSupportTicket(ticket)            — category + severity + routing decision (FR-2)
 *   4. disposeSupportTicket(sb, ticket, tri)  — auto-resolve happy path | escalate edge cases (FR-3)
 * plus runSupportPipeline / getSupportEscalationQueue (FR-4) and markPipelineLive (FR-5).
 *
 * REUSE (FR-2 / TR-1): the triage classifier reuses the EVA intake-classification keyword-scoring
 * engine — it imports keywordClassify from lib/integrations/intake-classifier.js (an out-of-scope
 * "this is actually a new-venture pitch, not a support issue" signal) and mirrors its scoring shape
 * (keywords.filter(kw => text.includes(kw)).length) for the support taxonomy. NO greenfield engine.
 *
 * Persistence (SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001): venture support tickets write to the
 * DEDICATED venture_support_tickets table (chairman-gated migration
 * database/migrations/20260713_venture_support_tickets.sql) — NEVER to the shared harness `feedback`
 * table. Fail-loud: nothing is ever silently dropped — an auto-resolution that cannot be recorded
 * DOWNGRADES to escalate, and a ticket with no resolvable venture_id is FORCED to escalate (never
 * auto-resolved unattributed) but is still persisted (venture_id=NULL) for human triage.
 *
 * FIRST CUSTOMER gate (ventures.support_is_armed): an explicit, human/chairman-set flag — never
 * auto-detected. It is informational/readiness signal only: it does NOT block ticket intake or
 * processing (a venture without a "first customer" yet should still get its support tickets
 * triaged/escalated correctly, not ignored). Callers that need armed-gated behavior downstream
 * (e.g. public rail-address activation) read `ticket.venture_armed` from the pipeline result.
 */
'use strict';

import { createHash } from 'node:crypto';
import { keywordClassify } from '../integrations/intake-classifier.js';
import { diagnoseStripeIssue } from './stripe-support-skill.js';
import { checkPublishAuthorization } from '../marketing/autonomy-gate.js';

const CRAFT_TIMEOUT_MS = 10000;

/** Support taxonomy — keyword sets scored exactly as intake-classifier.js keywordClassify does. */
export const SUPPORT_CATEGORY_KEYWORDS = Object.freeze({
  billing: ['bill', 'billing', 'charge', 'charged', 'invoice', 'payment', 'refund', 'subscription', 'price', 'overcharge', 'double charge', 'double-charged'],
  bug: ['bug', 'error', 'broken', 'crash', 'not working', "doesn't work", 'does not work', 'fails', 'failing', 'exception', 'glitch', '500'],
  how_to: ['how do i', 'how to', 'how can', 'where do', 'where is', 'tutorial', 'guide', 'setup', 'set up', 'configure', 'documentation'],
  account: ['account', 'login', 'log in', 'sign in', 'password', 'reset', 'locked', 'access', '2fa', 'verification', 'email change'],
  abuse: ['abuse', 'spam', 'fraud', 'scam', 'threat', 'harass', 'illegal', 'phishing', 'chargeback fraud'],
});
const SEVERITY_HIGH = ['urgent', 'asap', 'down', 'outage', "can't access", 'cannot access', 'charged twice', 'double charged', 'double-charged', 'lost data', 'breach', 'security', 'emergency', 'immediately', 'critical', 'losing money'];
const SEVERITY_MED = ['soon', 'important', 'blocked', 'stuck', 'frustrated', 'escalate', 'still waiting'];

const CANNED_RESOLUTIONS = Object.freeze({
  billing: 'Sent the billing FAQ + self-serve invoice/refund link.',
  bug: 'Acknowledged + linked the status page and the documented workaround.',
  how_to: 'Sent the relevant how-to guide article.',
  account: 'Sent the self-serve account / password-reset link.',
});

const SUPPORT_CATEGORIES = Object.freeze(['billing', 'bug', 'how_to', 'account', 'abuse', 'other']);
export const PIPELINE_LIVE_KR_CODE = 'KR-2026-07-01';

/**
 * Mirror of the intake-classifier scoring primitive: count keyword hits in the lower-cased text.
 * Multi-word phrases match as substrings; single tokens match on WORD BOUNDARIES so 'down' does
 * not match 'download' and 'charge' does not match 'recharge' (adversarial-review fix).
 */
function scoreKeywords(text, keywords) {
  const lower = String(text || '').toLowerCase();
  return keywords.filter((kw) => {
    if (kw.includes(' ')) return lower.includes(kw);
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower);
  }).length;
}

function deriveTicketId(parts) {
  const h = createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 16);
  return `tkt_${h}`;
}

// ── FR-1/FR-4: channel-neutral intake ingestion + venture attribution capture ─
/** Normalize any channel-neutral raw support input into a ticket. Pure + tolerant (never throws). */
export function normalizeSupportTicket(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const subject = typeof r.subject === 'string' ? r.subject : typeof r.title === 'string' ? r.title : '';
  const body = typeof r.body === 'string' ? r.body : typeof r.message === 'string' ? r.message : typeof r.description === 'string' ? r.description : '';
  const channel = typeof r.channel === 'string' && r.channel.trim() ? r.channel.trim() : 'unknown';
  const customer_ref = r.customer_ref ?? r.customer ?? r.email ?? null;
  const received_at = typeof r.received_at === 'string' ? r.received_at : new Date().toISOString();
  const ticket_id = r.ticket_id ?? r.id ?? deriveTicketId([channel, subject, body, customer_ref ? String(customer_ref) : '']);
  // venture_id: caller may already know it (e.g. an authenticated in-app support widget).
  // rail_address: the per-venture intake address the ticket arrived on (e.g. "billing@<venture>.com"
  // or a venture-specific webhook path) — resolved to a venture_id downstream (FR-4, DB-injected,
  // stays out of this pure function so normalizeSupportTicket remains unit-testable without a DB).
  const venture_id = typeof r.venture_id === 'string' && r.venture_id ? r.venture_id : null;
  const rail_address = typeof r.rail_address === 'string' && r.rail_address ? r.rail_address : typeof r.to === 'string' && r.to ? r.to : null;
  return { ticket_id, channel, subject, body, customer_ref, received_at, status: 'new', venture_id, rail_address };
}

// ── FR-4/FR-5: venture attribution + FIRST CUSTOMER armed-flag resolution ─────
/**
 * Resolve a ticket's venture_id (via its rail_address, or direct venture_id as a fallback) and the
 * venture's FIRST CUSTOMER support_is_armed flag. DB-injected, fail-open to unresolved (never
 * throws) — an unresolvable venture is a legitimate, expected outcome that disposeSupportTicket()
 * handles (forced escalate).
 *
 * PRECEDENCE (adversarial-review fix): rail_address is checked FIRST, direct venture_id only as a
 * fallback when no rail_address was provided. rail_address reflects the physical intake channel the
 * ticket arrived on; a caller-supplied venture_id on raw channel-neutral input (email/webhook body)
 * is otherwise spoofable — a sender could attribute their ticket to any existing venture. The
 * fallback exists for a genuinely trusted caller (e.g. an authenticated in-app support widget that
 * already knows its own venture_id and has no rail_address to give).
 * RESIDUAL SCOPE NOTE: both venture_id and rail_address are still sourced from raw, unauthenticated
 * input in normalizeSupportTicket() today — this pipeline has ZERO production callers (dormant,
 * test-only). Full trust-context propagation from a real transport layer (e.g. a verified email
 * envelope "to" address vs. spoofable body content) is deferred to whichever future SD wires a live
 * intake channel, since no live trust boundary exists to violate yet.
 */
export async function resolveVentureContext(supabase, ticket = {}) {
  try {
    if (ticket.rail_address) {
      // support_is_armed/support_rail_address: chairman-gated, staged-not-applied columns
      // (database/migrations/20260713_venture_support_tickets.sql). schema-lint-disable-line
      const { data } = await supabase.from('ventures').select('id, support_is_armed').eq('support_rail_address', ticket.rail_address).maybeSingle(); // schema-lint-disable-line
      if (data) return { venture_id: data.id, venture_armed: !!data.support_is_armed, resolved: true };
    }
    if (ticket.venture_id) {
      const { data } = await supabase.from('ventures').select('id, support_is_armed').eq('id', ticket.venture_id).maybeSingle(); // schema-lint-disable-line
      if (data) return { venture_id: data.id, venture_armed: !!data.support_is_armed, resolved: true };
      return { venture_id: null, venture_armed: false, resolved: false };
    }
    return { venture_id: null, venture_armed: false, resolved: false };
  } catch {
    return { venture_id: null, venture_armed: false, resolved: false };
  }
}

// ── FR-2: triage classifier (reuse the intake-classifier engine/pattern) ──────
/**
 * Classify a ticket into { category, severity, routing_decision, confidence, rationale }.
 * Pure + FAIL-OPEN: any error degrades to 'escalate' (never silent-drop, never throws).
 */
export function triageSupportTicket(ticket = {}) {
  try {
    const text = `${ticket?.subject || ''} ${ticket?.body || ''}`.trim();

    // category: highest keyword-score wins (intake-classifier scoring shape), else 'other'
    let category = 'other';
    let catScore = 0;
    for (const [cat, kws] of Object.entries(SUPPORT_CATEGORY_KEYWORDS)) {
      const s = scoreKeywords(text, kws);
      if (s > catScore) { category = cat; catScore = s; }
    }
    // Abuse is a VETO, not a category that must win the argmax (adversarial-review fix): ANY abuse
    // signal forces category='abuse' so a fraud/abuse ticket can never be auto-resolved even when a
    // benign category (e.g. billing) outscores it on keyword count.
    if (scoreKeywords(text, SUPPORT_CATEGORY_KEYWORDS.abuse) > 0) category = 'abuse';

    // severity
    const severity = scoreKeywords(text, SEVERITY_HIGH) > 0 ? 'high' : scoreKeywords(text, SEVERITY_MED) > 0 ? 'medium' : 'low';

    // REUSE intake-classifier: a ticket that the EVA engine reads as a new-venture pitch is
    // out-of-scope for support triage -> escalate to human routing.
    let misroutedAsVenture = false;
    try { misroutedAsVenture = keywordClassify(text)?.target_application === 'new_venture'; } catch { /* fail-open */ }

    const confidence = catScore >= 2 ? 0.8 : catScore === 1 ? 0.6 : 0.3;
    const knownCategory = category !== 'other';
    const autoResolvable = knownCategory && category !== 'abuse' && severity !== 'high' && confidence >= 0.6 && !misroutedAsVenture;
    const routing_decision = autoResolvable ? 'auto_resolve' : 'escalate';
    const rationale = autoResolvable
      ? `confident ${category} (${severity}) — auto-resolvable happy path`
      : `escalate: ${category === 'abuse' ? 'abuse' : misroutedAsVenture ? 'out-of-scope (reads as new-venture, not support)' : !knownCategory ? 'unknown category' : severity === 'high' ? 'high severity' : 'low confidence'}`;

    return { category, severity, routing_decision, confidence, rationale };
  } catch (e) {
    return { category: 'other', severity: 'high', routing_decision: 'escalate', confidence: 0, rationale: `triage error (fail-open to escalate): ${e?.message ?? e}` };
  }
}

// ── FR-1 (round 2): LLM-based ticket understanding + personalized draft-reply ─
/**
 * Craft a personalized reply for an auto-resolvable ticket. Reuses the existing LLM client
 * factory (lib/llm/client-factory.js#getClassificationClient) -- no new LLM client. The prompt
 * contains ONLY ticket.subject and ticket.body -- customer_ref (often an email) is NEVER sent to
 * the LLM. This is the first place ticket content reaches a real LLM in this codebase; triage
 * above (keywordClassify) is a pure keyword scorer, not an LLM call (adversarial TESTING finding).
 *
 * FAIL-OPEN INCLUDING ON A HANG: an unbounded await is not an "error" and would never trigger a
 * plain try/catch, silently blocking the caller forever -- the explicit timeout is what makes
 * fail-open reachable (adversarial TESTING finding). Never throws; returns null on any error,
 * timeout, or missing LLM client so the caller falls back to CANNED_RESOLUTIONS.
 */
export async function craftSupportReply(ticket = {}, triage = {}) {
  // TESTING finding N1 (EXEC-TO-PLAN, evidence 5b69b337): an uncleared setTimeout keeps a
  // short-lived process (a cron worker, a one-shot script) alive for the full 10s even after the
  // race is won -- clearTimeout in `finally` regardless of which side of the race settled first.
  let timer;
  try {
    return await Promise.race([
      craftReplyViaLLM(ticket, triage),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`craftSupportReply: exceeded ${CRAFT_TIMEOUT_MS}ms`)), CRAFT_TIMEOUT_MS); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function craftReplyViaLLM(ticket, triage) {
  const { getClassificationClient } = await import('../llm/client-factory.js');
  const client = await getClassificationClient();
  if (!client?.complete) return null;
  const subject = String(ticket.subject || '').slice(0, 500);
  const body = String(ticket.body || '').slice(0, 4000);
  const response = await client.complete(
    "You are a concise, friendly customer-support agent. Write a short (2-4 sentence) reply addressing the customer's issue directly. Do not invent facts you cannot verify from the ticket text.",
    `Category: ${triage.category || 'other'}\nSubject: ${subject}\nMessage: ${body}`,
    { maxTokens: 300 }
  );
  const text = typeof response === 'string' ? response : response?.content;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

// ── FR-3 (round 2): stage the crafted reply for delivery -- never send it directly ───────────
/**
 * Stage a crafted reply via the fleet's PROVEN send-staging mechanism
 * (lib/marketing/autonomy-gate.js#checkPublishAuthorization, already used in production by
 * SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001 for outbound marketing) -- never delivers directly.
 * ZERO send-capable code exists in this module, in stripe-support-skill.js, or in
 * checkPublishAuthorization() itself (no SMTP, resend, twilio, or sendgrid call anywhere) --
 * verified by a static scan + one-hop import check (tests/unit/support/no-send-capability.test.js).
 * checkPublishAuthorization()'s own deeper dependency tree (autonomy-gate.js -> stage-gate-
 * predicate.js -> ... ) is NOT exhaustively scanned beyond one hop (TESTING finding N2, EXEC-TO-
 * PLAN evidence 5b69b337) -- it IS manually traced: checkPublishAuthorization() only ever writes a
 * venture_channel_publish_ledger row and calls recordPendingDecision() (a chairman_decisions
 * insert), never a send/dispatch call, regardless of what it returns (it CAN return allowed:true
 * for an autonomous/pre-accepted channel) -- there is nothing downstream in this module, or in
 * checkPublishAuthorization() itself, that acts on that result to actually deliver anything.
 *
 * No explicit correlationId is passed -- checkPublishAuthorization()'s own default
 * (`${ventureId}:${channelType}:${contentId}`) is already venture-scoped, unlike the raw
 * ticket_id (a content hash, NOT venture-scoped) an earlier draft proposed passing directly,
 * which would have collided across two ventures receiving textually-identical tickets
 * (adversarial TESTING finding).
 */
async function stageReplyDelivery(supabase, ticket) {
  if (!ticket.venture_id) return { staged: false, reason: 'no venture_id' };
  try {
    const result = await checkPublishAuthorization({
      supabase,
      ventureId: ticket.venture_id,
      channelType: 'support_reply',
      contentId: ticket.ticket_id,
    });
    return { staged: true, ...result };
  } catch (e) {
    return { staged: false, reason: e?.message ?? String(e) };
  }
}

// ── FR-3: routing / disposition (venture_support_tickets; fail-loud) ──────────
/**
 * IDEMPOTENT insert (adversarial-review fix): ticket_id is deterministic (deriveTicketId), and the
 * table enforces UNIQUE(venture_id, ticket_id) / a unique partial index for venture_id IS NULL.
 * At-least-once redelivery (webhook/email retries are the norm) would otherwise hit a unique-
 * violation on the SECOND write attempt — auto-resolve fails silently (caught by the caller),
 * downgrades to escalate, then escalate hits the SAME violation UNCAUGHT and crashes the pipeline.
 * On a Postgres unique-violation (23505), look up and return the already-persisted row instead of
 * throwing — a benign redelivery becomes a no-op, not a crash.
 */
async function writeSupportTicketRow(supabase, row) {
  const { data, error } = await supabase.from('venture_support_tickets').insert(row).select('id').single();
  if (!error) return data.id;
  if (error.code === '23505') {
    let existingQuery = supabase.from('venture_support_tickets').select('id').eq('ticket_id', row.ticket_id);
    existingQuery = row.venture_id ? existingQuery.eq('venture_id', row.venture_id) : existingQuery.is('venture_id', null);
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) return existing.id;
  }
  throw error;
}

async function recordAutoResolution(supabase, ticket, triage, resolutionNotes) {
  return writeSupportTicketRow(supabase, {
    venture_id: ticket.venture_id,
    ticket_id: ticket.ticket_id,
    channel: ticket.channel,
    subject: ticket.subject || null,
    body: ticket.body || '',
    customer_ref: ticket.customer_ref ? String(ticket.customer_ref) : null,
    category: triage.category,
    severity: triage.severity,
    routing_decision: triage.routing_decision,
    status: 'auto_resolved',
    resolution_notes: resolutionNotes,
  });
}

async function escalateSupportTicket(supabase, ticket, triage) {
  return writeSupportTicketRow(supabase, {
    venture_id: ticket.venture_id,
    ticket_id: ticket.ticket_id,
    channel: ticket.channel,
    subject: ticket.subject || null,
    body: ticket.body || '',
    customer_ref: ticket.customer_ref ? String(ticket.customer_ref) : null,
    category: triage.category,
    severity: triage.severity,
    routing_decision: triage.routing_decision,
    status: 'escalated',
    // TR-5: discriminator prefix -- resolution_notes is written by 4 different sources
    // (canned/crafted/stripe/escalated) with no dedicated column (TR-1: no schema change).
    resolution_notes: triage.rationale ? `[escalated] ${triage.rationale}` : null,
  });
}

/**
 * Dispose a triaged ticket. Auto-resolve the happy path; ESCALATE everything else to
 * venture_support_tickets. FAIL-LOUD: an auto-resolution that cannot be recorded DOWNGRADES to
 * escalate, and a ticket with no resolvable venture_id is FORCED to escalate (never auto-resolved
 * unattributed) — so a ticket is NEVER silently dropped.
 */
export async function disposeSupportTicket(supabase, ticket, triage) {
  if (!ticket.venture_id) {
    triage = { ...triage, routing_decision: 'escalate', rationale: `${triage.rationale}; escalated: no venture_id resolved (unattributed ticket)` };
  }
  if (triage.routing_decision === 'auto_resolve') {
    const [crafted, stripeDiagnosis] = await Promise.all([
      craftSupportReply(ticket, triage),
      triage.category === 'billing' && ticket.venture_id ? diagnoseStripeIssue(supabase, ticket.venture_id, ticket) : Promise.resolve(null),
    ]);
    // TR-5: discriminator prefix so an audit can tell canned/crafted/stripe apart without a
    // dedicated column (TR-1: no schema change).
    const resolutionNotes = crafted
      ? `[crafted] ${crafted}${stripeDiagnosis ? ` [stripe] ${stripeDiagnosis}` : ''}`
      : stripeDiagnosis
        ? `[stripe] ${stripeDiagnosis}`
        : `[canned] ${CANNED_RESOLUTIONS[triage.category] || 'Auto-resolved (happy path).'}`;

    let recordedId = null;
    try { recordedId = await recordAutoResolution(supabase, ticket, triage, resolutionNotes); } catch { recordedId = null; }
    if (recordedId) {
      // FR-3: stage delivery AFTER the ticket row write succeeds (adversarial TESTING fix) --
      // never before, so a downstream write failure can't leave an orphaned pending
      // chairman_decisions row for a reply that was never actually persisted.
      const staging = await stageReplyDelivery(supabase, ticket);
      return { status: 'auto_resolved', resolution: resolutionNotes, record_id: recordedId, escalated: false, staging };
    }
    // downgrade: the happy-path record failed -> do NOT drop; escalate instead.
    triage = { ...triage, routing_decision: 'escalate', rationale: `${triage.rationale}; downgraded: auto-resolve record failed` };
  }
  const escalationId = await escalateSupportTicket(supabase, ticket, triage);
  return { status: 'escalated', escalation_id: escalationId, escalated: true, reason: triage.rationale };
}

// ── FR-4: orchestrator + surfaced queue ──────────────────────────────────────
/** Run the full intake -> resolve-venture -> triage -> route pipeline for one raw input. */
export async function runSupportPipeline(supabase, raw) {
  const ticket = normalizeSupportTicket(raw);
  const ventureContext = await resolveVentureContext(supabase, ticket);
  ticket.venture_id = ventureContext.venture_id;
  ticket.venture_armed = ventureContext.venture_armed;
  const triage = triageSupportTicket(ticket);
  const disposition = await disposeSupportTicket(supabase, ticket, triage);
  return { ticket, triage, disposition };
}

/**
 * List the surfaced escalation queue (open venture_support_tickets rows). Formerly surfaced via the
 * harness /inbox (unified-inbox-builder's unfiltered loadFeedback()) when this reused the feedback
 * table — accepted tradeoff (SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001 TR-3): venture support tickets no
 * longer appear in /inbox. A dedicated venture-support surfaced view is deferred to a future SD if/
 * when the pipeline goes live with a real consumer.
 */
export async function getSupportEscalationQueue(supabase, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('venture_support_tickets')
    .select('id, venture_id, ticket_id, channel, subject, body, category, severity, status, resolution_notes, created_at')
    .eq('status', 'escalated')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // Do NOT silently report an empty queue on a read failure — that would blind an operator to
    // real escalations (adversarial-review fix). Surface the error loudly; caller treats as unknown.
    console.warn(`[support-intake] escalation-queue read failed (NOT empty — query errored): ${error.message}`);
    return null;
  }
  return data || [];
}

// ── FR-5: KR-2026-07-01 wiring (idempotent, real-run-gated) ───────────────────
/**
 * Flip KR-2026-07-01 (current_value 0 -> 1, status achieved) — the pipeline is live end-to-end.
 * IDEMPOTENT (re-running leaves it at 1) and gated on a genuine end-to-end pipelineResult.
 */
export async function markPipelineLive(supabase, pipelineResult) {
  const ranEndToEnd = !!(pipelineResult?.ticket?.ticket_id && pipelineResult?.triage?.routing_decision && pipelineResult?.disposition?.status);
  if (!ranEndToEnd) return { flipped: false, reason: 'pipeline did not run end-to-end' };
  const { data: kr, error: readErr } = await supabase.from('key_results').select('id, current_value').eq('code', PIPELINE_LIVE_KR_CODE).maybeSingle();
  if (readErr || !kr) return { flipped: false, reason: 'KR not found' };
  if (Number(kr.current_value) >= 1) return { flipped: false, already: true, current_value: kr.current_value };
  const { error } = await supabase.from('key_results').update({ current_value: 1, status: 'achieved', last_updated_by: 'support-intake-pipeline' }).eq('code', PIPELINE_LIVE_KR_CODE);
  if (error) return { flipped: false, error: error.message };
  return { flipped: true, current_value: 1 };
}

export { SUPPORT_CATEGORIES };
