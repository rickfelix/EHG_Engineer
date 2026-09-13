/**
 * VALIDATION sub-agent evidence writer for SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001
 * (LEAD-TO-PLAN). Uses the canonical writer path — storeSubAgentResults +
 * applySubAgentRepoVerdict — never a hand-rolled insert.
 */
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_UUID = '71fb0b59-adb5-4c65-88d3-5fe788b062d1';
const SD_KEY = 'SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001';

const supabase = await getSupabaseClient();

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  probeExistsRelative: 'scripts/hooks/coordination-inbox.cjs',
  supabase,
});

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Retroactive validation of the already-merged QF-20260912-269 fix (PR #8889, squash-merged as 6c6356cc72d). '
    + 'The reader-side limbs of the SD fix shape (b/c/d) are present on main, byte-identical in this worktree, and '
    + 'their 41 unit tests pass. Limb (a) — the WRITER that sets payload.urgency=\'interrupt\' — is absent from the '
    + 'entire codebase, so the urgency class is zero-yield / dead by construction: no code path can produce a row the '
    + 'new reader would match, and 0 of 1755 live session_coordination rows carry payload.urgency. The documentation '
    + 'also landed in a different file than the SD specified, and the in-code pointer cites a file that documents nothing.',
  critical_issues: [],
  warnings: [
    {
      severity: 'HIGH',
      issue:
        'READERS-WITHOUT-WRITER (zero-yield): payload.urgency=\'interrupt\' appears ONLY in the reader '
        + '(scripts/hooks/coordination-inbox.cjs:842,856,910,916) and in the two test files. grep across scripts/ and '
        + 'lib/ (excluding archive/) finds no writer setting it. Live DB probe: session_coordination rows with '
        + 'payload.urgency NOT NULL = 0 out of 1755 total (probe shape validated against controls: '
        + 'payload->>kind=coordinator_request = 148, payload->>topic=ruling = 1, so 0 is genuine absence, not a broken query). '
        + 'The SD fix shape limb (a) explicitly required "the ruling writer (coordinator seat, the same insert helper '
        + 'that sets topic=ruling) sets payload.urgency=\'interrupt\'". Asymmetry vs the precedent this fix was modeled on: '
        + 'fence_notice DOES have a writer (scripts/amend-sd.js emits a directed fence_notice); the urgency class has none.',
      recommendation:
        'Add the writer limb before treating the urgency class as live: either a flag on the coordinator send/ruling '
        + 'helper or an explicit set in the insert helper that stamps topic=ruling. Until then the merged reader cannot fire.',
    },
    {
      severity: 'MEDIUM',
      issue:
        'STALE DOC POINTER: the code comment at scripts/hooks/coordination-inbox.cjs:842-843 states the class is '
        + '"documented in docs/protocol/coordinator-adam-comms.md beside fence_notice". That file exists (36,934 bytes) '
        + 'but contains ZERO occurrences of "urgency" and ZERO of "fence_notice". The actual documentation was written to '
        + 'docs/reference/fleet-coordination.md:173-194 instead. The SD fix shape limb (a) named coordinator-adam-comms.md '
        + 'as the venue — the doc the coordinator seat reads at authoring time — so the discoverability path for the party '
        + 'who must SET the key is broken twice over.',
      recommendation:
        'Either document the urgency class in docs/protocol/coordinator-adam-comms.md as the SD specified, or correct the '
        + 'code comment to point at docs/reference/fleet-coordination.md and amend the SD to record the deliberate venue change.',
    },
  ],
  recommendations: [
    'PLAN should scope limb (a) (the writer) as the remaining work — limbs (b)(c)(d) are demonstrably complete and merged.',
    'Fix the coordination-inbox.cjs:842-843 doc pointer so it names the file that actually carries the section.',
    'Limb (e) (UserPromptSubmit read of interrupt rows) was marked "optional, measured at PLAN" in the SD and is not implemented — confirm PLAN dispositions it explicitly rather than letting it lapse silently.',
    'Consider an end-to-end test that writes an interrupt row and asserts the hook surfaces it, which would have caught the missing writer at build time.',
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS: every line of code that was actually merged is correct, well-tested and matches '
    + 'the SD fix shape limbs (b) uncapped fetch merged via mergePriorityExempt, (c) cutMinutes:2 nudge naming the row '
    + 'subject with the 15-minute default preserved on the fallback branch, and (d) four new unit tests. All four target '
    + 'files are byte-identical to origin/main and `npx vitest run` on the two named test files reports 2 files / 41 tests '
    + 'passed. Nothing merged should be reverted. But the SD\'s stated intent is NOT fully satisfied: limb (a) required a '
    + 'writer and a documentation venue, and neither landed. A consumer-only discriminator reads as a working feature while '
    + 'yielding nothing, so recording this as a clean PASS would let an inert mechanism ship as done.',
  conditions: [
    {
      action:
        'Implement SD fix shape limb (a): a writer that sets payload.urgency=\'interrupt\' on rulings that reverse '
        + 'in-flight work. Without it the merged reader matches 0 rows by construction.',
      priority: 'high',
      blocking: false,
    },
    {
      action:
        'Reconcile the documentation venue: coordination-inbox.cjs:842-843 cites docs/protocol/coordinator-adam-comms.md, '
        + 'which contains no "urgency" or "fence_notice" text; the section actually lives at docs/reference/fleet-coordination.md:173-194.',
      priority: 'medium',
      blocking: false,
    },
  ],
  validation_mode: 'retrospective',
  execution_time_ms: 0,
  metadata: {
    sd_key: SD_KEY,
    validation_type: 'retroactive_merged_code_verification',
    escalation_reason: 'QF escalated to SD for sensitive-path governance (scripts/hooks/coordination-inbox.cjs, fleet-wide PostToolUse hook)',
    pr: 8889,
    pr_merge_commit: '6c6356cc72d9850a051f821b4f8e13425256c3f5',
    pr_merge_method: 'squash (original SHA e484d137d60 is NOT an ancestor of main; content IS on main)',
    files_verified_identical_to_origin_main: [
      'scripts/hooks/coordination-inbox.cjs',
      'tests/unit/coordination-inbox-priority-exempt.test.js',
      'tests/unit/coordination-inbox-lane-blind-nudge.test.js',
      'docs/reference/fleet-coordination.md',
    ],
    test_run: {
      command: 'npx vitest run tests/unit/coordination-inbox-priority-exempt.test.js tests/unit/coordination-inbox-lane-blind-nudge.test.js',
      test_files_passed: 2,
      tests_passed: 41,
      tests_failed: 0,
      duration_ms: 280,
    },
    fix_shape_limb_status: {
      a_writer_and_docs: 'NOT SATISFIED — no writer anywhere; docs landed in fleet-coordination.md not coordinator-adam-comms.md',
      b_uncapped_fetch_merged_ahead: 'SATISFIED — coordination-inbox.cjs:848-862',
      c_nudge_cutminutes_2_named_subject: 'SATISFIED — coordination-inbox.cjs:1050-1060',
      d_unit_tests: 'SATISFIED — 4 new tests (3 priority-exempt + 1 lane-blind), all passing',
      e_userpromptsubmit_optional: 'NOT IMPLEMENTED — SD marked it "optional, measured at PLAN"',
    },
    zero_yield_probe: {
      session_coordination_total_rows: 1755,
      rows_with_payload_urgency_not_null: 0,
      control_coordinator_request_rows: 148,
      control_topic_ruling_rows: 1,
      control_fence_notice_rows: 0,
      probe_shape_validated: true,
      conclusion: 'genuine absence — no row has ever carried payload.urgency',
    },
    gates: {
      gate1_duplicate_check: 'PASS — no duplicate urgency mechanism; SD DEDUP section verified (fence_notice is the only pre-existing priority-exempt kind)',
      gate3_pattern_validation: 'PASS — reuses existing mergePriorityExempt / classifyToolActiveLaneBlind, no reinvention',
      gate4_integration_verification: 'CONDITIONAL — reader integrated, writer entry point absent (the UI-entry-point analogue for a non-UI mechanism)',
    },
    evidence_author: 'VALIDATION sub-agent (Task tool run, Opus 5)',
  },
};

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'VALIDATION',
  SD_UUID,
  { name: 'Principal Systems Analyst' },
  results,
  { phase: 'LEAD-TO-PLAN', sdKey: SD_KEY },
);

console.log('\n=== STORE RESULT ===');
console.log(JSON.stringify(stored, null, 2)?.slice(0, 1200));
console.log('resolution.repoPath      =', resolution.repoPath);
console.log('metadata.repo_path       =', results.metadata.repo_path);
console.log('metadata.executed_from_cwd =', results.metadata.executed_from_cwd);
console.log('final verdict            =', results.verdict);
