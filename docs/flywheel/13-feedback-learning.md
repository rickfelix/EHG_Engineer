---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, feedback, learning, retro, heal, signal, adam-adherence]
---

# Link 13 — Feedback / Learning Loops

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

This is the **up-flow that closes the loop**. Every shipped SD and every lesson learned flows back
up: lessons become backlog (so the system fixes its own friction), shipped work credits the KRs and
advances the rungs, and an adherence metric measures whether the system is converging on its own
rules. *"The system gets measurably better every cycle"* (the mission) is implemented here.

## The post-completion tail (the Ralph loop)

When a worker claims done, the **post-completion-tail Stop hook** re-injects continuation work rather
than letting the worker stop on a self-declared completion:

- **`/document`** — capture documentation.
- **`/heal`** — fix what the run revealed.
- **`/learn`** — extract lessons.
- **completion-flags capture** (`scripts/capture-completion-flags.js`) — the reflective "are there
  gaps we failed to close?" pass; incidental findings route to the durable feedback channel ("0
  flags" shown explicitly).

These are **continuation steps, never pause points** (CLAUDE.md). Enforced by the
post-completion-tail-enforcement Stop hook + the completion-flags witness check.

## Signal → backlog (friction becomes work)

- **`/signal <type>`** (stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug
  | feedback | other) writes a `session_coordination` row to the coordinator.
- **`lib/coordinator/signal-router.cjs`** promotes a fingerprinted signal to a `harness_backlog`
  `feedback` row at **≥3 distinct callsigns** OR **any critical** signal.
- **`scripts/log-harness-bug.js`** writes `feedback` (`category='harness_backlog'`) directly.
- These `harness_backlog` feedback rows **re-enter intake** (link 5) → become candidates → become
  SDs. *This is the literal loop closure:* the system's own friction is sourced as new work.

## Lessons + retros

- Retrospectives are stored in the `retrospectives` table (database-first).
- `/learn` extracts patterns; the auto-learning capture hooks
  (`docs/reference/auto-learning-capture-hooks.md`) persist them; future workers consult prior
  issues (`scripts/search-prior-issues.js`) **before** work — so the next worker starts from a higher
  baseline (the moat = learning speed).

## Crediting shipped work to outcomes

`sd_key_result_alignment` (link 3) credits a shipped SD to the KR(s) it contributes to. As V1
buildable capabilities ship, the build gauge (link 10) flips them `built`, raising `build_pct` and
advancing the V1 rung — and as V2 activates, shipped revenue work will move the outcome KRs. *That
is how shipped work advances the rungs.*

## The adam_adherence convergence metric

- **`adam_adherence_ledger`** (72 rows). Columns: `run_id`, `probe`, `duty`, `verdict`, `detail`,
  `remediation_ref`. Each run scores Adam against its own duties (e.g. "read the vision gauge", "route
  the SSOT first"). The exec-summary writes a durable *"Adam read the vision gauge"* marker
  (`recordVisionGaugeRead`) so the self-adherence audit can measure the vision-monitoring duty.
- This is a **convergence / catch-rate metric**: it measures whether the advisor is actually
  following the contract, so drift (e.g. the "degrade to hand-mining" regression) is *detected*, not
  silently tolerated. (SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-F was the
  convergence-metric child.)

## Existing documentation

- `docs/reference/auto-learning-capture-hooks.md`, `progressive-learning-format.md`,
  `retrospective-patterns-skill-content.md`, `pattern-lifecycle.md`. **Coverage: good (mechanics).**
- `docs/04_features/23a_feedback_loops.md`. **Coverage: partial.**
- `docs/reference/schema/engineer/tables/adam_adherence_ledger.md` — schema. **Coverage: good (schema).**
- **Gap (filled here):** no doc tied signal→backlog→intake→SD as *the loop closure*, nor framed the
  adherence ledger as the convergence metric in flywheel context. This doc fills it.

## Connects to

- **Up from:** LEO execution's post-completion tail ([09-leo-execution.md]).
- **Closes to:** backlog intake ([05-backlog-intake.md]) — friction becomes new work.
- **Advances:** the rungs ([02-vision-ladder.md]) via the gauge + KR credit ([10], [03]).
- **Audited by:** the adherence ledger; surfaced in the exec email ([15-executive-summary-email.md]).
