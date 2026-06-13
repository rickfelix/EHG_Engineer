# Launch-Spike Rehearsal — runbook

**SD:** SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 (FR-4) · **Closes:** G9 (serial-dep on the support
pipeline), G15 (retro-fitted ceiling) · **Script:** `scripts/continuity/spike-rehearsal.mjs`

## What it proves
That when a launch spike + a breakage hits **while the chairman is away**, the fleet enters
**degraded-safe-mode** (freeze new work, hold intake, surface) and the incident costs **no more than a
PRE-REGISTERED chairman touch-count ceiling** — i.e. the human is touched a bounded number of times
regardless of spike size. This is the operationalised X3/X4 exit criterion.

## Why seeded + dry-run (no serial dependency)
The rehearsal runs against **seeded in-memory fixtures**, not the live DB or the (Phase-2,
demand-deferred) automated support pipeline. So it does **not** wait on that pipeline (fixes G9), and
the **ceiling is an INPUT** declared before the run (fixes G15 — the ceiling is not fitted to the
observed result afterward). It is idempotent and leaves no state behind.

## Run it
```bash
node scripts/continuity/spike-rehearsal.mjs        # dry-run; prints PASS/FAIL JSON, exit 0/1
npm run continuity:spike-rehearsal                 # same, via npm
npx vitest run tests/unit/spike-rehearsal.test.js  # the pure-core assertions
```

## Pass criteria (pre-registered)
- The breakage drives the fallback ladder to **PAUSE_AND_SURFACE** (degraded-safe-mode).
- Degraded-safe-mode **freezes new work** and **holds ALL intake** (nothing auto-processed, nothing
  auto-killed, nothing auto-promoted — consistent with `chairman-away-gate-policy.md`).
- **Chairman touches ≤ the pre-registered ceiling** (default **1**: a single surface). The touch-count
  must NOT scale with intake volume — a 1-item spike and a 500-item spike both cost 1 touch.

## If it FAILS
- `did not reach degraded-safe-mode` → the detector's rung mapping or the canary thresholds are off;
  check `scripts/continuity/llm-degradation-detector.mjs` + `anthropic-cap-contingency.md`.
- `chairman touches exceeded the ceiling` → some path is touching the chairman per-item instead of a
  single surface; that is the G15 failure mode — fix the response to surface ONCE.
- `intake not fully held` → degraded-safe-mode is auto-processing intake; it must HOLD.

## Cadence
Run before any launch spike and whenever the detector / away-gate policy / canary thresholds change.
The full continuity suite: `npx vitest run tests/unit/llm-degradation-detector.test.js tests/unit/spike-rehearsal.test.js`.
