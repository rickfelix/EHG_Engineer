#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INCOME-OBJECTIVE-FUNCTION-001 — add the income_contribution dimension to the
 * ACTIVE Glide Path policy so scoreVenture weights distance-to-quit as a first-class factor.
 *
 * IDEMPOTENT + ADDITIVE + LOW-BLAST-RADIUS:
 *   - Adds an income_contribution dimension {source_field, default_value:0, min:0, max:100} and a
 *     tunable weight (DEFAULT_INCOME_DIMENSION_WEIGHT) to the active policy row.
 *   - Does NOT modify the existing 6 weights. Verified: scripts/modules/sd-next/SDNextSelector.js
 *     reads specific weight keys by growth_strategy (it does not iterate all weights nor call
 *     scoreVenture), so live SD ranking is unchanged. scoreVenture divides by totalWeight, so the
 *     new dimension simply adds a first-class income term to the composite (feeds dry-run + the
 *     DEFERRED venture-scoring path only).
 *   - Stores income_weights in policy.metadata so the strategy choice stays tunable CONFIG.
 *
 * MUST run with the service-role client (anon client RLS-no-ops strategic-policy writes silently).
 * Run ONLY after the adversarial review of the scoring math + reweight passes (this is the deploy
 * step). Re-runnable: if the dimension already exists it reports "already present" and exits 0.
 *
 * Usage: node scripts/glide-path/add-income-dimension.mjs [--dry-run]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
import { INCOME_DIMENSION_KEY, DEFAULT_INCOME_WEIGHTS } from './replacement-net.js';

/** Tunable default weight for the income dimension (additive; existing weights untouched). */
export const DEFAULT_INCOME_DIMENSION_WEIGHT = 0.18;

export const INCOME_DIMENSION_DEF = Object.freeze({
  key: INCOME_DIMENSION_KEY,
  source_field: INCOME_DIMENSION_KEY,        // populated by enrichVentureWithIncome before scoreVenture
  default_value: 0,                          // unknown income earns NO credit (fail-safe, no phantom score)
  min: 0,
  max: 100,
  label: 'Income contribution (distance-to-quit)',
});

/**
 * Compute the next dimensions/weights/metadata for a policy row, adding income_contribution if absent.
 * Pure — returns { changed, dimensions, weights, metadata } so it is unit-testable without a DB.
 */
export function withIncomeDimension(policy) {
  const dimensions = Array.isArray(policy?.dimensions) ? policy.dimensions.slice() : [];
  const weights = { ...(policy?.weights || {}) };
  const metadata = { ...(policy?.metadata || {}) };
  const has = dimensions.some((d) => d && d.key === INCOME_DIMENSION_KEY);
  if (has) return { changed: false, dimensions, weights, metadata };
  dimensions.push({ ...INCOME_DIMENSION_DEF });
  weights[INCOME_DIMENSION_KEY] = DEFAULT_INCOME_DIMENSION_WEIGHT; // additive — other weights untouched
  if (!metadata.income_weights) metadata.income_weights = { ...DEFAULT_INCOME_WEIGHTS };
  return { changed: true, dimensions, weights, metadata };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const s = createSupabaseServiceClient();
  const { data: policy, error } = await s
    .from('portfolio_allocation_policies')
    .select('id, policy_version, dimensions, weights, metadata')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (error || !policy) {
    console.error('[add-income-dimension] no active policy found:', error?.message || 'none');
    process.exit(1);
  }
  const next = withIncomeDimension(policy);
  if (!next.changed) {
    console.log(`[add-income-dimension] income_contribution already present on policy v${policy.policy_version} — no-op.`);
    process.exit(0);
  }
  console.log(`[add-income-dimension] policy v${policy.policy_version}: adding income_contribution (weight ${DEFAULT_INCOME_DIMENSION_WEIGHT}); existing weights untouched.`);
  if (dryRun) {
    console.log('[add-income-dimension] --dry-run: would set weights =', JSON.stringify(next.weights));
    process.exit(0);
  }
  const { error: upErr } = await s
    .from('portfolio_allocation_policies')
    .update({ dimensions: next.dimensions, weights: next.weights, metadata: next.metadata })
    .eq('id', policy.id);
  if (upErr) {
    console.error('[add-income-dimension] update failed:', upErr.message);
    process.exit(1);
  }
  console.log('[add-income-dimension] ✅ applied. income_contribution is now a first-class Glide Path dimension.');
}

// Run only as a script (not on import — keeps withIncomeDimension unit-testable).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('add-income-dimension.mjs')) {
  main().catch((e) => { console.error('[add-income-dimension] threw:', e.message); process.exit(1); });
}
