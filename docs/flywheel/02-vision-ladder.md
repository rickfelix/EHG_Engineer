---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, vision-ladder, rungs, buildable-operational]
---

# Link 2 — The Vision / Mission Ladder (V1 → V2 → V3)

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

The vision ladder turns the North Star into an **ordered, gated path**. Exactly one rung is
active at a time; the active rung defines *what the fleet builds now*. The ladder is the spine
that links 4 (roadmap), 10 (build gauge), 11 (prioritization) and 14 (governance) all hang off.

## The three rungs (verified live, `vision_ladder_rungs`)

| `rung_key` | `sequence` | `is_active` | Title (live) |
|-----------|:--:|:--:|------|
| **V1** | 1 | **true** | V1 — Capability-saturated, solo-operable EHG (income-replacement **precursor**) |
| V2 | 2 | false | V2 — First revenue venture(s): distance-to-quit instrumented (named placeholder) |
| V3 | 3 | false | V3 — Portfolio scaled to the chairman quit-threshold (named placeholder) |

- **V1 = Foundation.** Build the machine + the product to the point of being capability-saturated
  and solo-operable. This is a *precursor* to income, deliberately not income itself.
- **V2 = Earning.** First revenue venture(s), distance-to-quit instrumented.
- **V3 = Outcomes.** Portfolio scaled to the chairman quit-threshold.

## Criteria (the rung's capability checklist)

- **Table:** `vision_ladder_criteria` (26 rows total; the active V1 rung lists 21 capabilities
  after the V1→V2 re-cut — see below). Columns: `rung_id`, `ordinal`, `capability`, `today`,
  `required`, `nature`.
- The active rung's criteria are read by `dbVisionSource()` (`vdr-registry.js`) — this is the
  **denominator** for the build gauge. The gauge re-points automatically when the chairman
  activates the next rung; no code edit needed.

### Buildable vs operational `nature`

Each capability has a deterministic `nature` (SD-LEO-INFRA-GAUGE-BUILDABLE-VS-OPERATIONAL-001):

- **`buildable`** — the fleet can complete it by shipping code / populating a fleet table.
- **`operational`** — only flips when a live VENTURE / OPERATION / CHAIRMAN / COMPETITIVE signal
  makes it true (e.g. a KR that depends on live income, a running venture, live governance
  enforcement). The fleet **cannot** make these true by shipping code alone.

The reviewable source-of-truth is the **`OPERATIONAL_NATURE` Set** in
`lib/vision/vdr-registry.js` (lines 212-219, with the fail-loud coherence invariant at 227-235). On the active V1 rung the operational set is **6**:

1. `Solo-operator survivability` (KR-2026-07-02 — live breakage-caught rate)
2. `A queryable, structured north star` (chairman-ratified record)
3. `Governance cascade enforced` (KR-GOV-3.1 — live cascade)
4. `OKR-driven prioritization + day-28 hard stop` (KR-GOV-3.3)
5. `All 7 governance guardrails` (KR-GOV-3.2)
6. `Competitive vigilance process established` (OBSERVED competitor baselines)

A startup invariant **fails loud** if `OPERATIONAL_NATURE` names a capability not in the registry
(`vdr-registry.js` ~229–235), so the taxonomy can't silently drift.

### The V1→V2 re-cut (why some capabilities aren't measured yet)

The chairman-ratified **SD-LEO-INFRA-VISION-LADDER-V1-V2-RECUT-001** moved **4 revenue/operating
capabilities** off the active V1 rung onto the inactive V2 rung: *Take a real dollar*, *See
distance-to-quit*, *Run a self-operating venture*, *Compound venture-level learning*. Their VDR
probes are intentionally **absent** from the active set (a probe for an inactive rung would be a
`staleProbe` that withholds the whole gauge); they return only **when V2 is activated**. This is
the [progression-gate.md](progression-gate.md) principle in code.

## Coherence enforcement (no drift)

- **`assertRegistryCoherence`** (gating): the parsed vision capabilities and `VDR_REGISTRY` must
  stay in lockstep — if a capability is added/removed/renamed, the gauge **withholds** (returns
  `available:false`) rather than silently measure a wrong denominator.
- **`placement-rules.js` + `assertLadderRoadmapCoherence`** (advisory): the
  `REVENUE-NOT-IN-FOUNDATION` rule flags the 4 named revenue capabilities if they reappear on V1.
  Advisory-only — it can never suppress the live chairman gauge.
- Full write-up: `docs/vision/ladder-roadmap-coherence.md`.

## Existing documentation

- `docs/vision/ehg-mission-vision-canonical.md` — mission/vision prose. **Coverage: good (prose).**
- `docs/vision/ladder-roadmap-coherence.md` — backward/forward coherence. **Coverage: good.**
- `docs/reference/schema/engineer/tables/vision_ladder_rungs.md`, `vision_ladder_criteria.md` —
  schema. **Coverage: good (schema).**
- `lib/vision/vdr-registry.js`, `lib/vision/placement-rules.js` — the code source of truth.
- **Gap:** no doc previously tied the *ladder → active rung → build gauge denominator* mechanics
  together for a non-author reader. This doc + [10-vdr-build-gauge.md] fill it.

## Connects to

- **Up from:** North Star ([01-north-star.md]).
- **Down to:** Roadmap waves ([04-roadmap-waves.md]) via `RUNG_BY_HORIZON`; build gauge
  ([10-vdr-build-gauge.md]) via the active-rung denominator; prioritization
  ([11-prioritization.md]) which scores active-rung-first.
- **Controlled by:** chairman rung activation ([14-governance.md]).
