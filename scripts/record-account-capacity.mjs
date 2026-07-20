#!/usr/bin/env node
/**
 * record-account-capacity.mjs — QF-20260720-406.
 *
 * Records a chairman-pasted /usage dashboard reading against the CURRENTLY ACTIVE
 * account (resolved via lib/fleet/account-identity.cjs) into the per-account capacity
 * gauge, then prints the updated headroom ranking across every account this fleet has
 * ever logged a reading for — the data-driven input to a which-account-to-/login
 * routing decision.
 *
 * Usage:
 *   node scripts/record-account-capacity.mjs --weekly-all-models-pct 53 --weekly-fable-pct 80 \
 *     --weekly-reset "2026-07-24T07:59:00Z" [--session-pct 42] [--session-reset "2026-07-20T14:29:00Z"]
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { recordCapacityReading, rankAccountsByHeadroom } = require('../lib/fleet/account-capacity-gauge.cjs');

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const reading = {
    sessionPct: Number(argVal(args, '--session-pct')),
    sessionResetAt: argVal(args, '--session-reset'),
    weeklyAllModelsPct: Number(argVal(args, '--weekly-all-models-pct')),
    weeklyFablePct: Number(argVal(args, '--weekly-fable-pct')),
    weeklyResetAt: argVal(args, '--weekly-reset'),
  };

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
}

main();
