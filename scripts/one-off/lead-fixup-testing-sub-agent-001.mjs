// SD-FDBK-INFRA-TESTING-SUB-AGENT-001 — LEAD-TO-PLAN fixups: real smoke test steps (LEAD Q9)
// and mechanism-claim verifier citations, both required by the LEAD-TO-PLAN gate suite.
import { createSupabaseServiceClient } from '../../lib/supabase-client.cjs';

const SD_KEY = 'SD-FDBK-INFRA-TESTING-SUB-AGENT-001';

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: 'grep -rn "skipE2ESdTypes\\|E2E_EXEMPT_SD_TYPES" lib/sub-agents/testing/',
    expected_outcome: 'Zero matches -- both private applicability lists are deleted; the sub-agent no longer decides on the type string alone.',
  },
  {
    step_number: 2,
    instruction: 'node scripts/execute-subagent.js --code TESTING --sd-id <fixture infrastructure SD with a code diff and zero test runs>',
    expected_outcome: 'Verdict is NOT a bare PASS -- it is NOT_APPLICABLE (docs-only) or CONDITIONAL_PASS with a stated reason; a code-changing SD with phase3_execution skipped can never carry verdict PASS.',
  },
  {
    step_number: 3,
    instruction: 'node scripts/execute-subagent.js --code TESTING --sd-id <same fixture, now with a passing scoped unit run>',
    expected_outcome: 'Verdict PASS with metadata.measured=true and executed/passed counts > 0 (failed=0) -- a measured PASS, not an auto-pass.',
  },
  {
    step_number: 4,
    instruction: 'node scripts/modules/handoff/validation/mandatory-testing-validation.js --sd-id <fixture with only a NOT_APPLICABLE TESTING row and a code diff> (or the equivalent unit test)',
    expected_outcome: 'Gate treats NOT_APPLICABLE as absence of test evidence for the code-changing SD and reports it via the existing ERR_TESTING_REQUIRED-style REQUIRED/ADVISORY path -- never as a satisfying PASS.',
  },
  {
    step_number: 5,
    instruction: 'Replay the QF-20260801-660 controlled pair: run TESTING on the same evidence once labeled sd_type=bugfix and once sd_type=infrastructure',
    expected_outcome: 'Both runs produce the identical verdict -- the sd_type string is no longer the discriminant.',
  },
];

const mechanismVerifications = [
  {
    verified_by: 'Golf-4 (Explore sub-agent Task-tool pass, evidence row 56a5971d-674e-4042-94af-cdf9d2abf949)',
    verified_at: 'lib/sub-agents/testing/index.js:376',
    note: 'Confirmed skipE2ESdTypes (11-entry list) and its :109 call site checkForNonUISdType (:362-430) verbatim against live source at LEAD.',
  },
  {
    verified_by: 'Golf-4 (Explore sub-agent Task-tool pass, evidence row 56a5971d-674e-4042-94af-cdf9d2abf949)',
    verified_at: 'lib/sub-agents/testing/phases/phase4-evidence.js:89',
    note: 'Confirmed E2E_EXEMPT_SD_TYPES is a DIFFERENT 5-entry list that diverges from skipE2ESdTypes.',
  },
  {
    verified_by: 'validation-agent (LEAD-TO-PLAN pass, evidence row 8cc7aff7-a39c-4582-9ce3-099f2d891830)',
    verified_at: 'scripts/modules/handoff/validation/mandatory-testing-validation.js:163',
    note: 'Confirmed mandatory-testing-validation.js already imports getValidatorRequirement and currently returns ADVISORY (passed:true, score:70), NOT ERR_TESTING_REQUIRED, for a NOT_APPLICABLE-classified code-changing infrastructure SD -- correcting SC#3\'s premise that this path already blocks today.',
  },
];

const sb = createSupabaseServiceClient();
const { data: existing, error: readErr } = await sb
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (readErr) { console.error('READ_ERROR', readErr); process.exit(1); }
if (!existing) { console.error('SD_NOT_FOUND', SD_KEY); process.exit(1); }

const newMetadata = { ...(existing.metadata || {}), mechanism_verifications: mechanismVerifications };

const { error: writeErr } = await sb
  .from('strategic_directives_v2')
  .update({ smoke_test_steps: smokeTestSteps, metadata: newMetadata })
  .eq('id', existing.id);
if (writeErr) { console.error('WRITE_ERROR', writeErr); process.exit(1); }

console.log('UPDATED_SD_ID=' + existing.id);
console.log('SMOKE_TEST_STEPS_COUNT=' + smokeTestSteps.length);
console.log('MECHANISM_VERIFICATIONS_COUNT=' + mechanismVerifications.length);
