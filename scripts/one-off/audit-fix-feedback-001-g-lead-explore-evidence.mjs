#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed before LEAD's scope correction was written:
 * re-reading all 5 named call sites against current main, reading the newly-applied
 * 20260912_feedback_no_update_lifecycle_allowlist.sql migration in full to determine its exact
 * column census, and tracing scripts/adversarial-verification-sweep.mjs's writeLedger() to find
 * that its "verdictOnly" denylist still leaks 6 content columns through.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G';

const findings = [
  {
    id: 'migration-applied-narrows-trigger-to-content-columns',
    severity: 'INFO',
    summary: 'database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql (chairman decision ba4055b7 option A) was APPLIED 2026-09-12T10:53:36Z, read in full. It replaces feedback_no_update with a WHEN-clause trigger that only fires when a CONTENT column changes (title, description, category, type, source_application, source_type, error_message, etc. -- full list in the file); lifecycle columns (status, metadata, updated_at, resolved_at, promoted_to_sd_id, etc.) are unconditionally UPDATE-able again. ENABLE ALWAYS was re-asserted (tgenabled=\'A\', replica-safe). The file\'s own DO $verify$ block proves: content UPDATE rejected, lifecycle-only UPDATE accepted, mixed UPDATE rejected.',
  },
  {
    id: 'four-of-five-sites-already-fixed-by-migration-no-code-change-needed',
    severity: 'INFO',
    summary: 'Read all 5 named call sites directly against current main and checked their written columns against the migration\'s WHEN-clause census: scripts/corrective-triage.mjs promote (:132-139, writes status/promoted_to_sd_id/promoted_at/promoted_by) and dismiss (:157-165, writes status/resolution_type/resolution_notes/resolved_at); scripts/clockwork/prod-error-sweep-loop.cjs markBridgeNeedsEscalation (:250-257, writes metadata only); lib/uat/risk-router.js (:487-499, writes metadata+updated_at); lib/eva/event-bus/handlers/feedback-quality-updated.js (:58-61, writes metadata+updated_at). All four write ONLY lifecycle columns per the migration\'s census -- these are already unblocked with no code change required, per direct file read (not grep-only).',
  },
  {
    id: 'fifth-site-adversarial-sweep-still-broken-denylist-leaks-content-columns',
    severity: 'HIGH',
    summary: 'scripts/adversarial-verification-sweep.mjs writeLedger() (:434-476) builds a ledger row via buildLedgerRow() (:406-429) with fields {category, type, source_application, source_type, title, description, status, severity, updated_at, metadata}. The re-run UPDATE path (:471) does `const { status: _s, severity: _sev, ...verdictOnly } = row` -- a two-field DENYLIST, not an allowlist. verdictOnly therefore still includes category/type/source_application/source_type (constants, never distinct across writes for this ledger, so harmless in practice) PLUS title and description, which are NOT constant: title=`${workKey}: ${disposition}` and description embeds evidenceSummary, both derived from disposition. A genuine verdict change (the entire reason writeLedger exists) changes title/description, which are guarded content columns -- the trigger fires and feedback_freeze() rejects the UPDATE. This is NOT fixed by the migration; it needs an explicit code change (invert to an allowlist of {updated_at, metadata}).',
  },
  {
    id: 'live-metadata-race-reactivated-by-the-migration',
    severity: 'HIGH',
    summary: 'lib/uat/risk-router.js:487-499 (fires on every P0+HIGH-risk feedback insert) and lib/eva/event-bus/handlers/feedback-quality-updated.js:33-69 (fires on every feedback-capture.js insert via a fire-and-forget vision event, never awaited by the caller) both read-modify-write the SAME feedback.metadata column, racing on any row that is both P0 and classified HIGH risk. risk-router.js merges from feedbackRecord.metadata -- the PRE-INSERT in-memory snapshot passed into the call, not a fresh read -- while feedback-quality-updated.js does read fresh (:39-43) immediately before its own write. Whichever write lands second wins wholesale, silently dropping the other\'s fields (dimension_codes/dimension_classifications vs risk_assessment/escalation_actions/escalated_at). This race was INERT since 2026-09-08 because both UPDATEs were unconditionally rejected by the old blanket trigger; the new lifecycle-allowlist migration makes both succeed again, reactivating a live lost-update bug that predates this SD.',
  },
  {
    id: 'three-sites-fail-silent-not-fail-soft-hiding-the-original-break-for-4-days',
    severity: 'MEDIUM',
    summary: 'scripts/corrective-triage.mjs (:132-139, :157-165), lib/uat/risk-router.js (:487-499), and scripts/clockwork/prod-error-sweep-loop.cjs (:250-257) all call supabase.from(\'feedback\').update(...) without destructuring or checking the returned {error}. supabase-js resolves with {error} on a PostgREST rejection rather than throwing, so a wrapping try/catch (present in risk-router.js and prod-error-sweep-loop.cjs) never fires and corrective-triage.mjs has no error path at all. This is why the 2026-09-08 trigger break was invisible in these 3 call sites for 4 days -- the failure was truly silent, not merely soft-failed with a log line.',
  },
  {
    id: 'dedicated-table-redesign-would-reintroduce-a-settled-suppression-bug',
    severity: 'INFO',
    summary: 'lib/eva/corrective-finding-recorder.js:110-113 (the writer corrective-triage.mjs promotes/dismisses against) dedups new corrective findings on the ORIGINAL row\'s status, filtering to .in(\'status\', [\'new\',\'in_progress\']) specifically so "a resolved/wont_fix finding can never permanently suppress a genuine later regression" (its own comment). Moving promote/dismiss state to a dedicated table -- the child SD\'s original NEEDS_DEDICATED_TABLE framing -- would freeze that status field at \'new\' forever, silently suppressing every future recurrence of the same natural key. This is the exact failure mode chairman decision ba4055b7 already rejected as option (b) ("readers filter on the ORIGINAL row\'s status and would see it frozen at new/open forever"). corrective-triage.mjs\'s 2 sites also write only lifecycle columns (finding #2 above), so no code fix is needed there either way.',
  },
  {
    id: 'classify-before-insert-feasible-but-touches-two-insert-paths-and-the-ingest-hot-path',
    severity: 'INFO',
    summary: 'feedback-quality-updated.js\'s post-insert classification (subscriber 2, :33-69) could in principle move before the initial feedback insert, since classifyFeedback (lib/feedback-capture.js:264-268) depends only on title/description, both available pre-insert. But lib/feedback-capture.js has TWO insert paths (the burst-group branch at :230-238 and the normal insert at :251) that a redesign covering only one would silently miss, and moving classification onto the blocking ingest path changes today\'s non-blocking failure semantics (currently wrapped in try/catch with console.warn-only fallback). Subscriber 1 (:23-30, observability logging) is independent of subscriber 2 and must keep firing regardless of what happens to the UPDATE. This is a real, standalone piece of work, not a drop-in swap.',
  },
  {
    id: 'no-duplicate-or-overlapping-open-sds',
    severity: 'INFO',
    summary: 'Confirmed via strategic_directives_v2 query that sibling children A and F are already active (other seats), B/C/D/E remain draft, and no other open SD targets these 5 specific files. Parent orchestrator SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001 is active. No PRD or sd_backlog_map rows existed for this child prior to LEAD evaluation (both queried directly, both empty, as expected for an audit-sourced infra child).',
  },
];

