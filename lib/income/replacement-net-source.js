// SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 — real-dollar source for the replacement-net formula.
//
// Bridges income_capture_monthly -> the PURE replacementNet() (scripts/glide-path/replacement-net.js). This
// module does the I/O so replacement-net.js stays pure (no I/O, per its contract). It maps the structured
// columns to the formula inputs (recurring_revenue->revenue, retirement_solo_401k->retirement), coalesces NULL
// deductions to 0 ONLY at this read boundary, and surfaces `unattested` so a 0 deduction is never mistaken for
// a chairman-attested 0. It is also the ONLY writer of the chairman-gated deduction columns, and only from an
// APPROVED chairman_decisions attestation — the fleet aggregator never writes them.

import { createSupabaseServiceClient } from '../supabase-client.js';
import { replacementNet } from '../../scripts/glide-path/replacement-net.js';
import dotenv from 'dotenv';
dotenv.config();

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function getSupabase() {
  return createSupabaseServiceClient();
}

/**
 * Map an income_capture_monthly row to the pure replacementNet() inputs and compute the net.
 * Deductions coalesce to 0 at this boundary; `unattested` is true when no chairman attestation backs the
 * deductions (NULL ref or any NULL deduction column), so callers can flag a 0 as "unattested" not "attested 0".
 *
 * @param {object} row income_capture_monthly row
 * @returns {{ net:number, inputs:object, unattested:boolean, attestation_ref:(string|null) }}
 */
export function netFromSubstrateRow(row = {}) {
  const inputs = {
    revenue: num(row.recurring_revenue),
    business_expenses: num(row.business_expenses),
    ppo: num(row.ppo),
    retirement: num(row.retirement_solo_401k),
    se_tax: num(row.se_tax),
  };
  const unattested =
    row.deduction_attestation_ref == null ||
    row.ppo == null ||
    row.retirement_solo_401k == null ||
    row.se_tax == null;
  return {
    net: replacementNet(inputs), // pure formula, signature unchanged
    inputs,
    unattested,
    attestation_ref: row.deduction_attestation_ref ?? null,
  };
}

/**
 * Read the latest (or a specific month's) income_capture_monthly row and compute replacement-net from it.
 * @param {object} [opts]
 * @param {object}  [opts.supabase]
 * @param {string}  [opts.periodMonth]   YYYY-MM-01; omit for the most recent
 * @param {boolean} [opts.livemode=true] the gauge reads live rows; tests can read TEST-mode rows
 * @returns {Promise<object|null>} netFromSubstrateRow() result, or null if no row / on error
 */
export async function replacementNetFromCapture({ supabase, periodMonth, livemode = true } = {}) {
  const sb = supabase || getSupabase();
  let q = sb.from('income_capture_monthly').select('*').eq('livemode', livemode);
  q = periodMonth ? q.eq('period_month', periodMonth) : q.order('period_month', { ascending: false });
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) {
    console.error(`replacementNetFromCapture failed: ${error.message}`);
    return null;
  }
  if (!data) return null;
  return netFromSubstrateRow(data);
}

/**
 * Apply chairman-attested deduction params to a capture row. The ONLY writer of ppo/retirement_solo_401k/se_tax.
 * Refuses unless the referenced chairman_decisions row is an APPROVED 'replacement_net_deduction_params'
 * attestation; reads the figures from its brief_data (jsonb). Absent/unapproved -> no write (columns stay NULL).
 *
 * @param {object} opts
 * @param {object}  [opts.supabase]
 * @param {string}  opts.periodMonth   YYYY-MM-01
 * @param {boolean} [opts.livemode=true]
 * @param {string}  opts.attestationId chairman_decisions.id
 * @returns {Promise<object|null>} the updated row, or null if refused / on error
 */
export async function applyDeductionAttestation({ supabase, periodMonth, livemode = true, attestationId } = {}) {
  const sb = supabase || getSupabase();
  const { data: decision, error: dErr } = await sb
    .from('chairman_decisions')
    .select('id, decision_type, status, brief_data')
    .eq('id', attestationId)
    .maybeSingle();
  if (dErr) {
    console.error(`applyDeductionAttestation read failed: ${dErr.message}`);
    return null;
  }
  if (!decision) {
    console.error('applyDeductionAttestation: attestation not found');
    return null;
  }
  if (decision.decision_type !== 'replacement_net_deduction_params' || decision.status !== 'approved') {
    console.error('applyDeductionAttestation: refused — not an APPROVED replacement_net_deduction_params attestation');
    return null;
  }
  const p = decision.brief_data || {};
  const update = {
    ppo: num(p.ppo),
    retirement_solo_401k: num(p.solo_401k ?? p.retirement_solo_401k),
    se_tax: num(p.se_tax),
    deduction_attestation_ref: decision.id,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from('income_capture_monthly')
    .update(update)
    .eq('period_month', periodMonth)
    .eq('livemode', livemode)
    .select()
    .single();
  if (error) {
    console.error(`applyDeductionAttestation update failed: ${error.message}`);
    return null;
  }
  return data;
}
