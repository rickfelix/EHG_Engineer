# Invocation-Path Proof (WIRED-TO-FIRE)

> SD-LEO-INFRA-INVOCATION-PATH-PROOF-001 (children -A detector, -B classifier, -C gate, -D this doc + rollout).
> The systemic catch for the months-long *"shipped + tested + completed but nothing ever fires it"* class.

## REACHABLE vs INVOKED — the distinction this gate adds

Two different questions, two different gates:

| Gate | Proves | Example it catches |
|------|--------|--------------------|
| **WIRE_CHECK_GATE** | The new code is **REACHABLE** — a `package.json` script / import path exists so a human *could* run it. | A new CLI with no `npm run` entry. |
| **INVOCATION_PATH_PROOF** (this) | The autonomous code is **INVOKED** — a *live* production trigger (scheduled GHA workflow / loop-contract+workflow / `.claude` hook / parent-shell) actually fires it on its own. | A `*-loop.cjs` that ships, tests green, completes — but no cron ever runs it, so it sits inert in prod forever. |

**Reachable ≠ invoked.** An npm script proves a human can type it; it does not prove anything autonomous ever calls it. Autonomous runners (crons, sweep loops, daemons) are *supposed* to fire without a human — if nothing schedules them, they are dead on arrival, and that failure is silent (no error, just nothing happens). This gate makes that silence loud at LEAD-FINAL.

## The mechanism (how -A/-B/-C compose)

1. **Classifier — `lib/invocation-detector/requires-invocation.js`** (child -B): decides whether a changed file *requires* a live invocation path. Conservative / fail-open (defaults to NOT-required). A file REQUIRES invocation when it is a genuine autonomous runner:
   - lives under a `cron/` or `clockwork/` directory, **or**
   - its filename ends in `-loop` / `-cron` / `-sweep` / `-sweeper` / `-daemon` / `-worker` / `-autotriage`, **or**
   - it is a declared loop-contract entrypoint, **or**
   - it has a runnable surface (main / shebang / `process.argv`) **and** in-code scheduling (`setInterval`, `cron`, `--once`, `while (true)`, `every N minutes`).
   - Libraries (`lib/**`), tests, and one-off/archive files are **never** flagged.

2. **Detector — `lib/invocation-detector/index.js`** (child -A): maps a script to its live triggers across five matchers — `NPM_SCRIPT`, `GHA_WORKFLOW` (only counts when `on: schedule: cron` actually fires the `run:` step), `CLAUDE_HOOK`, `LOOP_CONTRACT_REGISTRY` (registry alone is **data-only**; counts as invoked only when a scheduled workflow wires its entrypoint), and `PARENT_SCRIPT_SHELL`. Returns `{ invoked, triggers[], excluded, warnings }`.

3. **Gate — `scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js`** (child -C): at LEAD-FINAL-APPROVAL, for each **added** `*.js/.mjs/.cjs` under `scripts/`/`lib/` in the SD's diff, a **violation** = *classifier says requires-invocation* **and** *detector says not invoked*. Venture-targeted SDs opt out (their triggers live in another repo) unless `metadata.wiring_required=true`. Fail-OPEN on git/load errors.

## How to satisfy the gate

Wire each flagged file with **one** live trigger:

- A **scheduled GitHub Actions workflow** (`.github/workflows/*.yml` with `on: schedule: cron`) whose `run:` step invokes it (directly or via `npm run`).
- A **loop-contract registry entry** (`lib/loops/loop-contract-registry.js`) **paired** with a scheduled workflow that wires its entrypoint (registry alone is not enough).
- A **`.claude` hook** registration (`.claude/settings.json`) if it is a lifecycle hook.
- A **parent script** that shells it, or an **npm script + workflow**.

If the file is *not* actually autonomous (a library / manual CLI / helper), it should not match the classifier — check its name/location (avoid the autonomous suffixes, the `cron/`·`clockwork/` dirs, and in-code scheduling).

Ship-dormant is fine: a runner gated behind a flag (e.g. `... --apply` / `*_ENABLE`) still needs the workflow that *would* invoke it to exist — the cron proves it is wired; the flag controls whether it acts.

## Rollout criteria (advisory → blocking)

The gate defaults to **ADVISORY** so it cannot mass-fail existing SDs on day one before the wired-to-fire discipline is adopted:

- **`INVOCATION_PATH_PROOF_MODE` unset / `advisory`** (default): violations are reported as **warnings**; the gate **passes**. Use this to measure the real false-positive rate across live SDs.
- **`INVOCATION_PATH_PROOF_MODE=block`**: violations **fail** the SD (the enforcing posture).

**Promotion criteria:** flip to `block` once advisory runs show the false-positive rate is acceptable (the classifier is conservative, so genuine violations should dominate) and the known exemplars below are all resolved. Promotion is a one-line env change — no code change.

## The 3 backfilled exemplars (current status)

| Instance | File | Status | Proof / rationale |
|----------|------|--------|-------------------|
| **exec-email** | `scripts/adam-exec-summary.mjs` | **WIRED** | `.github/workflows/adam-exec-email-cron.yml` (scheduled) drives the exec-email pipeline. |
| **prod-error-sweep** | `scripts/clockwork/prod-error-sweep-loop.cjs` | **WIRED** | `.github/workflows/prod-error-sweep-loop.yml` `cron: '40 * * * *'` + the `lib/loops/loop-contract-registry.js` entry (SD-LEO-INFRA-PROD-ERROR-SWEEP-WIRE-001). Ship-dormant behind `PROD_ERROR_SWEEP_LOOP_ENABLE`. |
| **staged→belt** | `scripts/sourcing-engine/proactive-populator.mjs` | **NOT-REQUIRED** (not a violation) | Manual / chairman-gated: no `-loop/-cron/-sweep` suffix, not in `cron/`·`clockwork/`, no in-code scheduling, no loop-contract entry → the classifier returns NOT-required, so it correctly does not need an invocation path. (Auto-promotion is a separate, deliberately chairman-gated decision — see SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001.) |

The staged→belt case is the important nuance: *not every un-wired script is a violation* — only ones the classifier judges genuinely autonomous. A manual, chairman-gated step is correctly exempt.
