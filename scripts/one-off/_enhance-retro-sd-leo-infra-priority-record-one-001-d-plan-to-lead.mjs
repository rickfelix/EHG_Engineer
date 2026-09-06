#!/usr/bin/env node
/**
 * Enhance the auto-generated SD_COMPLETION retrospective for
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D (Child D: repair the 13 live
 * non-terminal reasonless roadmap-link rows; report wave-link coverage
 * honestly) ahead of its PLAN-TO-LEAD handoff.
 *
 * node scripts/generate-comprehensive-retrospective.js / the RETRO sub-agent's
 * own preflight-autogen path already created retrospectives.id=
 * 9c5d1c15-b026-4c6b-a587-4a4e8f9bbea7 from the SD's own handoff/PRD records
 * BEFORE EXEC's actual work (the repair script, CI predicate, alignment
 * module, health-probe wiring) had landed -- its content is template
 * boilerplate ("Infrastructure completed without breaking existing
 * functionality", generic success_metrics learnings) with zero reference to
 * what was actually built or measured. This script REPLACES that row's
 * content in place (same id, same sd_id/retro_type/status contract) with the
 * real, evidence-grounded narrative, per the documented enhance-after-generate
 * workflow (generate-comprehensive-retrospective.js's own comment: "Use
 * enhance-retrospective-sd-<key>.js to update existing retrospectives").
 *
 * Every claim below is grounded in one of:
 *   - strategic_directives_v2.metadata (lead_validation, repair_evidence,
 *     mechanism_verifications, claim_history) for this SD
 *   - sd_phase_handoffs rows b4f65848/8368e11b/e7beea3f (LEAD-TO-PLAN, 3
 *     attempts) and e6441427/fd2b8528 (PLAN-TO-EXEC, 2 attempts)
 *   - sub_agent_execution_results rows 2b888be9 (LEAD VALIDATION),
 *     b6ae5eea (LEAD Explore), 15c40067/7e2c8dbc (DESIGN, both
 *     CONDITIONAL_PASS with an unresolved-repo warning), 1703673c (EXEC
 *     TESTING: 112/112 vitest tests across 7 files, live CI-predicate output)
 *   - PR #8342 (gh pr view: 928 additions / 11 deletions / 12 files, commit
 *     cee12b464acf4493289ca08d1aa408a5efb00405, OPEN -- not yet merged to main)
 *   - git show --stat of that commit for the exact file list
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

const RETRO_ID = '9c5d1c15-b026-4c6b-a587-4a4e8f9bbea7';
const SD_UUID = 'bcb68af5-caff-4bab-b02c-95e720f4baa2';
const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D';

const description = `The parent SD (SD-LEO-INFRA-PRIORITY-RECORD-ONE-001) cited "133 reasonless roadmap links" as its headline defect count. LEAD investigation for this child re-measured the LIVE state before scoping any repair and found that number stale/mis-scoped: the live fleet-wide count of reasonless exceptions was 147 (drifting to 148 mid-investigation from a new mint) across 6,141+ historical rows, but only 13 sat on the LIVE NON-TERMINAL belt -- the only slice this child could safely touch without reaching into a large, untouched historical corpus. Of those 13, two distinct defect shapes were found and named before any write: 9 rows carried a bare STRING value in metadata.roadmap_link_exception, written by a one-off script (.artifacts/michael-002-fences-20260905.mjs) that bypassed the canonical buildRoadmapLinkException builder entirely, so a real reason read reason_supplied!==true; the remaining 4 were genuine {reason_supplied:false} no-reason mints. EXEC repaired all 13 live via a new dry-run/--apply/--revert script (scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs), preserving each row's prior value under metadata.roadmap_link_exception_repair for audit and writing an explicit backfill string naming the repairing SD rather than fabricating a reason the original minter never supplied. The repair was verified idempotent by re-running --apply immediately afterward and finding 0 remaining candidates. Three small, additive modules/scripts were added rather than one large rewrite: countRoadmapLinkExceptionsByScope + classifyExceptionShape in the EXISTING lib/sourcing-engine/roadmap-link-exception.js (delegating to the already-tested countRoadmapLinkExceptions predicate instead of reimplementing reason_supplied===true a second time); scripts/ci/reasonless-roadmap-link-non-terminal.mjs (npm run ci:reasonless-roadmap-links), a CI predicate deliberately scoped to non-terminal SDs only and asserting a LEVEL (non_terminal.without_reason===0), never a delta and never against the historical corpus; and lib/priority/alignment.js (readWaveLinkAlignment/computeAlignmentCoverage), a new ALIGNMENT reader that returns the string sentinel 'UNSCORED' -- never 0 or null -- when an SD has no wave link, mirroring wave-linkage-coverage.js's existing linkage rule for sibling Child B's comparator to consume. A non_terminal split was also wired additively into the existing scripts/adam-coordinator-health.mjs health probe (computePlanAdherence), with the top-level all-corpus figures left explicitly unchanged for backward compatibility. Live result, confirmed by an independent EXEC-phase TESTING sub-agent run against the live database (evidence 1703673c): non_terminal.without_reason 13 -> 0, all.without_reason unchanged at 135 (the historical corpus was deliberately never touched), CI predicate status PASS. 112 new/updated vitest tests across 7 files (roadmap-link-exception-scope, roadmap-link-exception, repair-reasonless-roadmap-links, ci/reasonless-roadmap-link-non-terminal, priority/alignment, adam-coordinator-health, wave-linkage-coverage) all pass; ESLint and the count-delta-gate lint are both clean. PR #8342 (928 additions / 11 deletions across 12 files, commit cee12b464ac, still OPEN -- not yet merged to main) is justified against the ~100 LOC target / 400 LOC soft-guideline as four largely independent, individually-tested pieces (repair script, CI predicate, new alignment module, health-probe wiring); the LOC gate is advisory-only for infrastructure SDs and passed. A coverage gap was measured and named honestly rather than fixed or hidden: only 3 of 47 non-terminal SDs are reachable from roadmap_wave_items.promoted_to_sd_key directly, and closing that gap needs separate sourcing/PM-board plumbing explicitly out of scope for this child. LEAD's own deletion_audit recorded a 35% scope reduction before EXEC began, explicitly cutting a new coverage gauge (existing computeWaveLinkageCoverage/computePlanAdherence + this SD's own non-terminal split already cover it), any new GitHub Actions workflow (an scripts/ci predicate was used instead, matching an existing convention), and raising coverage / adam_task_ledger population / the Child B/C comparator wiring itself.`;

const what_went_well = [
  {
    achievement: 'LEAD re-measured the LIVE state (147/148 reasonless exceptions fleet-wide, only 13 on the live non-terminal belt) before scoping any repair, rather than trusting the parent SD\'s stale "133" headline figure -- correcting the scope BEFORE a PRD was written, not after EXEC discovered the mismatch.',
    is_boilerplate: false,
  },
  {
    achievement: 'The 13 defective rows were classified into two distinct, named shapes (9 bare-string rows from a one-off script that bypassed the canonical builder; 4 genuine no-reason mints) before any write, so the repair script could apply the correct remediation to each shape rather than a single blanket fix.',
    is_boilerplate: false,
  },
  {
    achievement: 'The repair script (scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs) preserves each row\'s prior value under metadata.roadmap_link_exception_repair for audit, supports dry-run/--apply/--revert, and never fabricates a reason the original minter did not supply -- backfill reasons say so explicitly.',
    is_boilerplate: false,
  },
  {
    achievement: 'Idempotency was verified directly rather than assumed: re-running --apply immediately after the live repair found 0 remaining candidates.',
    is_boilerplate: false,
  },
  {
    achievement: 'New aggregation logic (countRoadmapLinkExceptionsByScope, classifyExceptionShape) delegates to the existing, already-tested countRoadmapLinkExceptions predicate instead of reimplementing the reason_supplied===true test a second time -- avoiding the exact reader/writer shape-drift class that produced the 9 bare-string rows in the first place.',
    is_boilerplate: false,
  },
  {
    achievement: 'The new CI predicate (scripts/ci/reasonless-roadmap-link-non-terminal.mjs) is deliberately scoped to non-terminal SDs only and asserts a LEVEL (non_terminal.without_reason===0), never a delta and never against the untouched historical corpus -- confirmed live by an independent TESTING sub-agent run (evidence 1703673c): status PASS, non_terminal.without_reason=0, all.without_reason unchanged at 135.',
    is_boilerplate: false,
  },
  {
    achievement: 'lib/priority/alignment.js\'s UNSCORED sentinel (never 0/null when an SD has no wave link) mirrors an existing precedent (wave-linkage-coverage.js\'s linkage rule) instead of inventing a new convention, giving sibling Child B\'s comparator an honest "not yet scored" signal distinct from a real zero.',
    is_boilerplate: false,
  },
  {
    achievement: '112 new/updated vitest tests across 7 files all pass, and both ESLint and the count-delta-gate lint are clean.',
    is_boilerplate: false,
  },
];

const what_needs_improvement = [
  'LEAD-TO-PLAN needed 3 attempts before acceptance: attempt 1 failed a preflight (SMOKE_TEST_MISSING, SUBAGENT_EVIDENCE_MISSING); attempt 2 failed GATE_MECHANISM_CLAIM_VERIFIER (the spine asserted a mechanism about lib/sourcing-engine/roadmap-link-exception.js with no named verifier -- "endorsement is not evidence"); attempt 3 passed at 95% only after mechanism_verifications explicitly cited the read file/line and reproduced the live count.',
  'PLAN-TO-EXEC needed 2 attempts: attempt 1 failed a SUBAGENT_EVIDENCE_MISSING preflight before the gate pipeline ran; attempt 2 passed at 96% once fresh sub-agent evidence existed for the PLAN phase.',
  'Both DESIGN sub-agent runs (15c40067, 7e2c8dbc) returned CONDITIONAL_PASS at only 60% confidence with an identical HIGH-severity warning: "scanned an unresolved or empty repo (repo_resolved=true, probe_exists=false)" -- an empty/misresolved tree can read as zero violations and pass as green, and this was never re-run to confirm the probe actually reached the real code.',
  'PR #8342\'s diff (928 additions / 11 deletions across 12 files) is well over both the ~100 LOC target and the 400 LOC soft-guideline, requiring an explicit four-piece justification for the advisory LOC gate rather than shipping as several smaller PRs.',
  'The measured coverage gap (only 3 of 47 non-terminal SDs reachable from roadmap_wave_items.promoted_to_sd_key directly) was named honestly but left unresolved -- closing it needs separate sourcing/PM-board plumbing not yet scheduled as a follow-up SD.',
  'PR #8342 was still OPEN (not merged to main) as of this retrospective -- the live repair and its CI predicate exist on the feature branch only until the PR merges.',
];

const action_items = [
  {
    owner: 'Sourcing/PM-board track',
    action: 'File a follow-up SD to close the measured wave-link reachability gap (only 3/47 non-terminal SDs reachable from roadmap_wave_items.promoted_to_sd_key directly) via the sourcing/PM-board plumbing this child explicitly left out of scope.',
    deadline: 'next sourcing/PM-board planning cycle',
    priority: 'medium',
    source: 'coverage_gap',
    smart_format: true,
    success_criteria: 'A new SD exists scoping the promoted_to_sd_key reachability gap, citing this SD\'s 3/47 measurement as its baseline.',
    verification_query: "SELECT id, sd_key, title FROM strategic_directives_v2 WHERE title ILIKE '%promoted_to_sd_key%' OR title ILIKE '%wave-link%reach%'",
    is_boilerplate: false,
  },
  {
    owner: 'DESIGN sub-agent owner',
    action: 'Investigate why both DESIGN runs on this SD (15c40067, 7e2c8dbc) reported repo_resolved=true but probe_exists=false, and confirm the scan actually reached the real target_application tree rather than an unresolved/empty one before trusting a CONDITIONAL_PASS at 60% confidence as sufficient.',
    deadline: 'before the next SD in this repo relies on a DESIGN CONDITIONAL_PASS as sufficient evidence',
    priority: 'medium',
    source: 'evidence_gap',
    smart_format: true,
    success_criteria: 'A re-run of DESIGN against this SD (or a documented RCA) shows probe_exists=true, or the warning is confirmed as a known-safe false positive.',
    verification_query: "SELECT id, verdict, confidence, warnings FROM sub_agent_execution_results WHERE sd_id='bcb68af5-caff-4bab-b02c-95e720f4baa2' AND sub_agent_code='DESIGN' ORDER BY created_at DESC",
    is_boilerplate: false,
  },
  {
    owner: 'EXEC / PR reviewer',
    action: 'Merge PR #8342 to main once EXEC-TO-PLAN and PLAN-TO-LEAD complete -- the live repair and CI predicate currently exist only on the feature branch.',
    deadline: 'immediately after PLAN-TO-LEAD acceptance',
    priority: 'high',
    source: 'type_specific_requirement',
    smart_format: true,
    success_criteria: 'PR #8342 shows state=MERGED with a merge commit on main.',
    verification_query: 'gh pr view 8342 --json state,mergedAt,mergeCommit',
    is_boilerplate: false,
  },
  {
    owner: 'Sourcing-engine writers (standing practice)',
    action: 'Any future one-off script that writes to metadata.roadmap_link_exception must go through buildRoadmapLinkException rather than hand-writing the field -- the exact bypass (.artifacts/michael-002-fences-20260905.mjs) that produced 9 of this SD\'s 13 defective rows.',
    deadline: 'standing practice, effective immediately',
    priority: 'medium',
    source: 'root_cause_prevention',
    smart_format: true,
    success_criteria: 'No new bare-string metadata.roadmap_link_exception row appears in a future countRoadmapLinkExceptions sweep.',
    verification_query: "node scripts/ci/reasonless-roadmap-link-non-terminal.mjs",
    is_boilerplate: false,
  },
];

const key_learnings = [
  {
    lesson: 'The parent SD\'s own cited defect count ("133 reasonless roadmap links") was stale and mis-scoped against the live fleet: the true live figure was 147/148 fleet-wide, but only 13 sat on the live non-terminal belt this child could safely touch -- LEAD caught this by re-measuring before writing the PRD, not by EXEC discovering the mismatch mid-implementation.',
    category: 'root-cause-verification',
    applicability: 'When a parent/orchestrator SD cites a specific defect count as a child\'s scope, re-measure that count against LIVE state before authoring the child PRD -- a stale headline number can drift far from the slice a child can safely and honestly repair.',
  },
  {
    lesson: '9 of 13 defective rows existed because a one-off script (.artifacts/michael-002-fences-20260905.mjs) wrote a bare string directly into metadata.roadmap_link_exception, bypassing the canonical buildRoadmapLinkException builder -- exactly the reader/writer shape-drift class this codebase\'s own gauge-registry.js shapeContract already predicts.',
    category: 'shape-contract-drift',
    applicability: 'A one-off/adhoc script that writes directly to a field a canonical builder owns is a recurring defect source, not a one-time event -- new derived readers (like this SD\'s classifyExceptionShape) are a cheap way to detect the drift after the fact, but the real fix is routing every writer through the builder.',
  },
  {
    lesson: 'Verifying idempotency by literally re-running --apply immediately after a live repair (and observing 0 remaining candidates) is a cheap, concrete self-check that a "should be idempotent" design claim rarely gets in practice.',
    category: 'verification-methodology',
    applicability: 'For any repair script applied against live production data, run it a second time immediately after the first live application and assert zero candidates remain -- do not rely on the script\'s design alone.',
  },
  {
    lesson: 'New derived aggregation functions (countRoadmapLinkExceptionsByScope, classifyExceptionShape) delegated to the existing, already-tested countRoadmapLinkExceptions predicate rather than reimplementing reason_supplied===true a second time -- avoiding a second, independently-drifting copy of the same test.',
    category: 'predicate-reuse',
    applicability: 'When adding a scoped or classified view of an existing count, delegate to the existing predicate function rather than re-deriving the same boolean test inline -- this is the direct prevention for the shape-drift class this SD itself repaired.',
  },
  {
    lesson: 'The UNSCORED string sentinel (never 0/null) for an SD with no wave link was reused from an existing precedent (wave-linkage-coverage.js\'s linkage rule) rather than invented fresh for lib/priority/alignment.js\'s new ALIGNMENT reader.',
    category: 'convention-reuse',
    applicability: 'Before inventing a new "no data" sentinel for a coverage/scoring reader, check whether a sibling module in the same codebase already established the convention -- reusing it keeps honest-reporting semantics consistent across comparators.',
  },
  {
    lesson: 'Both DESIGN sub-agent runs on this SD returned CONDITIONAL_PASS at only 60% confidence with an identical HIGH-severity warning that the scan may have hit an unresolved/empty repo (repo_resolved=true, probe_exists=false) -- neither run was re-verified before the LEAD-TO-PLAN handoff proceeded.',
    category: 'evidence-verification-gap',
    applicability: 'A CONDITIONAL_PASS carrying a HIGH-severity warning about the scan\'s own validity (not about the code it found) should be re-run or explicitly investigated before being counted as satisfying evidence, rather than accepted at face value because the verdict string says PASS.',
  },
];

const success_patterns = [
  'Re-measured the live state (147/148 fleet-wide, 13 on the live non-terminal belt) before scoping the repair, correcting the parent SD\'s stale "133" figure at LEAD time rather than at EXEC discovery time.',
  'Classified the 13 defective rows into two named shapes (9 bare-string, 4 genuine no-reason) before writing any repair code, so the fix addressed the actual root causes rather than a single blanket remediation.',
  'Built dry-run/--apply/--revert into the repair script from the start and verified idempotency by literally re-running --apply and observing 0 remaining candidates.',
  'Preserved every row\'s prior value under metadata.roadmap_link_exception_repair for audit and never fabricated a reason the original minter did not supply.',
  'New aggregation/classification functions delegated to the existing tested predicate instead of reimplementing it, and the new UNSCORED sentinel reused an existing sibling convention instead of inventing one.',
  'Named a real, measured coverage gap (3/47 non-terminal SDs reachable from promoted_to_sd_key) honestly as out of scope, rather than fabricating full coverage or silently dropping the finding.',
];

const failure_patterns = [
  '9 of 13 defective rows trace to a one-off script (.artifacts/michael-002-fences-20260905.mjs) that bypassed the canonical buildRoadmapLinkException builder and wrote a bare string directly into metadata.roadmap_link_exception.',
  'LEAD-TO-PLAN required 3 attempts: a preflight failure (SMOKE_TEST_MISSING, SUBAGENT_EVIDENCE_MISSING), then a MECHANISM_CLAIM_UNVERIFIED rejection (an asserted mechanism about roadmap-link-exception.js with no named verifier), before acceptance at 95%.',
  'PLAN-TO-EXEC required 2 attempts, the first rejected on a SUBAGENT_EVIDENCE_MISSING preflight before the gate pipeline itself ran.',
  'Both DESIGN sub-agent runs returned CONDITIONAL_PASS at 60% confidence carrying an unresolved/empty-repo warning that was never independently re-verified.',
];

const improvement_areas = [
  {
    area: 'The parent SD cited a stale, mis-scoped defect count ("133 reasonless roadmap links") that this child had to independently re-measure before it could safely scope a repair.',
    root_cause_analysis: {
      why_1: 'The child\'s PRD could not simply inherit the parent\'s cited count.',
      why_2: 'The parent\'s "133" figure did not match the live fleet-wide count (147, drifting to 148 mid-investigation).',
      why_3: 'The parent SD\'s figure appears to have been measured at an earlier point in time and never re-verified against current live state before being cited as this child\'s scope.',
      root_cause: 'Cross-SD scope inheritance (a parent citing a specific count for a child to fix) has no built-in freshness check against live state at child-authoring time.',
      contributing_factors: ['Fleet-wide counts drift continuously as new SDs mint roadmap-link exceptions', 'No automated cross-reference between a parent SD\'s cited figures and current live measurements'],
    },
    preventive_measures: ['Any child SD inheriting a specific defect count from a parent should re-measure that count against live state as an explicit LEAD-phase step before PRD authoring, exactly as this child did.'],
    systemic_issue: true,
  },
  {
    area: '9 of 13 defective rows existed because a one-off script bypassed the canonical builder and wrote a bare string directly into a field the builder owns.',
    root_cause_analysis: {
      why_1: 'countRoadmapLinkExceptions found rows where reason_supplied!==true despite the row apparently carrying a real reason.',
      why_2: 'The reason was stored as a bare string, not the {sd_key, operator_reason, reason_supplied, recorded_at} shape buildRoadmapLinkException emits.',
      why_3: 'A one-off script (.artifacts/michael-002-fences-20260905.mjs) wrote metadata.roadmap_link_exception directly instead of calling the builder.',
      root_cause: 'No enforcement (lint, CI, or write-path guard) prevents an ad-hoc script from writing directly to a field a canonical builder owns.',
      contributing_factors: ['One-off scripts under .artifacts/ are not subject to the same review/lint bar as scripts/ or lib/ code', 'The shape mismatch was invisible until a predicate function was written specifically to detect it'],
    },
    preventive_measures: ['Route every future writer of metadata.roadmap_link_exception through buildRoadmapLinkException, and consider a lightweight CI/lint check that flags direct writes to that field from outside the builder.'],
    systemic_issue: true,
  },
  {
    area: 'Both DESIGN sub-agent runs on this SD returned CONDITIONAL_PASS at 60% confidence carrying an identical HIGH-severity warning about the scan possibly hitting an unresolved/empty repo, and neither run was re-verified.',
    root_cause_analysis: {
      why_1: 'DESIGN\'s own metadata reported repo_resolved=true but probe_exists=false on both runs.',
      why_2: 'An unresolved or empty scan target yields zero violations, which can read identically to "no violations found" on a correctly-resolved repo.',
      why_3: 'The handoff pipeline accepted the CONDITIONAL_PASS verdict without a downstream check distinguishing "clean scan" from "scan of nothing".',
      root_cause: 'DESIGN\'s own self-reported probe_exists=false signal is surfaced as a warning but not (yet) wired into a blocking or re-verification step.',
      contributing_factors: ['CONDITIONAL_PASS is in the gate\'s ACCEPT_VERDICTS set regardless of the specific warning content'],
    },
    preventive_measures: ['When DESIGN (or any sub-agent) self-reports probe_exists=false in its own warning, treat that as a signal to re-run against a confirmed-correct target_application before accepting the verdict at face value.'],
    systemic_issue: false,
  },
];

const unnecessary_work_identified = [
  {
    item: 'A new coverage gauge for wave-link/roadmap alignment.',
    reason: 'LEAD\'s deletion_audit found existing tools already covered this: computeWaveLinkageCoverage, gauge-registry\'s plan-drift-coverage, and computePlanAdherence already surface coverage -- only a non-terminal split of the exception counter and a strict promoted_to_sd_key-only figure were actually missing, and both were delivered additively instead.',
    confirmed_against: "SD metadata.lead_validation.deletion_audit: 'CUT: a NEW coverage gauge ... only a non-terminal split of the exception counter and a strict promoted_to_sd_key-only figure are missing'",
  },
  {
    item: 'A new GitHub Actions workflow for the CI predicate.',
    reason: 'An existing scripts/ci predicate convention (mirroring chairman-awareness-live-owner-count.mjs) already covers this need without a new workflow file.',
    confirmed_against: "SD metadata.lead_validation.deletion_audit: 'any new GitHub workflow (CI assertion lands as a scripts/ci predicate script per the chairman-awareness-live-owner-count.mjs convention)'",
  },
  {
    item: 'Raising coverage, populating adam_task_ledger, and wiring the Child B/C comparator itself inside this SD.',
    reason: 'Those are separate, larger efforts explicitly assigned to sibling children (Child B\'s comparator consumes this SD\'s new ALIGNMENT reader) or out-of-scope tracks, not this SD\'s 35%-scope-reduced repair mandate.',
    confirmed_against: 'SD metadata.lead_validation.deletion_audit and scope_reduction_percentage=35',
  },
];

const protocol_improvements = [
  'A DESIGN sub-agent run self-reporting probe_exists=false in its own warning metadata should be either blocked or automatically re-run against a confirmed target_application, rather than left as an advisory warning inside an accepted CONDITIONAL_PASS.',
  'When a parent/orchestrator SD cites a specific defect count for a child to fix, the child\'s LEAD-phase gate could surface an explicit prompt to re-measure that count against live state, rather than relying on the individual worker to think to do so (as happened here).',
];

const verbatim_citations = [
  {
    quote: 'MECHANISM_CLAIM_UNVERIFIED: the spine asserts a mechanism about lib/sourcing-engine/roadmap-link-exception.js with no named verifier. Endorsement is not evidence.',
    source: 'sd_phase_handoffs 8368e11b-553a-4db7-ac13-92044354d7e6 (LEAD-TO-PLAN attempt 2, rejected)',
  },
  {
    quote: 'countRoadmapLinkExceptions :95-107 tests ex.reason_supplied === true strictly; buildRoadmapLinkException :67-90 emits {sd_key,operator_reason,reason_supplied,recorded_at}. Read in full this session; live count reproduced (13 non-terminal without_reason, 9 of them bare-string shape from .artifacts/michael-002-fences-20260905.mjs:30).',
    source: 'strategic_directives_v2.metadata.mechanism_verifications (this SD, LEAD 2026-09-06)',
  },
  {
    quote: '112 vitest tests across 7 files pass: roadmap-link-exception-scope, roadmap-link-exception (pre-existing), repair-reasonless-roadmap-links, ci/reasonless-roadmap-link-non-terminal, priority/alignment, adam-coordinator-health, wave-linkage-coverage (pre-existing, untouched).',
    source: 'sub_agent_execution_results 1703673c-56bd-4bb8-ac9c-24e9b9405326 (TESTING, EXEC phase)',
  },
  {
    quote: 'Sub-agent scanned an unresolved or empty repo (repo_resolved=true, probe_exists=false)',
    source: 'sub_agent_execution_results 7e2c8dbc-21e8-43db-9f42-e3306b21a057 (DESIGN, PLAN_PRD phase) warnings',
  },
  {
    quote: 'Backfilling the 4 canonical no-reason rows must not fabricate: operator_reason will be an explicit backfill string naming this SD and the plan_linkage bucket. Repair must be idempotent and preserve the original recorded_at where a string shape carries none (fall back to SD created_at).',
    source: 'strategic_directives_v2.metadata.lead_validation.risks (this SD)',
  },
];

const coverage_analysis = {
  live_repair: 'non_terminal.without_reason 13 -> 0 (LEAD measured 13; EXEC applied and verified idempotent via a second --apply finding 0 candidates); all.without_reason unchanged at 135 (historical corpus deliberately untouched, per FR-6).',
  ci_predicate_live_output: 'status PASS, non_terminal={total:25, with_reason:25, without_reason:0}, all={total:499, with_reason:364, without_reason:135} (evidence 1703673c, evaluated commit 9126e8903f2).',
  test_suite: '112/112 vitest tests pass across 7 files (roadmap-link-exception-scope, roadmap-link-exception, repair-reasonless-roadmap-links, ci/reasonless-roadmap-link-non-terminal, priority/alignment, adam-coordinator-health, wave-linkage-coverage); ESLint and count-delta-gate lint both clean.',
  wave_link_reachability_gap: 'Only 3 of 47 non-terminal SDs are reachable from roadmap_wave_items.promoted_to_sd_key directly -- measured and named as explicitly out of scope for this SD, requiring separate sourcing/PM-board plumbing.',
  gate_score_progression: 'LEAD-TO-PLAN: SMOKE_TEST_MISSING+SUBAGENT_EVIDENCE_MISSING (preflight reject) -> MECHANISM_CLAIM_UNVERIFIED (reject) -> 95% (accepted). PLAN-TO-EXEC: SUBAGENT_EVIDENCE_MISSING (preflight reject) -> 96% (accepted).',
};

const future_enhancements = [
  'Sourcing/PM-board track: close the wave-link reachability gap (3/47 non-terminal SDs reachable from promoted_to_sd_key directly) via dedicated sourcing/PM-board plumbing -- this SD only measured and named the gap.',
  'Sourcing-engine track: consider a lint/CI guard against direct writes to metadata.roadmap_link_exception from outside buildRoadmapLinkException, to prevent recurrence of the 9-row bare-string defect class this SD repaired.',
  'DESIGN sub-agent owner: investigate the repo_resolved=true/probe_exists=false warning pattern observed on both of this SD\'s DESIGN runs.',
];

const metadata = {
  sd_key: SD_KEY,
  pr: {
    number: 8342,
    url: 'https://github.com/rickfelix/EHG_Engineer/pull/8342',
    title: 'Child D: repair reasonless roadmap-link rows, non-terminal CI predicate, honest alignment coverage',
    state: 'OPEN',
    additions: 928,
    deletions: 11,
    changed_files: 12,
    commit: 'cee12b464acf4493289ca08d1aa408a5efb00405',
  },
  key_sub_agent_evidence_ids: {
    lead_validation: '2b888be9-4935-4b90-8332-bfa2ec3cdb09',
    lead_explore: 'b6ae5eea-4efc-436b-bb7e-3bb99df17c32',
    design_first: '15c40067-947a-4f48-9543-345336793ca0',
    design_second: '7e2c8dbc-21e8-43db-9f42-e3306b21a057',
    exec_testing: '1703673c-56bd-4bb8-ac9c-24e9b9405326',
  },
  lead_to_plan_handoff_attempts: [
    { id: 'b4f65848-63c0-4df5-92d0-06305d7ea2b4', status: 'rejected', reason: 'SMOKE_TEST_MISSING, SUBAGENT_EVIDENCE_MISSING (preflight)' },
    { id: '8368e11b-553a-4db7-ac13-92044354d7e6', status: 'rejected', reason: 'GATE_MECHANISM_CLAIM_VERIFIER: MECHANISM_CLAIM_UNVERIFIED' },
    { id: 'e7beea3f-c28c-4dde-b405-4724e2e59246', status: 'accepted', score: 95 },
  ],
  plan_to_exec_handoff_attempts: [
    { id: 'e6441427-e998-456a-afb2-5e2cd84467e6', status: 'rejected', reason: 'SUBAGENT_EVIDENCE_MISSING (preflight)' },
    { id: 'fd2b8528-31a2-4efc-95f0-57b002bf374e', status: 'accepted', score: 96 },
  ],
  rows_repaired: 13,
  defect_shapes: { bare_string: 9, no_reason_marker: 4 },
  wave_link_reachability: { reachable: 3, total_non_terminal: 47 },
  scope_reduction_percentage: 35,
};

async function main() {
  const { data: existing, error: fetchErr } = await supabase
    .from('retrospectives')
    .select('id, sd_id, retro_type, status, retrospective_type')
    .eq('id', RETRO_ID)
    .single();

  if (fetchErr || !existing) {
    console.error('Could not find the generated retrospective row to enhance:', fetchErr);
    process.exit(1);
  }
  if (existing.sd_id !== SD_UUID || existing.retro_type !== 'SD_COMPLETION') {
    console.error('Row identity mismatch -- refusing to overwrite an unrelated row.', existing);
    process.exit(1);
  }

  const update = {
    title: `${SD_KEY} Completion Retrospective: 13 live reasonless roadmap-link rows repaired idempotently, a stale "133" headline corrected to a measured 13, and an honest UNSCORED sentinel for wave-link coverage`,
    description,
    period_start: '2026-09-06T10:14:46.500Z',
    period_end: '2026-09-06T11:53:00.000Z',
    conducted_date: new Date().toISOString(),
    sub_agents_involved: ['VALIDATION', 'Explore', 'DESIGN', 'RISK', 'DATABASE', 'STORIES', 'TESTING', 'RETRO'],
    what_went_well,
    what_needs_improvement,
    action_items,
    key_learnings,
    quality_score: 78,
    team_satisfaction: 8,
    business_value_delivered: 'Repaired all 13 live non-terminal roadmap-link rows carrying a reasonless or malformed exception, closing the gap the parent SD flagged with an honest, re-measured scope rather than the parent\'s stale "133" figure. Delivered a non-terminal-scoped CI predicate that will catch regressions going forward, and a new ALIGNMENT reader (with an honest UNSCORED sentinel) that unblocks sibling Child B\'s wave-link comparator.',
    customer_impact: 'Internal harness/fleet-governance correctness (roadmap-link exception auditability and CI regression coverage), not an external-facing surface.',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 2,
    bugs_resolved: 2,
    tests_added: 112,
    performance_impact: 'No measurable runtime change; the repair script and CI predicate are one-off/CI-invoked tools, not hot-path code.',
    objectives_met: true,
    within_scope: true,
    success_patterns,
    failure_patterns,
    improvement_areas,
    generated_by: 'MANUAL',
    learning_category: 'APPLICATION_ISSUE',
    applies_to_all_apps: false,
    related_files: [
      'scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs',
      'lib/sourcing-engine/roadmap-link-exception.js',
      'scripts/ci/reasonless-roadmap-link-non-terminal.mjs',
      'lib/priority/alignment.js',
      'scripts/adam-coordinator-health.mjs',
      'lib/governance/gauge-registry.js',
      'tests/unit/sourcing-engine/repair-reasonless-roadmap-links.test.js',
      'tests/unit/sourcing-engine/roadmap-link-exception-scope.test.js',
      'tests/unit/ci/reasonless-roadmap-link-non-terminal.test.js',
      'tests/unit/priority/alignment.test.js',
      'tests/unit/adam/adam-coordinator-health.test.js',
    ],
    related_commits: ['cee12b464acf4493289ca08d1aa408a5efb00405'],
    related_prs: ['https://github.com/rickfelix/EHG_Engineer/pull/8342'],
    affected_components: [
      'buildRoadmapLinkException',
      'countRoadmapLinkExceptions',
      'roadmap-link exception repair tooling',
      'CI predicate (reasonless-roadmap-link-non-terminal)',
      'priority/alignment ALIGNMENT reader',
      'adam-coordinator-health computePlanAdherence',
    ],
    tags: ['roadmap-link-exception', 'ci-predicate', 'idempotent-repair', 'honest-reporting', 'wave-link-alignment', 'sourcing-engine'],
    unnecessary_work_identified,
    protocol_improvements,
    retrospective_type: null,
    verbatim_citations,
    coverage_analysis,
    test_total_count: 112,
    test_passed_count: 112,
    test_failed_count: 0,
    test_skipped_count: 0,
    test_pass_rate: 100,
    test_verdict: 'PASS',
    metadata,
    future_enhancements,
    quality_issues: [],
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateErr } = await supabase
    .from('retrospectives')
    .update(update)
    .eq('id', RETRO_ID)
    .select()
    .single();

  if (updateErr) {
    console.error('Update failed:', updateErr);
    process.exit(1);
  }

  console.log('Retrospective enhanced.');
  console.log('id:', updated.id);
  console.log('sd_id:', updated.sd_id);
  console.log('retro_type:', updated.retro_type);
  console.log('status:', updated.status);
  console.log('quality_score:', updated.quality_score);
  console.log('title:', updated.title);
  console.log('what_went_well:', updated.what_went_well.length);
  console.log('what_needs_improvement:', updated.what_needs_improvement.length);
  console.log('key_learnings:', updated.key_learnings.length);
  console.log('action_items:', updated.action_items.length);
  console.log('success_patterns:', updated.success_patterns.length);
  console.log('failure_patterns:', updated.failure_patterns.length);
  console.log('improvement_areas:', updated.improvement_areas.length);
}

main();
