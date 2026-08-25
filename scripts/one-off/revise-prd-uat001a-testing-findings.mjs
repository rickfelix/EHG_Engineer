#!/usr/bin/env node
// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A -- PLAN-phase PRD revision incorporating the
// TESTING sub-agent's CONDITIONAL_PASS findings (sub_agent_execution_results id
// cdb92643-a3df-471d-8a3b-a603a3edea71) before PLAN-TO-EXEC:
//   1. TS-3's assertion was hedged ("documented") -- harden to an executable dual-query
//      comparison in the same test run.
//   2. TS-6 only tested the generated-from-SSOT branch of a binary classifier -- add TS-8
//      to test the hand-written branch too.
//   3. AC-5 (zero forbidden regex escapes) had no dedicated automated self-check -- add TS-9.
//   4. TS-4 was mislabeled test_type 'e2e' for what is really a CLI dogfood run -- relabel
//      'integration' so a future E2E-specific gate does not misread this exempt SD.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A';

async function run() {
  const supabase = createSupabaseServiceClient();
  const { data: current, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('test_scenarios')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const scenarios = current.test_scenarios.map((ts) => {
    if (ts.id === 'TS-3') {
      return {
        ...ts,
        then: 'In the SAME test run: the bracket-class [0-9] query returns exactly 2 matches against the fixture, AND the naive \\d query (run against the identical fixture in the identical SQL context as the reproduced hazard) returns 0 matches -- both asserted live, not documented as a prior observation',
      };
    }
    if (ts.id === 'TS-4') {
      return { ...ts, test_type: 'integration' };
    }
    return ts;
  });

  scenarios.push({
    id: 'TS-8',
    scenario: 'Generated-vs-handwritten classification is correct for a known hand-written finding (the other branch of the binary classifier)',
    test_type: 'unit',
    given: 'A finding on a hardcoded stage-number literal in application code or a migration file, which is NOT regenerable by any SSOT regen script',
    when: 'ClassificationEngine labels the finding',
    then: 'The finding is labeled hand-written, not generated-from-SSOT -- proving the classifier discriminates both branches rather than defaulting to one label'
  });

  scenarios.push({
    id: 'TS-9',
    scenario: 'Automated self-check confirms zero forbidden regex escapes anywhere in the instrument source',
    test_type: 'unit',
    given: 'The complete instrument source tree under scripts/audits/',
    when: 'A source-scanning self-check greps every SQL-embedded regex literal in the instrument files',
    then: 'Zero occurrences of \\d, \\w, \\s, \\m, or \\M escapes are found in any SQL-embedded regex literal (AC-5), asserted as a running test rather than a manual code-review convention'
  });

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ test_scenarios: scenarios })
    .eq('id', PRD_ID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
  console.log(`test_scenarios revised: ${scenarios.length} total (was ${current.test_scenarios.length}).`);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
