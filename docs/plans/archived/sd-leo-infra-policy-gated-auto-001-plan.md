<!-- Archived from: ./.coord-plan.md -->
<!-- SD Key: SD-LEO-INFRA-POLICY-GATED-AUTO-001 -->
<!-- Archived at: 2026-06-07T01:54:16.012Z -->

# Policy-gated auto-execution engine (canary + instant rollback, human-owned policy) — pilot on the checkout-sync op

## Problem / why
Irreversible or risky operations (e.g. the main-checkout deploy-sync, prod migrations, destructive cleanups) currently require per-act human authorization. That is the dominant human-in-the-loop bottleneck for fleet automation: the operator must approve each individual act. The fleet already uses canary+rollback patterns piecemeal (DATABASE sub-agent BEGIN..ROLLBACK, dry-run+count-guard before destructive DB ops, default-OFF flags, and the manually-stashed+branch-ref-preserved checkout sync). This SD generalizes those into a POLICY LAYER that auto-executes REVERSIBLE ops within human-owned rules, escalating only the genuinely-irreversible or out-of-policy.

## Load-bearing principle
Reversibility is the gate: an action is eligible for auto-execution ONLY if it can be undone within a bounded rollback window. The engine's first precondition is "is this reversible within the rollback window?" If no -> human-gated (or requires a recoverable variant, e.g. soft-delete).

## Scope (functional requirements)
1. POLICY SCHEMA (declarative, human-only-editable): per action-class define { preconditions, canary spec, rollback spec, blast-radius limit, observation window, escalation target }. Stored where only a human can edit it; the engine reads but never writes it.
2. ENGINE: evaluate policy preconditions -> take the rollback snapshot -> run the canary on the smallest safe scope -> observe for the window -> commit-or-rollback -> emit telemetry that surfaces in the 15-min executive email (so the operator SEES every auto-exec without being asked).
3. PILOT OP = the main-checkout deploy-sync (proven manually this session): preconditions = coordinator-improvements PR merged + uncommitted WIP verified-superseded + no live worker cwd in the main repo; rollback = git stash + preserved branch ref (restore within the window if any worker reports a PreToolUse/internal error); canary = run in a post-sweep quiet window and watch the next 2 ticks for worker hook errors.
4. REVERSIBILITY GATE enforced as a hard precondition. Irreversible / outward-facing acts (hard repo deletion, prod data purge without soft-delete, sending external email) are policy-FORBIDDEN from auto-exec and stay human-gated.
5. SAFETY: ship default-OFF behind a flag; golden test proving flag-OFF is byte-identical to current behavior; staged rollout. META-STABILITY GUARD: the engine must NOT be able to auto-execute changes to its own policy or guardrails (the policy spec is human-only-editable; self-modification of the safety layer is forbidden).

## Constraints
Safety-critical shared fleet machinery (same hazard class as the claim-sweep / coordinator-resolve machinery). Default-OFF, staged, golden-tested. Faithful canary + reliable rollback are non-negotiable: pair the canary with a blast-radius limit; the rollback must be more reliable than the action it guards.

## Success criteria
- The checkout-sync op can auto-execute under an operator-owned policy, with verified canary + rollback, flag-gated, emitting email telemetry; the operator approves the POLICY once, not each execution.
- Zero auto-execution of any irreversible / outward-facing op.
- Flag-OFF byte-identical (golden test passes).
- The policy/guardrail spec is provably human-only-editable (engine cannot modify it).

## Type
infrastructure (framework / safety-critical harness)
