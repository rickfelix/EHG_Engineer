---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, prioritization, needle-movement, unlock-score]
---

# Link 11 — Prioritization

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

Prioritization decides **which** unbuilt work the fleet does first. It orders work
**active-rung-first**, then **highest-impact-on-rung-completion-first** — so the fleet always moves
the needle on the rung that is actually active (V1 today), and within that rung favors the wave
closest to completion. This is the operational expression of [progression-gate.md].

## Source of truth (verified — `lib/vision/needle-priority.mjs`, 78 lines)

A thin, **PURE** scoring layer that REUSES the rung rollup (link 4/10), not a new measurement
system.

### `needleScore(sdRung, ctx)` — the calculation

```
if sdRung is null/unknown          → 0          (neutral; keep existing order, never guess a rung)
base = (sdRung === activeRungKey) ? 2 : 1        (active rung 2; known future rung 1)
bonus = clamp(0..100, rungProgressByKey[sdRung]) / 1000   → 0..0.1   (completion tiebreak)
score = base + bonus
```

- **Tiers never cross:** the completion bonus is capped at 0.1, so an active-rung SD (≥2.0) always
  outranks a future-rung SD (≤1.1), which always outranks an unknown-rung SD (0). Within a tier, the
  rung *closer to completion* edges up (highest-impact-on-rung-completion-first).
- **Honesty:** an SD whose rung can't be resolved scores 0 and falls back to its existing rank — it
  is never guessed onto a rung.

### Supporting functions

- `rungProgressByKey(rollupRows)` — folds `runRollup` rows into `{ [rung_key]: progress_pct }`
  (null progress skipped, never coerced to 0; highest measured % wins per rung).
- `buildSdRungMap(waveItems, wavesById)` — maps each promoted SD key to its rung by reusing
  `mapWaveToRung` (skips unpromoted / unmappable — honest, no guess).

## Where it plugs in

- **Coordinator backlog rank** — the needle-movement comparator is wired into
  `coordinator-backlog-rank` *after* the unlock_score (SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-
  PRIORITIZATION-001-C), so the coordinator dispatches the highest-needle work first.
- **Unlock score** — the pre-existing dependency-unlock heuristic (an SD that unblocks many others
  ranks higher); needle-movement refines the order on top of it.
- **Adam forecaster / belt-low** — the belt-low message surfaces the needle ranking too.

## [Current-state note]

Needle-movement is **LATENT-live**: it is wired and tested, but its effect is proportional to how
many SDs are promoted from rung-mapped waves. With 684 unpromoted wave-items (live metric, as of 2026-06-20) and the rung-aligned
waves still filling, its influence grows as the now/next/later waves get promoted to the belt.
(Verified-honest: the code is shipped; the ranking has limited material effect until more rung-mapped
SDs are on the belt.)

## Existing documentation

- `docs/reference/central-planner.md`, `docs/reference/severity-weighted-pattern-prioritization.md`
  — adjacent prioritization heuristics. **Coverage: partial (not the rung-first needle rank).**
- **Gap (filled here):** no doc traced the needle-movement score or its active-rung-first tiering.
  This doc fills it.

## Connects to

- **Up from:** the rung rollup ([04-roadmap-waves.md]) + the build gauge ([10-vdr-build-gauge.md]).
- **Plugs into:** the coordinator's dispatch order ([08-belt-coordinator-fleet.md]).
- **Expresses:** the progression gate ([progression-gate.md]) — active-rung-first.
