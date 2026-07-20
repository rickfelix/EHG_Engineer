#!/usr/bin/env node
/**
 * scripts/operator/feed-operator-cash-burn.mjs
 *
 * Fail-soft hourly feeder for the operator cash/burn substrate (SD-EHG-OPERATOR-RUNWAY-SUBSTRATE-001).
 *
 *   FR-2  AI-BURN: total the last 30 days of measured AI spend (via scripts/llm-cost-report.mjs
 *         --days 30 --json) and write it to income_capture_monthly.business_expenses AND the
 *         substrate ai_burn input, ALWAYS labeled a lower bound (main-session Opus tokens are
 *         structurally uncaptured).
 *   FR-3  REVENUE: prefer lib/payments/attribution-resolver.js's computeAttributedRevenue()
 *         (real Stripe attribution, SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002) when
 *         ops_payment_events has any row fleet-wide; otherwise fall back to mirroring
 *         income_capture_monthly.recurring_revenue (pre-attribution behavior). Updated by
 *         SD-EHG-PRODUCT-UIUX-REMEDIATION-001-D (FR-5/H10, spec refresh 2026-07-10).
 *   FR-5  BACKFILL: price venture_token_ledger.cost_usd from token counts via lib/cost/llm-pricing.js
 *         for rows whose model is resolvable — leave unpriceable (unknown-model) rows untouched.
 *
 * FAIL-SOFT: each step is independently try/caught. A step failure leaves that input's
 * last_synced_at stale (so the cockpit suppresses it) and NEVER writes a fabricated value.
 *
 * Usage:
 *   node scripts/operator/feed-operator-cash-burn.mjs            # live write
 *   node scripts/operator/feed-operator-cash-burn.mjs --dry-run  # compute + print, no write
 */

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { priceFor } from '../../lib/cost/llm-pricing.js';
import { periodMonthOf, upsertSubstrateInputs, AI_BURN_LOWER_BOUND_LABEL } from '../../lib/operator/cash-burn-substrate.js';
import { computeAttributedRevenue } from '../../lib/payments/attribution-resolver.js';
import { readStripeCashSlice } from '../../lib/operator/cash-sources/stripe-balance.js';
import { readBankCashSlice } from '../../lib/operator/cash-sources/bank-read-service.js';
import { loadTellerCertPair } from '../../lib/operator/cash-sources/token-vault.js';
import { createTellerClient } from '../../lib/operator/cash-sources/teller-client.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the period's payment events are
// SUMMED into the reported revenue figure; a capped read would silently UNDER-report revenue
// with no error once a month's event volume exceeds the PostgREST cap.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');

function log(step, msg) { console.log(`[operator-cash-burn] ${step}: ${msg}`); }
function warn(step, msg) { console.warn(`[operator-cash-burn] ${step}: WARN ${msg}`); }

/**
 * SD-EHG-PRODUCT-OPERATOR-CASH-ATTEST-DTB-LIVE-001 (FR-1): parse the chairman-attested cash flag.
 * Pure + DB-free (unit-testable). Supports `--cash <usd>` and `--cash=<usd>`.
 *   - absent                  -> null (no attestation; the existing bank/stripe path runs)
 *   - present but no value     -> THROW (an attestation must be intentional — never coerce to 0)
 *   - NaN / Infinity / negative -> THROW naming the bad token
 *   - finite >= 0              -> the number (0 is a valid floor). No rounding here.
 * @param {string[]} argv
 * @returns {number|null}
 */
export function parseCashFlag(argv = process.argv) {
  let raw = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cash') { raw = argv[i + 1]; break; }
    if (typeof a === 'string' && a.startsWith('--cash=')) { raw = a.slice('--cash='.length); break; }
  }
  if (raw === null || raw === undefined) {
    // distinguish "flag absent" (null) from "flag present but no value" (throw)
    const present = argv.includes('--cash') || argv.some((a) => typeof a === 'string' && a.startsWith('--cash='));
    if (present) throw new Error('--cash requires a USD value (e.g. --cash 50000); refusing to attest an empty cash balance');
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`--cash value must be a finite number >= 0 (got "${raw}")`);
  }
  return n;
}

// Parse once at load so a malformed flag fails fast before any DB work.
const ATTESTED_CASH = parseCashFlag(process.argv);

