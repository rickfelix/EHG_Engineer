// SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001 — LEAD-phase correction.
//
// The SD's description/scope (as filed) named `/inbox snooze` (lib/quality/snooze-manager.js) as
// the live writer of snoozed_until on critical/high feedback rows. A risk-agent review during
// LEAD evaluation found that path dead by construction: snoozeFeedback()/unsnoozeFeedback()/
// wakeExpiredSnoozes() write status values ('snoozed', 'open') that public.feedback_status_check
// does not permit, and none of the three has any caller in the repo. Independently re-verified
// live against pg_constraint plus a zero-caller grep before writing this correction.
//
// The real, live writer is lib/quality/assist-engine.js's this_week/next_week decision branch
// (~L768, reached via `/leo assist`), which sets status='backlog' (a permitted value) alongside
// snoozed_until. The fix itself (exclude snoozed_until from the flag_review branch) is unchanged
// and still correct — only the causal narrative was wrong. This script corrects the SD row to
// match the already-corrected migration header
// (database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion.sql).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001';

const CORRECTED_TEXT = `Found as a documented out-of-scope finding (F3) during PLAN-phase prospective TESTING review of SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C. The chairman_all_decision_signals view/query feeds the chairman decision queue for feedback rows via: severity IN (critical,high) AND resolved_at IS NULL AND status NOT IN (resolved,wont_fix,in_progress,duplicate,invalid). This does not exclude backlog status or consult snoozed_until at all.

CORRECTED CAUSE (LEAD-phase RISK/DOCMON sub-agent review, 2026-09-12, two correction passes): the original F3 finding named /inbox snooze (lib/quality/snooze-manager.js) as THE writer of snoozed_until. That path cannot write via the /inbox skill in production -- snoozeFeedback() writes status='snoozed' and unsnoozeFeedback()/wakeExpiredSnoozes() write status='open', and public.feedback_status_check permits ONLY (new, triaged, in_progress, resolved, wont_fix, duplicate, invalid, backlog, shipped) -- verified live against pg_constraint; neither value is in that list. Precise caller statement (an earlier draft overclaimed "zero callers in the repo"): there is no JS/library caller -- the sole call sites are the /inbox snooze/unsnooze/snoozed skill script (.claude/skills/inbox.md) itself, whose writes are the ones rejected by the constraint. wakeExpiredSnoozes() (the would-be sweep that clears expired snoozes) has zero callers anywhere, skill or code, and never runs.

There are TWO real, live writers of snoozed_until, mattering differently to this branch: (1) lib/quality/assist-engine.js's this_week/next_week decision branch (~L768, via /leo assist Phase 2 scheduling) sets status='backlog' alongside snoozed_until with NO severity restriction -- this is the writer that actually drives the bug, since a critical/high row scheduled this_week/next_week keeps its severity. (2) scripts/chairman-decisions.mjs's recordDeferral() (chairman defer --review-in) inserts a new audit-log feedback row with severity='low' HARDCODED -- this can never produce a critical/high row and is irrelevant to this branch's population; it is named only because it is the source of today's one live example row. Confirmed live: whole-table non-null snoozed_until count is exactly 1 row today, and it is writer (2)'s low-severity audit row -- already excluded from this branch by the existing severity filter regardless of this fix. So the CURRENT affected-row delta from applying the fix is 0 today, not "404-408 currently-snoozeable" (that figure is this branch's total ELIGIBLE population -- critical/high, unresolved, non-terminal-status -- not a count of rows actually snoozed today via writer (1)).

The gap is still genuinely load-bearing going forward: any critical/high row a chairman/operator schedules via /leo assist this_week/next_week (writer 1) is silently still queued for immediate chairman attention despite being explicitly deferred to a later date, and the fix (checking snoozed_until directly, since nothing ever clears it once set) is correct and unchanged by this correction -- only the WHY, not the WHAT, was wrong. -001-C deliberately did NOT fix this: it is a shared DB view/query (not one of the 6 files in -001-C original scope), any change is schema-adjacent (a view WHERE-clause change) with blast radius across every OTHER feature reading the same view, and deserves its own dedicated review. Confirmed -001-C does NOT regress this (status is never touched by either writer above, so visibility here is byte-identical pre/post -001-C) -- this is a pre-existing gap, not a new one.

FIX SHAPE: add a "snoozed_until IS NULL OR snoozed_until <= now()" exclusion to the flag_review branch of chairman_all_decision_signals (implemented as a CREATE OR REPLACE VIEW migration; staged in database/chairman-gated/, not yet applied). The fix (predicate) is unchanged from the original finding -- only the causal narrative above was corrected, across two passes (the first pass missed that the same stale story was repeated in the migration's own THE ONE CHANGE and VERIFY sections).

OUT OF SCOPE, FLAGGED FOR SEPARATE FOLLOW-UP: lib/quality/snooze-manager.js's three write functions (snoozeFeedback, unsnoozeFeedback, wakeExpiredSnoozes) are unconditionally rejected by feedback_status_check -- the /inbox snooze/unsnooze/snoozed commands appear functional to a user but can never work (snooze/unsnooze throw; snoozed silently reports empty forever). This is a genuine, separate, chairman-facing defect requiring its own either/or design decision (align the status writes to permitted values + wire a real sweep caller, vs. delete the module and its /inbox skill sections) -- deliberately kept out of this SD to preserve the one-change/byte-identical-provenance discipline of the view migration.

Source: TESTING sub-agent (Task-tool, PLAN and EXEC phase reviews of SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C), evidence rows 2de37d89-7fb2-4ab3-a37e-8d7b8c531376 and 7e94571a-f8dd-48b4-859c-9c94cf1eb6db. Cause correction: LEAD-phase RISK + DOCMON sub-agent review, 2026-09-12, independently re-verified against live feedback_status_check constraint, live snoozed_until row distribution, and a repo-wide caller grep.`;

async function main() {
  const { data: before, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, description, scope')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw new Error(`read failed: ${readErr.message}`);

  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ description: CORRECTED_TEXT, scope: CORRECTED_TEXT })
    .eq('sd_key', SD_KEY);
  if (writeErr) throw new Error(`write failed: ${writeErr.message}`);

  const { data: after, error: verifyErr } = await supabase
    .from('strategic_directives_v2')
    .select('description, scope')
    .eq('sd_key', SD_KEY)
    .single();
  if (verifyErr) throw new Error(`verify failed: ${verifyErr.message}`);

  if (after.description !== CORRECTED_TEXT || after.scope !== CORRECTED_TEXT) {
    throw new Error('VERIFY FAILED: written content does not match after re-read');
  }

  console.log(`OK: ${SD_KEY} description+scope corrected and verified (id=${before.id}).`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
