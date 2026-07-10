/**
 * Acquisition decision packet — shortlist -> ONE pending chairman decision.
 *
 * SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001 FR-1.
 *
 * Consumes the Stage-11 domainShortlist riding the identity_brand_name
 * venture_artifacts row (producer contract:
 * lib/venture-domains/stage-integration.js buildDomainShortlist —
 * [{candidate, domain, verdict, checked_at, price:null}]; price is null BY
 * DESIGN there, so this module quotes LIVE via the registrar adapter's Check
 * endpoint; unquotable domains carry price 'unknown', never a fabricated
 * number).
 *
 * ROUTED THROUGH THE EXISTING QUEUE ONLY: a plain chairman_decisions insert
 * (writer pattern: lib/eva/stage-zero/chairman-review.js) with status
 * 'pending' — surfaced by chairman_pending_decisions / CLI / email for free,
 * resolved exclusively via fn_chairman_decide. Never a bespoke channel or UI.
 *
 * DEGRADE, DON'T FABRICATE: the availability seam is default-OFF
 * (DOMAIN_AVAILABILITY_MODE), so the shortlist may be ABSENT — that returns
 * {status:'no_shortlist'} with the re-run hint and inserts NOTHING.
 *
 * IDEMPOTENT: an existing pending acquisition packet for the venture is
 * returned as-is (no duplicate pending rows). Packets are identified by
 * brief_data.packet_kind === 'domain_acquisition'.
 *
 * @module lib/venture-acquisition/decision-packet
 */

import { normalizeQuote } from './registrar-adapter.js';

export const PACKET_KIND = 'domain_acquisition';
export const PACKET_VERSION = 1;
export const DEFAULT_DOMAIN_PURCHASE_CEILING_USD = 50;

/** Resolve the configured per-purchase ceiling (env-driven; FR-5 default 50). */
export function resolvePurchaseCeilingUsd(env = process.env) {
  const v = Number(env.DOMAIN_PURCHASE_CEILING_USD);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DOMAIN_PURCHASE_CEILING_USD;
}

/** Read the venture's latest identity_brand_name artifact's domainShortlist (or null). */
export async function readDomainShortlist(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'identity_brand_name')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`readDomainShortlist: ${error.message}`);
  const shortlist = data?.[0]?.artifact_data?.domainShortlist;
  return Array.isArray(shortlist) && shortlist.length > 0 ? shortlist : null;
}

/**
 * Quote the shortlist via the registrar adapter (live Check per domain).
 * Adapter null or a per-domain fault => price 'unknown' (honest, fail-soft for
 * QUOTING only — the executor's ceiling re-quote is the fail-closed layer).
 */
export async function quoteShortlist(shortlist, registrar) {
  const ranked = [];
  for (const row of shortlist) {
    let quotedPriceUsd = 'unknown';
    let registrable = null;
    if (registrar) {
      try {
        const q = normalizeQuote(await registrar.checkDomain(row.domain));
        registrable = q.registrable;
        quotedPriceUsd = q.priceUsd === null ? 'unknown' : q.priceUsd;
      } catch { /* honest unknown — never fabricate a price */ }
    }
    ranked.push({ domain: row.domain, candidate: row.candidate, verdict: row.verdict, registrable, quoted_price_usd: quotedPriceUsd });
  }
  return ranked;
}

/** Pick the recommended default: first registrable-and-within-ceiling, else first row. */
export function pickRecommended(ranked, ceilingUsd) {
  const affordable = ranked.find((r) => r.registrable === true && typeof r.quoted_price_usd === 'number' && r.quoted_price_usd <= ceilingUsd);
  return (affordable || ranked[0])?.domain ?? null;
}

/**
 * Compose the packet: ONE pending chairman_decisions row for the venture.
 *
 * @param {object} supabase - service-role client
 * @param {string} ventureId
 * @param {{registrar?: object|null, env?: object, lifecycleStage?: number, selectedName?: string}} [deps]
 * @returns {Promise<{status: 'created'|'existing'|'no_shortlist', decision?: object, unblock?: string}>}
 */
export async function composeAcquisitionPacket(supabase, ventureId, deps = {}) {
  const { registrar = null, env = process.env, lifecycleStage = 11, selectedName = null } = deps;

  // Idempotency first: one pending acquisition packet per venture, ever.
  const { data: existing, error: exErr } = await supabase
    .from('chairman_decisions')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('status', 'pending')
    .eq('brief_data->>packet_kind', PACKET_KIND)
    .limit(1);
  if (exErr) throw new Error(`composeAcquisitionPacket: pending lookup failed: ${exErr.message}`);
  if (existing && existing.length > 0) return { status: 'existing', decision: existing[0] };

  const shortlist = await readDomainShortlist(supabase, ventureId);
  if (!shortlist) {
    return {
      status: 'no_shortlist',
      unblock: 'No domainShortlist on the identity_brand_name artifact — re-run Stage-11 naming with DOMAIN_AVAILABILITY_MODE=live (lib/venture-domains/stage-integration.js seam) to produce one.',
    };
  }

  const ceilingUsd = resolvePurchaseCeilingUsd(env);
  const ranked = await quoteShortlist(shortlist, registrar);
  const recommended = pickRecommended(ranked, ceilingUsd);
  const name = selectedName || shortlist[0]?.candidate || null;

  const { data: decision, error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: lifecycleStage,
      status: 'pending',
      decision: 'pending',
      blocking: false,
      decision_type: 'chairman_approval',
      summary: `Domain acquisition: register "${recommended}" for venture name "${name}" (${ranked.length} candidate domain(s), ceiling $${ceilingUsd}/yr)`,
      rationale: 'One-touch purchase gate (SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001): approve to register the recommended domain via Cloudflare Registrar, auto-wire DNS, and hand to the deploy pipeline. Purchase is real money and irreversible — the executor refuses without this approval.',
      brief_data: {
        packet_kind: PACKET_KIND,
        packet_version: PACKET_VERSION,
        selected_name: name,
        ranked_domains: ranked,
        recommended,
        ceiling_usd: ceilingUsd,
        quoted_at: new Date().toISOString(),
      },
    })
    .select()
    .single();
  if (error) {
    // Real-DB constraint the pre-check can't see (adversarial finding): a
    // partial unique index allows ONE pending decision per (venture, stage) —
    // ANY other pending stage-11 decision 23505s this insert. Surface it as a
    // named conflict (fail-loud, retry after that decision resolves), and
    // re-check for a concurrently-created acquisition packet first.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('chairman_decisions')
        .select('*')
        .eq('venture_id', ventureId)
        .eq('status', 'pending')
        .eq('brief_data->>packet_kind', PACKET_KIND)
        .limit(1);
      if (raced && raced.length > 0) return { status: 'existing', decision: raced[0] };
      return {
        status: 'pending_conflict',
        unblock: `Another pending stage-${lifecycleStage} chairman decision holds this venture's pending slot (partial unique index) — resolve it, then re-compose.`,
      };
    }
    throw new Error(`composeAcquisitionPacket: insert failed: ${error.message}`);
  }
  return { status: 'created', decision };
}

export default { composeAcquisitionPacket, readDomainShortlist, quoteShortlist, pickRecommended, resolvePurchaseCeilingUsd, PACKET_KIND, PACKET_VERSION, DEFAULT_DOMAIN_PURCHASE_CEILING_USD };
