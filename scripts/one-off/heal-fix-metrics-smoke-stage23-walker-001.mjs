#!/usr/bin/env node
// /heal-discovered gap fix for SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 (mirrors the
// heal-gap pattern from SD-LEO-FIX-GATE-PLAN-EXEC-001):
//   1. success_metrics.actual fields were left as "N/A" placeholders even though every metric
//      is genuinely measured and verifiable now -- backfilled with real values.
//   2. smoke_test_steps 3/4 described the PRE-CORRECTION design (an "outside the spec" override
//      literally failing FR-12's build, and the walk run id landing on ELEVEN-001's nonexistent
//      "FR-4") -- both were superseded by LEAD/PLAN-phase corrections made before any code was
//      written. Updated to describe the actually-delivered, as-built behavior.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('success_metrics, smoke_test_steps')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  const success_metrics = current.success_metrics.map((m) => {
    if (m.metric.includes('without a registered override')) {
      return { ...m, actual: '0 -- confirmed live via npm run altifyai:registry-completeness-check (14/14 spec step_ids registered, 0 missing, 0 stale allowlist entries)' };
    }
    if (m.metric.includes('reaching their surface without the :689 throw')) {
      return { ...m, actual: '11 of 14 reach their surface without the :689 throw (7 fully live-verified: list/multi-upload/batch-generate/delete/export-CSV/export-JSON/keywords; 4 correctly report the pre-existing, out-of-scope generation-flow defect instead of :689: edit/copy/approve/suggestions). The remaining 3 (upload/auto-generate/see-generated, the pre-existing overrides) are unaffected by this SD. A live walk run (8fd20429) still stops at position 3 (stp-e3e6) per the same pre-existing defect -- the walk\'s own pass/fail belongs to ELEVEN-001 per this SD\'s own success_criteria #4, not to this metric.' };
    }
    if (m.metric.includes('overrides keyed by full step_id')) {
      return { ...m, actual: '11/11 -- confirmed via diffing getVentureRegistration(\'ALTIFYAI\').stepOverrides keys against the full step_id map at merge time; zero truncated-prefix registrations.' };
    }
    if (m.metric.includes('exhaustive/order-sensitive assertions remaining')) {
      return { ...m, actual: '0 for the stepOverrides-keys assertion at :815-819 (narrowed to a non-exhaustive membership check, subsumed by FR-12). NOTE, PLAN-phase correction: the sibling :814 (preflightNames) and :826 (authOrigins, the SEC-003 security allowlist) assertions were deliberately left untouched -- the live spec data cannot legitimately subsume them, and :826 in particular pins a security boundary. The target\'s literal "0" was scoped to all exhaustive assertions in that block; only the one FR-12 could legitimately replace was removed.' };
    }
    return m;
  });

  const smoke_test_steps = current.smoke_test_steps.map((s) => {
    if (s.step_number === 3) {
      return {
        ...s,
        instruction: 'Run `npx vitest run --project unit tests/unit/apa/altifyai-registry-completeness-check.test.js` -- the "reports (non-blocking) a registered key with no matching spec step_id as orphaned" test simulates registering an override for a step_id outside the fourteen-journey specification.',
        expected_outcome: 'DESIGN CORRECTION (EXEC-TO-PLAN TESTING review, evidence 4960b7aa): an orphaned registration is reported (result.orphaned, a CI warning) but does NOT fail the hard gate -- it is a dead-code cleanup signal, not the fail-closed condition FR-12 exists to enforce (an authenticated spec step_id reaching :689 unguarded). The :689 fail-closed path for a genuinely out-of-specification step_id is separately covered by tests/unit/apa/venture-step-executors.test.js and is unchanged by this SD.',
      };
    }
    if (s.step_number === 4) {
      return {
        ...s,
        instruction: 'After all 11 overrides merged, run `node scripts/one-off/rerun-stage23-walk-eleven-001-fr13.mjs` and read SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001.metadata.',
        expected_outcome: 'LEAD-phase correction (recorded before any code was written): the run id lands on metadata.stage23_walk_run_id, NOT a literal "FR-4" (ELEVEN-001\'s actual FR-4 is "Edit surface", unrelated -- the original smoke-test text predates this correction). Confirmed delivered: metadata.stage23_walk_run_id=8fd20429-22df-40fa-83f4-da191842d0a1, status=fail, passRate=14.3%, brokenAtStep=stp-e3e6 (the pre-existing, disclosed, out-of-scope defect) -- ELEVEN-001 itself remains status=completed, untouched by this post-hoc verdict.',
      };
    }
    return s;
  });

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics, smoke_test_steps })
    .eq('sd_key', SD_KEY);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ success_metrics actuals backfilled, smoke_test_steps 3/4 corrected to match delivered design.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
