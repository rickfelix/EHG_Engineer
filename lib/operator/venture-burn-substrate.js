/**
 * lib/operator/venture-burn-substrate.js
 *
 * Honest venture-scoped operating-burn substrate (SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1).
 *
 * CORE CONTRACT — never fabricate a financial number (mirrors lib/operator/cash-burn-substrate.js):
 *   - A missing input is NULL (unattested), never 0.
 *   - ai_cost_status stays 'unattested' until a real Cloudflare AI Gateway measurement exists
 *     for the venture — honest starting state, not an error.
 *   - Disjoint from operator_cash_burn_monthly / income_capture_monthly: this module never
 *     reads or writes either fleet-wide singleton table.
 *
 * Read/write helpers take a Supabase service client (injectable for tests).
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

/** First-of-month date string (YYYY-MM-01) for a given instant. */
export function periodMonthOf(now) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Read the burn row for one venture+source_application+period (defaults to current month). */
export async function readBurnRow(ventureId, sourceApplication, periodMonth, supabase = createSupabaseServiceClient()) {
  const pm = periodMonth || periodMonthOf(Date.now());
  const { data, error } = await supabase
    .from('venture_operating_burn')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('source_application', sourceApplication)
    .eq('period_month', pm)
    .maybeSingle();
  if (error) throw new Error(`venture_operating_burn read failed: ${error.message}`);
  return data || null;
}

/**
 * Upsert one or both burn inputs for a venture+period. Only writes the fields provided
 * (never zeroes an input it isn't feeding) and stamps the matching *_last_synced_at.
 * source_application is a parameter here (server-side, writer-controlled) — never sourced
 * from an untrusted caller.
 *
 * @param {object} fields - subset of { infra_cost_usd, ai_cost_usd, ai_cost_status }
 */
export async function upsertBurnInputs(
  ventureId,
  sourceApplication,
  periodMonth,
  fields,
  supabase = createSupabaseServiceClient(),
  nowIso = new Date().toISOString(),
) {
  if (!ventureId) throw new Error('upsertBurnInputs requires ventureId');
  if (!sourceApplication) throw new Error('upsertBurnInputs requires sourceApplication');
  const pm = periodMonth || periodMonthOf(Date.now());
  const row = {
    venture_id: ventureId,
    source_application: sourceApplication,
    period_month: pm,
    updated_at: nowIso,
  };
  if ('infra_cost_usd' in fields) {
    row.infra_cost_usd = fields.infra_cost_usd;
    row.infra_cost_last_synced_at = nowIso;
  }
  if ('ai_cost_usd' in fields) {
    row.ai_cost_usd = fields.ai_cost_usd;
    row.ai_cost_status = fields.ai_cost_status ?? 'measured';
    row.ai_cost_last_synced_at = nowIso;
  }
  const { data, error } = await supabase
    .from('venture_operating_burn')
    .upsert(row, { onConflict: 'venture_id,source_application,period_month' })
    .select()
    .single();
  if (error) throw new Error(`venture_operating_burn upsert failed: ${error.message}`);
  return data;
}
