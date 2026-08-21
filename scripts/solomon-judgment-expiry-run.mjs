#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-2 — the aging RUNNER.
 *
 * WHY THIS FILE EXISTS AS A SEPARATE COMMIT, AND WHAT I GOT WRONG. FR-2 originally shipped as a pure
 * selector plus an ENABLED_BY_DEFAULT flag no code read, and I described it as "ships disabled".
 * Retro review named that accurately: FR-2 SHIPPED AS THE FAILURE MODE IT WAS WRITTEN TO PREVENT.
 * Five mechanisms have already shipped into this table and all five run at zero; a selector with no
 * runner is the sixth, and the SD's own TR-3 says acceptance requires a non-zero count on live data.
 *
 * The mechanism of my error is worth recording because it is subtle: I had a GOOD argument that TS-3
 * should assert the enable FLAG rather than the scheduler ENTRY (a disabled entry still satisfies
 * "an entry references it"). That argument is about what to ASSERT. I reused it, without noticing,
 * as a reason not to BUILD the entry. A narrower test became a narrower deliverable.
 *
 * SAFETY, unchanged and now actually enforced rather than asserted:
 *   - refuses to run unless LEO_JUDGMENT_EXPIRY_ENABLED=1, so merging cannot start it;
 *   - --apply is required to write, absent which it is a dry run that prints what it WOULD stamp;
 *   - paginates (the ledger is past 1100 rows and PostgREST clamps an unpaginated read at 1000);
 *   - refuses to run at all if the migration is not applied, rather than failing per-row.
 *
 * Usage:
 *   node scripts/solomon-judgment-expiry-run.mjs                 # dry run, prints the candidate set
 *   LEO_JUDGMENT_EXPIRY_ENABLED=1 node scripts/... --apply       # stamps
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import {
  selectExpiredJudgments,
  expiryPatch,
  EXPIRY_DAYS,
  EXPIRY_ACTOR,
  ENABLED_BY_DEFAULT,
  isDecisionByIdentityCheckViolation,
} from '../lib/solomon/judgment-expiry.js';
import { normalizeDecisionBy } from './coordinator-ack-adam.cjs';

const TABLE = 'solomon_advice_outcome_ledger';
const PAGE = 1000;

/** PURE — the run decision, so the safety gate is testable without a DB. */
export function resolveRunMode({ env = {}, argv = [] } = {}) {
  const enabled = ENABLED_BY_DEFAULT || env.LEO_JUDGMENT_EXPIRY_ENABLED === '1';
  const apply = argv.includes('--apply');
  if (!enabled) return { run: false, apply: false, reason: 'disabled: set LEO_JUDGMENT_EXPIRY_ENABLED=1 to enable' };
  // Enabled but no --apply is a DRY RUN, not a refusal: seeing the candidate set is exactly how an
  // operator decides whether the first real run is safe, and aging is not reversible in the sense
  // that matters (a row recording that nobody answered cannot be un-recorded by judging it later).
  return { run: true, apply, reason: apply ? 'apply' : 'dry-run' };
}

/** Read every pending row. PAGINATED — an unpaginated read silently clamps at 1000. */
async function fetchPending(supabase) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, decision, created_at, judgment_expired_at')
      .eq('decision', 'pending')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const mode = resolveRunMode({ env: process.env, argv: process.argv.slice(2) });
  if (!mode.run) {
    console.log(`[judgment-expiry] ${mode.reason}`);
    return 0;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // REFUSE UP FRONT if the chairman-gated migration is not applied. Failing per-row would stamp
  // nothing while reporting success, which is this table's established failure mode.
  const probe = await supabase.from(TABLE).select('judgment_expired_at').limit(1);
  if (probe.error) {
    console.error(`[judgment-expiry] REFUSING: ${probe.error.code || ''} ${probe.error.message}`);
    console.error('[judgment-expiry] the FR-1 migration is chairman-apply-gated and is not applied yet.');
    return 2;
  }

  const rows = await fetchPending(supabase);
  const due = selectExpiredJudgments(rows, { nowMs: Date.now(), expiryDays: EXPIRY_DAYS });
  console.log(`[judgment-expiry] pending=${rows.length} threshold=${EXPIRY_DAYS}d due=${due.length} mode=${mode.reason}`);

  if (!mode.apply) {
    for (const r of due.slice(0, 20)) console.log(`  WOULD STAMP ${r.id} (age ${r.ageDays.toFixed(1)}d)`);
    if (due.length > 20) console.log(`  ...and ${due.length - 20} more`);
    return 0;
  }

  const patch = expiryPatch({ nowIso: new Date().toISOString(), actor: EXPIRY_ACTOR });
  let stamped = 0;
  let healedOnRetry = 0;
  for (const r of due) {
    const { error } = await supabase.from(TABLE).update(patch).eq('id', r.id).is('judgment_expired_at', null);
    if (!error) { stamped++; continue; }
    // SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001's decision_by CHECK is NOT VALID -- a
    // grandfathered violating row still 23514s on ANY update, even this one, which never sets
    // decision_by. Bounded, single retry: also normalize decision_by so the row becomes compliant
    // and this class of failure cannot recur for it. Scoped strictly to this one constraint by name
    // -- a genuine DB fault is never masked or retried.
    if (!isDecisionByIdentityCheckViolation(error)) { console.error(`  FAILED ${r.id}: ${error.message}`); continue; }
    const { data: current, error: readErr } = await supabase.from(TABLE).select('decision_by').eq('id', r.id).single();
    if (readErr) { console.error(`  FAILED ${r.id} (decision_by identity check, and could not read current value to retry: ${readErr.message})`); continue; }
    const retryPatch = { ...patch, decision_by: normalizeDecisionBy(current?.decision_by) };
    const retry = await supabase.from(TABLE).update(retryPatch).eq('id', r.id).is('judgment_expired_at', null);
    if (retry.error) { console.error(`  FAILED ${r.id} (decision_by identity check, retry with normalized decision_by also failed: ${retry.error.message})`); continue; }
    stamped++; healedOnRetry++;
  }
  console.log(`[judgment-expiry] stamped=${stamped}/${due.length}${healedOnRetry ? ` (${healedOnRetry} required a decision_by-normalizing retry)` : ''}`);
  return 0;
}

/**
 * Drain undici before exiting. supabase-js keeps a keep-alive socket pool open, and calling
 * process.exit() through it raises a libuv assertion on Windows — observed on the very first live
 * run of this script. Harmless to the work (it fires after the output) but it turns a clean refusal
 * into something that reads like a crash in a CI log, which is the opposite of what a
 * safety-gated job should look like. Same fix as scripts/hooks/stop-loop-wakeup-reminder.cjs.
 */
async function shutdown(code) {
  try { await (await import('undici')).getGlobalDispatcher().close(); } catch { /* absent or closed */ }
  process.exit(code);
}

if (isMainModule(import.meta.url)) {
  main().then(shutdown).catch((e) => { console.error('[judgment-expiry]', e.message); return shutdown(1); });
}
