require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = 'bc53d835-57eb-4522-b766-cbdcf98c36b2';
const SD_KEY = 'SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001';

(async () => {
  const row = {
    sd_id: SD_UUID,
    target_application: 'EHG_Engineer',
    learning_category: 'APPLICATION_ISSUE',
    retro_type: 'SD_COMPLETION',
    title: 'SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001 — register-script create-if-absent RPC path was unreachable behind a loud pre-check guard',
    description: 'scripts/adam-register.cjs and scripts/solomon-register.cjs returned a hard "not found" error when a session had no pre-existing claude_sessions row, instead of using the already-existing atomic set_adam_flag/set_solomon_flag RPCs (INSERT ... ON CONFLICT DO UPDATE), which already could create the row. This meant a genuinely first-time session -- the common case for a freshly restarted Solomon -- could never successfully register, the root cause of repeated live Solomon-registration failures. The original RCA framing (from SD sourcing) assumed a "silent no-op false-success" bug. Live verification during LEAD phase found the actual code already had a loud `if (!row) return error` guard -- not a silent no-op. The real bug was narrower: that loud-error guard ran before the already-correct, already-flag-enabled atomic RPC create-if-absent path was ever reached, so the RPC never got a chance to create the missing row. This is the third time this session a sourced SD RCA was found broader than what live verification reproduced (also true for SD-LEO-INFRA-VENTURE-NAME-UNIQUENESS-001 and the APA Child-A scoping) -- a recurring pattern worth systemic attention: verify RCA claims against live code/DB state during LEAD, do not just trust the sourced narrative.',
    affected_components: [
      'scripts/adam-register.cjs',
      'scripts/solomon-register.cjs',
      'scripts/adam-register.test.js',
      'scripts/solomon-register.test.js',
      'tests/unit/coordination/adam-singleton.test.js',
      'tests/unit/coordination/adam-solomon-lane-probe.test.js',
      '.claude/commands/adam.md',
      '.claude/commands/solomon.md'
    ],
    related_files: [
      'scripts/adam-register.cjs',
      'scripts/solomon-register.cjs',
      'scripts/adam-register.test.js',
      'scripts/solomon-register.test.js',
      'tests/unit/coordination/adam-singleton.test.js',
      'tests/unit/coordination/adam-solomon-lane-probe.test.js',
      '.claude/commands/adam.md',
      '.claude/commands/solomon.md'
    ],
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['DESIGN', 'DATABASE', 'RISK', 'DOCMON', 'TESTING', 'VALIDATION', 'REGRESSION'],
    human_participants: ['LEAD'],
    what_went_well: [
      'Verified the sourced RCA against live code during LEAD review before scoping the fix -- found scripts/adam-register.cjs and scripts/solomon-register.cjs already had a loud `if (!row) return error` guard, not the "silent no-op false-success" the sourcing SD assumed, which kept the fix scope narrow and correct.',
      'The atomic set_adam_flag/set_solomon_flag RPCs (INSERT ... ON CONFLICT DO UPDATE) were already correct and already flag-enabled before this SD started; the bug was purely that the loud-error guard ran before that RPC path, so removing the guard and making the write path unconditional closed the gap without touching the RPC itself.',
      'Deleted the ROLE_HANDOFF_ADAM_V1/ROLE_HANDOFF_SOLOMON_V1 feature flags and their legacy JS-merge-only fallback branch after confirming both flags were permanently "on" in every real environment, removing dead code that had only ever executed inside test mocks.',
      'Recognized that the PRD FR-3 literal ask (a live-DB integration test spawning the real CLI against a synthetic session) would let unscoped fetchAllSolomons/fetchAllAdams queries see, and potentially retire, the real live Solomon/Adam session in this shared production database, and substituted a function-level binding test against an injected fake DB with the same call chain and zero blast radius.',
      'Found that FR-4 canonical-identity-divergence requirement was already solved by lib/session-identity-sot.js (checkAgreement/reconcileAtBoot), which already has 5 tests spanning divergence scenarios D-1 through D-5, and documented the delegation in both register scripts file headers instead of building a second, competing SSOT.',
      'Applied the .update()-vs-.insert() supabase-js lesson from this session (update().eq() on a non-existent row silently no-ops) to fix the RPC-absent fallback path in both register scripts, and added a mandatory fail-loud readback after every write so an unconfirmed write returns ok:false instead of a false ok:true.',
      '8 files changed (6 modified, 2 new): 319 insertions / 236 deletions in the modified files plus 273 lines across the 2 new test files, with 52 passed (52) tests across the 4 test files covering the register scripts, the singleton wrapper, and the new binding probe.'
    ],
    what_needs_improvement: [
      'Solomon clear_solomon_flag retire-fallback still lacks parity with Adam: scripts/adam-register.cjs has a JS-merge fallback plus retire_fallback_used/retire_blocked reporting when the clear_adam_flag RPC is absent (per QF-20260703-883), while scripts/solomon-register.cjs clear_solomon_flag path still silently skips on RPC-absence -- flagged by the TESTING sub-agent (confidence 95%) as a pre-existing, non-blocking asymmetry that should be closed in a follow-up QF.',
      'The PRD FR-3 as literally specified (a live-DB integration test) was not safely implementable in this shared production database -- fetchAllSolomons/fetchAllAdams have zero namespace scoping (unlike tests/integration/claim-boundary-probe.integration.test.js uniquely-namespaced fixtures), so a synthetic registerSolomon call could have retired the real live session; the substitution to a function-level binding test had to be explicitly documented in the test file header and the PRD risks[] array so it does not read as unaddressed scope.',
      'This is the third SD in this session where the sourced RCA/PRD narrative was found broader than what live-code verification reproduced (also true of SD-LEO-INFRA-VENTURE-NAME-UNIQUENESS-001 and the APA Child-A scoping) -- a recurring pattern worth systemic attention rather than a one-off surprise.',
      'The sourcing SD "silent no-op false-success" framing was not wrong about the symptom (registration did fail for genuinely first-time sessions) but was wrong about the mechanism (loud error, not silent no-op); SD sourcing/RCA authors should distinguish claims "verified against live code" from claims "narrative/inferred from symptom" so PLAN does not scope a fix around the wrong mechanism.'
    ],
    action_items: [
      { item: 'File a follow-up QF to bring scripts/solomon-register.cjs clear_solomon_flag retire-fallback to parity with scripts/adam-register.cjs (JS-merge fallback + retire_fallback_used/retire_blocked reporting) -- flagged by TESTING sub-agent at confidence 95%, non-blocking pre-existing asymmetry', owner: 'follow-up QF', priority: 'medium' },
      { item: 'Consider prompting SD sourcing/RCA authors to explicitly tag claims as "verified against live code/DB" vs "narrative/inferred from symptom" to reduce the recurring broader-than-reality RCA pattern seen 3x this session', owner: 'process/harness', priority: 'medium' },
      { item: 'Monitor the next live Solomon session restart to confirm the create-if-absent path (set_solomon_flag RPC via the now-unconditional write path) actually creates the claude_sessions row on a genuinely first-time session, since FR-3 could only be verified at the function-binding level, not against the live DB', owner: 'monitoring', priority: 'high' },
      { item: 'Point any future Adam/Solomon identity-divergence work at the lib/session-identity-sot.js delegation note added to both register scripts file headers, to avoid re-deriving a competing SSOT', owner: 'follow-up', priority: 'low' }
    ],
    key_learnings: [
      'RCA claims sourced into an SD are a hypothesis, not a fact -- this SD sourcing framed the bug as a "silent no-op false-success", but live verification during LEAD found a loud `if (!row) return error` guard already existed; the real bug was that guard running before the already-correct atomic RPC create-if-absent path, a narrower and different mechanism than what was sourced.',
      'The set_adam_flag/set_solomon_flag RPCs already did INSERT ... ON CONFLICT DO UPDATE and could create an absent row -- the fix was entirely about guard ordering (removing the early bail-out so the RPC path is reached unconditionally), not about the RPC itself.',
      'supabase-js .update().eq(id, x) is a silent no-op when the row does not exist -- a recurring bug class this session (memory: supabase_update_check_error_or_silent_noop); the RPC-absent fallback path in both register scripts had to switch to .insert() for the create-if-absent case.',
      'Feature flags that are permanently "on" in every real environment (ROLE_HANDOFF_ADAM_V1/ROLE_HANDOFF_SOLOMON_V1) leave their OFF-branch as dead code exercised only by test mocks -- deleting both flags and the legacy JS-merge-only fallback simplified the write path to one unconditional code path instead of two divergent ones.',
      'Live-DB integration tests need uniquely-namespaced fixtures to be safe in a shared production database, as tests/integration/claim-boundary-probe.integration.test.js already does; fetchAllSolomons/fetchAllAdams have no such namespacing, so a literal FR-3 test could have retired the real live Solomon/Adam session -- substituting a function-level binding test against an injected fake DB preserved the same call chain with zero blast radius.',
      'Before building a new resolution mechanism for a requirement (FR-4: canonical identity resolution across CLAUDE_SESSION_ID and the SessionStart-hook id), check whether existing infrastructure already solves it -- lib/session-identity-sot.js checkAgreement/reconcileAtBoot already has 5 tests spanning divergence scenarios D-1 through D-5, so documenting delegation avoided creating a second, competing source of truth.',
      'A mandatory fail-loud readback after every write (a write that does not confirm on read-back now returns ok:false) closes the class of bug where a registration script reports success without the row actually existing -- the same false-success pattern documented in reference_role_register_update_not_upsert_false_success.md.'
    ],
    quality_score: 90,
    team_satisfaction: 9,
    business_value_delivered: 'Closes the root cause of repeated live Solomon-registration failures: a genuinely first-time session (the common case after a Solomon restart) can now register successfully instead of hard-failing on a missing claude_sessions row.',
    customer_impact: 'Internal harness reliability fix -- restores Adam/Solomon session-registration availability for first-time sessions',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 1,
    bugs_resolved: 1,
    tests_added: 15,
    objectives_met: true,
    on_schedule: true,
    within_scope: true,
    success_patterns: [
      'Verify sourced RCA against live code before scoping a fix',
      'Prefer documenting delegation to existing infra over building a competing mechanism (FR-4)',
      'Substitute a zero-blast-radius function-level test when a literal live-DB test spec is unsafe (FR-3)'
    ],
    failure_patterns: [
      'Sourced RCA/PRD narrative broader than what live-code verification reproduced (3rd occurrence this session)'
    ],
    improvement_areas: [
      'Solomon clear_solomon_flag retire-fallback parity with Adam',
      'SD sourcing should distinguish verified-against-live-code claims from narrative/inferred claims'
    ],
    generated_by: 'MANUAL',
    trigger_event: 'PLAN_TO_LEAD_RETROSPECTIVE_QUALITY_GATE',
    status: 'PUBLISHED',
    performance_impact: 'No performance impact -- registration path change only (guard removal + unconditional RPC write + readback)',
    metadata: {
      sd_key: SD_KEY,
      sd_type: 'infrastructure',
      branch: 'feat/SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001',
      test_results: {
        test_files: 4,
        total: 52,
        passed: 52,
        failed: 0,
        new_test_files: 2,
        new_tests_in_new_files: 15
      },
      diff_stats: {
        files_changed: 8,
        modified_files: 6,
        new_files: 2,
        insertions: 319,
        deletions: 236,
        new_file_lines: 273
      },
      sub_agent_verdicts: [
        { agent: 'DESIGN', verdict: 'PASS', confidence: 95 },
        { agent: 'DATABASE', verdict: 'PASS', confidence: 100 },
        { agent: 'RISK', verdict: 'PASS', confidence: 85 },
        { agent: 'DOCMON', verdict: 'PASS', confidence: 92 },
        { agent: 'TESTING', verdict: 'PASS', confidence: 95 },
        { agent: 'VALIDATION', verdict: 'PASS', confidence: 100 },
        { agent: 'REGRESSION', verdict: 'PASS', confidence: 100 }
      ],
      root_cause_refinement: {
        sourced_hypothesis: 'silent no-op false-success on registration',
        verified_mechanism: 'loud `if (!row) return error` guard ran before the already-correct atomic set_adam_flag/set_solomon_flag RPC create-if-absent path, so the RPC never got a chance to create the missing row',
        recurrence_note: 'third SD this session where sourced RCA was broader than live-verified reality (also SD-LEO-INFRA-VENTURE-NAME-UNIQUENESS-001, APA Child-A scoping)'
      },
      fr3_scope_substitution: {
        prd_ask: 'live-DB integration test spawning real CLI + synthetic session against the production DB',
        risk: 'fetchAllSolomons/fetchAllAdams have no namespace scoping (unlike claim-boundary-probe.integration.test.js uniquely-namespaced fixtures) -- a synthetic call could see/retire the real live Solomon/Adam session',
        resolution: 'function-level binding test (tests/unit/coordination/adam-solomon-lane-probe.test.js) against an injected fake DB, same call chain, zero blast radius',
        documented_in: ['test file header comment', 'PRD risks[] array']
      },
      fr4_delegation: {
        requirement: 'canonical identity resolution when CLAUDE_SESSION_ID and the SessionStart-hook id diverge',
        existing_solution: 'lib/session-identity-sot.js checkAgreement/reconcileAtBoot, canonical-marker-wins, gated by SESSION_IDENTITY_SOT_ENABLED, wired into scripts/hooks/session-register.cjs',
        existing_test_coverage: 'tests/unit/session-identity-sot.test.js D-1..D-5 (5 scenarios)',
        action_taken: 'documented delegation in both register scripts file headers instead of building a second mechanism'
      }
    }
  };

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(row)
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at')
    .single();
  if (error) { console.error('INS_ERR:', error); process.exit(1); }
  console.log('INSERTED retro:', JSON.stringify(data, null, 2));
})();
