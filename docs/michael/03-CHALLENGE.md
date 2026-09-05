# Michael — Drafting-session adversarial completeness pass

**Date:** 2026-09-05 · **Against:** `02-SPEC.md` v0.1 · **Result:** 7 blocking defects, 9 contradictions, 11 gaps, 6 scope-creep findings, 20 recommended edits. All findings verified against the live repo (`$HOME/mnt/EHG_Engineer`) by the critic before being accepted.
**Outcome:** `02-SPEC.md` revised to v0.2. Dispositions below. Three findings became chairman decisions (D2, D3, D4) rather than silent edits.

## Findings and dispositions

| # | Finding (short) | Verified against | Disposition in v0.2 |
|---|---|---|---|
| B1 | `michael_handoff`/`adam_handoff` kinds would be refused at insert (`dispatch.cjs:1291-1310` throws `DISPATCH_UNTYPED_ADAM_KIND`; no `DRAIN_SETS.michael`, `declaredAddresseeRole` knows only adam/solomon) | `lib/coordinator/dispatch.cjs`, `lib/fleet/worker-status.cjs:74-130, 353-380` | **Accepted.** Adam-bound items use the existing `chairman_handoff` kind with `payload.origin:'michael'`; the Michael-bound kind is registered in `PAYLOAD_KINDS`, `DRAIN_SETS.michael`, the drain-set registry, `declaredAddresseeRole`, `peer-target.cjs`, drained by `scripts/michael-inbox.cjs`. |
| B2 | `eva_sync_state.source_type` CHECK allows only `todoist`/`youtube`; a `google_chairman_oauth` row cannot exist as written | `database/migrations/20260209_eva_idea_processing_pipeline.sql:61,73` | **Accepted.** Credentials move to a dedicated `michael_credentials` table; EVA untouched. |
| B3 | `callWithLadderEscalation` is Gemini-only; no workflow carries `ANTHROPIC_API_KEY`; house rule is Max-plan-not-API (`CLAUDE_ADAM.md:98`) | `lib/llm/client-factory.js:641-693`, `.github/workflows` secrets census | **Chairman decision D2 — decided by Rick, overriding the drafting session's Gemini proposal.** Anthropic models only, on the three Max plans, never API billing. Consequence: all model work moves into Michael's seat (Haiku sub-agents read, Opus sub-agents verify, Sonnet converses) at an overnight tick; GHA does only model-free work and produces a degraded-but-verified brief when the seat is dead. Gemini stays only where EHG already uses it to read YouTube videos (v1.1, outside Michael's loop). |
| B4 | Liveness ladder can't route to Michael; `KNOWN_PEERS` = adam/solomon/coordinator; two rungs only | `lib/periodic-liveness/owner-target-resolver.mjs:23,62-67`, `ladder-escalation.mjs:5-7` | **Accepted.** Michael added to `KNOWN_PEERS` and `peer-target.cjs`; coordinator rung suppressed for `owner: 'michael'` by a code change; rung 2 stays the chairman digest. |
| B5 | `currently_expected_active:false` means unwatched, and the seeder force-writes `true` for role sessions | `scripts/periodic-liveness-watcher.mjs:227`, `seed-periodic-process-registry.mjs:88-102` | **Accepted.** Spec states plainly that the seat is unwatched; the seeder gets a Michael branch exempt from force-true. |
| B6 | `MUST_FIT_SINGLE_READ` is pinned by a unit test; composing the posture into the contract file risks the 25k cap | `scripts/modules/claude-md-generator/index.js:672`, `tests/unit/claude-md-single-read-cap.test.js` | **Accepted.** `CLAUDE_MICHAEL_MODEL_POSTURE.md` is its own file; the test is updated in the same PR. |
| B7 | Umbrella sequential workflow is incompatible with `*/15` self-healing + `cancel-in-progress` + 10-minute timeout | `.github/workflows/chairman-morning-brief-cron.yml` | **Accepted.** One workflow per feeder; ordering by checking upstream `michael_feeder_runs`, not job `needs:`. |
| C1 | YouTube Data API cannot read or write the `WL` playlist (dropped 2016) | documented API behavior; no WL refs in `lib/integrations/youtube` | **Accepted.** `[Michael] Picks` playlist replaces Watch Later. Feeder deferred to v1.1 (see D3). |
| C2 | "Gemini-first by house policy" is not a documented rule; the documented rule is Max-plan-not-API | grep of CLAUDE_CORE/ADAM/SOLOMON | **Accepted.** Wording corrected; D2 records the actual policy. |
| C3 | Calendar is requested and never read; Today/day-shape/alignment/Tuesday rule all need it | spec internal | **Accepted.** `calendar-read` feeder added to v1 core. |
| C4 | Todoist feeder would grade Adam's fleet items in the EHG chairman project `6grHWpvVM8QXrj5W` | `lib/integrations/todoist/chairman-notify.js:25,64` | **Accepted.** That project is excluded from grading; read only for the EHG block. |
| C5 | `feedback-ledger-check` as a session `CronCreate` loop violates the durable-venue invariant | workflow header comment | **Accepted.** Removed; `michael-ledger-gap` gauge covers it. `MICHAEL_LOOPS` is `quiet-tick` only. |
| C6 | Self-stamping feeders conflict with the GHA-observer liveness source (QF-20260830-694) | `seed-periodic-process-registry.mjs:176-190` | **Accepted.** No self-stamping; one auto-discovered `gha_cron` row per workflow. |
| C7 | Silence test doesn't say which actor is silent | spec internal | **Accepted.** Scoped to Michael's session. |
| C8 | `createBriefDoc` inserts a string verbatim; HTML would become literal tags | `lib/daily-review/drive-doc-client.js:60-78` | **Accepted.** Drive copy is the brief's markdown/plain text. |
| C9 | Path errors: `scripts/cron/…`, `lib/integrations/todoist/…`; `routeFinding` needs no branch | repo | **Accepted.** Corrected. |
| G1 | Restricted Google scopes on a consumer account in a Testing-status GCP project expire refresh tokens after 7 days; the existing YouTube token already died once | `oauth-manager.js:10-16`; Google policy (confirm in console) | **Accepted, elevated to chairman decision D4** (publish the consent screen / verify the app vs. accept a 7-day re-consent cadence). Spec adds `michael-oauth-health` gauge, `_OAUTH_EXPIRING` tick line, re-consent runbook, and a 9-day durability test. |
| G2 | Refresh token in both DB and GHA secret drifts on rotation | Google behavior | **Accepted.** DB is the single source; GHA decrypts with the encryption key secret. |
| G3 | PII in tables readable by every service-role session; no retention; API route lacks `requireAuth`; GHA logs | `server/index.js:248-254` | **Accepted.** Data-handling paragraph: 30-day purge of `rendered_html`/summaries/reasons, fleet-visibility caveat stated, `requireAuth` on `/api/michael/*`, counts-and-ids-only logging. |
| G4 | Gmail write failure semantics undefined | — | **Accepted.** Record-then-act with per-thread idempotency; label-id drift check; resurfacing rule for threads with new messages. |
| G5 | Overnight Todoist mutations not idempotent | — | **Accepted.** Dedupe on `(et_date, task_id, action)`. |
| G6 | Migration ceremony unsequenced | `scripts/lib/migration-guards.js`, `migration-deploy-drift-guard.yml` | **Accepted.** Added to cutover. |
| G7 | `account_profile` never stamped for role seats; independence gauge reads null | `worker-checkin.cjs:1685`, `solomon-register.cjs:154` | **Accepted.** `michael-register.cjs` stamps it. |
| G8 | No rollback for mis-archived threads; `_Cowork` deleted before the 14-day window | spec internal | **Accepted.** `gmail-act.mjs --unarchive` test; retirement after the 14-morning window; freeze step added. |
| G9 | Mode-C packet requires authority, budget-at-entry, and a ≤4096-char consult-lane row | `CLAUDE_SOLOMON.md:70-79, 259` | **Accepted.** `04-SOLOMON-COMMISSION.md` carries the packet; §12 rewritten. |
| G10 | Oracle Apps Script timing vs ET retry window | — | **Accepted.** Retry window widened; `missing:true` path already covered. |
| G11 | No error budget number for the cheap classifier | vision §9 | **Accepted.** 10% sample; trips at >5% disagreement over 7 days. |
| S1 | Six of eight feeders serve enrichment, not the three jobs | invariant §0 | **Chairman decision D3.** v0.2 splits v1 core (calendar, gmail, todoist, brief) from v1.1 (oracle, health, tasks-classifier, youtube). Rick can pull any into v1. |
| S2 | A GHA YouTube subscription digest already exists (`youtube-subscription-digest.yml`, `subscription-scanner.js`) in EVA's lane | repo | **Accepted.** v1.1 youtube feeder reuses the scanner; no second scanner. |
| S3 | Reconstructed ledger entries are Michael acting unprompted | invariant §0 | **Accepted.** Removed with C5. |
| S4 | Overnight label updates / check-in reschedule are acts without proposals | invariant §0 | **Accepted.** They are `auto_apply=true` rules imported as such (they were standing rules in the old system); stated explicitly. |
| S5 | Session reads generated `RULES.md` at startup, making prose the read path | invariant §0 | **Accepted.** Session reads rows via `michael-rules-load.mjs`; `RULES.md` is for the chairman's review only. |
| S6 | Opus/Sonnet cron calls add an API-billing dependency | invariant §0 | **Accepted** via D2: no model calls in cron at all; the seat does them on the Max plan. |

## What checked out and needed no edit

The register/identity/flag-migration copy pattern; the generator wiring; `VALID_TARGET_CONTRACTS` extension; ET wall-clock helpers; the `commitments` migration template; `createTodoistClient` reuse; `/sd-create` with letter-suffixed children; Tier-3 routing; Gmail `threads.modify` removing INBOX under `gmail.modify`; `drive.readonly` sufficing for Doc export and folder listing; and the absence of any Adam-contract clause that conflicts with a personal-day lane.

## Decisions surfaced to the chairman

**D2 — Models and venue.** Decided by the chairman: Anthropic models only (Haiku reads, Opus verifies, Sonnet at the seat; Fable has no v1 role), on the three Max plans, never API billing. Because a Max-plan model is only reachable from a Claude Code session, model work runs at Michael's overnight tick rather than in GHA, and the GHA layer must stand on its own with a degraded brief when the seat is down. Open sub-parameter: Haiku or Sonnet as the cheap tier. Rejected alternatives: the Gemini ladder (drafting-session proposal), and `ANTHROPIC_API_KEY` in GHA (API billing).

**D3 — v1 scope.** Adopted in v0.2: v1 core is calendar-read, gmail-triage, todoist-brief, brief-assemble/render. Oracle, health, tasks-classifier, youtube are v1.1, sourced as children once the three jobs are measured green. Alternative: ship all eight in v1.

**D4 — Google OAuth posture.** Not decided in the spec. Either publish/verify the GCP consent screen so restricted-scope refresh tokens persist, or accept a re-consent every 7 days surfaced by the `_OAUTH_EXPIRING` tick line. The spec is written to work under both; the runbook differs.
