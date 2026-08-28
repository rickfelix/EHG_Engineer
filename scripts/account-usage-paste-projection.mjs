#!/usr/bin/env node
/**
 * account-usage-paste-projection.mjs — SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-3).
 *
 * Manual-duty CLI for Adam's 21:30 ET presleep bandwidth-forecast: prints a terse burn-projection
 * report for one account across all 3 meters (session, week-all-models, week-Fable), using the
 * SAME shared renderer (lib/fleet/exec-email-capacity-line.mjs) the 6 AM ET morning-brief action
 * list calls, so the two surfaces cannot disagree in one day.
 *
 * Usage:
 *   node scripts/account-usage-paste-projection.mjs                 # currently active account
 *   node scripts/account-usage-paste-projection.mjs <account-uuid8> # a specific account
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { composeCapacityCliReport } from '../lib/fleet/exec-email-capacity-line.mjs';

const require_ = createRequire(import.meta.url);
const { getAccountIdentity } = require_('../lib/fleet/account-identity.cjs');
const { METERS } = require_('../lib/fleet/account-usage-burn-projection.cjs');

async function main() {
  const arg = process.argv[2];
  const accountUuid8 = arg || getAccountIdentity()?.accountUuid8;
  if (!accountUuid8) {
    console.error('account-usage-paste-projection: no account specified and no active identity resolvable');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const io = { supabase };

  console.log(`Account ${accountUuid8} — capacity projection`);
  console.log('-'.repeat(50));
  for (const meter of Object.keys(METERS)) {
    // eslint-disable-next-line no-await-in-loop
    const report = await composeCapacityCliReport(accountUuid8, meter, io);
    console.log(report);
    console.log('');
  }
}

main();
