/**
 * Purchase executor — approval-enforced, idempotent, ceiling-guarded, plan-first.
 *
 * SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001 FR-3 / FR-4 / FR-5 / FR-6.
 *
 * THE AUTHORIZATION BOUNDARY IS THIS CODE PATH, not convention (RISK evidence
 * 5d4f0fe5 gate #1): the executor consumes ONLY a linked chairman_decisions row
 * with status='approved'. Refusal matrix (each with a named reason, zero
 * registrar calls): decision absent / not an acquisition packet / pending /
 * rejected-or-other-nonapproved / stale quote / already consumed.
 *
 * PLAN-MODE DEFAULT (mirrors lib/venture-deploy/promote.js): without
 * deps.registrar AND deps.execute===true the result is the ordered action plan
 * + status 'blocked_on_credentials' — no registrar HTTP is reachable. This is
 * what lets the real-money surface merge dormant before the chairman
 * provisions the token.
 *
 * EXECUTE ORDER (registry-first, register last):
 *   1. live re-quote (Check) -> FR-5 fail-closed ceiling guardrail — the
 *      packet's quote is ADVISORY; money decisions use the live number only.
 *   2. recordDisposition(domain_acquisition, {venture_id, domain}) BEFORE the
 *      register call (awaiting) — the durable check-before-register record;
 *      a prior 'consumed' row short-circuits to already_acquired (FR-4).
 *   3. registerDomain — the LAST, narrowest, most-audited step. No rollback
 *      exists; the full registrar response is persisted for forensics.
 *   4. disposition -> consumed with the registrar response in answer_payload.
 * Failures persist a sanitized error onto the decision record
 * (brief_data.acquisition_error) and LEAVE the disposition un-consumed so a
 * retry is possible once the cause clears (FR-6, fail-loud never fail-silent).
 *
 * @module lib/venture-acquisition/acquire
 */

import { REGISTRAR_PRICE_CEILING } from '../venture-deploy/spend-guardrails.js';
import { normalizeQuote } from './registrar-adapter.js';
import { PACKET_KIND, resolvePurchaseCeilingUsd } from './decision-packet.js';
import { recordDisposition, updateDispositionStatus, getDispositionBySubject, computeQuestionKey } from '../decision-binding/disposition.js';

/** Quote freshness bound: an approval on week-old prices must re-compose (FR-3 stale state). */
export const PACKET_QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

/** The ordered action plan (plan mode emits this; execute mode walks it). */
export function planAcquisitionActions(domain) {
  return [
    { kind: 'live_quote', desc: `registrar Check ${domain} — live registrability + price (packet quote is advisory only)` },
    { kind: 'ceiling_guardrail', desc: 'registrar-price-ceiling fail-closed check against the live quote (blocks even WITH approval)' },
    { kind: 'idempotency_record', desc: `disposition domain_acquisition {venture, ${domain}} written BEFORE the register call (registry-first)` },
    { kind: 'register', desc: `registrar Register ${domain} — the real-money, irreversible, most-audited step` },
    { kind: 'dns_wiring', desc: 'zone + minimal record set for the deploy handoff (FR-7, PR-B)' },
    { kind: 'deploy_handoff', desc: 'stamp ventures.deployment_url once routed (FR-8, PR-B)' },
  ];
}

/** Persist a sanitized refusal/error onto the decision record (fail-soft recorder — never masks the primary result). */
async function persistOnDecision(supabase, decision, key, payload) {
  try {
    await supabase
      .from('chairman_decisions')
      .update({ brief_data: { ...(decision.brief_data || {}), [key]: payload } })
      .eq('id', decision.id);
  } catch { /* recorder fault never masks the executor's own result */ }
}

/**
 * Execute (or plan) the acquisition for an approved decision.
 *
 * @param {object} supabase - service-role client
 * @param {string} decisionId - chairman_decisions.id
 * @param {{registrar?: object|null, execute?: boolean, env?: object, now?: () => Date}} [deps]
 * @returns {Promise<{status: string, reason?: string, domain?: string, plan?: object[], registrarResponse?: object, error?: string}>}
 */
