#!/usr/bin/env node
/**
 * One-off: Write Explore sub-agent LEAD-TO-PLAN evidence for
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E ("Measurements carry no
 * provenance - pin perishability to the existing premise-liveness path").
 *
 * The Explore sub-agent is a READ-ONLY search agent (no Write tool), so it
 * cannot persist its own evidence row. Its findings were produced in this
 * session and are recorded here verbatim via the canonical repo-evidence
 * pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict) + the
 * canonical storage path (lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults), per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'e74cd20f-02b7-4142-aee7-e443421efb7d';
const SD_KEY = 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E';

const findings = [
  {
    id: 'E1-adapter-working-shape',
    severity: 'INFO',
    summary: 'lib/eva/feedback-premise-adapter.js: extractReferencedFiles (18-25) pulls up to 5 file-path tokens from free text; feedbackToPremiseDescriptor (31-61) shapes a feedback row into the descriptor, reading title/description (joined into premise_text), severity/priority, id -> feedback_id, category (display-only, NOT identity per QF-20260703-428), deriving cluster_reason from title.slice(0,80) as the IDENTITY KEY, referenced_files, and identifiers; extractWorkIdentifiers (67-76) regexes verbatim QF-/SD- tokens (cap 5) as extra exact lookup keys, never identity; checkFeedbackPremiseLiveness (83-85) is a thin wrapper calling checkPremiseLiveness(descriptor, deps) with deps {supabase, git, recentDays, completedDays, recentThreshold, nowMs}; logForceLivenessOverride (95-105) writes a non-fatal audit_log row for the --force-liveness bypass. gate_name is always null for feedback-sourced descriptors.'
  },
  {
    id: 'E2-verdict-logic-reads-no-timestamp',
    severity: 'WARNING',
    summary: 'checkPremiseLiveness (lib/eva/premise-liveness.js:221-308) keys on gate_name || cluster_reason (premiseToken, 50-52); a missing token always yields LIVE (228-244). Verdict combines recentRecount() counting sd_phase_handoffs rejections in the last recentDays (90-109) and findShippedFix() doing a completed-SD ilike lookup (137-157), an exact SD-key lookup via descriptor.identifiers (165-184), and git log --since on referenced_files / --grep on the token (189-209). STALE/ARCHIVE only when recentCount===0 AND a fix was found AND the lookup was NOT indeterminate (264-281); indeterminate downgrades to LIVE/HOLD_FOR_REVIEW (264-271); recount >= threshold(3) => LIVE/PROCEED (284-291); otherwise LIVE/HOLD_FOR_REVIEW (293-299); any throw fails OPEN to LIVE (300-307). NO timestamp/measured_at/git-ref concept exists in this module today - it is a point-in-time check, not a stamped one. Corroborates the VALIDATION agent finding F2 independently.'
  },
  {
    id: 'E3-all-production-call-sites',
    severity: 'INFO',
    summary: 'checkFeedbackPremiseLiveness production call sites (all pass {supabase}, all fail-open): scripts/create-quick-fix.js:246 (--feedback-id promotion, surrounding gate 236-261, import at :30); lib/sd-creation/source-adapters/feedback.js:69 (createFromFeedback / --from-feedback path, 66-82, import at :10); lib/sourcing-engine/refill-auto-promote.js:261 (promoteStagedCandidate, only when source_type===feedback && source_id, 251-270, import at :22). No production code calls checkPremiseLiveness directly for feedback rows - the adapter is the SOLE route in, so there is no bypass to also instrument. Test-only references: tests/unit/feedback/create-quick-fix-liveness-gate.test.js, tests/unit/leo-create-sd-feedback-liveness.test.js, tests/unit/one-off/s1-backlog-sweep.test.js, tests/unit/eva/feedback-premise-adapter*.test.js, tests/unit/sd-creation/plan-linkage-adapter-wiring.test.js, tests/unit/sd-creation/feedback-adapter-untrusted-origin.test.js, tests/unit/sourcing-engine/refill-auto-promote-liveness.test.js.'
  },
  {
    id: 'E4-record-time-write-paths',
    severity: 'WARNING',
    summary: 'CANONICAL writer lib/governance/emit-feedback.js (@canonical-writer-for: feedback): emitFeedback (163-294) / emitFeedbackBatch (351-446) build rows via _buildRowObject (103-135), stamping metadata.emitted_at (123) and a dedup_hash (250-253) - NO measured_at, git ref, or timezone today. Real callers: scripts/log-harness-bug.js:112 and lib/eva/lifecycle-sd-bridge.js. DIRECT-INSERT paths bypassing it: lib/coordinator/signal-router.cjs insertFeedbackRow (130-169, insert 139-166) - the promotion point from aggregated worker signals written by scripts/worker-signal.cjs via insertCoordinationRow (lib/coordinator/dispatch.cjs); lib/factory/feedback-writer.js writeErrors (52-71, sets sentry_first_seen only); lib/feedback-capture.js (row built 178-217, inserts at 224-226 and 246-248) which already self-stamps created_at (215), updated_at (216) and metadata.captured_at (205) as explicit-Z ISO strings - the closest existing precedent; lib/eva/corrective-finding-recorder.js recordCorrectiveFinding (row 87-113, insert 115-119); scripts/pattern-alert-sd-creator.js:538.'
  },
  {
    id: 'E5-feedback-table-columns-no-provenance-but-metadata-jsonb-exists',
    severity: 'INFO',
    summary: 'Authoritative generated schema: docs/reference/schema/engineer/tables/feedback.md (2026-07-04 snapshot, 64 columns, 5584 rows). Base CREATE TABLE at database/migrations/391_quality_lifecycle_schema.sql:11-74, extended by 392_quality_lifecycle_fixes.sql, 20260131_feedback_resolution_enforcement.sql, 20260207_add_quality_scoring_columns_to_feedback.sql, 20260207_feedback_llm_triage_columns.sql, 20260223_feedback_metadata_column.sql, 20260401_software_factory_guardrails.sql, 20260504_feedback_corrective_columns.sql, 20260515211625_add_provenance_source.sql. Timestamp-shaped columns that EXIST (all timestamptz, all LIFECYCLE not measurement-provenance): created_at DEFAULT now(), updated_at, resolved_at, first_seen, last_seen, sentry_first_seen, converted_at, triaged_at, snoozed_until, promoted_at, cluster_processed_at. Provenance-adjacent: provenance_source text (format agent:SEAT:ROUND_ID | human:USER_ID, nullable, no CHECK, added by SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F for AUTHORSHIP attribution, NOT measurement timing) and metadata jsonb DEFAULT {} (added 20260223, already the ad-hoc bag for emitted_at/captured_at/dedup_hash). CONFIRMED ABSENT: measured_at, git_ref/git_sha/commit_sha, explicit timezone column. created_at conflates "when inserted" with "when measured" today.'
  },
  {
    id: 'E6-reusable-helpers-and-the-missing-git-sha-helper',
    severity: 'INFO',
    summary: 'REUSE: buildProvenancedStamp(callerStamp, writingSessionId) at lib/governance/hold-state-contract.js:84-93 spreads caller payload first then stamps stamped_by_session LAST (tamper-evident ordering, PAT-PROVENANCE-SPOOF-VIA-SPREAD-ORDER-001); companions validateHoldStamp/checkHoldStamp (37-73), mode via readHoldStateMode (27-30, default observe). Consumed by lib/sd-park.js, scripts/defer-quick-fix.js, lib/fleet/exec-boundary-hold-writer.js - the established stamp-discipline pattern. NAIVE-TIMESTAMP-TO-UTC helper is already reimplemented 3+ times and must NOT be written a 4th: scripts/modules/handoff/retro-filters.js:42-51 (exported parseAsUTC), lib/handoff/wait-verdict.js:164-171 (local unexported parseAsUTC), scripts/hooks/stop-subagent-enforcement/time-utils.js:18-41 (exported normalizeToUTC); commit 4fcd2bad594 set the precedent of REUSING retro-filters.js parseAsUTC. NO canonical getCurrentGitSha()/getCurrentGitRef() helper exists anywhere - lib/eva/premise-liveness.js:35-41 has a local best-effort defaultGit(argsString) execSync wrapper (returns empty string on failure) used only for git log queries; lib/session-identity-sot.js:490 shells git rev-parse --show-toplevel for worktree root only; scripts/log-harness-bug.js:33-69 shells git log origin/main -n 1 --format=%h|%cI|%s for an advisory prior-fix hint. Capturing "the sha this measurement was taken from" is the one genuinely NET-NEW piece this SD introduces.'
  },
  {
    id: 'E7-four-hour-shift-bug-class-is-real-and-recurring',
    severity: 'WARNING',
    summary: 'The AC-3 failure mode is a documented recurring bug class in this repo (US Eastern offset ~4-5h), caused by timestamp-without-time-zone columns returning naive strings from PostgREST which bare new Date() parses as LOCAL. Prior independent fixes: scripts/modules/handoff/retro-filters.js:24-51 (doc names sd_phase_handoffs.accepted_at explicitly; naive string passed to .gt(created_at) is cast using the DB session TimeZone, shifting the freshness boundary; consumed at resolveLeadToPlanAcceptedAt 86-104); lib/handoff/wait-verdict.js:156-171; scripts/hooks/stop-subagent-enforcement/time-utils.js:1-41 (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-M). Commits: 4fcd2bad594 (2026-07-20, approvalTimeValid flipped on any non-UTC-negative-offset machine), c3c2fe144a8, 7f2b9442ac8. IMPORTANT NEGATIVE RESULT: none of the feedback-table write paths in E4 exhibit this bug TODAY - they all use the now() DB default or new Date().toISOString() (always Z). So AC-3 is a PREVENTION requirement, not a repair of a live defect: any new measured_at must be timestamptz (never naive timestamp), or every read-side comparison must route through the existing parseAsUTC/normalizeToUTC helpers.'
  }
];

const warnings = [
  'No canonical getCurrentGitSha()/getCurrentGitRef() helper exists in the repo - the git-ref half of the provenance stamp is genuinely net-new code. Model it on lib/eva/premise-liveness.js:35-41 defaultGit() (injectable dep, execSync, best-effort/non-fatal) rather than inventing a new git-shelling convention.',
  'parseAsUTC/normalizeToUTC already exists in THREE places (retro-filters.js:42-51, wait-verdict.js:164-171, time-utils.js:18-41). Any AC-3 work must reuse one of these, not add a fourth copy.',
  'AC-3 is a PREVENTION requirement, not a live-defect repair: no current feedback write path has the four-hour-shift bug (all use now() or toISOString()). PLAN should frame AC-3 as "the new measured_at must be timestamptz / explicit-offset so the documented bug class cannot reach it", not as fixing an existing break.',
  'lib/coordinator/signal-router.cjs insertFeedbackRow (130-169) is the promotion point where WORKER SIGNALS become feedback rows - it bypasses the canonical emit-feedback.js writer entirely. If PLAN wants provenance on measurements that originate from worker signals (the exact incident class in the SD narrative), this writer, not emit-feedback.js, is the one that carries them.'
];

const recommendations = [
  'PLAN: note that the adapter is the SOLE production route into checkPremiseLiveness for feedback rows (3 call sites, no direct-call bypass), so instrumenting the adapter layer reaches 100% of feedback liveness checks without a sweep.',
  'PLAN: store provenance in feedback.metadata jsonb (added by migration 20260223) - no new column, no new table, and it is the established convention on this table (metadata.emitted_at, metadata.captured_at, metadata.dedup_hash already live there).',
  'PLAN: do NOT confuse the existing provenance_source column with measurement provenance - it encodes AUTHORSHIP (agent:SEAT:ROUND_ID | human:USER_ID) per SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F, not when/where a measurement was taken.',
  'PLAN: decide explicitly whether the reference writer is lib/governance/emit-feedback.js (nominally canonical, 2 callers) or lib/coordinator/signal-router.cjs (the path the SD narrative incident actually travelled - worker signal -> feedback row). The narrative argues for signal-router.cjs; the canonical-writer intent argues for emit-feedback.js.',
  'EXEC: reuse buildProvenancedStamp spread-then-stamp-last ordering (lib/governance/hold-state-contract.js:84-93) so a caller cannot spoof its own provenance by overriding the stamped fields.'
];

const summary = 'Explore READ-ONLY codebase survey for SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E LEAD-TO-PLAN. Mapped the adapter working shape (feedback-premise-adapter.js:18-105), the full verdict logic (premise-liveness.js:221-308), all 3 production call sites of checkFeedbackPremiseLiveness (create-quick-fix.js:246, sd-creation/source-adapters/feedback.js:69, sourcing-engine/refill-auto-promote.js:261) and confirmed the adapter is the SOLE route in with no direct-call bypass. Independently corroborated that the liveness verdict reads NO timestamp/ref off the descriptor - it is derived from live re-queries at call time - so provenance stamping and staleness detection are orthogonal. Enumerated the record-time write paths: one nominally-canonical writer (lib/governance/emit-feedback.js, only 2 real callers) plus at least 5 direct-insert bypass paths, of which lib/coordinator/signal-router.cjs insertFeedbackRow (130-169) is the one the SD narrative incident actually travelled (worker signal -> feedback row). Confirmed against the generated schema + migrations that the feedback table has NO measured_at/git_ref/timezone columns, that provenance_source encodes AUTHORSHIP not measurement timing, and that metadata jsonb already exists and is the established ad-hoc stamping bag - so no new column and no new table are required. Identified reusable helpers (buildProvenancedStamp tamper-evident ordering; parseAsUTC/normalizeToUTC already triplicated - do not write a fourth) and the one genuinely net-new piece (no canonical getCurrentGitSha helper exists). Documented the four-hour-shift bug class with 3 prior fixes and 3 commits, and recorded the NEGATIVE RESULT that no current feedback write path exhibits it - making AC-3 a prevention requirement rather than a repair.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 88,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001',
      mode: 'read-only codebase survey (no design, no code)',
      adapter: 'lib/eva/feedback-premise-adapter.js:18-105',
      verdict_logic: 'lib/eva/premise-liveness.js:221-308 (reads no timestamp/ref)',
      production_call_sites: [
        'scripts/create-quick-fix.js:246',
        'lib/sd-creation/source-adapters/feedback.js:69',
        'lib/sourcing-engine/refill-auto-promote.js:261'
      ],
      sole_route_in: true,
      record_time_writers: {
        canonical_but_underused: 'lib/governance/emit-feedback.js (2 real callers)',
        narrative_incident_path: 'lib/coordinator/signal-router.cjs insertFeedbackRow:130-169',
        other_direct_inserts: [
          'lib/factory/feedback-writer.js:52-71',
          'lib/feedback-capture.js:224-226,246-248',
          'lib/eva/corrective-finding-recorder.js:115-119',
          'scripts/pattern-alert-sd-creator.js:538'
        ]
      },
      feedback_table: {
        measured_at: 'ABSENT',
        git_ref_or_sha: 'ABSENT',
        timezone_column: 'ABSENT',
        provenance_source: 'EXISTS but encodes AUTHORSHIP, not measurement timing',
        metadata_jsonb: 'EXISTS (migration 20260223) - sufficient, no new column/table required'
      },
      reusable_helpers: {
        stamp_ordering: 'lib/governance/hold-state-contract.js:84-93 buildProvenancedStamp',
        utc_parse: 'retro-filters.js:42-51 / wait-verdict.js:164-171 / time-utils.js:18-41 (already 3x - reuse)',
        git_sha_capture: 'NONE EXISTS - genuinely net-new for this SD'
      },
      ac3_status: 'PREVENTION requirement - no current feedback write path exhibits the four-hour-shift bug'
    },
    phase: 'LEAD-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_ID,
    { name: 'Explore (read-only codebase survey agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
