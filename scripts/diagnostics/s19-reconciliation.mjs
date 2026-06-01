#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-5): diagnostic/cron runner for the S19->S20 reconciliation
 * invariant. Prints every leo_bridge venture that has advanced past Stage 19 with an incomplete
 * SD tree. Exit code 2 when violations exist (so CI/cron can alert), 0 when clean.
 *
 *   node scripts/diagnostics/s19-reconciliation.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { findS19AdvanceViolations } from '../../lib/eva/bridge/s19-reconciliation.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const violations = await findS19AdvanceViolations(supabase);
console.log(JSON.stringify({ invariant: 's19_advance_completion', count: violations.length, violations }, null, 2));
if (violations.length > 0) {
  console.error(`\n[s19-reconciliation] ${violations.length} violation(s): leo_bridge venture(s) past S19 with an incomplete tree.`);
  process.exit(2);
}
console.log('[s19-reconciliation] OK — no leo_bridge venture has bypassed the S19 completion invariant.');
process.exit(0);
