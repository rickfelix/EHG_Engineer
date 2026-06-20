---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, roadmap, waves, time-horizon]
---

# Link 4 — Roadmap → Waves

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

The roadmap is where the abstract vision ladder becomes an **executable sequence**. Rungs are
sliced into **waves**; each wave holds **wave-items** (candidates sourced from the backlog); a
wave-item is **promoted** into a claimable SD for the fleet. This is the hand-off from the
strategy layer to the supply layer.

## Source of truth (verified 2026-06-20)

- **`strategic_roadmaps`** (2 rows). Columns include `vision_key`, `title`, `status`,
  `current_baseline_version`.
- **`roadmap_waves`** (12 rows). Key columns: `sequence_rank`, `title`, `status`,
  `depends_on_wave_ids` (uuid[]), `okr_objective_ids` (uuid[]), `proposed_okrs` (jsonb),
  `progress_pct`, `time_horizon` (now/next/later/eventually), `metadata` (may hold `rung_key`).
- **`roadmap_wave_items`** (728 rows). Key columns: `wave_id`, `source_type`
  (todoist/youtube/brainstorm/...), `source_id`, `title`, **`promoted_to_sd_key`** (NULL until
  promoted to the belt), `priority_rank`, `item_disposition` (e.g. `pending`), `lane`.

## time_horizon → rung mapping (the progression encoding)

```
RUNG_BY_HORIZON = { now: 'V1', next: 'V2', later: 'V3' }   // 'eventually' → null
```

(`lib/vision/rung-progress-rollup.mjs:20`.) Wave→rung resolution (`mapWaveToRung`): explicit
`metadata.rung_key` wins; else the `time_horizon` map; else `null` (honest — never guessed). This
mapping is *the* mechanism by which "where a wave sits on the timeline" equals "which rung it
advances" — the heart of [progression-gate.md].

## [Honesty flag] Two roadmap structures currently coexist

A read of `roadmap_waves` on 2026-06-20 shows **two overlapping wave structures** in the same
table:

1. **The older "Engineering" set** — `Wave 1: Foundational AI Protocol & Engineering Core`,
   `Wave 2: Strategic Research & Venture Evaluation (EVA)`, … `Wave 6: New Items`. These have
   **`time_horizon = null`** and `progress_pct = 0`, so they do **not** map to a rung and do not
   currently contribute measured progress.
2. **The newer rung-aligned set** — `Wave 0: Distillation`, `Wave 1: EHG Foundation`,
   `Wave 2: Revenue rails ready`, all `time_horizon='now'` (→ V1, progress ~57%); `Wave 3 (GATED):
   First revenue push`, `Wave 4: Distance-to-quit live`, both `time_horizon='next'` (→ V2, ~20%);
   `Wave 5 (V3): Scale to the chairman quit-threshold`, `time_horizon='later'` (→ V3, 0%).

> **Implication for the chairman review:** the rung-aligned (now/next/later) waves are the ones
> that drive the gauge/forecast and the progression gate. The older null-horizon "Engineering"
> waves appear to be legacy/parallel structure. **Recommendation:** confirm whether the older set
> should be retired, re-horizoned, or kept as a separate planning lens, so a reader isn't confused
> by two "Wave 1"s. (This doc reports the state truthfully; it does not change any rows.)

## How `progress_pct` is populated

`runRollup` (`lib/vision/rung-progress-rollup.mjs`) writes `roadmap_waves.progress_pct`
type-aware: build rung waves ← `computeBuildGauge.build_pct`; outcome rung waves ←
`aggregateKrProgress` over `okr_objective_ids`. **DRY-RUN by default** (`apply:false`); only
`--apply` persists, and only for rows with a non-null % (never a fabricated 0). The exec-summary
email reads this rollup **DRY-RUN** (read-only) so the email never mutates roadmap state.

## Promotion to the belt

A wave-item becomes claimable fleet work when it is **promoted**:
`node scripts/leo-create-sd.js --from-roadmap-item <id>` — the **register-first** path
(`lib/sourcing-engine/register-first.js`) stamps the two-way roadmap↔SD provenance and sets
`roadmap_wave_items.promoted_to_sd_key`. **684 of 728 unpromoted (live metric, as of 2026-06-20)** wave-items
(`promoted_to_sd_key IS NULL`) — a large reservoir of sourced-but-not-yet-belted
work. See [07-sourcing-engine.md] for the automated promotion path.

> **[Gap — promotion has no target-repo routing]** Promotion via `leo-create-sd --from-roadmap-item`
> provides no way to set the target repo: it accepts no `--target-repos` flag
> (`leo-create-sd.js` `riKnownFlags` ~line 2685) and `deriveSdFieldsFromRoadmapItem`
> (`lib/sourcing-engine/register-first.js:22`) sets no `target_application`, so `createSD` defaults
> to `getCurrentVenture() || 'EHG_Engineer'` (`leo-create-sd.js` ~line 1902). Nothing FORBIDS EHG
> (`ALLOWED_REPOS` includes it, line 86) — but there is no ROUTING mechanism, so EHG-product roadmap
> items (Waves 2/3/4) default to the harness repo and cannot be promoted to `rickfelix/ehg`. The
> product-promotion-pipeline SD addresses this by adding `--target-repos` to `--from-roadmap-item`
> and/or deriving the target from the item's wave.

## Existing documentation

- `docs/reference/schema/engineer/tables/strategic_roadmaps.md`, `roadmap_waves.md`,
  `roadmap_wave_items.md`, `roadmap_baseline_snapshots.md` — schema. **Coverage: good (schema).**
- `docs/vision/ladder-roadmap-coherence.md` — wave↔rung coherence (advisory). **Coverage: partial.**
- **Gap:** no doc explained the wave→rung mapping mechanics, the promotion mechanism, or the
  two-coexisting-structures state. This doc fills it.

## Connects to

- **Up from:** Vision ladder ([02-vision-ladder.md]); OKRs ([03-okrs-key-results.md]).
- **Down to:** Backlog intake ([05-backlog-intake.md]) feeds wave-items; the sourcing engine
  ([07-sourcing-engine.md]) promotes them to the belt ([08-belt-coordinator-fleet.md]).
- **Measured by:** the build gauge / rung rollup ([10-vdr-build-gauge.md]).
