#!/usr/bin/env node
/**
 * SECOND LEAD-phase correction for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158.
 *
 * An independent Validation sub-agent re-derived the first correction (scripts/one-off/
 * correct-scope-learn-158.mjs) from scratch and PASSED the core code-chain claim (95%+
 * confidence on every hop), but REFUTED one specific clause: `issue_patterns.metadata.
 * sites[].first_seen` is NOT actually read by /learn's scoring path
 * (scripts/modules/learning/filter.mjs) -- its only consumer repo-wide is a human-readable
 * description string (lib/learning/class-escalation.js:98). The first correction's claim that
 * a falsified first_seen directly caused /learn to mint this SD does not hold up.
 *
 * The validator traced the REAL mechanism instead, confirmed directly against
 * scripts/modules/learning/filter.mjs in this pass:
 *   - /learn's noise filter has 3 single-SD guards (checkSingleSDClosedSource,
 *     checkSingleSDStaleOpenSource, checkSingleSDRetroLikeCategory), ALL keyed on
 *     `pattern.first_seen_sd_id === pattern.last_seen_sd_id` -- their shared premise is "if
 *     this pattern only ever touched ONE SD, it's a one-off, not a systemic recurrence."
 *   - The retro-pattern-extraction backlog drain (same cron/script chain as the first
 *     correction) processes retrospectives for MANY SIBLING SDs (orchestrator children of the
 *     SD-MAN-ORCH-VISION-HEAL-SCORE-93-001 / SD-LEO-ORCH-CHAIRMAN-COMPLETE-MIGRATION-001
 *     families, all created 2026-02-28) that all share the SAME one-time PRD-template defect
 *     from that single day. Each sibling's retro extraction calls recordOccurrence with a
 *     DIFFERENT sd_id (that sibling's own id), so the pattern accumulates ~20 distinct sd_ids
 *     -- first_seen_sd_id !== last_seen_sd_id -- which causes all 3 single-SD guards to
 *     ABSTAIN (they only fire when the ids match). The guards' own premise ("touched >1 SD =
 *     genuine cross-SD recurrence") is exactly the signal the backlog drain manufactures for
 *     what is actually ONE incident on ONE day, replayed across sibling SDs of a single batch.
 *   - occurrence_count (39-41) and updated_at (refreshed to today on every recordOccurrence
 *     call) are the fields that actually feed /learn's composite scorer
 *     (scripts/modules/learning/filter.mjs -- occurrence_count read directly; recency derived
 *     from last_seen_at||updated_at), not first_seen.
 *
 * The underlying timestamp-fidelity defect in mergeSite (first_seen stamped at cron-processing
 * time) is STILL real and still worth fixing for correctness (it renders a false "first seen
 * <date>" to any LEAD reviewer reading a pattern's history, per
 * lib/learning/class-escalation.js:108's own reviewer-facing warning) -- it is just not the
 * literal mechanism that fooled the scorer, so this correction keeps it in scope as a secondary
 * fix rather than removing it.
 *
 * Also corrects a factual drift the validator caught: the cron's own comment cites "568/608
 * retrospectives in 14 days" (a 14-day sample at the time QF-20260911-299 shipped), not "568
 * total backlog." Live count at investigation time: 7,983 of 9,869 retrospectives (81%) still
 * have learning_extracted_at IS NULL -- the real backlog is ~14x larger than the first
 * correction implied.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

const title = 'Fix retro-pattern-extraction backlog drain: sibling-SD fan-out defeats /learn\'s single-SD noise filter, and first_seen is stamped at cron time not the incident\'s real date';

const description = `## Business Impact

This SD was auto-minted by /learn from 4 issue_patterns (PAT-LES-8fb5175dce26, PAT-LES-15c6ed980a2e, PAT-LES-752e6a374f67, PAT-LES-e02af6e8e18d) with occurrence_count 39-41 each, reading as freshly, actively recurring gate failures worth a systematic fix.

## LEAD-Phase Investigation (two independent passes)

**Pass 1 (Explore)**: found all 20 sampled pattern "sites" resolve to \`strategic_directives_v2\` rows with \`status='completed'\`, created 2026-02-28 (the SD-MAN-ORCH-VISION-HEAL-SCORE-93-001 / SD-LEO-ORCH-CHAIRMAN-COMPLETE-MIGRATION-001 orchestrator families). Traced the mechanism to \`.github/workflows/retro-pattern-extraction-cron.yml\` (hourly cron, QF-20260911-299) -> \`scripts/extract-pending-retro-patterns.mjs\` (drains \`retrospectives WHERE learning_extracted_at IS NULL ORDER BY created_at ASC\`, oldest-first) -> \`scripts/auto-extract-patterns-from-retro.js\` -> \`lib/learning/issue-knowledge-base.js\`'s \`recordOccurrence()\` -> \`lib/learning/class-escalation.js\`'s \`recordSiteAndMaybeEscalate()\` / \`mergeSite()\`, which stamps a site's \`first_seen\` at wall-clock processing time (never the retro's real historical \`created_at\`).

**Pass 2 (independent Validation)**: re-derived the full chain from scratch (PASS, 98-99% confidence on every hop) but REFUTED one clause of Pass 1's causal story: \`sites[].first_seen\` is NOT read anywhere in /learn's scoring path (\`scripts/modules/learning/filter.mjs\`) -- its only repo-wide consumer is a human-readable description string (\`lib/learning/class-escalation.js:98\`). The validator traced the REAL mechanism instead, confirmed directly against \`filter.mjs\` in this correction pass:

- /learn's noise filter has 3 single-SD guards -- \`checkSingleSDClosedSource\`, \`checkSingleSDStaleOpenSource\`, \`checkSingleSDRetroLikeCategory\` -- all keyed on \`pattern.first_seen_sd_id === pattern.last_seen_sd_id\`. Their shared premise: a pattern that only ever touched ONE SD is a one-off, not systemic recurrence, and gets rejected as noise.
- The backlog drain processes retrospectives for MANY SIBLING SDs (orchestrator children of the Feb-28 batch) that all share the SAME one-time PRD-template defect from that single day. Each sibling's own retro extraction records the pattern against a DIFFERENT \`sd_id\` (that sibling's own id), so the pattern accumulates ~20 distinct \`sd_id\`s -- \`first_seen_sd_id !== last_seen_sd_id\` -- which makes all 3 single-SD guards ABSTAIN. The guards' own premise ("touched >1 SD = genuine cross-SD recurrence") is exactly the signal the backlog drain manufactures for what is actually ONE incident on ONE day, replayed across sibling SDs of a single batch.
- \`occurrence_count\` (39-41) and \`updated_at\` (refreshed to "now" on every \`recordOccurrence\` call) are the fields that actually feed the composite scorer, not \`first_seen\`.

The underlying \`mergeSite\` timestamp-fidelity defect (stamping \`first_seen\` at cron-processing time) is still real and still worth fixing for correctness -- it renders a false "first seen &lt;date&gt;" to any LEAD reviewer reading a pattern's history (the code's own reviewer-facing warning at \`class-escalation.js:108\` -- "sites may have been fixed since recording" -- is guidance, not enforcement, and is silent on timestamp fidelity). It is just not the literal field that fooled the scorer, so it stays in scope as a secondary correctness fix, not the primary one.

**Factual correction**: the cron's own header comment cites "568/608 retrospectives in 14 days" (a 14-day sample at the time QF-20260911-299 shipped, 2026-09-11), not a fixed 568-row total backlog. Live count at investigation time: 7,983 of 9,869 retrospectives (81%) still have \`learning_extracted_at IS NULL\` -- the real, still-draining backlog is roughly 14x larger than a naive reading of that comment suggests, meaning this defect class will keep manufacturing false cross-SD-recurrence signals for a long time as the cron continues working through it.

## Root Cause (corrected)

Two compounding defects, both rooted in the same backlog-draining cron treating "I am processing this old record right now" as equivalent to "this happened right now":

1. **Filter-defeat (primary)**: \`scripts/modules/learning/filter.mjs\`'s single-SD noise guards cannot distinguish "N distinct SDs genuinely, independently hit this problem over time" from "N sibling SDs from ONE batch all inherited the SAME one-time defect and are being backfilled into the pattern DB in the same cron run." Both produce \`first_seen_sd_id !== last_seen_sd_id\`.
2. **Timestamp-fidelity (secondary)**: \`lib/learning/class-escalation.js\`'s \`mergeSite(metadata, site, now = new Date())\` stamps \`first_seen\` at the cron's wall-clock processing time rather than the retrospective's real historical \`created_at\`, misleading any human reader of the pattern's site history even though it does not itself drive automated scoring.

## Prevention Strategy

PLAN to design the correct fix shape for the primary defect -- candidates to evaluate: (a) have the noise filter (or the site-recording path) recognize sibling SDs sharing a \`parent_sd_id\` recorded within a short window as ONE occurrence rather than N for single-SD-guard purposes; (b) cap/dedupe same-day, same-parent site fan-out at record time in \`recordSiteAndMaybeEscalate\`; (c) some other structurally sound approach PLAN identifies. For the secondary defect, thread the retrospective's real \`created_at\` through \`extractPatternsFromRetrospective\` -> \`recordOccurrence\` -> \`recordSiteAndMaybeEscalate\` -> \`mergeSite\`'s \`now\` parameter (additive/optional; the real-time RCA-orchestrator callers at \`lib/rca/rca-orchestrator.js:319,382\` must keep defaulting to \`new Date()\` unchanged).

Verify by: (1) a regression test proving a synthetic batch of sibling-SD retros sharing one \`parent_sd_id\`, backfilled in one drain run, does NOT defeat the single-SD noise guards; (2) a regression test proving a synthetic old-\`created_at\` retro, run through extraction, produces a site \`first_seen\` matching the retro's \`created_at\`, not \`Date.now()\` at test-run time.

## Descoped (from the original auto-generated scope)

The 4 gates named in the original /learn-generated scope (GATE1_DESIGN_DATABASE, Gate 4 userStoriesComplete, Gate 2A uiComponentsImplemented, SD_TYPE_THRESHOLD) are NOT touched by this SD. They are working as designed; the SDs that tripped them in Feb 2026 are long completed (zero \`sub_agent_execution_results\` rows and zero \`sd_phase_handoffs\` activity since 2026-06 for the sampled SDs, confirming no gate has genuinely re-run against them). Re-opening or re-scoring those historical, already-shipped SDs is out of scope.

## Source

Created automatically by \`/learn\`; scope corrected during LEAD-phase investigation across two independent passes (Explore, then Validation) before PRD creation, per the standing "measure the defect premise against current main/live DB state" directive. Both passes' full evidence is recorded in \`sub_agent_execution_results\` for this SD, phase=LEAD.`;

const scope = 'IN SCOPE: scripts/modules/learning/filter.mjs (the 3 single-SD noise guards -- design and implement sibling-SD/same-batch awareness so a backlog-drain fan-out across parent_sd_id-linked SDs on the same historical day does not read as independent cross-SD recurrence) as the PRIMARY fix. lib/learning/class-escalation.js (mergeSite, recordSiteAndMaybeEscalate) and lib/learning/issue-knowledge-base.js (recordOccurrence) and scripts/auto-extract-patterns-from-retro.js (extractPatternsFromRetrospective) -- thread the retrospective\'s real created_at through as first_seen instead of defaulting to wall-clock now(), as a SECONDARY correctness fix. Add/adjust unit test coverage for both. OUT OF SCOPE: the 4 originally-named gates (GATE1_DESIGN_DATABASE, Gate 4 userStoriesComplete, Gate 2A uiComponentsImplemented, SD_TYPE_THRESHOLD) -- not defective, not touched. Re-scoring or reopening the Feb-2026 completed SDs that originally tripped these gates. Changing the hourly cron\'s batch size, ordering, or schedule (QF-20260911-299\'s own design, unrelated to this defect). Backfilling/correcting occurrence_count, updated_at, or first_seen on the 4 already-contaminated patterns\' existing rows (a data-correction concern, not a code-defect concern; may be filed separately). Changing lib/rca/rca-orchestrator.js\'s real-time call sites\' default now() behavior.';

const rationale = `The SD as auto-generated by /learn asked to "address root cause" of 4 gate-failure patterns with 161 total occurrences, reading as a systemic, currently-recurring code defect. Two independent LEAD-phase investigations found the real occurrences are historical (Feb 2026, on now-completed SDs) and the systemic problem worth fixing is not the gates but the pattern-learning pipeline itself: a backlog-draining cron's sibling-SD fan-out structurally defeats the /learn noise filter's own single-SD safety guard, manufacturing exactly the "many distinct SDs hit this" signal the guard was built to trust. Fixing the 4 named gates would be effort spent on a non-problem; the actual defect worth fixing corrupts the trustworthiness of every future /learn auto-approve decision for as long as the 81%-unextracted retrospective backlog continues draining -- which is the exact mechanism that generated this SD in the first place.`;

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

console.log('Corrected SD (v2):', JSON.stringify(data, null, 2));