const warnings = [
  'The originally-submitted premise ("Confirmed LIVE by that audit -- re-verify before fixing") was stale for 4 of 5 sites by the time this LEAD evaluation ran, because the chairman-ruled migration was applied between the audit and this claim (2026-09-12, same day). PLAN should not assume any of the 5 files still need a code-level fix without re-checking against current main -- only adversarial-verification-sweep.mjs and the newly-surfaced risk-router.js/feedback-quality-updated.js race actually do.',
  'The metadata race (finding #4) was not named anywhere in the child SD\'s original scope text -- it only became live as a side effect of the same migration that unblocks the other 4 sites, and was found by directly reading both handlers\' column-write and read-freshness behavior, not by re-reading the original audit.',
];

const recommendations = [
  'PLAN should scope EXEC to exactly 4 code changes: (1) scripts/adversarial-verification-sweep.mjs -- invert the two-field denylist to an allowlist ({updated_at, metadata}), keep the hard-throw (writeLedger\'s select-back verify and set-difference invariant are a deliberate write-integrity contract, not accidental fragility); (2) lib/uat/risk-router.js -- read feedback.metadata fresh immediately before merging, mirroring feedback-quality-updated.js\'s existing pattern, to close the lost-update race; (3-4) add {error} checks after the feedback UPDATE calls in scripts/corrective-triage.mjs (both sites) and confirm/extend the existing catch paths in risk-router.js and prod-error-sweep-loop.cjs so a rejected UPDATE is at minimum logged.',
  'PLAN should require regression tests (not code changes) for the 4 sites the migration already fixes -- assert a lifecycle-only UPDATE against each actually lands -- to close out this child\'s "5/5 confirmed" success criterion with evidence rather than assumption.',
  'PLAN should document the dedicated-table redesign as REJECTED (finding #6) and the classify-before-insert redesign as ADOPT-IN-PRINCIPLE-BUT-SPLIT-OUT into its own follow-up SD (finding #7), rather than attempting either inline in this child.',
  'PLAN should decide, as part of the adversarial-verification-sweep.mjs fix, whether a re-run with a changed disposition should update title/description via a superseding INSERT (new row) instead of dropping them from the UPDATE silently -- dropping them from the UPDATE leaves a stale disposition string on re-verified rows, which may or may not be acceptable depending on who reads that ledger.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G re-verified all 5 named call sites directly against current main (not grep-only) and against the full text of the newly-applied 20260912_feedback_no_update_lifecycle_allowlist.sql migration. 4 of 5 sites are already fixed by the migration (lifecycle-only writes, no code change needed, verification tests only). The 5th (adversarial-verification-sweep.mjs) still breaks on a genuine disposition change because its update-payload denylist leaks title/description (content columns) through. A previously-unscoped, newly-live regression was also found: risk-router.js and feedback-quality-updated.js race on the same feedback.metadata column and now silently clobber each other now that both UPDATEs succeed again. Both required design decisions (dedicated table for corrective-triage.mjs; classify-before-insert for feedback-quality-updated.js) were resolved: reject the former (would reintroduce a suppression bug chairman decision ba4055b7 already rejected), adopt-in-principle-but-split-out the latter (real work, touches the ingest hot path across two insert branches, no longer forced by the trigger). This exploration was the basis for LEAD\'s scope-reduction (scope_reduction_percentage=40) recorded on this SD.';

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
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql',
        'scripts/corrective-triage.mjs',
        'scripts/clockwork/prod-error-sweep-loop.cjs',
        'scripts/adversarial-verification-sweep.mjs',
        'lib/uat/risk-router.js',
        'lib/eva/event-bus/handlers/feedback-quality-updated.js',
        'lib/eva/corrective-finding-recorder.js',
        'lib/feedback-capture.js',
      ],
      corroborated_by: 'risk-agent (Task-tool run, LEAD-phase risk assessment) -- independently confirmed all 6 findings above via live probes against a throwaway feedback row.',
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
