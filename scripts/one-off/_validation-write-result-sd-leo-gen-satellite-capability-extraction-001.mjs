#!/usr/bin/env node
/**
 * Write VALIDATION (Principal Systems Analyst) PLAN_VERIFICATION-phase verdict
 * for SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001 ahead of its PLAN-TO-LEAD handoff.
 *
 * GATE 4 (PLAN Verification): independent implementation validation of the re-scoped
 * two-gap satellite delta (FR-1 capability-gap bridge, FR-2 no-deposit exception) +
 * FR-3 regression guard that the already-shipped SPINE-001-E satellite is untouched.
 * Every claim was independently re-derived (files read directly, tests run, diffs
 * inspected) rather than taken from the requesting summary.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults), per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '15c746e3-94af-4b92-8591-a0d7d54cdc18';
const SD_KEY = 'SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001';

const findings = [
  {
    id: 'V1-fr1-source-no-venture-capabilities-write',
    severity: 'INFO',
    summary: 'Read lib/harness/capability-gap-bridge.mjs directly. The string "venture_capabilities" appears ONLY in the doc comment (lines 11-12) explaining why the table is deliberately avoided; it appears in zero code paths. grep for .from(/.insert(/.upsert(/.update( inside the module returns nothing — the module performs no direct table ops. It delegates every finding to emitFeedback() (import from ../governance/emit-feedback.js) with category=CAPABILITY_GAP_CATEGORY=\'capability_gap\', which writes to the feedback table (verified in emit-feedback.js: .from(\'feedback\'), .eq(\'category\', category)). bridgeCannotDriveFindings guards on Array.isArray(coverageResult?.cannotDrive) and returns {emitted:0} on empty input. FR-1 "does NOT write venture_capabilities" invariant CONFIRMED.'
  },
  {
    id: 'V2-fr1-wiring-s20-run',
    severity: 'INFO',
    summary: 'Read the s20-run.mjs diff (0c04bc4965d..daad8ec6fe8) directly. Import added at line 43. The call site (line 325) is bridgeCannotDriveFindings(supabase, coverage, { harnessSource: \'s20-run\', runId }) placed immediately after coverage is produced by journal.checkCoverage([...LOOP_O_REQUIREMENTS]) at line 317 and the coverage lifecycle append — i.e. right after checkCoverage() as specified. It is wrapped in try/catch; on error it journal.append()s a "capability-gap bridge failed (non-blocking)" lifecycle event, so a feedback-write failure never fails the harness run (fail-soft/fail-open CONFIRMED). supabase is in scope: runArc defines const supabase = sb || makeClient() at line 290.'
  },
  {
    id: 'V3-fr2-wiring-post-lifecycle',
    severity: 'INFO',
    summary: 'Read the lib/eva/post-lifecycle-decisions.js diff directly. Imports added: routeException (../crm/spine-consumption-client.js, a real exported async stub at line 20) and emitFeedback. The new block at line 132 is `} else {` — the direct sibling of the existing `if (Array.isArray(decision.extractedCapabilities) && decision.extractedCapabilities.length > 0)` at line 122. Inside: routeException(\'NO_CAPABILITY_DEPOSIT\', {ventureId, sdKey, decisionType}) is awaited, THEN emitFeedback({supabase, category:\'capability_no_deposit\', ...}) durably persists the routed exception (routed_to captured in metadata). Whole block wrapped in try/catch with logger.warn on failure (fail-open CONFIRMED — never blocks the already-recorded lifecycle decision). supabase is in scope via const { supabase, logger } = deps at line 67. Matches the SPINE-001-E fail-open convention used by the sibling emitTraversalReflection/evaluateExtractionChecklist paths.'
  },
  {
    id: 'V4-test-evidence-28-plus-13',
    severity: 'INFO',
    summary: 'Ran the tests myself with npx vitest run --project unit. tests/unit/harness/capability-gap-bridge.test.js = 4 passed. tests/unit/eva/post-lifecycle-decisions.test.js = 24 passed (28 combined, matching the stated 4+24). Regression guard tests/unit/eva/venture-capability-extraction.test.js = 13 passed, unaffected. No skips/quarantine exclusions observed for the post-lifecycle file — it now runs in CI and its FR-2 no-deposit tests are exercised rather than silently excluded.'
  },
  {
    id: 'V5-fr3-regression-guard-satellite-untouched',
    severity: 'INFO',
    summary: 'git diff --stat 0c04bc4965d..daad8ec6fe8 for lib/eva/venture-capability-extraction.js returns EMPTY (untouched), and its test file tests/unit/eva/venture-capability-extraction.test.js is also untouched. The already-shipped SPINE-001-E satellite is completely unmodified and its 13 tests still pass. FR-3 regression guard CONFIRMED. Full SD diffstat is exactly 6 files: post-lifecycle-decisions.js (+27), capability-gap-bridge.mjs (+50 new), s20-run.mjs (+10), quarantine-manifest.json (-8), post-lifecycle-decisions.test.js (+85/-16), capability-gap-bridge.test.js (+60 new) — no scope creep beyond the two named gaps + their tests + the de-quarantine.'
  },
  {
    id: 'V6-quarantine-manifest-legitimate-dequarantine',
    severity: 'INFO',
    summary: 'git diff on tests/quarantine-manifest.json shows exactly ONE object removed (8 lines): the tests/unit/eva/post-lifecycle-decisions.test.js entry (reason_class=assertion-drift, quarantined 2026-06-11 by aa0de85c). No other manifest entries touched. Current file parses as valid JSON (top-level keys $schema/generated_at/quarantined) and contains zero remaining references to post-lifecycle-decisions. The de-quarantine is legitimate, NOT test-masking: the 2 corrected assertions were genuinely stale (isFinalStage boundary and MAX_LIFECYCLE_STAGE expecting 25) and were updated 25->26 to match current source truth — lib/eva/post-lifecycle-decisions.js:25 declares `export const MAX_LIFECYCLE_STAGE = 26`. Fixing the tests to match real source (rather than deleting or mocking) is the correct action; it also stopped this SD\'s own FR-2 tests from being silently excluded from CI.'
  },
  {
    id: 'V7-consume-not-rebuild-substrate-reuse',
    severity: 'INFO',
    summary: 'Independent duplicate/overlap check (GATE-4 duplicate detection). Both FRs REUSE existing substrate rather than rebuilding: FR-1 reuses emitFeedback (canonical governance writer) + the existing journal.checkCoverage() return; FR-2 reuses the spine\'s existing routeException() typed-exception interface + emitFeedback. No new tables, no new writer, no forked capability engine. This is exactly the "consume-not-rebuild / reuse the substrate" pattern the validation gate rewards (saves the 8-10h duplicate-build cost). No duplicate or overlapping implementation introduced.'
  }
];

const warnings = [
  'routeException(\'NO_CAPABILITY_DEPOSIT\', ...) is currently a non-persisting spine stub (lib/crm/spine-consumption-client.js:20). This is BY DESIGN and is precisely why FR-2 additionally calls emitFeedback for durable persistence — but it means the typed-exception channel itself is inert until the spine consumer is built out. Non-blocking for this SD (the durable feedback row is the acceptance-satisfying artifact); flagged for the record so a future spine SD wires routeException to real persistence.'
];

const recommendations = [
  'Allow PLAN-TO-LEAD handoff to proceed: all three FRs are satisfied at source + behavior level, the shipped SPINE-001-E satellite is provably untouched (FR-3), 28 new + 13 guard tests pass, and no duplicate/overlapping implementation was introduced.',
  'No code change required. One non-blocking note for the completed record: routeException remains a non-persisting stub (durable persistence is carried by the paired emitFeedback call, as intended by the SD scope).'
];

const summary = 'PASS (confidence 96). GATE 4 (PLAN Verification) implementation validation for the re-scoped capability-extraction satellite delta, every claim independently re-derived. FR-1: lib/harness/capability-gap-bridge.mjs never writes venture_capabilities (the table name appears only in the doc comment; zero .from/.insert/.upsert/.update; delegates to emitFeedback category=\'capability_gap\'); wired into s20-run.mjs at line 325 right after journal.checkCoverage() (line 317) with a fail-soft try/catch. FR-2: post-lifecycle-decisions.js gained an else-branch (line 132) sibling to the extractedCapabilities.length>0 check (line 122) that calls the real spine routeException(\'NO_CAPABILITY_DEPOSIT\') stub AND durably persists via emitFeedback category=\'capability_no_deposit\', wrapped fail-open in try/catch. FR-3: lib/eva/venture-capability-extraction.js and its test file are UNTOUCHED (empty diff); the shipped satellite\'s 13 tests still pass. Tests run by me: bridge 4 + post-lifecycle 24 = 28 pass (file de-quarantined), guard 13 pass. quarantine-manifest.json removed exactly one entry, valid JSON, and the 25->26 assertion fix is legitimate (source MAX_LIFECYCLE_STAGE=26), not test-masking. Both FRs reuse existing substrate (no duplicate implementation). One non-blocking note: routeException is a non-persisting stub (durable persistence carried by the paired emitFeedback, by design). Delivered scope == the two named gaps + tests + de-quarantine; no scope creep.';

const justification = [
  'PASS (confidence 96) - SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001 implementation is validated for PLAN-TO-LEAD.',
  '',
  'GATE 4 (PLAN Verification) checklist:',
  '- Implementation Validation: code matches approved re-scoped PRD. FR-1, FR-2, FR-3 all verified at source (files read directly) + behavior (tests run). VERIFIED.',
  '- No Scope Creep: full SD diffstat = 6 files (2 new lib/test, 2 wiring/source, 1 manifest, 1 test) confined to the two named §3.4 gaps + tests + de-quarantine. Delivered == approved. VERIFIED.',
  '- Integration Validation: FR-1 reuses journal.checkCoverage() output + emitFeedback; FR-2 reuses spine routeException + emitFeedback; both supabase clients confirmed in scope. Fail-soft/fail-open at both call sites so neither can break the harness run or the lifecycle decision. VERIFIED.',
  '- Duplicate/Overlap (independent): no new table, no new writer, no forked engine; both FRs consume existing substrate. VERIFIED.',
  '- Regression Guard (FR-3): the already-shipped SPINE-001-E satellite (venture-capability-extraction.js) is byte-for-byte untouched and its 13 tests pass. VERIFIED.',
  '',
  'EVIDENCE (independently re-derived):',
  '1. FR-1 source: grep "venture_capabilities" in capability-gap-bridge.mjs -> only comment lines 11-12; grep .from/.insert/.upsert/.update -> none; imports+uses emitFeedback(category=\'capability_gap\').',
  '2. FR-1 wiring: s20-run.mjs:317 const coverage = journal.checkCoverage(...); :325 await bridgeCannotDriveFindings(supabase, coverage, ...) inside try/catch -> journal.append non-blocking on failure. supabase defined :290.',
  '3. FR-2 wiring: post-lifecycle-decisions.js:122 if(...extractedCapabilities.length>0); :132 } else { routeException(\'NO_CAPABILITY_DEPOSIT\',...) + emitFeedback(category=\'capability_no_deposit\') inside try/catch -> logger.warn on failure. supabase from deps :67.',
  '4. Tests I ran: capability-gap-bridge.test.js 4 pass; post-lifecycle-decisions.test.js 24 pass; venture-capability-extraction.test.js 13 pass.',
  '5. FR-3: git diff --stat for venture-capability-extraction.js (+ its test) = empty (untouched).',
  '6. quarantine-manifest.json: one entry removed (post-lifecycle-decisions.test.js), valid JSON, no lingering refs; 25->26 assertion fix matches source MAX_LIFECYCLE_STAGE=26.',
  '',
  'RATIONALE FOR PASS:',
  'The delta is minimal, correctly scoped to the two genuinely-unclaimed §3.4 gaps, source- and behavior-verified, test-covered (28 new + 13 guard passing), fail-soft at both integration points, and free of duplicate/overlapping implementation. The shipped satellite is provably untouched. The single open item (routeException is a non-persisting stub) is by-design and mitigated by the paired durable emitFeedback write; it is a PRD-record note, not a code defect. Confidence 96 reflects full functional confidence with that one non-blocking architectural observation.'
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 96,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      gate: 'GATE_4_PLAN_VERIFICATION',
      validation_type: 'implementation_validation_and_duplicate_check',
      files_read_directly: [
        'lib/harness/capability-gap-bridge.mjs',
        'lib/governance/emit-feedback.js (writer verification)',
        'scripts/harness/s20-run.mjs (diff + scope)',
        'lib/eva/post-lifecycle-decisions.js (diff + scope)',
        'lib/crm/spine-consumption-client.js (routeException stub)',
        'tests/quarantine-manifest.json (diff)',
        'tests/unit/eva/post-lifecycle-decisions.test.js (de-quarantine diff)',
      ],
      fr_coverage: {
        'FR-1': 'PASS — capability-gap-bridge.mjs never writes venture_capabilities (comment-only mention, no table ops), delegates to emitFeedback(category=capability_gap); wired after journal.checkCoverage() in s20-run.mjs:325, fail-soft.',
        'FR-2': 'PASS — post-lifecycle-decisions.js else-branch (line 132, sibling of extractedCapabilities>0 at 122) calls routeException(NO_CAPABILITY_DEPOSIT) + emitFeedback(category=capability_no_deposit), fail-open.',
        'FR-3': 'PASS — lib/eva/venture-capability-extraction.js + its test UNTOUCHED (empty diff); shipped satellite 13 tests pass.',
      },
      tests_run_by_validation: {
        'tests/unit/harness/capability-gap-bridge.test.js': '4 passed',
        'tests/unit/eva/post-lifecycle-decisions.test.js': '24 passed (de-quarantined)',
        'tests/unit/eva/venture-capability-extraction.test.js': '13 passed (regression guard)',
        combined_new: 28,
      },
      duplicate_overlap_check: {
        new_tables: 0,
        new_writers: 0,
        forked_engines: 0,
        fr1_reuses: 'journal.checkCoverage() + emitFeedback',
        fr2_reuses: 'spine routeException() + emitFeedback',
        verdict: 'NO_DUPLICATE_OR_OVERLAP',
      },
      scope_creep_check: {
        sd_diffstat_files: 6,
        files: 'post-lifecycle-decisions.js(+27), capability-gap-bridge.mjs(+50 new), s20-run.mjs(+10), quarantine-manifest.json(-8), post-lifecycle-decisions.test.js(+85/-16), capability-gap-bridge.test.js(+60 new)',
        delivered_equals_approved: true,
      },
      quarantine_manifest_check: {
        entries_removed: 1,
        entry_removed: 'tests/unit/eva/post-lifecycle-decisions.test.js',
        valid_json: true,
        lingering_refs: 0,
        assertion_fix_legitimate: 'source MAX_LIFECYCLE_STAGE=26; two stale 25-assertions corrected 25->26 (not test-masking)',
      },
      commits_verified: ['dc2ec8f6d46 (feat)', 'daad8ec6fe8 (de-quarantine)'],
      base_commit: '0c04bc4965d',
      non_blocking_notes: [
        'routeException is a non-persisting spine stub; durable persistence intentionally carried by the paired emitFeedback call.',
      ],
      e2e_applicable: false,
      e2e_exemption_reason: 'server-side/harness-side data-bridging invariants (feedback-row emission, fail-soft wiring, regression guard); no UI/route surface. Fully exercised at unit level.',
      model: 'Opus 4.8',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        fr1_no_venture_capabilities_write: 'PASS (comment-only mention; delegates to emitFeedback)',
        fr1_wiring_after_checkcoverage_failsoft: 'PASS (s20-run.mjs:325 try/catch)',
        fr2_else_branch_routeexception_plus_emitfeedback_failopen: 'PASS (post-lifecycle:132 try/catch)',
        tests_28_new_plus_13_guard: 'PASS (all pass, file de-quarantined)',
        fr3_shipped_satellite_untouched: 'PASS (empty diff)',
        quarantine_manifest_one_entry_valid_json: 'PASS (legitimate 25->26 fix, not masking)',
        duplicate_overlap_scan: 'PASS (substrate reuse, no duplicate)',
      },
    },
    phase: 'PLAN_VERIFICATION',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