export async function executeAcquisition(supabase, decisionId, deps = {}) {
  const { registrar = null, execute = false, env = process.env, now = () => new Date() } = deps;

  // ── FR-3 refusal matrix: every state below refuses BEFORE any registrar call ──
  const { data: decision, error: dErr } = await supabase
    .from('chairman_decisions')
    .select('*')
    .eq('id', decisionId)
    .maybeSingle();
  if (dErr) return { status: 'refused', reason: `decision_read_error: ${dErr.message}` };
  if (!decision) return { status: 'refused', reason: 'decision_not_found' };
  const brief = decision.brief_data || {};
  if (brief.packet_kind !== PACKET_KIND) return { status: 'refused', reason: 'not_an_acquisition_packet' };
  if (decision.status === 'pending') return { status: 'refused', reason: 'approval_pending' };
  if (decision.status === 'rejected') return { status: 'refused', reason: 'decision_rejected' };
  if (decision.status !== 'approved') return { status: 'refused', reason: `decision_not_approved: ${decision.status}` };

  const domain = brief.recommended;
  const ventureId = decision.venture_id;
  if (!domain || !ventureId) return { status: 'refused', reason: 'packet_missing_domain_or_venture' };

  const quotedAt = Date.parse(brief.quoted_at || '');
  if (!Number.isFinite(quotedAt) || now().getTime() - quotedAt > PACKET_QUOTE_TTL_MS) {
    return { status: 'refused', reason: 'stale_packet_quote', unblock: 're-compose the packet (composeAcquisitionPacket) for fresh quotes and a fresh approval' };
  }

  // ── FR-4 check-before-register: a consumed disposition means this purchase already happened ──
  const subject = { venture_id: ventureId, domain };
  const prior = await getDispositionBySubject(supabase, 'domain_acquisition', subject);
  if (prior?.payload?.status === 'consumed') {
    return { status: 'already_acquired', domain, disposition: prior.payload.question_key };
  }

  // ── TR-1 plan-mode default: no adapter or execute!==true => ordered plan, zero live calls ──
  if (!registrar || execute !== true) {
    return { status: 'blocked_on_credentials', domain, plan: planAcquisitionActions(domain) };
  }

  // ── FR-5 fail-closed ceiling against the LIVE quote (never the packet's) ──
  const ceilingUsd = resolvePurchaseCeilingUsd(env);
  let live;
  try {
    live = normalizeQuote(await registrar.checkDomain(domain));
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    await persistOnDecision(supabase, decision, 'acquisition_error', { step: 'live_quote', reason: msg, at: now().toISOString() });
    return { status: 'failed', reason: 'live_quote_failed', error: msg };
  }
  const verdict = REGISTRAR_PRICE_CEILING.enforce({ quote: { priceUsd: live.priceUsd ?? undefined }, limits: { registrarPriceCeilingUsd: ceilingUsd } });
  if (verdict.decision !== 'allow' || live.registrable !== true) {
    const refusal = {
      step: 'ceiling_guardrail',
      reason: live.registrable !== true ? 'domain_not_registrable_at_execute' : verdict.reason,
      live_price_usd: live.priceUsd,
      ceiling_usd: ceilingUsd,
      at: now().toISOString(),
    };
    await persistOnDecision(supabase, decision, 'acquisition_refusal', refusal);
    return { status: 'refused', reason: refusal.reason };
  }

  // ── FR-4 registry-first: durable record BEFORE the money call ──
  const { row } = await recordDisposition(supabase, {
    decisionType: 'domain_acquisition',
    subject,
    decisionKey: `domain_acquisition:${ventureId}:${domain}`,
    authority: 'chairman',
    status: 'awaiting_disposition',
  });
  if (row?.payload?.status === 'consumed') {
    return { status: 'already_acquired', domain, disposition: row.payload.question_key };
  }
  const questionKey = computeQuestionKey('domain_acquisition', subject);

  // ── The register call: last, narrowest, most-audited. No rollback exists. ──
  let registrarResponse;
  try {
    registrarResponse = await registrar.registerDomain(domain, { years: 1, autoRenew: false });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    await persistOnDecision(supabase, decision, 'acquisition_error', { step: 'register', reason: msg, at: now().toISOString() });
    // Disposition stays un-consumed: retry-able once the cause clears (FR-6).
    return { status: 'failed', reason: 'register_failed', error: msg };
  }

  await updateDispositionStatus(supabase, questionKey, 'consumed', {
    answerPayload: { registrar_response: registrarResponse, registered_at: now().toISOString(), live_price_usd: live.priceUsd },
  });
  return { status: 'registered', domain, registrarResponse };
}

export default { executeAcquisition, planAcquisitionActions, PACKET_QUOTE_TTL_MS };
