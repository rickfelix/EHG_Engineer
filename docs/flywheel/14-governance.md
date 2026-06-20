---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, governance, chairman, rung-activation, authorization]
---

# Link 14 — Governance / Chairman Control

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

Governance is the layer that **wraps everything**. The Chairman governs **by exception** — override
authority, not approval authority; reviews decisions, never enters data. Two governance levers
directly shape the flywheel: **rung activation** (what the fleet builds shifts only on a chairman
flip) and **authorization gates** (irreversible/dangerous acts hard-wait for chairman authority).

## Rung activation (the progression control)

- **Mechanism:** `vision_ladder_rungs.is_active`. Exactly one rung is active (today **V1**). When the
  chairman judges V1 sufficiently saturated, flipping `V2.is_active=true` shifts the build front
  toward Earning/revenue capabilities — and the build gauge **automatically re-points** to the new
  rung's criteria (`dbVisionSource` reads `WHERE is_active`).
- **Why this is the gate:** per [progression-gate.md], this is *the* "milestone gate" for shifting
  the fleet — it is the existing roadmap/ladder position + a chairman act, **not** an invented metric.
- The V1→V2 re-cut (4 revenue capabilities deferred to inactive V2) means activating V2 is what
  *turns on* those capabilities' probes — a deliberate chairman-timed reveal.

## Authorization gates (irreversible / dangerous acts)

| Act | Gate |
|-----|------|
| DB migrations to prod | 3-factor: `@approved-by:<git-email>` header per file + single-use `MIGRATION_APPLY_TOKEN` + git user.email (see `docs/sourcing-engine-activation-runbook.md`) |
| Destructive / outward-facing irreversible ops | chairman-authorized via AskUserQuestion before auto-deciding |
| Sourcing-engine populator staging | requires `apply=true` AND `chairmanApproved=true`; never auto-promotes to the belt ([07-sourcing-engine.md]) |
| Engine flag flips (go-live) | chairman/coordinator go-live decision ([06-adam-sourcing.md] SSOT step 3) |
| Adam-delegated DB-change apply | scoped, apply-only, fail-closed, revocable (`leo_protocol_sections` id=606) |
| Push enforcement bypass | `EMERGENCY_PUSH` with ticket reference |
| Handoff gate bypass | `--bypass-validation --bypass-reason`, rate-limited (3/SD, 10/day) |

## Chairman decision surfaces

The canonical inventory is **`docs/governance/chairman-decision-surfaces.md`** — the **10 places** a
"chairman needs to decide" can live and which the unified queue
(`chairman_unified_decisions` / `chairman_pending_decisions`) covers:

1. `chairman_decisions` (covered) · 2. `venture_decisions` (covered) · 3. `agent_messages`
escalations (covered) · 4. `feedback` critical/high (covered) · 5. `okr_generation_log` (covered) ·
6. `leo_feature_flags` enable-or-kill (covered) · 7. CHAIRMAN-PENDING markers (uncovered) · 8.
AskUserQuestion ephemeral (proxied on write) · 9. `session_coordination` (uncovered — agent-to-agent)
· 10. Todoist external (out of scope by design).

> **Constitutional rule:** the queue **NEVER decides anything**. Recommendations are display-only
> defaults; pending-too-long (>72h) escalates *visibility* only. Every decision is an explicit
> chairman act producing exactly one source write (`scripts/chairman-decisions.mjs decide`).

## The chairman's primary interface

- **Pull:** the unified decision queue + `scripts/chairman-decisions.mjs list|decide` +
  the `/decisions` skill.
- **Push:** the **executive summary email** ([15-executive-summary-email.md]) — "Decisions awaiting
  you" (top 10 by age + one-line recommendation), rendered as a copy-paste block the chairman pastes
  back into Claude Code to action.
- **Tiered HITL:** workers proceed autonomously (never AskUser) → escalate to Adam → Adam triages
  what reaches the chairman (urgent AskUser / phone-push / batched hourly email). Protects the
  chairman's attention.

## Existing documentation

- `docs/governance/chairman-decision-surfaces.md` — the surface inventory. **Coverage: good.**
- `docs/reference/activation-invariant-rule.md`, `docs/reference/always-ask-first-never.md`,
  `docs/runbooks/payment-rail-chairman-checklist.md`. **Coverage: partial (specific gates).**
- `leo_protocol_sections` id=606 — Adam DB-change apply authority. **Coverage: good.**
- **Gap (filled here):** no doc tied rung activation + the authorization gates + the decision
  surfaces together as *the governance wrapper of the flywheel*. This doc fills it.

## Connects to

- **Controls:** rung activation ([02-vision-ladder.md]) → shifts the build front ([progression-gate.md]).
- **Gates:** sourcing activation ([07-sourcing-engine.md]), migrations, destructive ops, LEO bypasses
  ([09-leo-execution.md]).
- **Surfaced via:** the executive summary email ([15-executive-summary-email.md]).
