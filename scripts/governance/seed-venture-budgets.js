#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-1.
 * CLI wrapper: seed venture_token_budgets / venture_phase_budgets for active ventures.
 * Idempotent — safe to re-run.
 *
 * Usage: node scripts/governance/seed-venture-budgets.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { seedActiveVentureBudgets } from '../../lib/governance/seed-active-venture-budgets.js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const result = await seedActiveVentureBudgets(supabase);
  console.log(`Seeded ${result.tokenBudgetsUpserted} venture_token_budgets row(s) and ${result.phaseBudgetsUpserted} venture_phase_budgets row(s) for ${result.activeVentureCount} active venture(s). Budgets are advisory-until-wired (fn_deduct_budget_atomic has no callers).`);
}

main().catch((err) => {
  console.error(`[seed-venture-budgets] FAILED: ${err.message}`);
  process.exit(1);
});
