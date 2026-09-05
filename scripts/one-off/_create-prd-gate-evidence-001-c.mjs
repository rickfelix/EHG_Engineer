#!/usr/bin/env node
/**
 * One-off: create the PRD for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C via contentOverride
 * (generate-first pattern, SD-FDBK-INFRA-ADD-PRD-DATABASE-001), grounded in an Explore sweep
 * (evidence f21f9d2c) plus independent VALIDATION (7b499187) and RISK (0cae276e) sub-agent
 * re-measurement against live DB/code that corrected 3 of the SD's own 4 stated FRs before
 * this PRD was written -- see LEAD scope-correction note recorded on the SD row.
 */
import { addPRDToDatabase } from '../prd/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C';

const content = {
  executive_summary:
    'The agent-invoked RCA dispatch path is broken at the argument level: lib/sub-agent-executor/' +
    'executor.js:284 unconditionally passes an SD\'s UUID as the first argument to every sub-agent ' +
    'module\'s execute() call, but lib/sub-agents/rca.js::execute(rcrId, ...) expects a ' +
    'root_cause_reports (RCR) row id, not an SD id -- the ONLY one of 27 dispatchable sub-agent ' +
    'modules whose first argument is not an SD id (RISK evidence 0cae276e). This is a real, ' +
    'currently-latent defect: 0 of 63 historical RCA-coded sub_agent_execution_results rows show ' +
    'this failure mode, because the CLI path (node scripts/execute-subagent.js --code RCA --sd-id ' +
    '<SD>) has essentially never been run in production. Separately, and more consequentially, the ' +
    'one LIVE enforcement gate (rca-required-after-retries-gate.js:103) currently passes on bare ' +
    'row-existence (rcaRows?.length > 0) regardless of verdict or content -- a hollow/failed RCA row ' +
    'is indistinguishable from a genuine analysis to this gate, which is the real false-pass this ' +
    'SD\'s stated intent ("a cited analysis always resolves to a provenanced row") needs to close. ' +
    'A sibling gate (rca-feedback-loop-gate.js) is dead code with zero call sites and zero rows -- ' +
    'confirmed independently by VALIDATION and RISK sub-agents -- and is explicitly out of scope. ' +
    'Three of the SD\'s own four originally-stated success criteria were found stale, retracted, or ' +
    'already-satisfied during LEAD research (see out_of_scope) and are replaced here with a ' +
    'corrected, measurement-grounded three-FR fix.',
  functional_requirements: [
    {
      id: 'FR-C1',
      title: 'The generic dispatcher resolves-or-creates a root_cause_reports row before invoking the RCA module, instead of passing the SD UUID as an RCR id',
      priority: 'critical',
      description:
        'lib/sub-agent-executor/executor.js:284 does `subAgentModule.execute(sdUUID || sdId, ' +
        'subAgent, execOptions)` for every code. lib/sub-agents/rca.js:42-79 expects its first ' +
        'argument to be a root_cause_reports.id and does `.from(\'root_cause_reports\').select(\'*\')' +
        '.eq(\'id\', rcrId).single()` -- given an SD UUID this either matches nothing or, in the ' +
        'astronomically unlikely case of a UUID collision, the wrong row entirely. Add a ' +
        'code===\'RCA\'-scoped branch immediately before the dispatch call (RISK evidence 0cae276e: ' +
        '"blast radius SAFE... use a narrow code===\'RCA\' branch, not a generic per-code resolver") ' +
        'that resolves an existing OPEN root_cause_reports row for the SD if one exists, or creates a ' +
        'new one via the same INSERT shape scripts/root-cause-agent.js:132-170 already uses (' +
        'scope_type, sd_id, trigger_source, failure_signature, problem_statement, status:\'OPEN\'), ' +
        'then passes THAT row\'s id as the first argument. The other 26 dispatchable modules are ' +
        'unaffected -- this is an additive branch, not a signature change to the shared dispatch ' +
        'function.',
      acceptance_criteria: [
        'node scripts/execute-subagent.js --code RCA --sd-id <fixture-SD> resolves a real root_cause_reports row (existing or newly created) and successfully runs the 5-Whys analysis, instead of failing to find a row matching the SD UUID',
        'A second invocation for the same SD reuses the existing OPEN root_cause_reports row rather than creating a duplicate',
        'All 26 other dispatchable sub-agent codes (RISK, STORIES, DATABASE, TESTING, etc.) are unaffected -- their dispatch call is unchanged',
      ],
    },
    {
      id: 'FR-C2',
      title: 'The one live RCA gate requires actual analysis content, not bare row existence',
      priority: 'critical',
      description:
        'scripts/modules/handoff/gates/rca-required-after-retries-gate.js:103 currently does ' +
        '`rcaRows?.length > 0` -- any row with sub_agent_code=\'RCA\' for the SD satisfies the gate, ' +
        'regardless of verdict, root_cause, or content. A row with verdict=\'MANUAL_REQUIRED\' and no ' +
        'real analysis (e.g. from a not-yet-resolved RCR, or FR-C1\'s fix racing an in-progress ' +
        'analysis) currently reads identically to a genuine, completed root-cause analysis. Add a ' +
        'content predicate: the gate must also verify the referenced root_cause_reports row (joined ' +
        'via the metadata.rcr_id FR-C3 adds) has a non-empty root_cause column and status != \'OPEN\'. ' +
        'This is the actual mechanism that makes "a cited analysis always resolves to a PROVENANCED ' +
        'row" true in the sense the SD intends -- resolving to a row is necessary but not sufficient; ' +
        'the row must carry real content. rca-feedback-loop-gate.js is confirmed dead (zero call ' +
        'sites, zero rows, per independent VALIDATION 7b499187 and RISK 0cae276e re-checks) and is ' +
        'explicitly NOT registered/touched by this FR -- registering it is a separate, larger, ' +
        'out-of-scope behavior-change decision.',
      acceptance_criteria: [
        'A synthetic sub_agent_execution_results row with sub_agent_code=\'RCA\' whose linked root_cause_reports row has an empty root_cause / status=\'OPEN\' does NOT satisfy the gate',
        'A synthetic row whose linked root_cause_reports row has a populated root_cause and status != \'OPEN\' DOES satisfy the gate',
        'The gate remains in its current advisory enforcement_mode (rca.required_after_retries.enforcement_mode has no app_config row today, defaulting to advisory per RISK evidence 0cae276e) -- this FR does not flip it to blocking',
        'A regression test asserts both RCA gates (rca-required-after-retries-gate.js and the dead rca-feedback-loop-gate.js) remain advisory-by-default, guarding against a later silent flip (RISK evidence 0cae276e, mitigation for R-advisory-mode)',
      ],
    },
    {
      id: 'FR-C3',
      title: 'A shared recorder writes the RCA verdict into root_cause_reports\' own columns and threads rcr_id back for citation resolution',
      priority: 'high',
      description:
        'No shared recorder exists today that both the (fixed) dispatcher path and any future ' +
        'agent-invoked path could call -- but a directly-analogous precedent already exists: ' +
        'scripts/record-explore-evidence.js (built for SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001) is ' +
        'exactly the "no execute() module, needs a sanctioned transcription writer" pattern (' +
        'VALIDATION evidence 7b499187: "Copy this shape"). Follow it: after FR-C1\'s dispatch fix ' +
        'runs rca.js\'s real analysis, write root_cause/causal_chain/contributing_factors/confidence/ ' +
        'impact_level into root_cause_reports\' EXISTING dedicated columns (no new schema -- RISK ' +
        'evidence 0cae276e: "root_cause_reports already has [these] as first-class columns... write ' +
        'analysis into the RCR row, reference it by id from metadata"), then stamp metadata.rcr_id ' +
        'onto the resulting sub_agent_execution_results row. metadata.rcr_id is ALREADY an exempted, ' +
        'mapped field via TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA (results-storage.js:457) -- no ' +
        'change needed there. This explicitly does NOT store unmapped RCA fields (five_whys, ' +
        'corrective_action, etc.) inside sub_agent_execution_results.metadata -- that approach was ' +
        'formally retracted (unpromoted feedback 1e4d6f6c, 13 minutes after the SD\'s own originating ' +
        'feedback 314a3556: "do NOT store unmapped RCA fields in results metadata -- ' +
        'root_cause_reports is the canonical RCA surface").',
      acceptance_criteria: [
        'After a successful FR-C1-dispatched RCA run, the resulting sub_agent_execution_results row\'s metadata.rcr_id resolves to a real root_cause_reports row',
        'That root_cause_reports row\'s root_cause/causal_chain/contributing_factors columns are populated with the real analysis, not left as the OPEN-status placeholder shape',
        'No new column is added to sub_agent_execution_results or root_cause_reports -- both already have every field this FR needs',
        'A citation of the RCA "by id" (metadata.rcr_id) from a test fixture resolves to a row with real content, closing the SD\'s originally-measured 2/31 (6.5%) resolution-rate defect for this path going forward',
      ],
    },
  ],
  acceptance_criteria: [
    'node scripts/execute-subagent.js --code RCA --sd-id <SD> runs a real 5-Whys analysis end-to-end instead of failing on an SD-UUID-as-RCR-id lookup mismatch',
    'The one live RCA gate (rca-required-after-retries-gate.js) can no longer be satisfied by a content-free/OPEN-status row',
    'A resulting evidence row\'s metadata.rcr_id resolves to a root_cause_reports row carrying real analysis in its native columns',
    'No DB migration required for any FR -- root_cause_reports already has every column needed; metadata.rcr_id is already an exempted top-level field',
    'Both RCA gates remain advisory-mode by default; zero regression-failure-wave risk on rollout (RISK evidence 0cae276e)',
  ],
  system_architecture:
    'FR-C1 adds one narrow, additive branch to the existing generic dispatcher (executor.js) -- no ' +
    'change to the dispatch function\'s signature or to any of the other 26 sub-agent codes\' call ' +
    'sites. FR-C2 adds a content predicate inside the existing gate function -- no new gate, no new ' +
    'table. FR-C3 follows record-explore-evidence.js\'s existing shape and writes into ' +
    'root_cause_reports\' existing columns plus an already-exempted metadata key -- no new pipeline, ' +
    'no new schema. rca-feedback-loop-gate.js (dead, unregistered) and task-subagent-recorder.cjs\'s ' +
    'Agent-tool-hook-is-dead-fleet-wide defect (separately tracked, unpromoted feedback ' +
    '52a64020/7317fce3) are both explicitly untouched by this SD.',
  implementation_approach:
    'FR-C1 ships first (the dispatch fix is a self-contained precondition for everything else being ' +
    'testable end-to-end). FR-C3\'s recorder logic is implemented alongside FR-C1 since the dispatch ' +
    'fix has nowhere useful to write its result without it. FR-C2\'s gate content-predicate ships ' +
    'last, once FR-C1/FR-C3 produce real content-bearing rows to test the predicate against ' +
    '(otherwise every existing row would trivially fail the new predicate with no real fix behind ' +
    'it).',
  test_scenarios: [
    {
      scenario: 'node scripts/execute-subagent.js --code RCA --sd-id <fixture-SD> is run for an SD with no existing OPEN root_cause_reports row',
      expected: 'A new root_cause_reports row is created and the real 5-Whys analysis runs against it, populating root_cause/causal_chain/contributing_factors',
    },
    {
      scenario: 'The same command is run again for the same SD while the first RCR row is still OPEN',
      expected: 'The existing OPEN row is reused, not duplicated',
    },
    {
      scenario: 'A synthetic sub_agent_execution_results row (sub_agent_code=\'RCA\') references a root_cause_reports row with status=\'OPEN\' and empty root_cause',
      expected: 'rca-required-after-retries-gate.js does NOT consider RCA satisfied for this SD',
    },
    {
      scenario: 'A synthetic sub_agent_execution_results row references a root_cause_reports row with a populated root_cause and status=\'RESOLVED\'',
      expected: 'rca-required-after-retries-gate.js considers RCA satisfied',
    },
    {
      scenario: 'The 26 non-RCA dispatchable sub-agent codes are invoked via the generic dispatcher',
      expected: 'Zero behavior change -- their dispatch call receives the SD UUID exactly as before',
    },
  ],
  risks: [
    {
      risk: 'FR-C1\'s dispatch fix could regress the other 26 sub-agent codes if the new branch is not correctly scoped to code===\'RCA\' only',
      mitigation: 'RISK evidence 0cae276e surveyed all 27 dispatchable modules and confirmed rca.js is the sole outlier; the branch is a narrow, additive, single-code guard, and all 26 other codes\' existing tests (which blanket-mock execute() and never assert on the dispatcher\'s internal RCR-resolution logic) provide a zero-behavior-change regression check.',
    },
    {
      risk: 'FR-C2\'s new content predicate could turn the advisory gate into a de-facto blocker if enforcement_mode is later flipped without anyone noticing the predicate got stricter',
      mitigation: 'A dedicated regression test (FR-C2 acceptance criterion 4) pins both RCA gates\' enforcement_mode as advisory-by-default, so a later flip is a deliberate, visible change rather than a silent one riding on this SD.',
    },
    {
      risk: 'Auto-creating more root_cause_reports rows (FR-C1) adds load to a table with fully-permissive RLS (USING(true) WITH CHECK(true) for public role, database/migrations/20251028_rca_fix_rls_policies.sql) and no dedup constraint (1,411 rows today, 92 already stale)',
      mitigation: 'RLS permissiveness is pre-existing and orthogonal (anon can already read/write all rows regardless of this SD) -- documented here, not fixed, per LEAD scope decision. FR-C1\'s reuse-existing-OPEN-row behavior bounds the growth rate to one row per SD per open analysis window, not one per invocation.',
    },
  ],
  out_of_scope: [
    {
      item: 'The SD\'s original criterion that lib/sub-agent-executor/results-storage.js "currently only console.warn"s on an unpersisted field',
      reason: 'STALE. Confirmed on origin/main (results-storage.js:917) that this already throws, shipped by sibling SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H. Already satisfied; no work needed.',
    },
    {
      item: 'The SD\'s original FR-C2 direction: writing unmapped RCA fields (five_whys, corrective_action, etc.) into sub_agent_execution_results.metadata as a structured block',
      reason: 'This encodes formally RETRACTED guidance (unpromoted feedback 1e4d6f6c, 13 minutes after the SD\'s own originating feedback 314a3556: "do NOT store unmapped RCA fields in results metadata -- root_cause_reports is the canonical RCA surface"). This PRD\'s FR-C3 implements the corrected direction instead: real analysis fields land in root_cause_reports\' own dedicated columns, referenced by id.',
    },
    {
      item: 'Normalizing sub_agent_code casing between the Task-tool-hook path (\'RCA-AGENT\') and the CLI dispatcher path (\'RCA\')',
      reason: 'Zero live rows of either the hook path or its miscasing exist -- task-subagent-recorder.cjs\'s Agent-tool-invoked-evidence hook is dead fleet-wide for ALL 22 sub-agent codes (the hook\'s PostToolUse matcher is the literal string "Task", but the live tool is named "Agent"), a separate, larger, already-tracked defect (unpromoted feedback 52a64020/7317fce3, 2026-08-07). Not absorbed into this SD per protocol -- route, do not absorb.',
    },
    {
      item: 'Registering the dead rca-feedback-loop-gate.js so it actually runs',
      reason: 'Confirmed by two independent sub-agent re-checks to have zero call sites and zero rows anywhere in the codebase -- it is not merely underused, it is never invoked. Deciding whether/how to register a currently-inert gate is a separate, larger behavior-change decision than this SD\'s scope.',
    },
    {
      item: 'Fixing root_cause_reports\' fully-permissive RLS policies',
      reason: 'Confirmed real (USING(true) WITH CHECK(true) for public role) but orthogonal to this SD\'s defect -- it does not get worse or better based on whether FR-C1-C3 ship. Documented as a known gap, not fixed here.',
    },
  ],
};

async function main() {
  await addPRDToDatabase(SD_KEY, 'W5 child C PRD: fix the RCA dispatch ID mismatch and the gate\'s content-free false-pass', content);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