/** FR-2: rolling-30d AI spend (lower bound) from the cost report CLI. Returns number or null. */
function readRolling30dAiSpend() {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/llm-cost-report.mjs'), '--days', '30', '--json'], {
    cwd: REPO_ROOT, encoding: 'utf-8', timeout: 120000, env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  if (r.status !== 0 || !r.stdout) {
    warn('FR-2', `llm-cost-report exited status=${r.status} signal=${r.signal} — leaving ai_burn stale`);
    return null;
  }
  // The report may print non-JSON prelude (dotenv tips); parse the JSON object from stdout.
  const start = r.stdout.indexOf('{');
  if (start < 0) { warn('FR-2', 'no JSON in cost-report stdout'); return null; }
  let parsed;
  try { parsed = JSON.parse(r.stdout.slice(start)); } catch (e) { warn('FR-2', `cost-report JSON parse failed: ${e.message}`); return null; }
  const total = parsed?.window?.totalUsd;
  if (typeof total !== 'number' || !Number.isFinite(total)) { warn('FR-2', 'cost-report had no numeric window.totalUsd'); return null; }
  return Number(total.toFixed(2));
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const periodMonth = periodMonthOf(Date.now());
  const result = { period_month: periodMonth, dry_run: DRY_RUN, cash: null, ai_burn: null, revenue: null, backfill: null };

  // ---- FR-2/FR-3: cash-on-hand (bank is PRIMARY + chairman-gated; Stripe is a SECOND slice) ----
  // HONESTY (mirrors the substrate's "missing is NULL, never 0"): the bulk of cash lives in the
  // bank, so the BANK is the primary source that establishes the cash reading. Stripe (FR-3) is an
  // ADDITIVE "second slice" (funds sitting in Stripe) — alone it is NOT a complete cash picture, so
  // writing it standalone would render a misleadingly-LOW runway. Until the chairman enrolls the
  // bank (FR-4), cash stays UNATTESTED and the gauge honestly shows 'awaiting cash source' rather
  // than a false near-zero. Fail-soft throughout: a failed pull preserves the prior value.
  try {
    if (ATTESTED_CASH != null) {
      // SD-EHG-PRODUCT-OPERATOR-CASH-ATTEST-DTB-LIVE-001 (FR-2): chairman-attested manual cash takes
      // precedence — the bank/stripe readers are NOT consulted (no network/credential calls, no
      // additive double-count). Cash-only: do not write other_burn_usd here.
      const cashUsd = Number(ATTESTED_CASH.toFixed(2));
      log('FR-cash', `cash-on-hand = $${cashUsd} (chairman-attested, manual)`);
      if (!DRY_RUN) await upsertSubstrateInputs(periodMonth, { cash_usd: cashUsd }, supabase, nowIso);
      result.cash = { written: !DRY_RUN, value_usd: cashUsd, sources: ['chairman_attested'] };
    } else {
    // FR-1: the Teller client factory must stay SYNCHRONOUS (bank-read-service.js calls it
    // without awaiting) -- pre-load the mTLS cert pair here (async) and close over it, rather
    // than making the factory itself async. Absent an enrolled cert pair, the factory stays
    // undefined and readBankCashSlice() falls through to its existing inert-by-default path.
    const { certPem, keyPem } = await loadTellerCertPair();
    const tellerClientFactory = certPem && keyPem
      ? (token) => createTellerClient({ token, certPem, keyPem })
      : undefined;
    const bankSlice = await readBankCashSlice({ tellerClientFactory });
    if (!bankSlice) {
      // Inert: no primary cash source yet. Peek Stripe for logging only; do NOT write cash.
      const stripePeek = await readStripeCashSlice();
      log('FR-cash', `bank cash slice inert (chairman not enrolled) — cash left unattested${stripePeek ? `; Stripe would add $${stripePeek.usd} once a bank is connected` : ''}`);
      result.cash = { written: false, reason: 'primary bank source not enrolled (cash left unattested — gauge stays "awaiting cash source")' };
    } else {
      const stripeSlice = await readStripeCashSlice(); // additive second slice
      const cashUsd = Number((Number(bankSlice.usd) + (stripeSlice ? Number(stripeSlice.usd) || 0 : 0)).toFixed(2));
      const sources = ['bank', ...(stripeSlice ? ['stripe'] : [])];
      const otherBurn = bankSlice.other_burn_usd; // categorized non-AI burn (FR-2 part-b), bank-derived
      log('FR-cash', `cash-on-hand = $${cashUsd} from ${sources.join('+')}`);
      if (!DRY_RUN) {
        const fields = { cash_usd: cashUsd };
        if (otherBurn != null) fields.other_burn_usd = Number(Number(otherBurn).toFixed(2));
        await upsertSubstrateInputs(periodMonth, fields, supabase, nowIso);
      }
      result.cash = { written: !DRY_RUN, value_usd: cashUsd, sources, other_burn_usd: otherBurn };
    }
    }
  } catch (e) { warn('FR-cash', `failed (fail-soft): ${e.message}`); result.cash = { written: false, error: e.message }; }

  // ---- FR-2: AI burn ----
  try {
    const aiSpend = readRolling30dAiSpend();
    if (aiSpend == null) {
      result.ai_burn = { written: false, reason: 'cost-report unavailable (left stale)' };
    } else {
      log('FR-2', `rolling-30d AI spend = $${aiSpend} (${AI_BURN_LOWER_BOUND_LABEL})`);
      if (!DRY_RUN) {
        // Substrate ai_burn (authoritative source for the gauge).
        await upsertSubstrateInputs(periodMonth, { ai_burn_usd: aiSpend, ai_burn_is_lower_bound: true }, supabase, nowIso);
        // Fill the income_capture_monthly.business_expenses slot on the LIVE operator row only
        // (UPDATE only — never create a partial row the aggregator owns). Scoped to livemode=true
        // deliberately: fleet AI burn IS a real business expense (the income migration designates
        // business_expenses as "incl. AI/infra") and the replacement-net / distance-to-quit reader
        // uses the live row — so this is an intentional, single-direction coupling, not a test-row
        // write. Until the aggregator has created a live row, the fill is deferred (0 rows) and the
        // substrate ai_burn above remains the authoritative source for the distance-to-broke gauge.
        const { data: upd, error: e } = await supabase
          .from('income_capture_monthly')
          .update({ business_expenses: aiSpend, updated_at: nowIso })
          .eq('period_month', periodMonth)
          .eq('livemode', true)
          .select('id, livemode');
        if (e) warn('FR-2', `business_expenses update failed (substrate still written): ${e.message}`);
        else log('FR-2', `business_expenses updated on ${upd?.length || 0} live income row(s)${(upd?.length || 0) === 0 ? ' (no live row yet — deferred; substrate ai_burn is authoritative)' : ''}`);
      }
      result.ai_burn = { written: !DRY_RUN, value_usd: aiSpend, lower_bound: true };
    }
  } catch (e) { warn('FR-2', `failed (fail-soft): ${e.message}`); result.ai_burn = { written: false, error: e.message }; }

  // ---- FR-3: revenue mirror ----
  // SD-EHG-PRODUCT-UIUX-REMEDIATION-001-D (FR-5/H10, spec refresh 2026-07-10): prefer
  // computeAttributedRevenue's real Stripe attribution (lib/payments/attribution-resolver.js,
  // SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002) over the pre-pivot income_capture_monthly
  // mirror. Distinguishing "attribution wired but $0 this period" (a genuine live reading)
  // from "attribution never wired" (fall back) requires checking whether ops_payment_events
  // has ANY row at all, not just rows in the current period.
  try {
    const { count: anyEventCount, error: anyEventErr } = await supabase
      .from('ops_payment_events')
      .select('id', { count: 'exact', head: true });
    if (anyEventErr) throw new Error(anyEventErr.message);

    if ((anyEventCount ?? 0) > 0) {
      // Attribution is live fleet-wide — use it as the primary source, even if this
      // specific period has zero matching rows (a genuine $0, not a missing source).
      const periodStart = `${periodMonth}T00:00:00.000Z`;
      const periodEnd = new Date(new Date(periodStart).getTime());
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      const periodRows = await fetchAllPaginated(() => supabase
        .from('ops_payment_events')
        .select('amount_cents, currency, event_type, payment_intent_id, stripe_charge_id, id')
        .eq('livemode', true)
        .gte('event_ts', periodStart)
        .lt('event_ts', periodEnd.toISOString())
        .order('id', { ascending: true }));
      const { totalCents } = computeAttributedRevenue(periodRows);
      const revUsd = Number((totalCents / 100).toFixed(2));
      log('FR-3', `revenue (attributed) = $${revUsd} (livemode=true, ${periodRows.length} events)`);
      if (!DRY_RUN) {
        await upsertSubstrateInputs(periodMonth, { revenue_usd: revUsd, revenue_livemode: true }, supabase, nowIso);
      }
      result.revenue = { written: !DRY_RUN, value_usd: revUsd, livemode: true, source: 'attribution_resolver' };
    } else {
      // Attribution never wired for this fleet yet — fall back to the pre-pivot mirror.
      // Prefer the LIVE row; fall back to the TEST-mode row, surfacing livemode honestly.
      const { data: rows, error } = await supabase
        .from('income_capture_monthly')
        .select('recurring_revenue, livemode')
        .eq('period_month', periodMonth);
      if (error) throw new Error(error.message);
      const live = (rows || []).find((r) => r.livemode === true);
      const test = (rows || []).find((r) => r.livemode === false);
      const pick = live || test || null;
      if (!pick) {
        result.revenue = { written: false, reason: 'no income_capture_monthly row yet (left stale)', source: 'income_capture_monthly' };
      } else {
        const revUsd = pick.recurring_revenue == null ? null : Number(pick.recurring_revenue);
        log('FR-3', `revenue (fallback) = $${revUsd} (livemode=${pick.livemode})`);
        if (!DRY_RUN && revUsd != null) {
          await upsertSubstrateInputs(periodMonth, { revenue_usd: revUsd, revenue_livemode: pick.livemode === true }, supabase, nowIso);
        }
        result.revenue = { written: !DRY_RUN && revUsd != null, value_usd: revUsd, livemode: pick.livemode === true, source: 'income_capture_monthly' };
      }
    }
  } catch (e) { warn('FR-3', `failed (fail-soft): ${e.message}`); result.revenue = { written: false, error: e.message }; }

  // ---- FR-5: venture_token_ledger.cost_usd backfill (priceable rows only) ----
  try {
    // Note: PostgREST caps this at ~1000 rows/page. That is fine because priced rows get cost_usd
    // set and DROP OUT of the cost_usd.is.null/eq.0 filter, so successive hourly runs drain the
    // backlog to completion — full coverage is reached over runs, not in one pass.
    const { data: ledger, error } = await supabase
      .from('venture_token_ledger')
      .select('id, model_id, agent_type, tokens_input, tokens_output, cost_usd')
      .or('cost_usd.is.null,cost_usd.eq.0')
      .limit(5000);
    if (error) throw new Error(error.message);
    let priced = 0, skippedUnknownModel = 0, totalUsd = 0;
    for (const r of ledger || []) {
      const p = priceFor(r.model_id) || priceFor(r.agent_type);
      if (!p) { skippedUnknownModel++; continue; } // honest: never guess a model's price
      const inT = Number(r.tokens_input || 0);
      const outT = Number(r.tokens_output || 0);
      if (inT === 0 && outT === 0) continue;
      const usd = Number(((inT / 1e6) * p.in + (outT / 1e6) * p.out).toFixed(6));
      if (usd <= 0) continue;
      totalUsd += usd;
      if (!DRY_RUN) {
        const { error: e2 } = await supabase.from('venture_token_ledger').update({ cost_usd: usd }).eq('id', r.id);
        if (e2) { warn('FR-5', `row ${r.id} update failed: ${e2.message}`); continue; }
      }
      priced++;
    }
    log('FR-5', `priced ${priced} row(s) totaling $${totalUsd.toFixed(2)}; ${skippedUnknownModel} left honest (unresolvable model)`);
    result.backfill = { written: !DRY_RUN, priced, skipped_unknown_model: skippedUnknownModel, total_usd: Number(totalUsd.toFixed(2)) };
  } catch (e) { warn('FR-5', `failed (fail-soft): ${e.message}`); result.backfill = { written: false, error: e.message }; }

  console.log('[operator-cash-burn] result ' + JSON.stringify(result));
  return result;
}

// Entrypoint guard: only run main() as a CLI, never on static import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((e) => { console.error('[operator-cash-burn] FATAL', e); process.exit(1); });
}

export { main, readRolling30dAiSpend };
