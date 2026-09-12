import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-LIB-QUALITY-SNOOZE-001';

const description = `Discovered mid-work during LEAD-phase RISK + DOCMON sub-agent review of SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001 (evidence rows af73fd5b-f55a-49e0-90e1-252dfd53c554, bc37abe7-4da0-4397-af2e-b2466cbda6d4), independently corroborated by a second RISK pass (row af73fd5b, executed inside a rolled-back live transaction) -- kept out of that SD's scope deliberately, per its own header, to preserve its one-change/byte-identical-provenance discipline.

lib/quality/snooze-manager.js exposes three write functions backing the /inbox skill's snooze, unsnooze, and snoozed commands (.claude/skills/inbox.md:345/373/399): snoozeFeedback() writes feedback.status='snoozed'; unsnoozeFeedback() and wakeExpiredSnoozes() (the intended background sweep) write feedback.status='open'. Both values are REJECTED by the live public.feedback_status_check constraint, which permits only (new, triaged, in_progress, resolved, wont_fix, duplicate, invalid, backlog, shipped). Confirmed by execution in a rolled-back transaction (Postgres error 23514). getSnoozedItems() filters status='snoozed' and therefore always returns empty (corroborated empirically: 0 rows in the whole feedback table, 38218 rows total, carry status 'snoozed' or 'open').

USER-FACING IMPACT: a chairman/operator running /inbox snooze on a feedback item, or /inbox unsnooze, gets a thrown error (not a graceful failure); /inbox snoozed silently reports "No snoozed items" forever, even immediately after a (failed) snooze attempt. wakeExpiredSnoozes has zero callers anywhere in the repo (only a barrel re-export at lib/quality/index.js:65, which is not a caller) -- so even if the status values were fixed, nothing currently invokes the sweep.

THIS IS A GENUINE EITHER/OR DESIGN DECISION, not a mechanical fix: (A) align the three functions' status writes to values feedback_status_check actually permits (e.g. reuse 'backlog' + snoozed_until, matching the pattern lib/quality/assist-engine.js:768's this_week/next_week branch already uses successfully) and wire a real caller for the sweep (e.g. a cron/schedule entry, or invoke it from the /inbox command itself on each run) -- OR (B) delete the module and its three /inbox skill sections entirely if the maintainers decide "snooze" as a distinct mechanism from /leo assist's own this_week/next_week scheduling is redundant and should be consolidated onto the one live path. Either choice is a real product decision requiring its own LEAD evaluation; this SD does not pre-select one.

Not a regression: this constraint (feedback_status_check) predates this discovery; the write paths have presumably been broken since whenever the constraint was last tightened to its current permitted-value list. Filed as bugfix (existing, live, user-facing functionality is broken), not infrastructure.`;

const key_changes = [
  { change: "DECIDE: align snoozeFeedback/unsnoozeFeedback/wakeExpiredSnoozes' status writes to a feedback_status_check-permitted value (e.g. backlog + snoozed_until, mirroring assist-engine.js:768) and wire a real caller for the sweep, OR delete the module + its three /inbox skill sections", impact: 'Restores (or consciously retires) the /inbox snooze/unsnooze/snoozed commands, which currently throw or silently no-op for any user who invokes them' },
  { change: 'If option A: add a scheduled or on-invocation caller for wakeExpiredSnoozes (currently zero callers repo-wide)', impact: 'The expired-snooze sweep actually runs at least once somewhere, instead of never' },
  { change: 'Add regression coverage asserting the /inbox snooze -> unsnooze -> snoozed round-trip actually persists and reads back correctly against a real (or faithfully mocked) feedback_status_check', impact: 'Prevents a third silent breakage of this same command surface if the constraint is tightened again in the future' }
];

const risks = [
  { risk: 'Choosing option A (fix the writes) without also auditing every other caller of feedback.status for the same constraint drift could leave sibling silent breakages undiscovered.', impact: 'medium', likelihood: 'low', mitigation: 'Grep all direct feedback.update({status:...}) call sites against the live feedback_status_check permitted-value list before considering this SD complete, not just the three named functions.' },
  { risk: 'Choosing option B (delete) removes a command surface a chairman/operator may have muscle memory for, even though it currently does not work.', impact: 'low', likelihood: 'low', mitigation: "LEAD phase should explicitly document which option was chosen and why, and if B, add a one-line CHANGELOG note pointing users to /leo assist this_week/next_week as the replacement." },
  { risk: 'This SD was filed by a worker mid-task on a different SD, not from a dedicated triage pass -- the description above is accurate as of 2026-09-12 but has not been independently re-verified by a fresh LEAD reviewer.', impact: 'low', likelihood: 'low', mitigation: "LEAD phase for this SD should re-run the feedback_status_check + zero-caller verification itself before locking scope (5-10 minutes), per this repo's own \"verify claims against reality\" LEAD pre-approval discipline." }
];

async function main() {
  const { error } = await supabase.from('strategic_directives_v2').update({ description, scope: description, key_changes, risks }).eq('sd_key', SD_KEY);
  if (error) throw new Error(error.message);
  const { data: after, error: e2 } = await supabase.from('strategic_directives_v2').select('description, key_changes, risks').eq('sd_key', SD_KEY).single();
  if (e2) throw new Error(e2.message);
  if (!after.description || after.description.length < 100) throw new Error('VERIFY FAILED: description too short after write');
  console.log('OK:', SD_KEY, 'enriched. description length:', after.description.length, 'key_changes:', after.key_changes.length, 'risks:', after.risks.length);
}
main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
