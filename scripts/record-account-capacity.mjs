#!/usr/bin/env node
/**
 * record-account-capacity.mjs — QF-20260720-406, extended by SD-LEO-INFRA-USAGE-PASTE-LEDGER-001.
 *
 * Records a chairman-pasted /usage dashboard reading against the CURRENTLY ACTIVE
 * account (resolved via lib/fleet/account-identity.cjs) into the per-account capacity
 * gauge, then prints the updated headroom ranking across every account this fleet has
 * ever logged a reading for — the data-driven input to a which-account-to-/login
 * routing decision.
 *
 * SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-1): the SAME paste event ALSO inserts a row into the
 * account_usage_pastes ledger (via lib/fleet/account-usage-paste-writer.cjs), additive to the
 * headroom gauge above, not a replacement for it — the two serve different purposes (latest-only
 * headroom routing vs. multi-row burn-projection history) and this script is the single chairman
 * entry point for both. The ledger write is fail-soft here: if it errors (e.g. the chairman-gated
 * migration has not been applied yet), the headroom gauge write above still succeeds and the
 * error is reported, not swallowed silently.
 *
 * Usage:
 *   node scripts/record-account-capacity.mjs --weekly-all-models-pct 53 --weekly-fable-pct 80 \
 *     --weekly-reset "2026-07-24T07:59:00Z" [--session-pct 42] [--session-reset "2026-07-20T14:29:00Z"] \
 *     [--promo-note "20% off through Aug 31"]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { recordCapacityReading, rankAccountsByHeadroom } = require('../lib/fleet/account-capacity-gauge.cjs');
const { recordUsagePaste } = require('../lib/fleet/account-usage-paste-writer.cjs');

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const reading = {
    sessionPct: Number(argVal(args, '--session-pct')),
    sessionResetAt: argVal(args, '--session-reset'),
    weeklyAllModelsPct: Number(argVal(args, '--weekly-all-models-pct')),
    weeklyFablePct: Number(argVal(args, '--weekly-fable-pct')),
    weeklyResetAt: argVal(args, '--weekly-reset'),
  };
  const promoNote = argVal(args, '--promo-note');

  const result = recordCapacityReading(reading);
  if (!result.ok) {
    console.error(`record-account-capacity: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  console.log('Per-account capacity headroom (most headroom first):');
  for (const acct of rankAccountsByHeadroom(result.store)) {
    console.log(`  ${acct.email} (${acct.accountUuid8}): ${acct.headroomPct}% headroom` +
      ` — weekly all-models ${acct.weeklyAllModelsPct ?? '?'}%, Fable ${acct.weeklyFablePct ?? '?'}%` +
      (acct.weeklyResetAt ? `, resets ${acct.weeklyResetAt}` : '') +
      (acct.recordedAt ? ` [read at ${acct.recordedAt}]` : ''));
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const ledgerResult = await recordUsagePaste({
    sessionPct: reading.sessionPct,
    sessionResetAt: reading.sessionResetAt,
    weekAllModelsPct: reading.weeklyAllModelsPct,
    weekFablePct: reading.weeklyFablePct,
    weekResetAt: reading.weeklyResetAt,
    promoNote,
  }, { supabase });
  if (!ledgerResult.ok) {
    console.error(`record-account-capacity: ledger write failed (headroom gauge above still succeeded): ${ledgerResult.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Ledger row recorded: id=${ledgerResult.row.id}`);
}

main();
