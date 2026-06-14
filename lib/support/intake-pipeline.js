/**
 * Venture-AGNOSTIC customer-support intake -> triage -> route pipeline (happy-path zero-touch).
 * SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001 (load-bearing-for-first-dollar).
 *
 * Three composable seams, DB INJECTED (the core is pure + unit-testable without a DB):
 *   1. normalizeSupportTicket(raw)            — channel-neutral capture -> normalized ticket (FR-1)
 *   2. triageSupportTicket(ticket)            — category + severity + routing decision (FR-2)
 *   3. disposeSupportTicket(sb, ticket, tri)  — auto-resolve happy path | escalate edge cases (FR-3)
 * plus runSupportPipeline / getSupportEscalationQueue (FR-4) and markPipelineLive (FR-5).
 *
 * REUSE (FR-2 / TR-1): the triage classifier reuses the EVA intake-classification keyword-scoring
 * engine — it imports keywordClassify from lib/integrations/intake-classifier.js (an out-of-scope
 * "this is actually a new-venture pitch, not a support issue" signal) and mirrors its scoring shape
 * (keywords.filter(kw => text.includes(kw)).length) for the support taxonomy. NO greenfield engine.
 *
 * Persistence (TR-3): NO new table / NO migration. The surfaced escalation queue REUSES the existing
 * feedback store (category='support_escalation', surfaced via /inbox); auto-resolutions are recorded
 * as resolved feedback rows (category='support_auto_resolved'). Fail-loud: nothing is ever silently
 * dropped — an auto-resolution that cannot be recorded DOWNGRADES to escalate.
 */
'use strict';

import { createHash } from 'node:crypto';
import { keywordClassify } from '../integrations/intake-classifier.js';

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

// ── FR-1: channel-neutral intake ingestion ───────────────────────────────────
/** Normalize any channel-neutral raw support input into a ticket. Pure + tolerant (never throws). */
export function normalizeSupportTicket(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const subject = typeof r.subject === 'string' ? r.subject : typeof r.title === 'string' ? r.title : '';
  const body = typeof r.body === 'string' ? r.body : typeof r.message === 'string' ? r.message : typeof r.description === 'string' ? r.description : '';
  const channel = typeof r.channel === 'string' && r.channel.trim() ? r.channel.trim() : 'unknown';
  const customer_ref = r.customer_ref ?? r.customer ?? r.email ?? null;
  const received_at = typeof r.received_at === 'string' ? r.received_at : new Date().toISOString();
  const ticket_id = r.ticket_id ?? r.id ?? deriveTicketId([channel, subject, body, customer_ref ? String(customer_ref) : '']);
  return { ticket_id, channel, subject, body, customer_ref, received_at, status: 'new' };
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

// ── FR-3: routing / disposition (reuse the feedback store; fail-loud) ─────────
async function writeFeedbackRow(supabase, row) {
  // source_application is NOT NULL on feedback; default it (callers may override).
  const fullRow = { source_application: 'EHG_Engineer', ...row };
  const { data, error } = await supabase.from('feedback').insert(fullRow).select('id').single();
  if (error) throw error;
  return data.id;
}

async function recordAutoResolution(supabase, ticket, triage) {
  return writeFeedbackRow(supabase, {
    type: 'issue',
    source_type: 'user_feedback',
    category: 'support_auto_resolved',
    status: 'resolved',
    severity: triage.severity,
    title: `Support auto-resolved: ${triage.category} (${triage.severity})`,
    description: `${ticket.subject || '(no subject)'} — ${CANNED_RESOLUTIONS[triage.category] || 'Auto-resolved (happy path).'}`,
    resolution_notes: CANNED_RESOLUTIONS[triage.category] || 'Auto-resolved (happy path).',
    metadata: { ticket_id: ticket.ticket_id, channel: ticket.channel, customer_ref: ticket.customer_ref, triage, sd: 'SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001' },
  });
}

async function escalateToFeedback(supabase, ticket, triage) {
  return writeFeedbackRow(supabase, {
    type: 'issue',
    source_type: 'user_feedback',
    category: 'support_escalation',
    status: 'new',
    severity: triage.severity,
    priority: triage.severity === 'high' ? 'high' : triage.severity === 'medium' ? 'medium' : 'low',
    title: `Support escalation: ${triage.category} (${triage.severity})`,
    description: `${ticket.subject || '(no subject)'}\n\n${ticket.body || ''}\n\n[triage] ${triage.rationale}`,
    metadata: { ticket_id: ticket.ticket_id, channel: ticket.channel, customer_ref: ticket.customer_ref, triage, sd: 'SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001' },
  });
}

/**
 * Dispose a triaged ticket. Auto-resolve the happy path; ESCALATE everything else to the surfaced
 * feedback queue. FAIL-LOUD: an auto-resolution that cannot be recorded DOWNGRADES to escalate, so a
 * ticket is NEVER silently dropped.
 */
export async function disposeSupportTicket(supabase, ticket, triage) {
  if (triage.routing_decision === 'auto_resolve') {
    let recordedId = null;
    try { recordedId = await recordAutoResolution(supabase, ticket, triage); } catch { recordedId = null; }
    if (recordedId) {
      return { status: 'auto_resolved', resolution: CANNED_RESOLUTIONS[triage.category] || 'Auto-resolved (happy path).', record_id: recordedId, escalated: false };
    }
    // downgrade: the happy-path record failed -> do NOT drop; escalate instead.
    triage = { ...triage, routing_decision: 'escalate', rationale: `${triage.rationale}; downgraded: auto-resolve record failed` };
  }
  const escalationId = await escalateToFeedback(supabase, ticket, triage);
  return { status: 'escalated', escalation_id: escalationId, escalated: true, reason: triage.rationale };
}

// ── FR-4: orchestrator + surfaced queue ──────────────────────────────────────
/** Run the full intake -> triage -> route pipeline for one raw input. */
export async function runSupportPipeline(supabase, raw) {
  const ticket = normalizeSupportTicket(raw);
  const triage = triageSupportTicket(ticket);
  const disposition = await disposeSupportTicket(supabase, ticket, triage);
  return { ticket, triage, disposition };
}

/** List the surfaced escalation queue (open support_escalation feedback rows). */
export async function getSupportEscalationQueue(supabase, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, title, description, status, priority, severity, created_at, metadata')
    .eq('category', 'support_escalation')
    .neq('status', 'resolved')
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
