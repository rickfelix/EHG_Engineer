import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-FIX-CLAIM-EVICTION-001';
const { data: sd, error: readErr } = await supabase.from('strategic_directives_v2').select('scope, success_criteria, risks, metadata').eq('sd_key', SD_KEY).single();
if (readErr) throw readErr;

// LEAD-phase prospective testing-agent review (evidence 5d196f47-4555-4f50-998d-101d38a2ccef)
// found the originating ticket's fix shape would cause a fleet-wide claim outage if
// transcribed literally into a PRD. Two schema facts falsify it, verified live:
//   - strategic_directives_v2.status has NO 'open' value (CHECK: draft|active|in_progress|
//     planning|review|pending_approval|completed|deferred|cancelled) -- only quick_fixes has it.
//   - strategic_directives_v2 has no pr_url/commit_sha columns at all (42703) -- only
//     quick_fixes does (confirmed: `column strategic_directives_v2.pr_url does not exist`).
// Correcting scope/success_criteria BEFORE PRD authoring, per LEAD's "verify claims against
// reality" principle (CLAUDE_LEAD.md Example 1) -- a PRD written from the unverified ticket
// text would have produced exactly the SD-UAT-002 class of rework this principle exists to
// prevent, at much higher cost (a migration deploy, not a code review).
const scope = `Fix the claim-eviction race for quick_fixes (parts c2/f are quick_fixes-ONLY -- strategic_directives_v2 has no 'open' status value and no pr_url/commit_sha columns, verified live; the SD-side eviction branch already correctly clears claiming_session_id/active_session_id/is_working_on and cannot produce the orphan shape described), skip self-claim when a session already authoritatively holds any live claim via the existing getMyClaims() predicate applied uniformly across all three self-claim producer steps (not just one tier), and stop a sleeping seat's claim-wakeup timer from running past a claim that was removed out from under it with a next-checkin hint (a true re-arm/preemption of ScheduleWakeup is not implementable and is already formally risk-accepted elsewhere).

Escalated from QF-20260912-961, which shipped parts (a) and (b) of its own three-part fix
shape (PR #8838): (a) flipped \`LEO_RELEASE_WORKITEM_RESET\` to default ON in
\`lib/fleet/release-work-item.mjs\`, and (b) added a phantom-in_progress detector for
\`quick_fixes\` in \`scripts/stale-session-sweep.cjs\`, delegating to the shared
\`releaseWorkItemOnSessionEnd()\` helper.

This SD covers the remaining scope, deliberately deferred because it requires modifying the
\`claim_sd\` Postgres function -- a migration, which this repo's own routing rules always route
to a full SD regardless of LOC (CLAUDE.md's "Schema: migration... always Tier 3" rule).`;

const success_criteria = [
  {
    criterion: "claim_sd's eviction path for a quick_fixes claim resets the evicted row's status to 'open' INSIDE the SAME guarded UPDATE statement that performs the eviction (not a separate UPDATE by id) -- a separate statement risks stomping a third session's fresh, legitimate claim back to 'open' if it raced the eviction.",
    measure: "Migration-shape test + live behavior test: evict a quick_fixes claim with no pr_url/commit_sha, assert the evicted row reads status='open', claiming_session_id=NULL in one transaction. This does NOT apply to strategic_directives_v2 -- its eviction branch is unchanged (already correct, verified no orphan shape exists there)."
  },
  {
    criterion: "claim_sd refuses (returns a refusal code, touches nothing) when the quick_fixes row being evicted carries a non-null pr_url or commit_sha -- expressed as a predicate directly on the destructive UPDATE (WHERE ... AND pr_url IS NULL AND commit_sha IS NULL) with a row-count check, not a separate prior SELECT+branch (READ COMMITTED with no FOR UPDATE means a prior read can go stale before the write).",
    measure: "Test: a quick_fixes row with pr_url set is NOT evicted by a competing claim_sd call; the row is untouched and a refusal code is returned. This does NOT apply to strategic_directives_v2 (no pr_url/commit_sha columns exist there)."
  },
  {
    criterion: "worker-checkin.cjs's self-claim guard against 'session already holds a live claim' is expressed as ONE shared predicate (lib/claim/get-my-claims.cjs's getMyClaims(), the existing authoritative both-kinds check) and applied uniformly to ALL THREE self-claim producer steps (critical-qf-jump, merged-pool-self-claim, self-claim-qf) -- not a new, separate guard on only one tier, and not keyed on ctx.mySd (a one-shot mirror snapshot that gets nulled at multiple points in the same pipeline, e.g. resume.cjs:147/:229 and release-request.cjs:117 -- a guard keyed on it would be inert in exactly the scenario this SD exists to fix).",
    measure: "Tests: a session already authoritatively holding ANY claim (SD or QF, via getMyClaims) does not self-claim a second item from any of the three producer steps."
  },
  {
    criterion: "Investigate directed-assignment's REJECTION fall-through paths specifically (not self-claim generally -- assignment already outranks self-claim in the existing step ordering, so a guard restating that ordering is a no-op). Determine what currently happens when a directed-assignment claim attempt is REJECTED (e.g. claim_sd returns an error/refusal for the assigned item) and whether the pipeline correctly falls through to self-claim afterward, or gets stuck having already skipped it.",
    measure: "A test reproducing a rejected directed-assignment claim attempt, asserting the pipeline still resolves to a self-claim (or a correctly-reported idle/error state), never a silent no-action tick."
  },
  {
    criterion: "A seat sleeping on a claim-wakeup (wind_down.had_claim=true) whose claim is removed by someone else receives a HINT it can act on at its NEXT check-in (matching the existing precedent at stale-session-sweep.cjs:352-366) -- this SD does NOT attempt to preempt/re-arm an already-scheduled ScheduleWakeup mid-sleep; that capability does not exist and is already formally risk-accepted (fleet-hibernation-quiet-tick.md:159-171, self-wake-escalation.cjs:15-22).",
    measure: "Test: a park/release action on a had_claim=true-sleeping seat's claim writes a hint the seat's NEXT check-in surfaces and acts on; no claim to preemptively wake mid-sleep."
  },
  {
    criterion: "No regression to QF-20260912-961's already-shipped parts (a)/(b): LEO_RELEASE_WORKITEM_RESET still defaults ON, 'off' remains the kill switch, and the quick_fixes phantom-in_progress detector still delegates to the shared releaseWorkItemOnSessionEnd() helper.",
    measure: "Existing QF-961 regression tests still pass unmodified."
  },
  {
    criterion: "Verification of the fix's effect uses an AUDIT EVENT emitted at the moment an eviction-with-reset or an eviction-refusal occurs, never a standing orphan-row COUNT -- the live orphan count is already 0 (the defect is racy/intermittent, not a steady population), so a count-based check would read as permanently healthy whether or not the fix is present.",
    measure: "A structured audit/log event fires on every claim_sd eviction-reset and every eviction-refusal, queryable after the fact."
  }
];

