#!/usr/bin/env node
// PLAN-phase: fix D13/D14 + the TR-3 provenance gap found by testing-agent's re-verification
// (sub_agent_execution_results a64217b2-d096-4015-be67-856591db1cfb, verdict FAIL, "10 of 12
// resolved, 2 new/residual issues"):
//   D13: FR-12 wrongly claimed to subsume tests/unit/apa/venture-step-executors.test.js:814
//        (preflightNames) and :826 (authOrigins) -- the live venture_artifacts spec row contains
//        no origin/preflight data, so a spec-vs-registry check cannot legitimately replace those
//        assertions. :826 in particular pins the SEC-003 origin allowlist to one reviewed value;
//        removing it would silently let a later PR widen the security boundary. Narrowed FR-12's
//        claim and acceptance criterion to :815-819 (the stepOverrides keys) ONLY.
//   D14: altifyai-uat-drift-check-cron.yml exports NEXT_PUBLIC_SUPABASE_URL, not plain
//        SUPABASE_URL. FR-12's new script must read NEXT_PUBLIC_SUPABASE_URL (matching the
//        existing FR-7 script's convention) or it fails "supabaseUrl is required" on every run,
//        inviting a later continue-on-error "fix" that reproduces D1.
//   TR-3 provenance gap: TR-3's "arm A" (a hand-typed --summary to record-explore-evidence.js) is
//        evidence authored by the party the gate evidences -- exactly what the chairman-ratified
//        gate-evidence-provenance rule forbids. Corrected to require the evidence be EMITTED BY
//        the verification script itself (arm B), not hand-typed by whoever runs it.
//   Cosmetic: technical_decisions[0] had the completion-vs-authoring direction inverted (said
//        "-E completed 8 minutes BEFORE the PRD was drafted"; actually 8 minutes AFTER).
//   Also documents an undisclosed side effect testing-agent found: runVentureJourneyWalk
//        unconditionally stamps metadata.journey_walk_result on whatever sdId it receives.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, implementation_approach')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) { console.error('❌ Fetch failed:', fetchErr.message); process.exit(1); }

  const functional_requirements = current.functional_requirements.map((fr) => {
    if (fr.id === 'FR-12') {
      return {
        ...fr,
        description: fr.description
          .replace(
            'Also SUBSUMES/REPLACES all THREE exhaustive, order-sensitive assertions in tests/unit/apa/venture-step-executors.test.js\'s ALTIFYAI describe block (:814 preflightNames, :815 stepOverrides keys, :826 authOrigins), not just :815.',
            "Also SUBSUMES/REPLACES ONLY the exhaustive, order-sensitive stepOverrides-keys assertion at tests/unit/apa/venture-step-executors.test.js:815-819. NARROWED during PLAN re-verification: the live venture_artifacts spec row contains step_ids and goals only -- no origin or preflight-check data -- so it cannot legitimately subsume :814 (preflightNames) or :826 (authOrigins). :826 in particular pins the SEC-003 origin allowlist to exactly one reviewed value (venture-step-executors.js:524 consumes it as a security boundary); it and :814 MUST remain untouched by this SD."
          ),
        acceptance_criteria: fr.acceptance_criteria.map((ac) => {
          if (ac.includes(':814/:815/:826')) {
            return "tests/unit/apa/venture-step-executors.test.js's stepOverrides-keys assertion at :815-819 is replaced or removed in the same PR; the :814 (preflightNames) and :826 (authOrigins) assertions are explicitly left untouched";
          }
          if (ac.startsWith('npm run altifyai:registry-completeness-check exists')) {
            return ac + ' -- the script reads NEXT_PUBLIC_SUPABASE_URL (not plain SUPABASE_URL), matching altifyai-uat-drift-check-cron.yml:36 and the sibling scripts/regen-fr7-source-material-fixture.mjs:42 convention (D14: the workflow does not export a plain SUPABASE_URL, so a script assuming it would fail "supabaseUrl is required" on every run)';
          }
          return ac;
        }),
      };
    }
    if (fr.id === 'FR-13') {
      return {
        ...fr,
        description: fr.description
          + ' NOTE (testing-agent re-verification): runVentureJourneyWalk unconditionally stamps metadata.journey_walk_result on whatever sdId it is invoked with, as an undisclosed side effect of the walk itself -- benign here since ELEVEN-001 carries no journey_steps key, but this is a SECOND write beyond the intended metadata.stage23_walk_run_id and should be logged, not suppressed.',
      };
    }
    return fr;
  });

  const technical_requirements = current.technical_requirements.map((tr) => {
    if (tr.id === 'TR-3') {
      return {
        ...tr,
        requirement: "Each override FR's 'dated live-verification evidence artifact' must be EMITTED BY the verification script itself at the moment it runs (e.g. the script calls scripts/record-explore-evidence.js or an equivalent writer programmatically, with --summary/--findings populated from its own measured output), never a hand-typed --summary supplied after the fact by whoever runs it",
        rationale: tr.rationale
          + " CORRECTED during PLAN re-verification: a hand-typed summary passed to record-explore-evidence.js is evidence authored by the party the gate evidences -- exactly what the chairman-ratified gate-evidence-provenance rule (ratification 6c263823: 'no completion gate may accept evidence authored by the party it gates... evidence without provenance is absent, not weak') forbids. The verification script's own measured output (selector found/not-found, rendered-state text, HTTP status, etc.) must be what populates the evidence row, not a post-hoc description of it.",
      };
    }
    return tr;
  });

  // implementation_approach is stored as a JSON-encoded string on this row, not a parsed object.
  const parsedApproach = typeof current.implementation_approach === 'string'
    ? JSON.parse(current.implementation_approach)
    : current.implementation_approach;
  const implementation_approach = {
    ...parsedApproach,
    technical_decisions: parsedApproach.technical_decisions.map((d) =>
      d.startsWith('PLAN-phase correction: all 5 sibling venture SDs')
        ? d.replace('8 minutes before this PRD was first drafted', '8 minutes AFTER this PRD was first drafted (20:56:43Z vs -E completing 21:04:34Z -- corrected direction per testing-agent re-verification)')
        : d
    ),
  };

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, implementation_approach })
    .eq('id', PRD_ID);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ D13, D14 (via FR-12 description note), TR-3 provenance, and the direction typo fixed.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
