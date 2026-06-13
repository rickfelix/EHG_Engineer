# Anthropic-cap / model-availability contingency + fallback ladder

**SD:** SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 · **Exit criterion:** roadmap X4 · **Addresses:** G4
**Problem:** Anthropic usage-cap / model-availability is a single point of failure the fleet has
already been bitten by (G4) — every worker + coordinator depends on one provider. There was ZERO
treatment of provider degradation. This contingency delivers the **detector + a documented fallback
ladder**, ending — when nothing else works — in **pause-and-surface** (never silent failure, never
auto-overriding the chairman). The LIVE production signal feeder is a named, deferred follow-up (see
**Current limitation** below) — this SD ships the evaluator, the ladder, and the rehearsal, not the
live cloud-health probe.

---

## Detection (signal contract + evaluator)

`scripts/continuity/llm-degradation-detector.mjs` exposes a PURE, source-agnostic
`evaluateDegradationRung(state, nowMs)` that maps a health-signal row to a ladder rung. It reads
these signals (column names mirror `llm_canary_state` so a feeder can write the same shape):

| Signal | Column | Degradation when |
|--------|--------|------------------|
| Error rate | `current_error_rate` vs `error_rate_threshold` (default 0.05) | current > threshold → MODEL_FALLBACK |
| Latency | `current_latency_p95_ms` vs `baseline_latency_p95_ms * latency_multiplier_threshold` (default 2.0×) | current > baseline×mult → SINGLE_SESSION |
| Consecutive failures | `consecutive_failures` vs `failures_before_rollback` (default 3), **only while `status='rolling'`** | counter ≥ limit on an active probe → PAUSE_AND_SURFACE |
| Liveness | `last_quality_check_at` | a probe that RAN then went stale → SINGLE_SESSION (a probe that NEVER ran stays NORMAL — fail-open) |

`evaluateDegradationRung` is read-only/pure — it returns `{rung, reason, signals}` and writes
**nothing** (no row in `llm_canary_transitions`, no chairman-reserved mutation). `detectFromDb` is a
thin read-only wrapper. Tunable thresholds stay in the signal row (config, not hardcoded).

> **Note on `status='rolled_back'`:** the detector does NOT treat it as degradation. On the existing
> `llm_canary_state` substrate (a local-model rollout canary) `rolled_back` means the local leg was
> abandoned and traffic returned to the **healthy** Anthropic cloud — the *inverse* of a cap event.

---

## Current limitation (the live feeder is a deferred follow-up)

`detectFromDb` currently reads `llm_canary_state` (migration `20260206_llm_canary_routing.sql`), which
was built as the **local-model rollout canary**, not an Anthropic-availability monitor:

- Its quality columns measure a LOCAL model against the Anthropic cloud as the CONTROL leg.
- The singleton row is **dormant** — paused, stage 0, with `current_error_rate` /
  `current_latency_p95_ms` / `last_quality_check_at` all NULL and **no writer** populating them.
- Therefore `detectFromDb` returns **NORMAL on every read in production today** (its own fail-open
  path). The automatic detector adds nothing over a human until a real signal source exists.

**Deferred follow-up (named, tracked):** a *cloud-health feeder* that stamps `current_error_rate`,
`current_latency_p95_ms`, `last_quality_check_at` (and increments `consecutive_failures`) from REAL
Anthropic API outcomes (429 / 5xx counters) onto a row this evaluator reads, with `status='rolling'`
while probing. Until then, G4 is mitigated by the **documented ladder + rehearsal + away-gate
policy** (operators walk the ladder manually), not by automatic detection.

---

## The fallback ladder (degrade gracefully; never silent-fail)

Walk DOWN one rung per sustained degradation signal; walk UP when healthy for the recovery window.
The rung is computed by `evaluateDegradationRung`; the **actuation** below is the OPERATOR RUNBOOK
response to each rung (the detector does not yet drive these automatically — see *Wiring status*).

1. **NORMAL** — full fleet, primary model.
2. **SINGLE-SESSION** — collapse fleet concurrency to ONE active worker to cut token burn and stay
   under the cap. Trigger: latency degradation or a probe that went stale. Runbook action: stop
   dispatching new parallel claims; in-flight work continues serially.
3. **MODEL-FALLBACK** — switch to a fallback model. Trigger: error_rate over threshold. Runbook
   action: route to the configured alternate model. ⚠️ For a genuine **Anthropic-cap / availability**
   outage the alternate MUST be a **non-Anthropic** provider — falling back to another Anthropic model
   (e.g. `claude-haiku-3-5`) cannot help when Anthropic itself is the capped/degraded dependency.
   (The local canary's `fallback_model` is an Anthropic model and is the WRONG choice here.)
4. **PAUSE-AND-SURFACE (degraded-safe-mode)** — fallback exhausted/unavailable, or
   `consecutive_failures ≥ failures_before_rollback` on an active probe. Runbook action: **freeze new
   work, hold intake, surface to the chairman** (the only-the-chairman-can list). The fleet idles
   SAFE; it does not thrash, does not auto-kill, does not auto-promote. This is the floor — it always
   terminates here rather than failing silently.

Recovery: when signals return healthy for a sustained window, climb back up one rung at a time
(pause→model-fallback→single-session→normal).

### Wiring status

The detector is **advisory** in this SD: nothing in the live fleet calls `detectFromDb` to
auto-collapse concurrency or switch models — operators/the runbook walk the ladder. Auto-actuation
(coordinator gates parallel dispatch on the rung) is deferred to the same follow-up as the live
feeder, and is intentionally NOT auto-enforced here so it cannot conflict with the no-auto-override
doctrine.

---

## Interaction with the gate policy

In SINGLE-SESSION and MODEL-FALLBACK, gates behave per `chairman-away-gate-policy.md`. In
**PAUSE-AND-SURFACE**, the runbook directs the operator to apply degraded-safe-mode: **every** gate
holds-and-surfaces regardless of its normal classification — a degraded fleet must not advance or kill
anything. (This is a runbook rule, not an automatic gate override — consistent with the no-auto-override
doctrine.)

## Rehearsal

The launch-spike rehearsal (`scripts/continuity/spike-rehearsal.*` + runbook) injects a seeded
breakage to exercise the ladder + degraded-safe-mode against a PRE-REGISTERED chairman touch-count
ceiling, so the contingency is proven before a real cap event — not retro-fitted (G15).
