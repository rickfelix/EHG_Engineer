---
name: grill
description: Adversarial sub-agent grilling for open SD questions. Runs Builder/Challenger/Judiciary multi-sample voting at T=0 over 5 rounds; emits a convergence artifact or dissent to chairman. Use when an SD reaches LEAD-TO-PLAN with metadata.open_questions_for_plan_phase populated.
allowed_tools: ["Bash", "Read", "Write"]
---

# /grill — adversarial autonomous grilling

The chairman never reviews intermediate rounds. They receive one artifact per /grill invocation: either a convergence row or a dissent block.

## Discipline

1. Resolve the questions to grill from `strategic_directives_v2.metadata.open_questions_for_plan_phase`.
2. Invoke `node scripts/pocock/grill-runner.mjs --sd-id <SD-ID>` from the parent worktree. T=0, ≥3 samples per agent per round, 5-round ceiling, ≤45 LLM calls/invocation.
3. The runner adapts the existing board-deliberation engine via config delta only (no fork). It records every invocation as a row in `grill_convergence_artifacts`.
4. Builder proposes; Challenger attacks; Judiciary scores. Convergence = ≥2/3 agents agree across ≥2/3 samples per round.
5. On convergence (`converged=true`): chairman sees a one-line summary and the recommended answer.
6. On non-convergence at round 5: chairman sees `dissent[]` (per-sample answers grouped by agent) — no Builder/Challenger turn-by-turn payloads.
7. Cost cap: graceful-stop at 45 LLM calls; partial dissent emitted.

See CONVERGENCE-PROTOCOL.md (same folder) for voting math, dissent rules, cost governor, fixture format.

## Wire-in

`LEAD-TO-PLAN` invokes `gates/grill-convergence.js`. Phase-1 (default): warn-only. Phase-2 (env `LEO_GRILL_HARD_FAIL=true`): block handoff when open questions exist and no fresh artifact is present. Bypass quota: 3/SD, 10/day.