const risks = [
  {
    risk: "A PRD or migration written directly from the originating ticket text (pre-correction) would attempt status='open' and pr_url/commit_sha predicates against strategic_directives_v2, which would either silently no-op (status, since a zero-row WHERE never hits the CHECK constraint) or hard-fail with 42703 (the nonexistent columns) -- either way, a broken or inert migration shipped to production.",
    impact: "high",
    likelihood: "low",
    mitigation: "LEAD-phase prospective testing-agent review (evidence 5d196f47-4555-4f50-998d-101d38a2ccef) caught this before PRD authoring; scope/success_criteria corrected to be quick_fixes-scoped for parts c2/f. PLAN phase must carry this distinction into every FR and into the migration DDL itself."
  },
  {
    risk: "Part (g)'s original 'should re-arm that seat' framing is not implementable (ScheduleWakeup has no preemption primitive) -- if PLAN authors an FR promising re-arm/preemption, EXEC will either fail to deliver it or invent a brittle, unreviewed new wake mechanism under time pressure.",
    impact: "medium",
    likelihood: "low",
    mitigation: "Success criteria above explicitly scope part (g) to a next-checkin hint only, citing the existing formal risk-acceptance docs (fleet-hibernation-quiet-tick.md, self-wake-escalation.cjs) so PLAN does not re-open that decision."
  },
  {
    risk: "Implementation may not fully address root cause",
    impact: "low",
    likelihood: "low",
    mitigation: "Verify against original evidence; re-queue via /learn if pattern recurs"
  }
];

const metadata = {
  ...sd.metadata,
  lead_correction_1: {
    at: new Date().toISOString(),
    reason: "Prospective LEAD-phase testing-agent review (mandatory per CLAUDE_LEAD.md's harness-fix sub-agent cadence rule -- this SD's scope touches a shared-scope writer/consumer pair (claim_sd + worker-checkin.cjs), a narrow-keyword detector, and session-lifecycle hook-like code) found the originating ticket's fix shape would cause a fleet-wide claim outage if transcribed literally: parts (c2)/(f) targeted strategic_directives_v2, but that table has no 'open' status value and no pr_url/commit_sha columns (both independently verified live by LEAD, not just trusted from the sub-agent: `node scripts/discover-schema-constraints.js strategic_directives_v2` shows the real status CHECK list; a direct .select('pr_url,commit_sha') against strategic_directives_v2 returns 'column ... does not exist'). Part (e)'s premise (an existing 'already holds a claim' guard to copy) is also false -- protection today is purely positional and keyed on a one-shot mirror (ctx.mySd) that gets nulled mid-pipeline, making a copied guard inert; the real fix is the existing authoritative getMyClaims() predicate applied to all three self-claim producer steps. Part (g)'s 're-arm' framing is not implementable (no ScheduleWakeup preemption primitive exists; already formally risk-accepted elsewhere) -- narrowed to a next-checkin hint. Part (c1) as worded is a no-op (assignment already outranks self-claim); the real gap is in directed-assignment's rejection fall-through paths, now an explicit investigation item rather than an assumed fix. scope/success_criteria/risks corrected accordingly before PRD authoring.",
    source_evidence_row: '5d196f47-4555-4f50-998d-101d38a2ccef'
  }
};

const { error: writeErr } = await supabase.from('strategic_directives_v2').update({ scope, success_criteria, risks, metadata }).eq('sd_key', SD_KEY);
if (writeErr) throw writeErr;
console.log('SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 LEAD-phase correction applied.');
