/**
 * Backfill hold provenance (requires_human_action_reason / human_decider) on rows fenced with
 * requires_human_action=true but missing one or both -- QF-20260831-832.
 *
 * MEASURED (coordinator, 12:30:54Z over all 5,954 SDs): 90/103 fenced rows lack
 * requires_human_action_reason (resolveHoldProvenance -- lib/fleet/claim-eligibility.cjs --
 * cannot say WHY these are held) and 94/103 lack human_decider (unroutable, per
 * QF-20260727-858's precedent script, which this one mirrors).
 *
 * NEVER touches requires_human_action itself. A patch that re-asserts requires_human_action=true
 * alongside a missing decider trips checkDeciderPairing's write-path guard
 * (lib/governance/human-action-decider.mjs) and mergeMetadataKeys reports merged:false for
 * exactly those rows -- the "safe-metadata-merge.mjs SILENTLY NO-OPS on missing human_decider"
 * blind spot a naive backfill would fall into (94/103 rows are in it). Backfilling
 * requires_human_action_reason and human_decider as their OWN keys, with requires_human_action
 * absent from the patch, never enters that guard at all -- sidesteps the blind spot rather than
 * fighting it.
 *
 * HARD ACCEPTANCE (Solomon a05d6f0c, fix-is-blind-too class): per-row READBACK after each write.
 * mergeMetadataKeys reporting merged:true is not proof the value is READABLE -- this script
 * re-selects every touched row and reports any mismatch as a FAILURE, never folded into a clean
 * "applied: N/N" summary that a merged:true return alone would have printed.
 *
 * Idempotent: rows that already carry a given field are skipped for that field only.
 *
 * Usage: node scripts/one-off/_backfill-hold-provenance-qf-20260831-832.mjs [--apply]
 *        (dry-run by default -- prints the plan and changes nothing)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { mergeMetadataKeys } from '../../lib/coordinator/safe-metadata-merge.mjs';
import { namedDecider, isHumanActionRequested } from '../../lib/governance/human-action-decider.mjs';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const DECIDER = 'chairman';
const BACKFILL_TAG = 'QF-20260831-832';
const GENERIC_REASON = 'legacy fence -- reason not captured at set time (QF-20260831-832 backfill)';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001: strategic_directives_v2 is a 5,955+ row table.
// A bare .select() silently truncates to PostgREST's 1000-row cap, which would have made this
// backfill see ~9 fenced rows instead of the true 103 and report a false clean sweep -- caught
// live while authoring this script (measured 9 vs the coordinator's independently-measured 103).
const data = await fetchAllPaginated(() =>
  supabase.from('strategic_directives_v2').select('sd_key,status,priority,metadata')
);

const fenced = (data || []).filter((r) => isHumanActionRequested(r.metadata?.requires_human_action));
const needsReason = fenced.filter((r) => !r.metadata?.requires_human_action_reason);
const needsDecider = fenced.filter((r) => !namedDecider(r.metadata));
const targets = fenced.filter((r) => !r.metadata?.requires_human_action_reason || !namedDecider(r.metadata));

console.log(`fenced (requires_human_action=true, non-terminal): ${fenced.length}`);
console.log(`missing requires_human_action_reason             : ${needsReason.length}`);
console.log(`missing human_decider                            : ${needsDecider.length}`);
console.log(`ROWS TO BACKFILL                                 : ${targets.length}\n`);

let succeeded = 0;
const failures = [];
const now = new Date().toISOString();

for (const r of targets) {
  const m = r.metadata || {};
  const patch = {};
  if (!m.requires_human_action_reason) {
    patch.requires_human_action_reason = GENERIC_REASON;
    patch.requires_human_action_reason_backfilled_by = BACKFILL_TAG;
    patch.requires_human_action_reason_backfilled_at = now;
  }
  if (!namedDecider(m)) {
    patch.human_decider = DECIDER;
    patch.human_decider_backfilled_by = BACKFILL_TAG;
    patch.human_decider_backfilled_at = now;
  }
  console.log(`${APPLY ? 'SET ' : 'PLAN'} ${(r.priority || '').padEnd(8)} ${r.sd_key} -> ${Object.keys(patch).join(',')}`);

  if (!APPLY) continue;

  const res = await mergeMetadataKeys(r.sd_key, patch);
  if (!res.merged) {
    failures.push(`${r.sd_key}: WRITE REFUSED -- ${res.error || 'no row matched'}`);
    continue;
  }

  // HARD ACCEPTANCE: readback. merged:true is not proof the value is readable -- re-select and
  // confirm every stamped key landed exactly. A patch key present but mismatched at readback is
  // reported as a FAILURE, never counted toward "succeeded".
  const { data: after, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', r.sd_key)
    .maybeSingle();
  if (readErr || !after) {
    failures.push(`${r.sd_key}: READBACK FAILED -- ${readErr?.message || 'no row found'}`);
    continue;
  }
  const mismatches = Object.keys(patch).filter((k) => after.metadata?.[k] !== patch[k]);
  if (mismatches.length) {
    failures.push(`${r.sd_key}: READBACK MISMATCH -- keys did not land: ${mismatches.join(',')}`);
    continue;
  }
  succeeded++;
}

if (APPLY) {
  console.log(`\nsucceeded (write + readback-confirmed): ${succeeded}/${targets.length}`);
  if (failures.length) {
    console.error(`FAILURES (${failures.length}) -- NOT a clean sweep:`);
    for (const f of failures) console.error('  -', f);
    process.exit(1);
  }
} else {
  console.log('\nDRY RUN -- re-run with --apply to write.');
}
