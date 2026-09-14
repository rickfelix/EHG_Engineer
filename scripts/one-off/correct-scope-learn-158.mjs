#!/usr/bin/env node
/**
 * LEAD-phase correction for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158.
 *
 * The SD was auto-minted by /learn from 4 issue_patterns (PAT-LES-8fb5175dce26,
 * PAT-LES-15c6ed980a2e, PAT-LES-752e6a374f67, PAT-LES-e02af6e8e18d) whose
 * occurrence_count (39-41 each) and "first_seen" timestamps (all 2026-09-14) made them
 * read as freshly, actively recurring gate failures.
 *
 * Investigation (direct DB evidence, verified via scripts/lib/supabase-connection.js
 * equivalent service client):
 *   - All 20 sampled "sites" (sd_ids) across the 4 patterns resolve to
 *     strategic_directives_v2 rows with status='completed', created 2026-02-28
 *     (the SD-MAN-ORCH-VISION-HEAL-SCORE-93-001 / SD-LEO-ORCH-CHAIRMAN-COMPLETE-MIGRATION-001
 *     families).
 *   - The canonical root_cause_reports row for the same fingerprint
 *     ("Gate GATE1_DESIGN_DATABASE failed: score 71/100") is id 6f10029b-6220-4030-8538-
 *     984aea74b2fa, created_at 2026-02-28T15:22:18Z, recurrence_count=26 -- the REAL failures
 *     happened in a tight window back on 2026-02-28 (PRD metadata missing design_analysis/
 *     database_analysis fields -- a one-time batch-creation defect on that day's orchestrator
 *     child SDs), not today.
 *   - retrospectives row 3a2d1b3f-f4f7-4654-a113-6b2832d7b443 (LEAD_TO_PLAN retro for
 *     SD-MAN-ORCH-VISION-HEAL-SCORE-93-001): created_at=2026-02-28T15:26:58Z,
 *     learning_extracted_at=2026-09-14T06:02:51.923Z. Row 5d0dc0ea-8ce0-49dc-b0ad-735e84d19b9c
 *     (PLAN_TO_EXEC retro, same SD): created_at=2026-02-28T15:30:47Z,
 *     learning_extracted_at=2026-09-14T12:08:17.558Z. Both extracted TODAY, 6.5 months after
 *     creation.
 *
 * Root cause: .github/workflows/retro-pattern-extraction-cron.yml (hourly cron, added
 * QF-20260911-299 to clear a 568-retrospective backlog) drives
 * scripts/extract-pending-retro-patterns.mjs, which processes retrospectives
 * WHERE learning_extracted_at IS NULL ORDER BY created_at ASC -- i.e. OLDEST first. Each
 * processed retro flows through scripts/auto-extract-patterns-from-retro.js's
 * extractPatternsFromRetrospective() -> lib/learning/issue-knowledge-base.js's
 * recordOccurrence() -> lib/learning/class-escalation.js's recordSiteAndMaybeEscalate() ->
 * mergeSite(metadata, site, now = new Date()), which stamps `first_seen: now.toISOString()`.
 * No caller in this chain threads the retro's own `created_at` through as `opts.now`, so
 * EVERY site recorded from a backlog-processed retro reads as "first seen" at cron-processing
 * time, not at the retro's real historical date -- regardless of how old the underlying SD
 * and its gate failure actually are.
 *
 * Effect: a one-time, long-since-resolved Feb-2026 PRD-template defect on a batch of
 * orchestrator child SDs (all now completed) was made to look like a FRESH, actively
 * recurring problem as of today, which is exactly the shape /learn's composite scorer
 * treats as "systemic and worth a corrective SD" -- manufacturing this SD from stale,
 * already-resolved noise. This is not specific to these 4 patterns: the same mechanism
 * will misdate `first_seen` for every pattern occurrence extracted from any retro the
 * hourly cron is still working through its backlog on.
 *
 * Corrected scope: fix the timestamp-fidelity defect (thread the retro's real created_at
 * through as first_seen), not the 4 gates named in the original auto-generated scope --
 * those gates are working correctly and the SDs that tripped them are long shipped.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

const title = 'Fix retro-pattern-extraction backfill: first_seen stamped at cron-processing time, not the retrospective\'s real historical date';

const description = `## Business Impact

This SD was auto-minted by /learn from 4 issue_patterns (PAT-LES-8fb5175dce26, PAT-LES-15c6ed980a2e, PAT-LES-752e6a374f67, PAT-LES-e02af6e8e18d) whose occurrence_count (39-41 each) and "first_seen" timestamps (all stamped 2026-09-14, today) made them score as freshly, actively recurring gate failures worth a systematic fix.

## LEAD-Phase Investigation Correction

Direct DB investigation (not the SD's own auto-generated claims) found the underlying "recurring failures" are stale, already-resolved historical residue, not a live defect in the 4 named gates:

- All 20 sampled "sites" (sd_ids) across the 4 patterns resolve to \`strategic_directives_v2\` rows with \`status='completed'\`, created 2026-02-28 (the SD-MAN-ORCH-VISION-HEAL-SCORE-93-001 / SD-LEO-ORCH-CHAIRMAN-COMPLETE-MIGRATION-001 orchestrator families).
- The canonical \`root_cause_reports\` row for the matching fingerprint ("Gate GATE1_DESIGN_DATABASE failed: score 71/100") is id \`6f10029b-6220-4030-8538-984aea74b2fa\`, \`created_at=2026-02-28T15:22:18Z\`, \`recurrence_count=26\` -- the real failures happened in a tight window on 2026-02-28 (PRD metadata missing \`design_analysis\`/\`database_analysis\` fields, a one-time batch-creation defect on that day's orchestrator child SDs), not today.
- \`retrospectives\` row \`3a2d1b3f-f4f7-4654-a113-6b2832d7b443\` (LEAD_TO_PLAN retro, SD-MAN-ORCH-VISION-HEAL-SCORE-93-001): \`created_at=2026-02-28T15:26:58Z\`, \`learning_extracted_at=2026-09-14T06:02:51.923Z\`. Row \`5d0dc0ea-8ce0-49dc-b0ad-735e84d19b9c\` (PLAN_TO_EXEC retro, same SD): \`created_at=2026-02-28T15:30:47Z\`, \`learning_extracted_at=2026-09-14T12:08:17.558Z\`. Both retros were extracted for pattern purposes TODAY, 6.5 months after they were written.

## Root Cause

\`.github/workflows/retro-pattern-extraction-cron.yml\` (hourly cron, added by QF-20260911-299 to clear a then-568-retrospective extraction backlog) drives \`scripts/extract-pending-retro-patterns.mjs\`, which selects \`retrospectives WHERE learning_extracted_at IS NULL ORDER BY created_at ASC LIMIT 100\` -- oldest-first. Each processed retro flows through \`scripts/auto-extract-patterns-from-retro.js\`'s \`extractPatternsFromRetrospective()\` -> \`lib/learning/issue-knowledge-base.js\`'s \`recordOccurrence()\` -> \`lib/learning/class-escalation.js\`'s \`recordSiteAndMaybeEscalate()\` -> \`mergeSite(metadata, site, now = new Date())\`, which stamps \`first_seen: now.toISOString()\`. No caller in this chain threads the retro's own \`created_at\` through as \`opts.now\`, so every site recorded from a backlog-processed retro reads as "first seen" at cron-processing time, not at the retro's real historical date -- regardless of how old the underlying SD and its gate failure actually are.

## Prevention Strategy

Thread the retrospective's real \`created_at\` through \`extractPatternsFromRetrospective\` -> \`recordOccurrence\` -> \`recordSiteAndMaybeEscalate\` -> \`mergeSite\`'s \`now\` parameter, so a site recorded from a historical backfill is stamped with the issue's true historical occurrence time, not the moment the backlog-draining cron happened to reach it. This is not specific to these 4 patterns -- the same mechanism will misdate \`first_seen\` for every pattern occurrence extracted from any retrospective the hourly cron processes while working through backlog (new retros extracted within their own hour of creation are unaffected, since cron-processing time and real time coincide for those).

After implementation, verify by re-running the extraction against one of these known-backlogged retros (or a synthetic fixture with an old \`created_at\`) and confirming the resulting/updated pattern site's \`first_seen\` matches the retro's \`created_at\`, not \`Date.now()\`.

## Descoped (from the original auto-generated scope)

The 4 gates named in the original /learn-generated scope (GATE1_DESIGN_DATABASE, Gate 4 userStoriesComplete, Gate 2A uiComponentsImplemented, SD_TYPE_THRESHOLD) are NOT touched by this SD. They are working as designed; the SDs that tripped them in Feb 2026 are long completed, and no live SD is currently failing these gates because of this pattern's cited cause. Re-opening or re-scoring those historical, already-shipped SDs is out of scope.

## Source

Created automatically by \`/learn\`; scope corrected during LEAD-phase investigation (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158, this row) before PRD creation, per the standing "measure the defect premise against current main/live DB state" directive.`;

const scope = 'IN SCOPE: lib/learning/class-escalation.js (mergeSite, recordSiteAndMaybeEscalate) and lib/learning/issue-knowledge-base.js (recordOccurrence) and scripts/auto-extract-patterns-from-retro.js (extractPatternsFromRetrospective) -- thread the retrospective\'s real created_at through as the recorded site\'s first_seen timestamp instead of defaulting to wall-clock now(). Add/adjust unit test coverage proving a backfill-processed (old created_at) retro records a site with first_seen matching the retro\'s created_at, not the processing time. OUT OF SCOPE: the 4 originally-named gates (GATE1_DESIGN_DATABASE, Gate 4 userStoriesComplete, Gate 2A uiComponentsImplemented, SD_TYPE_THRESHOLD) -- not defective, not touched. Re-scoring or reopening the Feb-2026 completed SDs that originally tripped these gates. Changing the hourly cron\'s batch size, ordering, or schedule (QF-20260911-299\'s own design, unrelated to this timestamp-fidelity defect). Backfilling/correcting first_seen on the 4 already-created patterns\' existing site entries (a data-correction concern, not a code-defect concern; may be filed separately if judged worth the effort).';

const rationale = `The SD as auto-generated by /learn asked to "address root cause" of 4 gate-failure patterns with 161 total occurrences, reading as a systemic, currently-recurring code defect. Direct investigation found the real occurrences are historical (Feb 2026, on now-completed SDs) and are being freshly re-timestamped today purely as a side effect of the hourly retro-pattern-extraction cron (QF-20260911-299) processing its oldest-first backlog. Fixing the 4 named gates would be effort spent on a non-problem; the actual defect worth fixing is that the learning pipeline cannot currently distinguish "this just started happening" from "this happened 6 months ago and I'm only now getting around to filing it," which corrupts every downstream consumer of pattern recency (including /learn's own composite scoring -- the exact mechanism that generated this SD).`;

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ title, description, scope, rationale })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, title')
  .single();

if (error) {
  console.error('UPDATE FAILED:', error);
  process.exit(1);
}

console.log('Corrected SD:', JSON.stringify(data, null, 2));
