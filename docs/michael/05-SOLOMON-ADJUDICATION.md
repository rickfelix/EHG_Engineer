# Michael — Solomon adjudication of `02-SPEC.md` v0.2

**Status:** ADJUDICATION delivered · 2026-09-05 16:05Z · Solomon seat a531d943 (Fable 5.1), Mode C under `04-SOLOMON-COMMISSION.md` (authority: Chairman, Cowork session 2026-09-05; pasted into the seat 15:54Z).
**Budget at entry:** one deep pass, ≤150k tokens or ≤45 min wall-clock. Spent: one pass, 15:55–16:05Z wall-clock (about 12 min), no sub-agents, one compaction mid-pass (contract re-read in full after it). Nothing marked UNREACHED.
**Posture:** propose-only (CONST-002). Nothing here sources, claims, dispatches, or edits a row. Every verdict carries its evidence as `file:line`, a ledger row, or a ratification id; anything not measured here is labelled INHERITED (from the spec or challenge) or UNVERIFIED.
**Read, in order:** `00-README.md`, `01-VISION.md` v0.1, `03-CHALLENGE.md`, `02-SPEC.md` v0.2, plus the repo sites cited below, at root HEAD `462ff7f0a07` (level with origin/main at 15:52Z).

---

## Summary for the chairman

The spec is sound in shape and honest about its trades. Two of its ten answers should change before Adam sources it, and both are small.

1. **The Google token must not be decrypted in GitHub Actions.** Your own ratification 0daf3bd8 (29 August) says "GHA stays credential-free (DB-scoped duties → Task Scheduler)". The two feeders that hold the Gmail and Calendar grant belong on the Windows Task Scheduler on your machine, where the 5-minute sweep already runs; assembly and rendering can stay on GHA with no credential. That one venue change also removes the encryption key from GHA secrets and turns Q1 from REJECT to ACCEPT.
2. **The earned-autonomy counter must be computed from the ledger, not incremented by the seat that benefits from it**, and it must lose autonomy on the outcome signal (a thread you reopen from archive), not only on an override of a proposal. Otherwise it saturates the way the drive score's uptake leg has, pinned at its ceiling for ten straight readings.

Everything else is ACCEPT or ACCEPT-WITH-CONDITION. On D4 I recommend the seven-day re-consent posture for v1. On the cheap tier I recommend Sonnet, not Haiku, because the overnight remainder is by definition the hard cases. On the seat I say plainly that the accuracy history argues for Opus at the seat; you decided Sonnet, and the spec's read-back-before-encode makes that survivable if one condition is added.

---

## Q1 — Credential posture: `gmail.modify`, tokens in `michael_credentials`, decrypted in GHA

**Verdict: ACCEPT-WITH-CONDITION** (as written: REJECT on the venue; ACCEPT on storage).

