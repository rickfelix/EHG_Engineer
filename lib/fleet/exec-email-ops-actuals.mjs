// exec-email-ops-actuals.mjs
// SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 (FR-5): one actuals-vs-targets line per live venture
// in the chairman exec-summary email, combining cost (venture_token_ledger) with health
// (ops_product_health). Extends the EXISTING exec-email pipeline (no new report) — mirrors
// the computeAlignmentLines fail-soft pattern in lib/fleet/exec-email-alignment.mjs.
//
// "Live venture" selection matches the rest of the SD: ventures WHERE deployment_url IS NOT
// NULL (status is unreliable post-pivot — see lib/ops/venture-uptime-probe.js header).

const WINDOW_DAYS = 30;

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: the cost line SUMS every
// venture_token_ledger row for a venture over 30 days — token-usage events easily exceed the
// PostgREST 1000-row cap, silently understating cost to the chairman. Paginate to completion;
// the per-venture fail-soft catch (cost defaults to 0) is preserved.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/**
 * PURE: format one venture's actuals line from its cost + health inputs.
 * @param {{ name: string }} venture
 * @param {{ costUsd: number|null, uptimePct: number|null, hasHealthRow: boolean }} actuals
 * @returns {string}
 */
export function formatVentureActualsLine(venture, actuals) {
  const name = venture?.name || 'Unknown venture';
  const costPart = Number.isFinite(actuals?.costUsd)
    ? `$${actuals.costUsd.toFixed(2)} cost (${WINDOW_DAYS}d)`
    : `$0.00 cost (${WINDOW_DAYS}d)`;
  const healthPart = actuals?.hasHealthRow && Number.isFinite(actuals?.uptimePct)
    ? `${actuals.uptimePct.toFixed(1)}% uptime`
    : 'health: no data yet';
  return `${name}: ${costPart} · ${healthPart}`;
}

/**
 * Compute the per-venture actuals lines for the exec email. Fail-soft: any error yields
 * an empty array (the caller renders nothing for this section) rather than throwing.
 * @param {{ supabase: object }} io
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<string[]>}
 */
export async function computeOpsActualsLines(io, opts = {}) {
  const db = io && io.supabase;
  if (!db) return [];

  try {
    const { data: ventures, error: vErr } = await db
      .from('ventures')
      .select('id, name, deployment_url')
      .not('deployment_url', 'is', null)
      .neq('deployment_url', '');
    if (vErr || !ventures || ventures.length === 0) return [];

    const nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
    const sinceIso = new Date(nowMs - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const todayDate = new Date(nowMs).toISOString().split('T')[0];

    const lines = [];
    for (const venture of ventures) {
      let costUsd = 0;
      try {
        const ledgerRows = await fetchAllPaginated(() => db
          .from('venture_token_ledger')
          .select('cost_usd')
          .eq('venture_id', venture.id)
          .gte('created_at', sinceIso)
          .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
        costUsd = (ledgerRows || []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
      } catch { /* fail-soft per venture: cost defaults to 0 */ }

      let uptimePct = null, hasHealthRow = false;
      try {
        const { data: health } = await db
          .from('ops_product_health')
          .select('uptime_pct')
          .eq('venture_id', venture.id)
          .eq('metric_date', todayDate)
          .maybeSingle();
        if (health) { hasHealthRow = true; uptimePct = health.uptime_pct; }
      } catch { /* fail-soft per venture: health omitted */ }

      lines.push(formatVentureActualsLine(venture, { costUsd, uptimePct, hasHealthRow }));
    }
    return lines;
  } catch {
    return [];
  }
}
