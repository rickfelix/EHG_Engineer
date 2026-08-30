import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-e6db824d-e5e2-4f77-9e22-052f64f98db2';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('*').eq('id', PRD_ID).single();
  if (readErr) throw readErr;

  const frs = prd.functional_requirements;
  const byId = Object.fromEntries(frs.map((f, i) => [f.id, i]));

  // FR-1: correct — VALIDATION (PLAN_VERIFICATION, evidence 4a45c5b2) found FR-1 was ALSO deferred,
  // contradicting FR-6 AC#3's earlier "ships FR-1 alone" text. Update FR-1 to reflect the deferral.
  frs[byId['FR-1']] = {
    ...frs[byId['FR-1']],
    priority: 'DEFERRED',
    acceptance_criteria: [
      ...frs[byId['FR-1']].acceptance_criteria,
      'DEFERRED to SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 (VALIDATION finding, PLAN_VERIFICATION, evidence 4a45c5b2): this fix only matters as a prerequisite for the band widening (FR-2), which is also deferred. The current 120s/360s-grace inbox registry value is benign against the unchanged 180-270s ACTIVE band, so shipping it alone now provides no value and is correctly grouped with the rest of the deferred scope.',
    ],
  };

  // FR-6 AC#3: correct the "ships FR-1 alone" text, which contradicted the actual final decision.
  frs[byId['FR-6']] = {
    ...frs[byId['FR-6']],
    acceptance_criteria: frs[byId['FR-6']].acceptance_criteria.map((ac) =>
      ac.startsWith('Per the predicted outcome')
        ? "Per the predicted (and confirmed) outcome: this SD ships FR-7 ONLY (the tested, inert loaded-and-quiet predicate function) in PR #7792. FR-1 through FR-5 (registry fix AND the band-widening change) are ALL deferred to follow-up SD SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002, which is metadata.needs_coordinator_review=true and un-claimable until the parked-seat directive-wake gap is resolved or the coordinator/chairman explicitly accepts the full-band exposure per amendment_2's own gate."
        : ac
    ),
  };

  // Top-level acceptance_criteria: rewrite to reflect what THIS PRD's PR (#7792) actually delivers.
  const acceptance_criteria = [
    'FR-7 (computeLoadedAndQuiet) is a pure, exported, fail-closed function in lib/coordinator/quiet-tick.cjs, independently unit-tested (9 tests) covering each of the six input dimensions',
    'All pre-existing decideCadence() behavior is unchanged (git diff shows zero deleted lines against the prior commit; the 984-test tests/unit/coordinator/ regression sweep passes)',
    "FR-1 through FR-5 (registry durability fix and the [540,660] band widening) are explicitly deferred to follow-up SD SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002, which is linked bidirectionally via metadata.deferred_to_sd_key / metadata.deferred_from_sd_key and is metadata.needs_coordinator_review=true, un-claimable until the FR-6 blocking finding (no parked-seat directive-wake preemption path) is resolved",
    'The FR-6 blocking finding (no preemption path exists anywhere in this codebase for an armed ScheduleWakeup; live counter-evidence seat 2b9045cc unresponsive 27+ minutes to two directives) is documented in the PRD, the PR body, the code docstring, AND relayed to the coordinator via /signal (durable channel, not just PR body)',
  ];

  const { error: updErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: frs, acceptance_criteria }).eq('id', PRD_ID);
  if (updErr) throw updErr;
  console.log('Patched PRD acceptance_criteria + FR-1 (deferred) + FR-6 AC#3 (corrected) to match actual delivery (FR-7 only, PR #7792).');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
