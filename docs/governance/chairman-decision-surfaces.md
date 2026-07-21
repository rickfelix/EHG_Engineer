# Chairman Decision Surfaces — Inventory

> SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001 · 2026-06-11
> Updated by SD-EHG-CONSOLE-QUEUE-POLLUTION-001 · 2026-07-10 (chairman-actionable predicate)
> Updated by SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 · 2026-07-10 (escalation reach + SLA dispatch)
>
> The 10 places a "the chairman needs to decide something" can live, and which
> are covered by the unified queue (`chairman_unified_decisions` /
> `chairman_pending_decisions`, extended by
> `database/migrations/20260611_chairman_decision_queue.sql`).
>
> **Constitutional rule**: the queue NEVER decides anything. Recommendations
> are display-only defaults; pending-too-long (>72h) escalates *visibility*
> (sort order) only. Every decision is an explicit chairman act producing
> exactly one source write (`scripts/chairman-decisions.mjs decide`).
>
> **Chairman-actionable predicate (SD-EHG-CONSOLE-QUEUE-POLLUTION-001, PR #744,
> `ehg` repo)**: console assessment ledger findings #8/#16 found the queue
> rendering machine-internal signals (session_question "PM stall" telemetry,
> harness_backlog/fleet_dormancy/process_enforcement feedback rows) as Critical
> chairman decisions, and test-fixture-linked rows on every consumer. Fixed by
> splitting the live 7-branch UNION into an unfiltered base view
> (`chairman_all_decision_signals`) that `chairman_unified_decisions` and a new
> `chairman_excluded_signals` view both filter with one predicate and its
> logical inverse — excluded rows remain reachable and labeled at
> `/chairman/decisions/excluded`, never silently deleted. Scope note: this fix
> covers the decision queue and its known consumers
> (`useDecisionGateQueue.ts`, `useChairmanDashboardData.ts`'s decision stack)
> specifically — it does NOT extend the new fixture name-pattern exclusion to
> every venture-listing surface (e.g. the Attention Queue Sidebar still relies
> on the pre-existing `is_demo`-only filter in `applyVentureVisibility`).

| # | Surface | Mechanism | Writers | Pending shape | Queue coverage |
|---|---------|-----------|---------|---------------|----------------|
| 1 | `chairman_decisions` | Table; atomic decide via `fn_chairman_decide` RPC (the name `decide_chairman_decision` does not exist on the live DB) | Venture stage-gate machinery (stage_gate/review/promotion_gate rows), `lib/chairman/record-pending-decision.mjs` proxy (session_question rows) | `status='pending'` (`decision='pending'`) | **Covered** — branch 4 (`chairman_approval`), **except session_question rows** — excluded from the queue since SD-EHG-CONSOLE-QUEUE-POLLUTION-001 (confirmed live: 100% of session_question rows are machine-internal PM-stall telemetry, not genuine chairman questions); reachable via `chairman_excluded_signals` |
| 2 | `venture_decisions` | Table; gate decisions per venture stage | Venture gate flow | `decision IS NULL` | **Covered** — branches 2/3 (`gate_decision`) |
| 3 | `agent_messages` escalations | Table; agent→chairman escalation messages | Agent fleet (`message_type='escalation'`) | `status='pending'` | **Covered** — branch 1 (`escalation`) |
| 4 | `feedback` (critical/high) | Table; durable flag/issue channel | `/signal`, `log-harness-bug.js`, sub-agents, captures, retros | `severity IN ('critical','high') AND resolved_at IS NULL AND status NOT IN ('resolved','wont_fix')` | **Covered (new)** — branch 5 (`flag_review`), **minus a machine-internal category denylist** (`harness_backlog`/`fleet_dormancy`/`process_enforcement`) since SD-EHG-CONSOLE-QUEUE-POLLUTION-001 — genuine categories still surface unchanged |
| 5 | `okr_generation_log` | Table; monthly OKR generator parks generations for acceptance | `lib/eva/jobs/okr-monthly-generator.js` (with `OKR_REQUIRE_ACCEPTANCE`); accept path `lib/eva/jobs/okr-accept-generation.js` | `status='pending_chairman_acceptance'` | **Covered (new)** — branch 7 (`okr_acceptance`) |
| 6 | `leo_feature_flags` | Table; flags shipped OFF awaiting an enable-or-kill call | SDs shipping gated features (`lifecycle_state='draft'`, `is_enabled=false`) | draft + disabled + idle > 7 days | **Covered (new)** — branch 6 (`flag_enablement`); the queue records the call only — toggling stays in the flag tooling |
| 7 | CHAIRMAN-PENDING markers | Convention: feedback rows / memory flags / doc markers tagged "CHAIRMAN-PENDING" (e.g. DR entitlement flag 9715c003) | Workers/retros ad hoc | free-text marker, no uniform shape | **Uncovered** — no machine-readable pending predicate; severity-tagged ones surface via branch 5; full coverage needs a marker convention SD |
| 8 | AskUserQuestion (ephemeral) | In-session prompt; vanishes with the session | Any interactive session | none (ephemeral) | **Uncovered by reading** (nothing durable to read); **proxied on write** via `recordPendingDecision()` → surface 1. Reference wiring: `scripts/coordinator-escalate-question.mjs` |
| 9 | `session_coordination` | Table; coordinator↔worker message lane (questions, advisories, directives) | Coordinator/worker fleet | `payload->>kind` various; no uniform "awaiting chairman" kind | **Uncovered** — lane is agent-to-agent; genuinely-human questions are escalated via `coordinator-escalate-question.mjs`, which now lands in surfaces 1+4 (both covered) |
| 10 | Todoist (external) | Chairman's personal task system (MCP) | Chairman/assistants externally | external API, not in our DB | **Uncovered** — external system of record; out of scope by design (the queue must not write to or mirror an external personal tool) |

## Escalation reach and SLA dispatch (SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001, 2026-07-10)

Two gaps closed, both on surface #1 (`chairman_decisions`):

- **No raiser bypass**: `shouldAutoEscalate` (`lib/chairman/record-pending-decision.mjs`) previously fired the
  standout on-creation email only when the caller passed `raisedBy==='adam'` — every producer that inserts
  `chairman_decisions` directly (stage-gate machinery, coordinator escalations, event-bus handlers, etc.,
  ~16 producer classes) structurally bypassed it, so a blocking pending decision from any of them had no
  reliable path to the chairman. Widened: **any `blocking===true` row now escalates regardless of raiser**;
  the `adam` + `session_question` path is preserved unchanged. Producer-by-producer coverage is pinned in
  `tests/unit/chairman/all-paths-producers.test.js` (the Stage-0 ready-venture pause is the regression fixture).
- **Dormant SLA backstop, now dispatched**: `lib/eva/chairman-sla-enforcer.js` (`enforceDecisionSLAs`) and its
  predecessor `lib/eva/chairman-decision-timeout.js` had zero production call sites — the assumed 24h fallback
  had never run once (registered-verifier-never-dispatched class). `scripts/cron/chairman-decision-sla-sweep.mjs`
  + `.github/workflows/chairman-decision-sla-cron.yml` is now the named dispatcher, running the enforcer
  **notify-only** (`blockOnViolation:false` — never mutates `blocking`) plus a dedicated blocking-row
  grace-period sweep (the enforcer itself exempts blocking rows). Only the enforcer is armed;
  `chairman-decision-timeout.js` is its documented predecessor and stays unscheduled to avoid double-escalation.
- **Quiet-window race fixed**: `escalateChairmanDecision` previously stamped `brief_data.escalation_email_sent_at`
  at spawn, before `adam-decision-email.mjs` checked the 23:00–05:00 ET quiet window — an item could be marked
  sent but never delivered. The quiet-window check now runs before any stamp/spawn; suppressed rows stay
  eligible for the next sweep pass.
- **Sweep-side telemetry guard**: `lib/chairman/chairman-actionable.mjs` mirrors the console's chairman-actionable
  allowlist (row #4's predicate above) for the JS-side sweep, with a documented superset — blocking rows escalate
  by email even when a type (e.g. `stage_gate`) isn't in the console's own allowlist.

## `blocking` gains enforcement teeth, not just escalation priority (SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001, 2026-07-16)

Before this SD, `chairman_decisions.blocking` was read only by the escalation/SLA/ordering machinery
described above (email priority, SLA exemption, `chairman_pending_decisions` sort order) — it never
actually held a venture back. A pending `blocking=true` row and a pending `blocking=false` row let the
venture advance identically once any pre-existing gate (kill/promotion/review_mode) was satisfied.

Two changes close that gap:

- **FR-1 — classification**: `venture_stages.is_high_consequence` (chairman-configurable, independent of
  `gate_type`/`review_mode`) lets the chairman designate ANY stage — including one with no gate today
  (`gate_type='none'`) — as requiring binding sign-off. Read via `stage-governance.js`'s existing cached
  reader (`isHighConsequence(stageNumber)`).
- **FR-2/FR-3 — minting + enforcement**: for a stage currently classified high-consequence, every mint site
  in `lib/eva/stage-execution-worker.js` (the review-mode pause block, `_handleChairmanGate`, and the
  pending-decision canonical-RPC resolver) now (a) sets `blocking=true`, (b) forces minting past the
  pre-existing `stage_creates_decision` self-skip (`forceDecisionCreation`), and (c) bypasses the autonomy
  auto-approve shortcuts entirely — a chairman-designated high-consequence stage can never be waved through
  by an autonomy level, unlike a plain review-mode gate. Two independent chokepoints then HOLD venture
  advancement while that row is `status='pending' AND blocking=true`: the SQL RPC `fn_advance_venture_stage`
  and the JS daemon's `_advanceStage`. A `leo_feature_flags.LEO_HIGH_CONSEQUENCE_GATES_ENABLED` kill-switch
  (default ON) allows disabling the new HOLD fleet-wide without a deploy.

**Scope boundary (known, not silent)**: enforcement lives on the two canonical chokepoints only, matching
every prior stage-gating feature's precedent (kill/promotion/review/artifact-precondition). At least one
other advancement path (`lib/agents/venture-ceo/handlers.js::_updateVentureProgress`, the autonomous agent
runtime) writes `current_lifecycle_stage` directly with no gate of any kind and is not yet covered — tracked
in `docs/architecture/stage-advancement-path-census.md` entry #16 as a pre-existing, deferred bypass.

## WebAuthn/passkey step-up gate on high-consequence decisions (SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-C, 2026-07-21)

Extends the `blocking`/high-consequence machinery above (SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001) with a
second, orthogonal factor for the human chairman console specifically: a platform-authenticator-only
(Touch ID/Face ID/Windows Hello — never roaming keys) WebAuthn step-up challenge required before the
`approve_chairman_decision`/`reject_chairman_decision` write, for any decision where
`chairman_decisions.consequence_level='high'` OR `lifecycle_stage=24` (Stage 24 go-live). This is
Child C of the chairman-ratified two-tier auth model (chairman-ratified 2026-07-16): routine/bounded
decisions stay on the SMS tier (Child B); high-consequence decisions now additionally require a
completed passkey ceremony.

**Architecture note for future SDs touching this surface**: `ehg/src/pages/api/*` and
`ehg/src/middleware/chairman-auth.ts` are dead Next.js-shaped code in this Vite SPA (no `next` or
`@supabase/auth-helpers-nextjs` installed) — do not build on them. The live decide flow is
`ehg/src/components/chairman-v3/decisions/DecisionActions.tsx` +
`ehg/src/hooks/usePendingGateDecision.ts` (two separate call sites for the SAME
`approve_chairman_decision`/`reject_chairman_decision` RPCs — both must be updated together for any
future change to the decide contract) calling Postgres RPCs directly from the browser. WebAuthn
ceremony verification (real CBOR/COSE/signature crypto) runs in 4 new Supabase Edge Functions under
`ehg/supabase/functions/chairman-webauthn-*` — the only genuinely-deployed, browser-reachable,
crypto-capable compute surface in this repo. Token issuance/consumption is atomic
(`fn_verify_and_consume_stepup_token`, `chairman_stepup_tokens`), lockout-safe (no-op below 2 enrolled
credentials, checked live), and kill-switched via `app_config.chairman_stepup.enforcement_mode`.
Enrollment UI: Chairman Settings → Security tab (`WebAuthnRegistration.tsx`) — chairman-auth-gated
only, never step-up-gated, since it is itself the break-glass re-enrollment path.

## Consumers (de-orphaning)

- `scripts/chairman-decisions.mjs list|decide` — CLI (+ `/decisions` skill in
  `.claude/commands/decisions.md` for the AskUserQuestion walk-through).
- `scripts/adam-exec-summary.mjs` — daily chairman email ("Decisions awaiting
  you", top 10 with age + one-line recommendation; GitHub-Actions cron
  `adam-exec-email-cron.yml`). This is the ≥1-live-consumer validation condition.
- `scripts/cron/chairman-decision-sla-sweep.mjs` — hourly (outside the quiet window) SLA notify +
  blocking-row escalation sweep, dispatched by `.github/workflows/chairman-decision-sla-cron.yml`.
  Liveness self-registers in `periodic_process_registry` (named activation trigger = the workflow file).

## Ordering semantics (`chairman_pending_decisions`)

`blocking DESC` → `effective_priority` class (base priority bumped one class
after 72h pending — visibility only) → `created_at ASC` (oldest first).
