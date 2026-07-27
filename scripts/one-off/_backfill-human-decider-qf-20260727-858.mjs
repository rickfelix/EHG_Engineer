/**
 * Backfill `metadata.human_decider` on SDs fenced with requires_human_action=true but naming
 * nobody — QF-20260727-858.
 *
 * The write-path guard stops NEW unroutable rows; it does nothing for the 9 that already exist,
 * which is why the QF asks for both. Without this pass the guard ships and the two critical
 * operating-company children keep ageing in nobody's queue.
 *
 * WHY 'chairman' AND NOT A CLEARED FLAG. Two options were available: name a decider, or clear the
 * fence as stale. Naming is the conservative one — it ROUTES the decision to an identified
 * authority, whereas clearing UNBLOCKS an SD for dispatch on my say-so, which is a governance act
 * I have no basis for. Every one of the 3 already-correct rows names `chairman`, and these are
 * activate/defer/priority calls of the same kind, so 'chairman' matches the established
 * convention rather than inventing one.
 *
 * The 2 SD-REFILL rows are flagged separately in the output: they are `deferred` AND carry no
 * reason text, which is the signature of a stale fence rather than a live decision. They are
 * still routed (not cleared) for the reason above, but they are the ones worth a human look.
 *
 * Goes through mergeMetadataKeys so the backfill uses the same atomic JSONB merge as every other
 * metadata stamper — and so it exercises the new guard's ALLOW path end to end.
 *
 * Idempotent: rows that already name a decider are skipped.
 *
 * Usage: node scripts/one-off/_backfill-human-decider-qf-20260727-858.mjs [--apply]
 *        (dry-run by default — prints the plan and changes nothing)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { mergeMetadataKeys } from '../../lib/coordinator/safe-metadata-merge.mjs';
import { namedDecider, isHumanActionRequested } from '../../lib/governance/human-action-decider.mjs';

const APPLY = process.argv.includes('--apply');
const DECIDER = 'chairman';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key,status,priority,metadata')
  .not('status', 'in', '(completed,cancelled)');

if (error) {
  console.error('query failed:', error.message);
  process.exit(1);
}

const fenced = (data || []).filter((r) => isHumanActionRequested(r.metadata?.requires_human_action));
const unrouted = fenced.filter((r) => !namedDecider(r.metadata));

console.log(`fenced (requires_human_action=true, non-terminal): ${fenced.length}`);
console.log(`already routed                                   : ${fenced.length - unrouted.length}`);
console.log(`UNROUTED (to backfill)                           : ${unrouted.length}\n`);

let applied = 0;
const failures = [];
for (const r of unrouted) {
  const m = r.metadata || {};
  const hasReason = Boolean(m.requires_human_action_reason || m.rha_reason);
  const staleCandidate = !hasReason && r.status === 'deferred';
  const tag = staleCandidate ? '  [STALE-FENCE CANDIDATE — no reason text + deferred]' : '';
  console.log(`${APPLY ? 'SET ' : 'PLAN'} ${r.priority?.padEnd(8)} ${r.sd_key}${tag}`);

  if (!APPLY) continue;
  const res = await mergeMetadataKeys(r.sd_key, {
    human_decider: DECIDER,
    human_decider_backfilled_by: 'QF-20260727-858',
    human_decider_backfilled_at: new Date().toISOString(),
  });
  if (res.merged) applied++;
  else failures.push(`${r.sd_key}: ${res.error || 'no row matched'}`);
}

if (APPLY) {
  console.log(`\napplied: ${applied}/${unrouted.length}`);
  if (failures.length) {
    console.error('FAILURES:');
    for (const f of failures) console.error('  -', f);
    process.exit(1);
  }
} else {
  console.log('\nDRY RUN — re-run with --apply to write.');
}
