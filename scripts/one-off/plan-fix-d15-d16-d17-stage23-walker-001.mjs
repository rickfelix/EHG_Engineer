#!/usr/bin/env node
// PLAN-phase: fix D15/D16/D17 found by testing-agent's THIRD PRD review
// (sub_agent_execution_results 88b14546-b853-42ff-a5b4-b01a7a25dcb3, verdict FAIL):
//   D15 (BLOCKING, HIGH/security): the D13 narrowing landed only in FR-12's own description --
//        three sibling fields (top-level acceptance_criteria[2], implementation_approach
//        phases[0].deliverables[2], test_scenarios TS-8.when) still claimed "all three" /
//        ":814/815/826" were subsumed, self-contradicting FR-12 and risking deletion of the
//        :826 SEC-003 origin-allowlist assertion. Narrowed all three to :815-819 only.
//   D16 (non-blocking but real): TR-3 mandates a durable, script-emitted evidence artifact per
//        override FR, but named no entrypoint script for FR-1..FR-11 to emit it FROM (only
//        FR-13's post-hoc walk script exists as a defined entrypoint). Added an explicit
//        per-override verification-script requirement to TR-3.
//   D17 (non-blocking but real): product_requirements_v2.content (the rendered text body) was
//        never regenerated after the three rounds of JSONB corrections -- still describes the
//        pre-redesign vitest-db-project FR-12 and the nonexistent "canonical runner" FR-13.
//        Regenerated via the canonical formatPRDContent() formatter from the corrected fields.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { formatPRDContent } from '../prd/formatters.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';
const SD_KEY = 'SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

const NARROW_FROM = /all\s+three\s+exhaustive(?:,\s*order-sensitive)?\s+assertions\s+at\s+venture-step-executors\.test\.js:?\s*:?814\/:?815\/:?826/i;

function narrowAllThree(text) {
  if (!text) return text;
  return text
    .replace(
      "has replaced all three exhaustive assertions at venture-step-executors.test.js:814/815/826",
      "has replaced the stepOverrides-keys assertion at venture-step-executors.test.js:815-819 (NOT :814 or :826, which remain untouched)"
    )
    .replace(
      "tests/unit/apa/venture-step-executors.test.js:814/815/826 assertions removed/replaced",
      "tests/unit/apa/venture-step-executors.test.js:815-819 (stepOverrides keys) assertion removed/replaced -- :814 and :826 explicitly untouched"
    )
    .replace(
      "with the file's exhaustive :814/:815/:826 assertions replaced per FR-12",
      "with the file's exhaustive :815-819 stepOverrides-keys assertion replaced per FR-12 (:814 and :826 untouched)"
    );
}

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('acceptance_criteria, implementation_approach, test_scenarios, technical_requirements, functional_requirements, executive_summary, system_architecture, risks, integration_operationalization, exploration_summary, title')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  // D15: narrow the 3 sibling fields
  const acceptance_criteria = current.acceptance_criteria.map(narrowAllThree);

  const parsedApproach = typeof current.implementation_approach === 'string'
    ? JSON.parse(current.implementation_approach)
    : current.implementation_approach;
  parsedApproach.phases = parsedApproach.phases.map((p) => ({
    ...p,
    deliverables: p.deliverables.map(narrowAllThree),
  }));

  const test_scenarios = current.test_scenarios.map((ts) =>
    ts.id === 'TS-8' ? { ...ts, when: narrowAllThree(ts.when) } : ts
  );

  // Verify the narrowing actually matched (fail loud if the string didn't exist to replace)
  const stillWide = [
    ...acceptance_criteria,
    ...test_scenarios.map((t) => t.when),
    JSON.stringify(parsedApproach.phases),
  ].some((s) => NARROW_FROM.test(s));
  if (stillWide) {
    console.error('❌ D15 narrowing did not fully apply -- a wide "all three" claim still present. Aborting without writing.');
    process.exit(1);
  }

  // D16: TR-3 gets an explicit per-override entrypoint requirement
  const technical_requirements = current.technical_requirements.map((tr) => {
    if (tr.id === 'TR-3') {
      return {
        ...tr,
        requirement: tr.requirement + '. For FR-1..FR-11 (no live per-override harness exists in the full walk, which breaks at position 2): EXEC writes one small verification script per override, structurally modeled on the existing scripts/one-off/verify-stp4de9-override-live-884.mjs precedent, but emitting its durable evidence row itself (per the EMITTED-BY requirement above) rather than a bare console.log. FR-13\'s one-off walk-invocation script is the equivalent, already-specified entrypoint for that FR.',
      };
    }
    return tr;
  });

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ acceptance_criteria, implementation_approach: parsedApproach, test_scenarios, technical_requirements })
    .eq('id', PRD_ID);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }
  console.log('✅ D15 (3 sibling fields narrowed) and D16 (TR-3 entrypoint) fixed.');

  // D17: regenerate content from the now-fully-corrected fields
  const { data: freshRow, error: freshErr } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', PRD_ID)
    .single();
  if (freshErr) { console.error('❌ Re-fetch for content regen failed:', freshErr.message); process.exit(1); }

  const llmContent = {
    executive_summary: freshRow.executive_summary,
    functional_requirements: freshRow.functional_requirements,
    technical_requirements: freshRow.technical_requirements,
    system_architecture: typeof freshRow.system_architecture === 'string' ? JSON.parse(freshRow.system_architecture) : freshRow.system_architecture,
    test_scenarios: freshRow.test_scenarios,
    acceptance_criteria: freshRow.acceptance_criteria,
    risks: freshRow.risks,
    implementation_approach: typeof freshRow.implementation_approach === 'string' ? JSON.parse(freshRow.implementation_approach) : freshRow.implementation_approach,
    integration_operationalization: typeof freshRow.integration_operationalization === 'string' ? JSON.parse(freshRow.integration_operationalization) : freshRow.integration_operationalization,
    exploration_summary: typeof freshRow.exploration_summary === 'string' ? JSON.parse(freshRow.exploration_summary) : freshRow.exploration_summary,
  };

  const content = formatPRDContent(SD_KEY, { title: current.title || 'Stage-23 walker step overrides' }, llmContent);

  const { error: contentErr } = await supabase
    .from('product_requirements_v2')
    .update({ content })
    .eq('id', PRD_ID);
  if (contentErr) { console.error('❌ content regen write failed:', contentErr.message); process.exit(1); }
  console.log('✅ D17: content field regenerated from corrected fields (', content.length, 'chars ).');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
