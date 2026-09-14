#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- LEAD-phase spine enrichment.
 *
 * Replaces the auto-generated key_changes/strategic_objectives/risks placeholders with
 * real content, verified via direct read of scripts/michael/checkpoint-send.mjs (254 lines,
 * read in full) before writing. Every file:line citation below was confirmed present at
 * that location in this worktree at the time of writing.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const key_changes = [
    {
      change: "Add an on-demand send path to scripts/michael/checkpoint-send.mjs: an explicit invocation (e.g. --now with a reason) that bypasses the fixed-window check at line 113 (`if (!inWindow(minuteOfDay, windowConfig)) return {ok:true, inert:true, reason:'outside_et_window'}`) for exactly this call shape, while every downstream guard (enable/disable row read at line 127, same-day cap read at line 145, recipient hash-pin read at line 166, identity resolution at line 181) still runs unchanged. The ledger row's window_slot marks the send as on-demand (FR-7's dedup key), and it counts against the same 4/day cap (FR-1) alongside fixed-window sends.",
      impact: "Serves the chairman's authorized ad-hoc request ('Can you ask Michael to send me a text message now') without weakening any existing fail-closed guard -- the on-demand path is additive to the guard chain, not a bypass of it.",
    },
    {
      change: "Fix readProducingFeederCounts (checkpoint-send.mjs:82-93): currently orders by `attempt` descending and takes rows[0] with NO finished_at filter, so an in-flight (unfinished) attempt for a feeder is read as that feeder's latest data. Change to select the latest attempt with a non-null finished_at (or an explicit finished status) per feeder for the ET date, so an in-flight run is never mistaken for a completed one.",
      impact: "Closes the 2026-09-14 22:00Z race Michael's own audit found: calendar-read and todoist-brief (25 due/overdue) silently vanished from the text because summarizeCounts (line 61-74) drops any feeder whose row.counts[key] isn't a number, which an in-flight placeholder row triggers.",
    },
    {
      change: "When a feeder has no finished run for the ET date at all, name it explicitly in the composed body (e.g. 'todoist-brief: no run yet today') instead of summarizeCounts (line 61-74) silently omitting it from `parts` when `rowsByFeeder[feeder]` is undefined or its counts field isn't numeric.",
      impact: "A feeder gap becomes visible in the text instead of indistinguishable from 'this feeder produces nothing to report today'.",
    },
    {
      change: "Fix composeCheckpointBody (checkpoint-send.mjs:76-80): `asOf` is interpolated directly into the body with no formatting, so a raw ISO-8601 string (Postgres/Supabase's native finished_at representation) ships verbatim in the SMS text. Render it in plain ET (e.g. 'as of 12:30pm ET'), and when the per-feeder finished_at values disagree (counts drawn from different times), say so explicitly rather than reporting one silently-chosen timestamp for all three.",
      impact: "Matches FR-4's own stated intent (a fixed template a human can read at a glance) -- a raw UTC ISO string is not that.",
    },
  ];

  const strategic_objectives = [
    "Serve chairman ratification eb7e84b3 ('Michael should be able to send messages outside of the regular frequency slots. I authorize it') with an on-demand send path that reuses every existing fail-closed guard (recipient pin, identity, enable/disable, daily cap, quiet hours) rather than a separate, less-guarded code path.",
    "Fix the finished_at race Michael's own first live text exposed (ledger a8388820, 2026-09-14 22:00:03Z) so no future checkpoint text silently drops or misdates a feeder's counts.",
  ];

  const risks = [
    {
      risk: "An on-demand send path that reuses the fixed-window guard chain incorrectly (e.g. skipping the daily cap or recipient-pin check instead of only the window check) would reopen the exact tamper/spam risks FR-1/FR-2's fail-closed design already closed.",
      impact: "high",
      likelihood: "low",
      mitigation: "Implement the on-demand path as a single additional bypass condition on the existing inWindow() branch only (checkpoint-send.mjs:113) -- every line after that (enable/disable, cap, pin, identity, staged-ledger-before-send) stays the same code path, not a duplicate. PLAN/EXEC must add a test proving an on-demand call still refuses on pin mismatch, disabled, cap-exceeded, and quiet hours exactly like a fixed-window call.",
    },
    {
      risk: "Changing readProducingFeederCounts's selection logic (attempt-order to finished_at-aware) could change behavior for the fixed-window path too, since both on-demand and fixed-window sends call the same function -- a regression here affects every send, not just the new capability.",
      impact: "medium",
      likelihood: "low",
      mitigation: "Reuse the exact 2026-09-14 22:00Z race as a fixture in a new unit test (an in-flight row alongside a finished row for the same feeder/date) so the fix is proven against the real incident shape, not a synthetic one.",
    },
  ];

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, strategic_objectives, risks })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();
  if (sdErr) throw sdErr;
  console.log('UPDATED spine for', sdRow.sd_key);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
