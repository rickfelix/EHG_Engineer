# Chairman Decision Surfaces — Inventory

> SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001 · 2026-06-11
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

| # | Surface | Mechanism | Writers | Pending shape | Queue coverage |
|---|---------|-----------|---------|---------------|----------------|
| 1 | `chairman_decisions` | Table; atomic decide via `fn_chairman_decide` RPC (the name `decide_chairman_decision` does not exist on the live DB) | Venture stage-gate machinery (stage_gate/review/promotion_gate rows), `lib/chairman/record-pending-decision.mjs` proxy (session_question rows) | `status='pending'` (`decision='pending'`) | **Covered** — branch 4 (`chairman_approval`) |
| 2 | `venture_decisions` | Table; gate decisions per venture stage | Venture gate flow | `decision IS NULL` | **Covered** — branches 2/3 (`gate_decision`) |
| 3 | `agent_messages` escalations | Table; agent→chairman escalation messages | Agent fleet (`message_type='escalation'`) | `status='pending'` | **Covered** — branch 1 (`escalation`) |
| 4 | `feedback` (critical/high) | Table; durable flag/issue channel | `/signal`, `log-harness-bug.js`, sub-agents, captures, retros | `severity IN ('critical','high') AND resolved_at IS NULL AND status NOT IN ('resolved','wont_fix')` | **Covered (new)** — branch 5 (`flag_review`) |
| 5 | `okr_generation_log` | Table; monthly OKR generator parks generations for acceptance | `lib/eva/jobs/okr-monthly-generator.js` (with `OKR_REQUIRE_ACCEPTANCE`); accept path `lib/eva/jobs/okr-accept-generation.js` | `status='pending_chairman_acceptance'` | **Covered (new)** — branch 7 (`okr_acceptance`) |
| 6 | `leo_feature_flags` | Table; flags shipped OFF awaiting an enable-or-kill call | SDs shipping gated features (`lifecycle_state='draft'`, `is_enabled=false`) | draft + disabled + idle > 7 days | **Covered (new)** — branch 6 (`flag_enablement`); the queue records the call only — toggling stays in the flag tooling |
| 7 | CHAIRMAN-PENDING markers | Convention: feedback rows / memory flags / doc markers tagged "CHAIRMAN-PENDING" (e.g. DR entitlement flag 9715c003) | Workers/retros ad hoc | free-text marker, no uniform shape | **Uncovered** — no machine-readable pending predicate; severity-tagged ones surface via branch 5; full coverage needs a marker convention SD |
| 8 | AskUserQuestion (ephemeral) | In-session prompt; vanishes with the session | Any interactive session | none (ephemeral) | **Uncovered by reading** (nothing durable to read); **proxied on write** via `recordPendingDecision()` → surface 1. Reference wiring: `scripts/coordinator-escalate-question.mjs` |
| 9 | `session_coordination` | Table; coordinator↔worker message lane (questions, advisories, directives) | Coordinator/worker fleet | `payload->>kind` various; no uniform "awaiting chairman" kind | **Uncovered** — lane is agent-to-agent; genuinely-human questions are escalated via `coordinator-escalate-question.mjs`, which now lands in surfaces 1+4 (both covered) |
| 10 | Todoist (external) | Chairman's personal task system (MCP) | Chairman/assistants externally | external API, not in our DB | **Uncovered** — external system of record; out of scope by design (the queue must not write to or mirror an external personal tool) |

## Consumers (de-orphaning)

- `scripts/chairman-decisions.mjs list|decide` — CLI (+ `/decisions` skill in
  `.claude/commands/decisions.md` for the AskUserQuestion walk-through).
- `scripts/adam-exec-summary.mjs` — daily chairman email ("Decisions awaiting
  you", top 10 with age + one-line recommendation; GitHub-Actions cron
  `adam-exec-email-cron.yml`). This is the ≥1-live-consumer validation condition.

## Ordering semantics (`chairman_pending_decisions`)

`blocking DESC` → `effective_priority` class (base priority bumped one class
after 72h pending — visibility only) → `created_at ASC` (oldest first).
