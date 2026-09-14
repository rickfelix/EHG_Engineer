#!/usr/bin/env node
/**
 * THIRD correction pass for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158's `scope`/`description`.
 *
 * A VERIFY-phase Validation sub-agent (independent re-derivation against the shipped code,
 * commits c7cfb4ce481 + ff4f1ff2e1d) found the SD row's `scope` field still described the
 * pre-PLAN, REJECTED design: "sibling-SD/same-batch awareness ... across parent_sd_id-linked
 * SDs on the same historical day" and named `extractPatternsFromRetrospective` as the call
 * site. What actually shipped (per the PLAN-phase TESTING review that measured the real data
 * and found no shared parent_sd_id / no narrow recording window across the 4 motivating
 * patterns): a single generalized guard (all-distinct-SDs-closed, no parent_sd_id/window
 * logic at all), wired via `extractPatternsFromImprovements`. `description`'s "Verify by:
 * (1)/(2)" lines likewise still prescribed the superseded sibling-batch/parent_sd_id
 * regression test.
 *
 * This is a documentation-only correction (no code change) -- the shipped code and its
 * evidence trail were already correct; only the SD row's own scope/description text lagged
 * behind the PLAN-phase correction. Read literally, the stale scope could mislead a future
 * reader (or LEAD-FINAL-APPROVAL) into thinking 2 of 3 guards were skipped.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('description')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const postPlanAddendum = `

## PLAN-Phase Correction (post-PRD, before EXEC)

A PLAN-phase TESTING sub-agent review measured the site data of the 4 motivating patterns directly and found candidate (a) above (parent_sd_id + recording-proximity window) does NOT match the real data: 7-8 distinct \`parent_sd_id\` values per pattern and recording windows from 5 minutes to 22 hours -- neither a shared parent nor a narrow window. An implementation faithful to candidate (a) would have fixed 0 of the 4 motivating patterns.

**What actually shipped instead**: \`checkSingleSDClosedSource\` (in \`scripts/modules/learning/filter.mjs\`) was generalized from "exactly one SD, and it's closed" to "every DISTINCT SD referenced in a pattern's \`metadata.sites[]\` array is closed" -- no \`parent_sd_id\`, no proximity window, no same-day/same-batch logic. This is the predicate the real data actually supports (100% of the motivating patterns' resolved sites are \`status='completed'\`). \`checkSingleSDStaleOpenSource\` and \`checkSingleSDRetroLikeCategory\` were NOT generalized -- only the closed-source guard, since "every referenced SD is closed" is the only one of the three predicates that scales cleanly to N sites. The secondary (\`occurred_at\`/timestamp-fidelity) fix was wired via \`scripts/auto-extract-patterns-from-retro.js\`'s \`extractPatternsFromImprovements\` (NOT \`extractPatternsFromRetrospective\`, which is a DB-fetching wrapper around it) at both its \`recordOccurrence\` and \`createPattern\` call sites.

Shipped and merged: PR #8963's sibling PRs #8967 (commit c7cfb4ce481, the fix) and #8970 (commit ff4f1ff2e1d, closing 2 test-coverage gaps an EXEC-phase TESTING review found). Verified by: (1) unit tests proving a multi-SD, all-closed pattern is now rejected, a multi-SD pattern with one still-open SD is NOT rejected, and a pattern with no \`metadata.sites[]\` falls back byte-identically to the original single-SD-only predicate (regression guard); (2) unit tests proving \`occurred_at\`, when supplied, produces a site \`first_seen\`/pattern \`created_at\` matching it exactly, and a malformed/omitted value falls back safely; (3) every new test independently mutation-tested (reverted, confirmed exactly the intended test(s) fail, restored). Full evidence trail (Explore, Validation x2, TESTING x2, SECURITY) recorded in \`sub_agent_execution_results\` for this SD across LEAD/PLAN/EXEC/VERIFY phases.

This SD's \`scope\` field (above) has been superseded by this addendum where the two conflict -- the addendum reflects what was actually built and shipped.`;

const newDescription = sd.description + postPlanAddendum;

const newScope = 'SHIPPED (see "PLAN-Phase Correction" in description for what actually landed vs. the candidate design below): scripts/modules/learning/filter.mjs\'s checkSingleSDClosedSource generalized to an all-distinct-SDs-closed predicate (metadata.sites[]-derived, no parent_sd_id/proximity-window logic -- that candidate design was measured against real data in PLAN and found to fix none of the 4 motivating patterns, so it was NOT implemented). lib/learning/class-escalation.js (mergeSite, recordSiteAndMaybeEscalate) and lib/learning/issue-knowledge-base.js (recordOccurrence, createPattern) -- threaded an optional occurred_at parameter through to first_seen/created_at, wired at scripts/auto-extract-patterns-from-retro.js\'s extractPatternsFromImprovements (both its recordOccurrence and createPattern call sites). Unit test coverage added and mutation-tested for both changes. OUT OF SCOPE (unchanged from original): the 4 originally-named gates (GATE1_DESIGN_DATABASE, Gate 4 userStoriesComplete, Gate 2A uiComponentsImplemented, SD_TYPE_THRESHOLD) -- not defective, not touched. Re-scoring or reopening the Feb-2026 completed SDs that originally tripped these gates. Changing the hourly cron\'s batch size, ordering, or schedule. Backfilling/correcting occurrence_count, updated_at, or first_seen on the 4 already-contaminated patterns\' existing rows. Changing lib/rca/rca-orchestrator.js\'s real-time call sites\' default now() behavior (confirmed unaffected by construction -- both call sites pass exactly 3 positional arguments, no opts object, so an additive 4th-argument default cannot reach them without a separate code change to that file, which this SD did not make).';

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ description: newDescription, scope: newScope })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key')
  .single();

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
console.log('Post-PLAN correction applied:', JSON.stringify(data, null, 2));
