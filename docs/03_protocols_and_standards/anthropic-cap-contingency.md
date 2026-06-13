# Anthropic-cap / model-availability contingency + fallback ladder

**SD:** SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 · **Exit criterion:** roadmap X4 · **Closes:** G4
**Problem:** Anthropic usage-cap / model-availability is a single point of failure the fleet has
already been bitten by (G4) — every worker + coordinator depends on one provider. There was ZERO
treatment of provider degradation. This contingency wires the existing (empty) `llm_canary_*`
substrate to **detect** degradation and walk a **fallback ladder**, ending — when nothing else
works — in **pause-and-surface** (never silent failure, never auto-overriding the chairman).

---

## Detection (reuses the live llm_canary_* substrate)

The `llm_canary_state` table (migration `20260206_llm_canary_routing.sql`; singleton row) already
carries the quality-gate signals; we read them as the degradation signal (no new table needed):

| Signal | Column | Degradation when |
|--------|--------|------------------|
| Error rate | `current_error_rate` vs `error_rate_threshold` (default 0.05) | current > threshold |
| Latency | `current_latency_p95_ms` vs `baseline_latency_p95_ms * latency_multiplier_threshold` (default 2.0×) | current > baseline×mult |
| Consecutive failures | `consecutive_failures` vs `failures_before_rollback` (default 3) | counter ≥ limit |
| Liveness | `last_quality_check_at` | staler than the check interval (probe stopped) |

`status` ∈ {rolling, paused, rolled_back, complete}; the detector records each rung transition in
`llm_canary_transitions` (the audit trail) and never mutates a chairman-reserved field.

The detection library: `scripts/glide-path/.../llm-degradation-detector.*` — wait, this SD's detector
lives at **`scripts/continuity/llm-degradation-detector.mjs`** (pure read of `llm_canary_state`,
returns the current rung + reason; no side effects beyond a transition row). Tunable thresholds stay
in the canary row (config, not hardcoded).

---

## The fallback ladder (degrade gracefully; never silent-fail)

Walk DOWN one rung per sustained degradation signal; walk UP when healthy for the recovery window.

1. **NORMAL** — full fleet, primary model. (canary `status='complete'`/healthy)
2. **SINGLE-SESSION** — collapse fleet concurrency to ONE active worker to cut token burn and stay
   under the cap. Trigger: approaching cap OR first degradation signal. Effect: coordinator stops
   dispatching new parallel claims; in-flight work continues serially.
3. **MODEL-FALLBACK** — switch to `fallback_model` (the canary's cloud fallback, default
   `claude-haiku-3-5`) or the configured alternate. Trigger: primary model erroring/latent past
   threshold while still capped. Effect: degraded capability, continued progress.
4. **PAUSE-AND-SURFACE (degraded-safe-mode)** — fallback exhausted/unavailable, or `consecutive_failures
   ≥ failures_before_rollback`. Effect: **freeze new work, hold intake, surface to the chairman**
   (the only-the-chairman-can list). The fleet idles SAFE; it does not thrash, does not auto-kill,
   does not auto-promote. This is the floor — it always terminates here rather than failing silently.

Recovery: when signals return healthy for a sustained window, climb back up one rung at a time
(pause→model-fallback→single-session→normal), recording each transition.

---

## Interaction with the gate policy

In SINGLE-SESSION and MODEL-FALLBACK, gates behave per `chairman-away-gate-policy.md`. In
**PAUSE-AND-SURFACE**, the degraded-safe-mode override applies: **every** gate holds-and-surfaces
regardless of its normal classification — a degraded fleet must not advance or kill anything.

## Rehearsal

The launch-spike rehearsal (`scripts/continuity/spike-rehearsal.*` + runbook) injects a seeded
breakage to exercise the ladder + degraded-safe-mode against a PRE-REGISTERED chairman touch-count
ceiling, so the contingency is proven before a real cap event — not retro-fitted (G15).
