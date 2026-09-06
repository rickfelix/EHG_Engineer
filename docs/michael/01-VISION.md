# Michael — Vision

**Status:** v0.1 APPROVED by chairman (Rick), Cowork session 2026-09-05 — D1 decided: D1-a (Michael as a Claude Code session; brief rendered to the chairman dashboard)
**Authority:** Chairman (Rick), in a Cowork session, 2026-09-05. Propose-only document; nothing here is an SD.
**Lineage:** Successor to the Cowork "Morning Brief" system (Dropbox `_Cowork`, Option E, distillation v2 of 2026-05-30).
**Next:** Specification (`02-SPEC.md`) → adversarial completeness pass → Solomon Mode-C commission → SD sourcing by Adam.

---

## 1. Why this exists

The Morning Brief was built as a set of Claude Cowork scheduled tasks plus a chat-session skill. It worked, and then it stopped: the overnight feeders died when the desktop scheduler went away in late June, and the last real brief was hand-assembled on August 1. Everything it had learned — months of the chairman's rulings on which email needs him, how his Todoist backlog should be rescheduled, what to stop surfacing — sits in markdown files that only a Cowork session on one specific claude.ai account can act on.

Three facts drive the decision to rebuild it inside the EHG harness rather than repair it where it is.

First, the harness already solved the durability problem the brief died of. Every duty in the harness that must survive session death runs in a durable venue (GitHub Actions cron, Windows Task Scheduler) with a liveness ladder that notices when it stops firing. The old brief had none of that; when it went dark, nothing noticed for weeks.

Second, the harness is account-independent by construction. Its role sessions launch under per-account `CLAUDE_CONFIG_DIR` profiles and rotate across all three Max accounts. Its integrations are direct APIs with credentials the harness owns. Nothing about it depends on which claude.ai account is logged in. The old brief depended on that account for its connectors, its schedule, its artifact, and its memory.

Third, the harness is database-first. Rules that live as rows can be gauged, versioned, ratified, and generated into prose; rules that live as markdown can only be read. The chairman's rulings are the most valuable thing the old system produced, and they deserve the same treatment the harness gives its role contracts.

The brief is therefore not being migrated. It is being rebuilt, keeping its rules and its designed experience, and discarding its implementation.

## 2. Who Michael is

Michael is the chairman's personal steward and gatekeeper: a singleton, propose-then-act role whose entire purpose is to protect Rick's attention and keep his personal day moving. The name is deliberate. The archangel's job is to stand guard and contend with what would intrude, never to rule. That is the posture.

Michael has three jobs, inherited unchanged from the distillation of 2026-05-30, and they are the only three things he is measured on: tame Gmail, so that only the handful of threads that genuinely need Rick reach him; drive Todoist, especially deciding what gets rescheduled and how, because the backlog is the standing pain; and manage distractions, raising only what deserves Rick's attention and holding everything else back.

Everything else the old brief carried — the Oracle stance, Watch Later picks, the Body section, yesterday's alignment score, household signals — is enrichment. Michael keeps it available and never volunteers it.

Michael has a voice: professional-casual, the sharp chief of staff. Contractions yes, slang no. He observes and hands over; he never commands, apologizes, pads, or narrates his own plumbing.

## 3. Where Michael sits among the other roles

The harness already has a morning brief. Adam's contract owns CHAIRMAN COMMS, including the 6:00 ET SMS brief about the fleet and the roadmap, delivered durably by GHA cron. Michael does not touch that. The boundary is by domain, not by time of day: Adam speaks for the fleet to the chairman; Michael speaks for the chairman's personal day to the chairman. Anything Michael finds that is fleet business (an EHG operations email, a Vercel or GitHub alert, a Claude Code incident) is summarized in the brief's EHG block and handed to Adam rather than acted on. Anything Adam holds that is personal (a household task that surfaced through a chairman SMS) is handed to Michael.

Solomon is not touched. Michael never asks for deep reasoning and is never an actor in Solomon's lanes; Solomon's only involvement is reviewing Michael's specification once, as a Mode-C commission.

EVA is not touched. The old Cowork system treated the EVA Todoist project and the "For Processing" queue as hands-off, and Michael keeps that rule. EVA remains venture orchestration.

The Coordinator is not touched. Michael is `non_fleet`, like Adam and Solomon; he never appears in fleet capacity, never claims an SD, never dispatches.

This boundary needs one ratification: a sentence in Adam's contract carving out the personal-day lane, encoded through the usual site-edit ritual before Michael's first live morning.

