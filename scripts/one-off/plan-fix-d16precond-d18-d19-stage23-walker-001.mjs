#!/usr/bin/env node
// PLAN-phase: close testing-agent's 4th-round CONDITIONAL_PASS precondition (evidence
// 2b98c637-0e7f-4412-ad0e-2b64360bea79) plus 2 non-blocking findings, without spinning a
// 5th full re-verification round (diminishing returns; CONDITIONAL_PASS already clears
// GATE_SUBAGENT_EVIDENCE per ACCEPT_VERDICTS):
//   D16 precondition: TR-3's writer must be storeSubAgentResults (sub_agent_code='TESTING',
//        phase='EXEC', sd_id=this SD), never scripts/record-explore-evidence.js, which
//        hard-codes sub_agent_code='Explore'/phase='LEAD' and would manufacture false
//        provenance for 11 override-verification rows.
//   D18: TS-8's `given` wrongly called :811 the existing-3-overrides' own block; it's
//        actually the FR-12-modified block. The 3 existing overrides live in :937/:1037.
//   D19: FR-12 never named the actual DB column path for the spec data.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';
const SD_KEY = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('technical_requirements, functional_requirements, test_scenarios')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  // D16 precondition
  const technical_requirements = current.technical_requirements.map((tr) =>
    tr.id === 'TR-3'
      ? {
          ...tr,
          requirement: tr.requirement
            + ` CONCRETE WRITER (testing-agent precondition, evidence 2b98c637): per-override verification scripts write via storeSubAgentResults (lib/sub-agent-executor/results-storage.js) with sub_agent_code='TESTING', phase='EXEC', sd_id='${SD_KEY}', stamped via applySubAgentRepoVerdict -- NEVER scripts/record-explore-evidence.js, which hard-codes sub_agent_code='Explore'/phase='LEAD' and would manufacture false provenance for an EXEC-phase per-override measurement.`,
        }
      : tr
  );

  // D19: name the actual column path in FR-12
  const functional_requirements = current.functional_requirements.map((fr) =>
    fr.id === 'FR-12'
      ? {
          ...fr,
          description: fr.description.replace(
            'The script reads the LIVE venture_artifacts spec row (id=4b60d6fe-3462-403c-ab62-c5c7ad2ed7c7) and the LIVE',
            "The script reads the LIVE venture_artifacts spec row (id=4b60d6fe-3462-403c-ab62-c5c7ad2ed7c7, column artifact_data -> journeys[].steps[].step_id -- parsed as structured JSON, never regex'd against the rendered PRD content) and the LIVE"
          ),
        }
      : fr
  );

  // D18: correct TS-8's given/then to accurately describe which blocks are which
  const test_scenarios = current.test_scenarios.map((ts) =>
    ts.id === 'TS-8'
      ? {
          ...ts,
          given: "The 3 pre-existing ALTIFYAI overrides' own dedicated describe blocks (tests/unit/apa/venture-step-executors.test.js, at lines 937 and 1037 -- NOT the :811 block, which FR-12 modifies) and a step_id genuinely outside the 14-journey specification",
          then: "The 3 existing overrides' own dedicated tests at :937/:1037 still pass unchanged, the :811 block's stepOverrides-keys assertion (:815-819) reflects the new registry per FR-12 while its :814/:826 assertions remain untouched, and the out-of-specification step_id still throws unconditionally at :689",
        }
      : ts
  );

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ technical_requirements, functional_requirements, test_scenarios })
    .eq('id', PRD_ID);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ D16 precondition, D18, D19 fixed.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