Evidence.
- Storage is established precedent, not new machinery: `lib/security/encryption.cjs:6,15,60-61,79,88` (AES-256-GCM, PBKDF2-derived key from a master key, random IV, auth tag). Live callers today: `lib/integrations/youtube/oauth-manager.js` (tokens encrypted at rest under SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 FR-3, header lines 4-16) and `lib/operator/cash-sources/token-vault.js`. A dedicated `michael_credentials` row is the right shape; the challenge's B2 (`eva_sync_state` CHECK admits only todoist/youtube, `20260209_eva_idea_processing_pipeline.sql:61,73`) is correct and I re-derive it.
- The venue is the defect. Ratification **0daf3bd8** (chairman verbal 2026-08-29 ~13:13Z, encoded at `CLAUDE_ADAM.md:415`): "(ii) GHA stays credential-free (DB-scoped duties -> Task Scheduler)". The spec's §5 puts `MICHAEL_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` into GHA secrets and decrypts the refresh token there (§4 "Single source of truth"). A venue holding the master key and service-role DB access holds the plaintext by construction; encryption at rest buys nothing against that venue. This is a deviation from a ratified decision, which under `CLAUDE_ADAM.md` §4b is chairman-only, and under the PRE_PLAN gate it is a high-authority finding (Q9).
- Census, MEASURED: 227 workflows under `.github/workflows`; secrets used are `SUPABASE_*`, `PG*_STAGING`, `DATABASE_URL`, `GITHUB_TOKEN`, `SUPABASE_ANON_KEY`; two workflows carry a model key (`semantic-indexer-cron.yml`, `venture-ops-actuals-cron.yml`). No workflow holds a user OAuth refresh token today. Michael's would be the first.
- Scope: `gmail.modify` has no narrower alternative for label+archive (challenge, "What checked out"; INHERITED, consistent with Google's scope table). Accept the breadth; compensate.

Compensating controls I require.
1. Venue per 0daf3bd8: `calendar-read` and `gmail-triage` run on Windows Task Scheduler on the chairman's host (the venue the ratification names; `scripts/cron/stale-session-sweep-task.cmd` is the precedent shape), registered in the periodic ladder as `task_scheduler` rows. `brief-assemble`, `render`, `retention` stay on GHA with no credential. The re-consent flow already needs that host (`oauth-manager.js:31`, redirect URI `localhost:3456`).
2. The master key never lives in the same venue as service-role DB access outside the chairman's host: `.env` on the host only; no `MICHAEL_ENCRYPTION_KEY` GHA secret.
3. Record-then-act with `--unarchive` rollback (spec §5, §7) stays; add the per-run count of `threads.modify` calls to `michael_feeder_runs.counts` and a gauge ceiling (a run that modifies more than N threads is `degraded`, not applied), because the only irreversible harm in this lane is bulk mis-archive.
4. Bodies never stored; summaries and `needs_you_reason` purged at 30 days (spec §2). Accept the fleet-visibility caveat as stated; there is no finer isolation in this harness (service-role everywhere), and pretending otherwise would be the placeholder-honesty failure.

Smallest change to ACCEPT: §5 venue line for the two credentialed feeders → Task Scheduler; delete the three secrets from the GHA list; keep everything else.

## Q2 — D4: publish/verify the consent screen vs. accept 7-day re-consent

**Verdict: ACCEPT the re-consent posture for v1** (publish/verify: DEFER).

Evidence.
- The YouTube token's "prior death" is weaker evidence than the challenge treats it as. `oauth-manager.js:10-16` records a refresh token found plaintext, "already dead -- likely natural expiry, since its own refresh_token_expires_in was ~1.4h and the row was over a month old", confirmed by an `invalid_grant` exchange. That is an unmaintained row expiring, not a measured seven-day Testing-status cliff. The seven-day rule for restricted scopes in a Testing-status project is Google policy as INHERITED from the challenge (G1, "confirm in console"); I could not verify it from this seat and did not try (no console access; not a web-verifiable fact about our project).
- Publish/verify with `gmail.modify` (a restricted scope) on a consumer Google account means Google's app verification with a third-party security assessment; "Internal" status, which removes the cliff, is available only to Workspace-organisation users, and the grant identifies `rickfelix2000@gmail.com` (spec §4). So the "persist" posture is not a checkbox; it is a project.
- The spec already carries the re-consent machinery: `_OAUTH_EXPIRING` tick line, `michael-oauth-health` gauge (trips on `invalid_grant` or `expires_at < 48h`), one-command runbook on the chairman's laptop, and a nine-day durability test written to the posture (§4, §9, §11).

Conditions.
1. The gauge, not the tick line, is the source of the warning, because the tick runs in a seat that may be dead (Q3); route `michael-oauth-health` through the same rung-2 digest as feeder failures, and put the day-6 warning into Adam's 6am brief as one line (Q7 explains why that channel).
2. The nine-day test is the acceptance test of the chosen posture and must be run before go-live, once, under the re-consent posture (assert day-6 warning and day-7 trip).
3. Re-evaluate publish/verify only if re-consent is missed twice in the first fourteen mornings (a measured cost, not a feared one).

Smallest change: none to the spec text; record D4 = re-consent in §4 and delete the "works under either" hedge so the acceptance test has one shape.

## Q3 — D2: models only in the seat; GHA model-free; degraded brief when the seat is dead

**Verdict: ACCEPT-WITH-CONDITION.** Cheap tier: **Sonnet**, not Haiku.

Evidence on the durability trade.
- Role seats die and rotate at a rate the spec should carry as a number: `claude_sessions` rows with a role tag created in the last 7 days read Adam 5, Solomon 1 (MEASURED 15:5xZ; my own predecessor died 2026-09-04 01:36Z, the Adam seat was restarted by the chairman this morning and its successor's registration was refused for ten minutes, QF-20260905-201, fixed PR 8224 merged 08:54Z). `CLAUDE_ADAM.md` §5i exists because duties "previously lived only in session-scoped crons and DIED with each session". So an overnight tick that lands only when the seat is alive is the exception path in practice until measured otherwise, and the spec's `michael-seat-uptime` gauge is the right instrument; it must gate go-live, not merely observe.
- Respawn exists: `scripts/cron/reboot-respawn-task.cmd` → `scripts/fleet/reboot-respawn.cjs`, plus `lib/coordinator/singleton-relaunch-trigger.js`. It restores seats after a reboot; it does not make a live seat run its tick. A seat that is alive and parked still misses a tick that fires only from its own loop.
- The chairman's own model choice is respected: Anthropic-only on the Max plans (D2). The consequence the spec draws (no model in the durable venue) is correct; the venue for the model layer is therefore the seat, and the GHA/Task-Scheduler layer must be the brief of record.

Conditions.
1. Invert the naming: the model-free brief IS the brief; the seat's classification and lede are enrichment applied when the seat was alive. "Never claim more than landed" then holds by construction, and `finalized=false` stops reading as a failure.
2. Go-live gate: `michael-seat-uptime` reads at least 5 of 7 overnight ticks landed in the parallel-read week; below that, the chairman sees the number and decides whether to revisit D2 with a measured miss rate (the drafting session's Gemini ladder is the rejected alternative; it stays rejected unless he reopens it).
3. Cheap tier = Sonnet for the unmatched Gmail remainder and Todoist grading; Haiku only for fleet-email summaries. Reason: the remainder is what the standing rules could not match, which is the hard tail, not the bulk; and the Opus verifier re-judges every `needs_you`/`borderline` plus a 10% sample, which leaves 90% of auto-archives unverified. A wrong archive of a family thread is the exact failure the vision names high-signal. The cost difference on tens of items a night is negligible.
4. The overnight tick's sub-agents are stopped when their result is read (this seat's own D3 miss today, QF-20260905-768 class); a tick that leaves gatherers attached burns the Max plan the chairman is protecting.
5. Verbs run by absolute path from the repo root, never `cd`-and-run, so the auto-mode classifier does not stall the seat overnight (chairman ruling B this morning, QF-646 lineage).

## Q4 — Earned autonomy: 7 approvals → `auto_apply`; 3 overrides → revoke

**Verdict: ACCEPT-WITH-CONDITION.** Three failure modes on the record would repeat as designed.

1. **Saturation with a dead signal.** The drive score's `leg2_uptake` is a thresholded counter (`lib/drive-loop/score/leg2-uptake.js:48`, `UPTAKE_THRESHOLD = 0.8`) and reads 2/2 on all ten of the newest `drive_reports` rows (MEASURED 15:5xZ: [2,2,2,2,2,2,2,2,2,2]); the chairman ruled on 3 September that a leg which cannot move is a signal defect (ffebbd68). `approvals_streak` has the same shape once it flips: an auto-applied rule is no longer proposed, so it earns no approvals and no overrides, and the streak freezes at its ceiling. The revoke path (three overrides) can only fire on proposals, which auto-apply has removed.
2. **Self-authored evidence.** `rule-encode.mjs` increments the streak in the seat that benefits from the flip. Ratification 6c263823 (gate-evidence provenance) says evidence authored by the party it gates is absent, not weak. Same class.
3. **Auto-default without a safe-default guard.** Adam's no-reply policy (`CLAUDE_ADAM.md` §5g) auto-applies only items with a genuinely safe, reversible default and never spend. The spec's flip has no reversibility scope.

Conditions (smallest change).
- The streak is computed at read time from `michael_feedback_ledger.dispositions` (proposed vs chosen), never stored or incremented by the encoder; the same discipline as the board's frozen P1 predicate.
- Revoke fires on the OUTCOME signal: a thread reopened from archive (`--unarchive`, or a newer `last_message_id` on an archived thread the chairman then acts on), or a rescheduled task he moves back; overrides of proposals are the second trigger, not the only one. The vision already names "reopens from archive stays near zero" as a success measure; make it the revoke input.
- `auto_apply` is permitted only for reversible verbs (label, archive, reschedule); complete/delete never auto-apply.
- An auto-applied action still writes a disposition row with `chosen: 'auto'`, so the grain survives the flip and the weekly Opus review has something to read.

## Q5 — Seat model: Sonnet at medium effort for the conversation

**Verdict: ACCEPT-WITH-CONDITION**, and the accuracy history argues for Opus at the seat.

Evidence. The chairman commissioned my re-verification of 4 September's work because the seats running Opus that day "were making a lot of mistakes and catching their own mistakes" (my seat record, 10:33Z 09-04); ratification 558cf9c3 exists because two unlabelled inherited claims reached him; c44cd9d8 exists because rulings were encoded wrong; and every seat whose job is to encode his rulings (Adam, this one) runs the strongest model at high effort. The vision (§1) calls his rulings the most valuable thing the old system produced. A Sonnet seat at medium effort is the one place this spec spends least where the value is highest.

What makes Sonnet survivable, if kept: rulings are read back before encoding (spec §3), verbs are scripts, and the weekly Opus review re-reads dispositions (§3). Condition to add: any `rule-encode` that flips `auto_apply` or supersedes an existing rule is verified by an Opus sub-agent before the row is written (a ten-second call on the highest-stakes writes), and the weekly review re-reads the week's encodes against the ledger, not only the dispositions.

Recommendation, yours to decide (D2 named Sonnet): the seat pin is a posture parameter (`MODEL_DEFAULTS.claude.michael`); default it to Opus at medium effort, with Sonnet as the fallback under account quota. A twenty-minute morning conversation on Opus is a small fraction of any Max plan's day; the fleet's Opus-day error rate is the cost of the alternative.

## Q6 — Boundary: the Adam carve-out and the handoff kinds

**Verdict: ACCEPT-WITH-CONDITION.** The clause closes the SMS lane; four seams remain open.

Evidence. `CLAUDE_ADAM.md` §5g scopes Adam's texts to fleet and roadmap; the words personal, household, Gmail do not appear in his contract (MEASURED grep: `Todoist` once at :317 for `notifyChairman`, `calendar` once at :409). `chairman_handoff` exists (`lib/fleet/worker-status.cjs:98`, `lib/coordination/lane-contract.cjs:161`); `michael_handoff` does not, and untyped or unregistered kinds are skipped by every inbox reader (the challenge's B1 is right; a specimen of the same class from Adam's own seat landed at 13:56Z today, an untyped row to the coordinator).

Open seams and the condition for each.
1. **Two briefs, one morning.** Adam's 6am SMS and Michael's front page both carry an EHG block. Michael's whole job is the chairman's attention; a second summary of the same fleet events, with two labels, is the distraction he exists to prevent. Condition: Michael's EHG block is a pointer ("Adam's 6am brief covers the fleet; N items handed to him"), never a re-summary.
2. **Backpressure.** `chairman_handoff` rows with `origin:'michael'` are directed rows to Adam; the dispatcher counts unanswered directed rows (`lib/coordinator/dispatch.cjs:1045-1123`, limit 3) and today parks Solomon's rows behind that floor. A feeder writing rows nightly adds to Adam's floor. Condition: `origin:'michael'` rows are informational (exempt from the count) and batched one per morning.
3. **Todoist EHG project.** `6grHWpvVM8QXrj5W` is Adam's `notifyChairman` target (`lib/integrations/todoist/chairman-notify.js:25,64`; INHERITED from C4). Read-only for Michael is right; add the mirror rule to the clause: Adam never writes to the personal projects.
4. **EVA's scanner.** v1.1 reuses `subscription-scanner.js` running in EVA's workflow. Two consumers of one process-registry row need one owner. Condition: EVA owns the scanner row; Michael reads its output; stated in the v1.1 child.

`michael_handoff` as a new kind is acceptable only if registered in the same PR everywhere the challenge lists (`PAYLOAD_KINDS`, `DRAIN_SETS.michael`, the DB drain-set registry, `declaredAddresseeRole`, `peer-target.cjs`) and the lane-lint gauge (`lib/coordination/lane-lint-gauge.cjs`) reads it; a partial registration is the untyped-row class.

## Q7 — Liveness: suppress the coordinator rung for `owner:'michael'`; seat unwatched

**Verdict: ACCEPT the rung suppression; REJECT "unwatched"; ACCEPT-WITH-CONDITION overall.**

Evidence. `scripts/periodic-liveness-watcher.mjs:225-228`: `currently_expected_active:false` → `INTENTIONALLY_DOWN`, i.e. never observed. `scripts/seed-periodic-process-registry.mjs:88-102` force-writes `true` for adam/solomon/coordinator role sessions under `owner:'chairman-fleet'`; a Michael branch exempt from that is what the spec proposes. The ladder is owner-first at rung 1 (`lib/periodic-liveness/ladder-escalation.mjs:69-79`; owner routing live since PR 8158/8159 this morning) and rung 2 is the `chairman_decisions` digest.

Why "unwatched" fails: an unwatched seat whose overnight tick silently does not fire is exactly the detector-with-no-sink class this seat flagged on the stale-session sweep today (QF-20260905-230). The spec's `michael-seat-uptime` gauge counts missed ticks, but a gauge with `owner:'michael'` routes owner-first to the dead seat before it reaches rung 2.

Conditions.
1. Replace "unwatched" with a windowed expectation: `currently_expected_active:true` inside 04:30–07:30 ET, false outside. The watcher has no window field today (spec is right); adding `expected_window_et` to the registry row and one check at :227 is a smaller change than a permanent blind spot, and it is the same change the sweep's hidden-console class needs.
2. Rung-2 latency must beat the morning: a feeder failing at 05:00 ET reaches the chairman by 06:30 ET. The digest rides Adam's slots; the cheapest durable channel that already exists is one line in Adam's 6am SMS ("Michael's overnight feeder X failed; the brief is degraded"). That is a handoff Adam's clause already permits (fleet-relevant item toward the chairman), and it needs no new rung.
3. Suppress the coordinator rung by the owner registry (`KNOWN_PEERS` in `owner-target-resolver.mjs`), not a code special-case for the string `michael`; the coordinator has no lever on Michael's feeders, so the suppression is correct.

## Q8 — D3: v1 = calendar, gmail, todoist, brief; the rest v1.1

**Verdict: ACCEPT**, with one measurement caveat to state.

The three jobs are measurable on the four v1 feeders: calendar gives the day shape and the Tuesday rule; gmail-triage gives surfaced-vs-reopened; todoist-brief gives overdue-with-a-date. None of the deferred feeders carries a rule the v1 conversation cannot honor: Oracle, health, and YouTube are enrichment by the spec's own invariant, and the tasks-classifier's rules are Todoist rules, which v1 holds.

The caveat: the Google Tasks bridge (tasks-classifier, v1.1) is the one deferred feeder that touches a v1 job. Items the chairman captures by phone into Google Tasks are invisible to "drive Todoist" until the bridge lands, so the v1 measure "every overdue item carries a date" is measured on the Todoist view only. State that in vision §8's measures, or pull tasks-classifier into v1; either is honest.

## Q9 — Gate preview: what PRE_PLAN_ADVERSARIAL_CRITIQUE would block on today

Evidence: `scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js:7-62` (block fails the gate unless an audited override exists; every could-not-run reports COULD_NOT_CHECK; a sufficiency threshold now anchors block severity to decision-authority cost, after 358 of 373 historical verdicts read block); `lib/eva/devils-advocate.js`; `lib/eva/invariant-library.js` runs alongside.

What blocks today, in order of authority cost.
1. **Ratified-decision deviation** (high-authority category): the GHA credential venue vs 0daf3bd8 (Q1). One high-authority finding suffices under the sufficiency rule. Clears with the venue change or an explicit chairman re-ruling recorded as a ratification.
2. **Security keywords force Tier 3 and the SECURITY sub-agent** (`CLAUDE.md` Work Item Routing: credentials, auth): `gmail.modify`, a new credentials table, a new API route. Clears with a security-agent evidence row carrying provenance (6c263823) on the `-C` child, and `requireAuth` on `/api/michael/*` (spec §2) present in the PR.
3. **Machinery restraint** (76a3c081: "let's not turn this into another machinery-building initiative; finish the UAT and launch path"): a new role with ten children, a new lane kind, a new liveness branch. The devils-advocate will cite it. Clears with this commission's chairman provenance plus a sequencing line in the orchestrator SD: all Michael children rank behind the AltifyAI eleven-surface build (767b288f) and the one-venture-per-month cadence is unchanged.
4. **The single-read cap** (`MUST_FIT_SINGLE_READ`, pinned by `tests/unit/claude-md-single-read-cap.test.js`): handled by the spec (B6); the gate checks the test moves in the same PR.
5. **PRD completeness against the invariant library**: the spec's §0 invariants map to checkable predicates; the gate's codified checks would want the acceptance tests of §11 as measurable criteria with instruments named (the CAPA rule 49656c8c: every workstream carries a CI-asserted exit predicate). Clears when each of the nine gauges in §9 names its query.

## Q10 — Where I differ from the drafting-session challenge

Accepted by the challenge, rejected by me.
- **B3/D2 venue and G2 "GHA decrypts with the encryption-key secret."** The challenge verified the secrets census and missed the ratification (0daf3bd8). Reversed in Q1.
- **B5 "the seat is unwatched."** Reversed in Q7 for a windowed expectation.
- **S4 overnight auto-apply imports as standing rules.** Accepted, but only with Q4's reversibility scope and read-time streak.

Rejected by the challenge (or the chairman), where I would have accepted with a bound.
- **The Gemini ladder for the overnight remainder (B3, the drafting session's original).** A durable-venue classifier on the model the house already runs in two GHA workflows would have made the model layer land every night. The chairman decided D2 and I do not relitigate it; I record it as the counterfactual with its trigger: if `michael-seat-uptime` trips twice in the first fourteen mornings, the measured miss rate returns D2 to him.

Where the challenge was right and I re-derived it: B1 (kinds refused at insert), B2 (the CHECK constraint), C4 (the EHG chairman project), C5 (the CronCreate loop), G3 (fleet visibility stated plainly), G7 (`account_profile` stamping).

---

## Verdict table

| Q | Verdict | Smallest change to ACCEPT |
|---|---|---|
| Q1 | ACCEPT-WITH-CONDITION (venue REJECT) | Credentialed feeders on Task Scheduler on the chairman's host; no key or client secret in GHA |
| Q2 | ACCEPT re-consent posture; DEFER publish/verify | Record D4 = re-consent; gauge, not tick line, is the warning source |
| Q3 | ACCEPT-WITH-CONDITION; cheap tier Sonnet | Model-free brief is the brief; seat-uptime gates go-live; stop sub-agents; absolute-path verbs |
| Q4 | ACCEPT-WITH-CONDITION | Streak computed from ledger rows at read time; revoke on reopen; reversible verbs only |
| Q5 | ACCEPT-WITH-CONDITION | Opus verification on auto_apply flips and supersedes; seat pin as a parameter, Opus recommended |
| Q6 | ACCEPT-WITH-CONDITION | EHG block is a pointer; origin:'michael' rows informational; scanner ownership stated |
| Q7 | ACCEPT suppression; REJECT unwatched | Windowed expectation on the seat; feeder failure as one line in Adam's 6am brief |
| Q8 | ACCEPT | State the Google Tasks caveat in the v1 measures, or pull tasks-classifier into v1 |
| Q9 | (preview) | Venue change; security evidence with provenance; sequencing behind 767b288f |
| Q10 | (differences listed) | — |

## What this adjudication does not do

It does not redesign the spec, source an SD, or change any row. The chairman decides D4 and the conditions; the drafting session revises to v0.3 or hands `02-SPEC.md` to Adam for `/sd-create` as `SD-LEO-INFRA-MICHAEL-ROLE-FORMALIZATION-001`. My D3 self-score for this commission: one pass, no sub-agents, delivered inside the ceiling; recorded in the seat record.

Solomon