## 4. What Rick's morning looks like

Overnight, without any Claude session running, the feeders do their work and write their results to the database: Gmail is triaged and auto-labeled by the standing rules, Todoist state is read and effort-graded, the Oracle document is pulled from Drive, the Health Sync CSVs are pulled from Drive and parsed, the YouTube subscriptions are scanned, the Google Tasks bridge is drained. By 5:30 ET the brief's data is assembled and a rendered page exists.

When Rick says good morning, Michael opens with two or three sentences on the shape of the day and the one or two things worth attention, then walks the front page one topic at a time: Gmail first (what was cleared, what needs him, at most one judgment call), then Todoist (state, what fits today's window, at most one reschedule call). Each ruling Rick gives is applied immediately, written as a durable rule, and confirmed in a short clause. Stated intentions become Todoist tasks. Enrichment is offered once near the end and surfaced only on request. Michael signs off with a recap of what got done and appends the day's feedback entry: what was proposed, what Rick chose, and why.

That conversation is the product. The rendered brief is the reference it rides on.

**Decision D1 (open): the conversation surface.** Two options.

*D1-a — Michael as a Claude Code session (recommended).* Michael is launched like Adam and Solomon: a persistent terminal tab under whichever account profile has capacity, activated by `/michael`. The rendered brief is served in the EHG chairman dashboard (and optionally written to Drive). This is fully account-independent and uses every harness mechanism as-is. The cost is that the morning conversation happens in a terminal rather than in the Cowork chat Rick designed it in.

*D1-b — Harness overnight, Cowork by morning.* The feeders, data model, rendering, and rules all live in the harness; the morning conversation stays in Cowork, which reads and writes the harness database. This preserves the exact experience but reintroduces one claude.ai dependency at the very end, and the Cowork side would need its own connector to the database.

The recommendation is D1-a, with D1-b kept as a possible later addition once Michael's rules are stable. If Rick chooses D1-b, the account-independence claim in section 1 becomes "everything except the last mile."

## 5. Architectural principles

**Database is the source of truth.** Michael's rules (Gmail classification rules and label tree, Todoist reschedule and effort rules, closures, the danger-zone weights, the check-in journal mirror, Oracle history and alignment, the daily feedback ledger) are Supabase rows. Anything Rick wants to read as prose is generated from the rows, exactly as `CLAUDE_*.md` files are generated from `leo_protocol_sections`. Rulings are captured in conversation and encoded with provenance, the way Adam records chairman ratifications.

**Durable venue for everything that doesn't need a conversation.** Every feeder becomes a Node script on GHA cron (or Windows Task Scheduler where a local machine is required), registered in the periodic liveness ladder so that silence is noticed. Where a feeder needs an LLM for classification — Gmail triage against the rules, effort grading — it uses the harness's LLM client (API-keyed, Gemini-first by house policy), not a Claude Code session. The Claude Code session is reserved for the one thing that needs it: the morning conversation and its synthesis.

**Account-independent by construction.** Data access uses Google OAuth (Gmail, Calendar, Drive, YouTube) and Todoist tokens held in the harness's `.env` and GHA secrets, all of which identify Rick's Google and Todoist accounts and have nothing to do with which Claude account runs a session. Michael's session launches under any of the three account profiles. The acceptance test is literal: run Michael under each account and produce the same brief.

**Propose-then-act, with earned autonomy.** Michael starts where the old system ended: the clear cases are auto-handled (Gmail labels and archives by standing rule), and every judgment call is proposed and applied on approval. The feedback ledger records proposed-versus-chosen per topic. Categories that reach a run of full approvals become auto-apply candidates; categories that keep being overridden become rule-edit proposals. This is the self-improvement arc the old system designed and never got to run.

**Silence by default outside the morning window.** Michael speaks at "good morning" and when Rick addresses him. He has no heartbeat, no SMS cadence, no proactive pings; those are Adam's. His only unprompted output is the failure notice when a feeder did not land.

**Never claim more than landed.** The old system's doctrine E3 carries over as a hard rule: self-verify the brief, the data, and the rendered page before surfacing, and say so loudly when a check fails.

## 6. Scope

**In scope for v1** (as narrowed by decision D3 on 2026-09-05: v1 = calendar read, Gmail triage, Todoist brief, Google Tasks classifier, and the brief; Oracle, Health Sync, and YouTube are v1.1). The two-zone brief data model and renderer, the Michael role contract and activation skill, the rules data model and migration of the existing rules, the morning conversation flow with save-as-you-go and conversational capture, the daily feedback ledger, gauges, and the Dropbox retirement.

**Replaced, not ported.** The YouTube digest's Chrome automation (RSS via in-page fetch, Watch Later via JS clicks) is replaced by the YouTube Data API, which the harness already has OAuth for; the subscriptions, Watch Later, and the `[Cowork]` playlists are all API-readable and writable. The Cowork artifact is replaced by a dashboard page. Cowork scheduled tasks are replaced by GHA cron and the liveness ladder. The Dropbox mount is replaced by the database.

**Kept outside, by design.** The Google Apps Script Oracle continues to write its Doc and dated archive to Drive; Michael reads it. The Health Sync phone app continues to export CSVs to Drive; Michael reads them, and the manual-sync reminder stays a human step. Google Tasks continues to reach Todoist via the Apps Script bridge's Drive snapshot; the classifier reads it.

**Out of scope for v1.** Evening reflection (dropped 2026-05-16, stays dropped), voice-note routing (removed, no revival), weather and news in the brief (dropped), a phone or watch widget (dropped), the monthly unsubscribe sweep and the Exelon bridge processor (both worth porting, both separate from the morning brief; sequenced after v1), and any change to Adam's SMS brief.

## 7. What Michael inherits

From `_Cowork/memory`: the doctrine that still applies to a personal steward (family is high-signal, calendar outranks tasks, schedule realistically, aspirational cadence is the rule not Rick, question prerequisites, never claim more than landed); the Gmail label tree with its IDs and every triage rule and "always surface" entry; the Todoist rules (overdue handling, reschedule destinations, never-Tuesday, effort and capacity budgets, `Est:` convention, conversational capture); the closures registry; the danger-zone weights and the Body section contract; the feedback ledger format; Oracle history and alignment; the check-in journal mirror. The specification will map each file to its table.

From `_Cowork/scripts` and `templates`: the health parser's scoring logic and the renderer's two-zone layout, re-implemented in Node inside the harness.

From `_Cowork/skills`: the *rules* embedded in each feeder's recipe, not the recipes themselves; those were written for Cowork's connector tools and will be rewritten against direct APIs.

**Dropbox `_Cowork` retirement.** Once the rules and history are migrated and verified, the folder is either deleted or reduced to a generated read-only mirror. The specification will include a cleanup process: an inventory of what migrated, a verification that each migrated ruling round-trips from the database, an archive of the folder as a single dated zip, and then removal. Nothing in the harness will reference the folder afterward.

## 8. How success is measured

Michael's success is the three jobs, not whether the feeders ran. Concretely, over the first fourteen live mornings: the brief and its rendered page land by 6:30 ET every day, or the failure is surfaced before 6:30; the number of Gmail threads Michael surfaces trends down while the number Rick reopens from archive stays near zero; every overdue Todoist item is either done today or carries a specific date by the end of the morning conversation; the feedback ledger has an entry every morning, and at least one rule per week is written from a freeform ruling rather than a button; and the same brief is produced under each of the three accounts at least once.

Those become gauges in the harness's gauge runner, the same way the drive score is gauged, so that Michael's usefulness is visible on the chairman dashboard rather than felt.

## 9. Risks and open decisions

D1, the surface, is above. The others the specification must settle: the Gmail OAuth scope (`gmail.modify` is required for labeling and archiving; this is a broader grant than anything the harness holds today); the exact Adam-contract carve-out text and its ratification path; whether the check-in journal stays as Todoist comments or moves to a table with Todoist as a mirror; which LLM does overnight classification and what its error budget is; Michael's token envelope within the weekly account budgets; and whether the EHG chairman dashboard already has a page slot for the rendered brief or one must be built.

The largest risk is scope creep back toward the nineteen-section brief the distillation cut down. The specification will carry the two-zone layout and the three jobs as invariants, and the completeness challenge should test additions against them.

## 10. The path from here

The specification follows this vision and reads as an implementation plan: role contract, data model, per-feeder design, auth, rendering, conversation flow, migration and Dropbox retirement, gauges, cutover sequence, and the Adam carve-out. It gets one adversarial completeness pass in the drafting session, then goes to Solomon as a Mode-C commission with chairman provenance and a stated budget, then to Adam for SD sourcing at Tier 3 through the normal LEAD → PLAN → EXEC path, where the PRE_PLAN_ADVERSARIAL_CRITIQUE gate challenges it again.
