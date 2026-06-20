---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, progression, vision-ladder, governance, build-front]
---

# Progression Gate (V1 → V2 → V3) — How We Know What To Build Next

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** Encodes the chairman-Adam agreement of 2026-06-20.
> This is the conceptual keystone of the flywheel: it answers *"what should the fleet build
> right now, and what would make us shift?"* without inventing a new metric.

## The principle (canonical)

**The foundation → product → revenue progression is ALREADY ENCODED in the roadmap / vision
ladder.** It does not need a separate, invented "milestone metric."

- The **vision ladder** orders capability into rungs: **V1 Foundation → V2 Earning → V3
  Outcomes** (`vision_ladder_rungs`, ordered by `sequence`; exactly one `is_active=true`).
- The **roadmap** sequences those rungs into waves, and each wave's `time_horizon` maps to a
  rung deterministically: **`now → V1`, `next → V2`, `later → V3`**
  (`RUNG_BY_HORIZON` in `lib/vision/rung-progress-rollup.mjs`, line 20). `eventually → null`
  (too far out to attribute).
- **V1 precedes V2 precedes V3** by construction. So *position on the ladder/roadmap IS the
  progression signal.* You do not need to ask "have we hit milestone X?" — you ask "which
  rung is active, and what unbuilt capabilities does it still have?"

**Therefore the "milestone gate" for shifting what the fleet builds is:**

> the existing **roadmap / vision-ladder position** + **chairman-controlled rung activation**.

It is not a number someone made up. It is the active rung (`vision_ladder_rungs.is_active`)
plus the chairman's decision to flip the next rung active. See [14-governance.md](14-governance.md)
for the rung-activation control.

## Why this matters (the failure it prevents)

A single blended "% built" can be **misread as income progress**. If a revenue capability
(rightly a V2/Earning concern) were sitting on the V1/Foundation rung, then "V1 is 80% built"
could be mistaken for "we are 80% of the way to revenue." The vision ladder + the
**buildable vs operational** nature split exist precisely to prevent that conflation:

- **V1 Foundation** measures *fleet build-debt* — capabilities the fleet can complete by
  shipping code. Its honest number is `build_pct` (buildable capabilities only).
- **V2 Earning / V3 Outcomes** measure *operational proofs* — capabilities that only flip
  when a live venture/operation makes them true. These are correctly **0 until a venture
  runs** and are tracked **separately**, never folded into the build number.

This is enforced in code: `OPERATIONAL_NATURE` (a reviewed Set in `vdr-registry.js`) tags the
operational capabilities, and `formatGaugeForSummary` emits the per-rung/per-nature line
*"V1 foundation: NN% built (buildable) — NN% operational — income/north-star tracked
separately on V2."* See [10-vdr-build-gauge.md](10-vdr-build-gauge.md) and
`docs/vision/ladder-roadmap-coherence.md`.

## Two concurrent build fronts (today)

There are **TWO build fronts being actively built right now**, and both need building today:

| Front | Repo | What it builds |
|-------|------|----------------|
| **The LEO Harness** | `EHG_Engineer` (this repo) | The autonomous machine itself: coordinator, Adam, workers, sourcing engine, gates, gauges, forecasting, the learning loop |
| **The EHG Product** | `rickfelix/ehg` | The actual application: ventures, EVA, the Chairman UI / cockpit surfaces |

The V1 active rung's capabilities span **both** fronts (the VDR registry has `layer` values
`infrastructure`/`process` that are harness-side, and `application`/`venture` that are
product-side; several probes target the `ehg` repo via `code_grep`). Building V1 means
advancing *both* fronts — not one then the other.

> **[Gap — promotion has no target-repo routing]** Promotion via `leo-create-sd --from-roadmap-item`
> provides no way to set the target repo: it accepts no `--target-repos` flag
> (`leo-create-sd.js` `riKnownFlags` ~line 2685) and `deriveSdFieldsFromRoadmapItem`
> (`lib/sourcing-engine/register-first.js:22`) sets no `target_application`, so `createSD` defaults
> to `getCurrentVenture() || 'EHG_Engineer'` (`leo-create-sd.js` ~line 1902). Nothing FORBIDS EHG
> (`ALLOWED_REPOS` includes it, line 86) — but there is no ROUTING mechanism, so EHG-product roadmap
> items (Waves 2/3/4) default to the harness repo and cannot be promoted to `rickfelix/ehg`. The
> product-promotion-pipeline SD addresses this by adding `--target-repos` to `--from-roadmap-item`
> and/or deriving the target from the item's wave.

## "Taper the harness" — a future condition, not a directive to pivot now

> **Taper the harness ≠ stop harness work and pivot to product now.**

"Taper" means **net-new harness work naturally thins as the harness matures** — a *future*
condition that is itself **gated on rung-advancement** (as V1 saturates and the system moves
toward V2/Earning, there is simply less foundation left to build, so harness throughput tapers
on its own). It is an emergent outcome of the progression, not an instruction to redirect the
fleet today.

**Right now**, with **V1 active** and the build gauge at ~55% overall (latest
`vision_build_gauge` row, 2026-06-20), there is substantial V1 foundation work remaining on
both fronts. The correct posture is: **keep building V1 on both the harness and the product.**

## Dedup hygiene ≠ tapering (distinct concept)

A separate, always-on discipline that is easy to confuse with tapering:

- **Dedup hygiene** = *not re-minting work that has already shipped* (the sourcing engine's
  `dedup-autostamp.js` / the router's `DEDUP` lane catch this; see
  [07-sourcing-engine.md](07-sourcing-engine.md)). This is hygiene applied to **every** new
  candidate at sourcing time, regardless of rung.
- **Tapering** = *the natural thinning of net-new foundation work as a rung saturates.*

Dedup hygiene removes duplicates; tapering reflects there being less genuinely-new work. They
are unrelated mechanisms — do not treat "we deduped a lot today" as evidence the harness should
taper, and do not treat "the harness is tapering" as license to skip dedup checks.

## The decision procedure (practical)

When deciding what the fleet builds next, in order:

1. **Which rung is active?** Read `vision_ladder_rungs WHERE is_active` (today: **V1**).
2. **What does the active rung still need?** The unbuilt/partial **buildable** capabilities in
   the active rung's `vision_ladder_criteria` (surfaced by `computeBuildGauge` components with
   `nature='buildable'` and `status != 'built'`). These are the "needle-movers" — see
   [11-prioritization.md](11-prioritization.md).
3. **Source candidates for those gaps** via the SSOT order (roadmap items → distillation →
   engine → last-resort gauge-mining). See [06-adam-sourcing.md](06-adam-sourcing.md).
4. **Shift the front only on chairman rung activation.** When the chairman judges V1
   sufficiently saturated, they flip `V2.is_active=true` (a governance act, [14-governance.md]).
   *That* — not a self-invented threshold — is when the fleet's build front shifts toward
   Earning/revenue capabilities.

## Source-of-truth references (verified 2026-06-20)

- Rungs and active flag: `vision_ladder_rungs` (V1 active; V2/V3 inactive).
- Horizon→rung map: `RUNG_BY_HORIZON` (`lib/vision/rung-progress-rollup.mjs:20`).
- Buildable vs operational: `OPERATIONAL_NATURE` + per-nature gauge
  (`lib/vision/vdr-registry.js`).
- Coherence enforcement (revenue-not-in-foundation): `lib/vision/placement-rules.js` +
  `assertLadderRoadmapCoherence` (advisory) + `docs/vision/ladder-roadmap-coherence.md`.
- Rung activation control: `docs/governance/chairman-decision-surfaces.md`.
