---
Category: Feature
Status: Draft
Version: 0.1.0
Author: SD-EHG-COCKPIT-VENTPERF-PHASE0-DESIGN-001 (Phase-0 design pass)
Last Updated: 2026-06-16
Tags: cockpit, operator, venture-performance, portfolio, vision-gauge, phase-0, design-only
---

# EHG Cockpit — Venture-Performance Read: Phase-0 Design Spec (DESIGN-ONLY, NO BUILD)

> **Status: reviewable design artifact.** This document contains **no UI code**. It deepens the
> *venture-performance* tile (**T5**) of the companion cockpit spec
> [`ehg-operator-cockpit-phase0.md`](./ehg-operator-cockpit-phase0.md) to **build-depth** so the
> chairman can shape the metric, the data, and the layout before any build is sourced. The build is a
> **separate gated follow-on SD** (see *§7*).

## 1. Why this exists (the gap)

The live Vision Denominator Registry (VDR) gauge puts the **application/cockpit layer at ~17% built** —
the weakest, most-buildable part of V1. One of its unbuilt capabilities is **C5 "Venture-performance
read"**, sourced verbatim from the active V1 vision-ladder rung:

| Source | Value |
|--------|-------|
| `vision_ladder_criteria.capability` (ordinal **4**, active V1 rung) | **Venture-performance read** |
| `…today` | *no venture-performance gauge* |
| `…required` | *venture-performance read in the chairman cockpit* |

The companion cockpit spec enumerated this as tile **T5** ("per-venture status — moving / stalled /
dead, grouped by investment category") with a one-line data-source pointer, but did **not** spec the
metric, its computation, or the data reality to build-depth. **This spec closes exactly that gap** for
the one capability — it does not re-specify the cockpit shell or the other four tiles.

> **Inheritance.** The host surface, the always-on **ticker-banner + rotating-tile + persona-toggle**
> layout DNA, and the open host-surface question (companion **Q-4**) are inherited from the companion
> spec and **not** re-litigated here.

## 2. Purpose of the surface (the progress lens)

The venture-performance read is the cockpit's **portfolio progress lens**: a single-pane, at-a-glance
answer to *"which of my ventures are moving, which are stalled, and which are dead?"* It complements the
survival lens (distance-to-broke / distance-to-quit) with the **build-momentum** view — is the venture
machine actually producing?

## 3. The live data reality (grounded, not assumed)

Read-only grounding against the live `ventures` and `key_results` tables. **The build must be designed
around this reality, not an idealized one:**

| Fact (live) | Value | Design consequence |
|-------------|-------|--------------------|
| `ventures` rows | **9** | Small N — a single surface can show all of them; no pagination needed at this scale. |
| `ventures.health_score` populated | **9 / 9** (numeric) | A numeric per-venture health signal **exists today** — the metric is computable now. |
| `ventures.health_status` populated | **0 / 9** (NULL) | The *label* "moving/stalled/dead" does **NOT** exist — it must be **derived** (see §4) or backfilled. |
| `ventures.status` distribution | **8 `cancelled` · 1 `active`** | Today the portfolio reads as mostly dead — itself a signal the chairman should see, and the reason this lens matters. |
| `ventures.category` populated | **0 distinct** (NULL) | The companion's "grouped by investment category" grouping has **no live backing**. |
| `ventures.vertical_category` | all **"other"** (9/9) | Vertical grouping is also unpopulated/uniform — grouping is an **open question** (§6). |
| Other live numeric signals | `current_lifecycle_stage` (1–40 pipeline), `ai_score`, `attention_score`, `validation_score`, `risk_score`, `portfolio_synergy_score`, `updated_at` | Candidate inputs for health derivation and staleness. |
| `key_results` rows | **43** (`baseline_value`, `current_value`, `target_value`, `status`) | Enables a **KR-attainment** progress reading per objective/venture. |
| `venture_kpis` table | **does not exist** | The companion's "venture KPIs" pointer is loose; the real KPI signals are the score columns on `ventures` + `key_results`. |

## 4. Candidate metric(s) and how each number is computed

> Phase-0 names **candidates** and how each would be computed from live columns. The chairman picks the
> canonical at-a-glance number in §6 — Phase-0 does **not** pre-decide it.

| Candidate | What it reads | Computation (from live columns) | Status today |
|-----------|---------------|----------------------------------|--------------|
| **M1 · Health band** *(recommended primary)* | moving / stalled / dead per venture | **Derive** from `health_score` thresholds + `status` (`cancelled`⇒dead) + staleness (`now − updated_at`). E.g. dead if `status='cancelled'`; else stalled if `health_score < t_low` OR stale beyond N days; else moving. Thresholds = open question Q-2. | `health_score` live (9/9); thresholds undecided; `health_status` label is NULL so it must be derived. |
| **M2 · Lifecycle progress** | how far through the 40-stage pipeline | `current_lifecycle_stage / 40` per venture | Live, but only meaningful for non-cancelled ventures. |
| **M3 · KR attainment** | objective progress behind a venture | `(current_value − baseline_value) / NULLIF(target_value − baseline_value, 0)` over the venture's `key_results` | Live (43 KRs); needs venture↔KR linkage confirmed at build. |
| **M4 · Portfolio pulse (summary)** | one-line roll-up for the ticker banner | counts by derived M1 band, e.g. `3↑ moving · 1→ stalled · 5✗ dead` | Composable from M1 once the bands are decided. |

**Per-number data source (explicit):** every number above is read from `ventures` and/or `key_results`
columns named in §3. **No new pipeline, table, or column is proposed** by this spec — where a needed
signal is absent (the `health_status` label, the grouping field), it is raised as an **open question**
(§6), never assumed.

## 5. Layout sketch (within the inherited cockpit shell)

Concept only — not a final visual design. The venture-performance read is **tile T5** inside the
companion's always-on shell; it contributes one banner segment and one rotating detail card.

```
TICKER (T4, always scrolling):  … ·· Ventures: 3↑ 1→ 5✗  ·· …            ← M4 portfolio pulse segment

┌──────────────────────────────┐   Rotating detail card for T5 (cycles in
│ T5 · VENTURE PERFORMANCE      │   with the other tiles on the shell timer):
│  3 moving · 1 stalled · 5 dead│
│ ───────────────────────────── │   per-venture mini-rows, worst-health first
│  ● DataDistill     moving  72 │   (● = derived M1 band, 72 = health_score,
│  ◐ <venture>       stalled 41 │    ◐/○ bands; rank/rotation = open question Q-4)
│  ○ <venture>       dead      – │
└──────────────────────────────┘
```

- **Banner segment (M4):** the portfolio pulse roll-up rides the always-scrolling ticker.
- **Rotating detail card (T5):** the per-venture list cycles in on the shell's tile timer; a glance
  always lands on the current portfolio state.
- **Read-only** (consistent with the companion's Phase-0 read-only assumption, Q-6).

## 6. Open design questions (for the chairman to resolve)

Each is framed with grounded options so it is decidable in one review pass:

1. **Q-1 (the canonical number):** Which candidate is the **at-a-glance** venture number — **M1** health
   band (recommended), **M2** lifecycle progress, **M3** KR attainment, or a blend? (All are live-computable per §4.)
2. **Q-2 (deriving moving/stalled/dead):** `health_status` is **NULL for all 9** ventures. Derive the
   band from `health_score` thresholds + `status` + `updated_at` staleness (recommended), **or** backfill
   `health_status` as a real column first? If derived: what are the `health_score` thresholds and the
   staleness window?
3. **Q-3 (grouping):** The companion proposed grouping by **investment category**, but `category` is
   **NULL** and `vertical_category` is uniformly **"other"** — there is **no live backing**. Options:
   (a) populate an investment-category field first, (b) group by derived health band, (c) group by
   lifecycle stage, or (d) no grouping at this N (9 ventures fit one flat list).
4. **Q-4 (ranking / rotation):** How are ventures ranked and rotated on the one surface — worst-health
   first, `attention_score` first, active-only with a dead count, or all? Does the card rotate per-venture
   or show all 9 at once?
5. **Q-5 (cancelled-heavy reality):** Today **8 / 9** ventures are `cancelled`. Does the read show **all**
   (the honest "portfolio is mostly dead" signal) or **active-only** with a dead tally? This shapes whether
   the tile is a momentum view or a graveyard view.
6. **Q-6 (refresh cadence — inherited):** Live, hourly (matching the exec-summary gauge), or on-demand?
   Defaults to the companion's cadence answer (Q-7 there).

> Host-surface (companion **Q-4**) and read-only-vs-interactive (companion **Q-6**) are **inherited**, not
> re-asked here.

## 7. Gauge-capability linkage + build handoff (NO build in this SD)

- **Gauge linkage:** the proposed T5 tile advances **C5 "Venture-performance read"** (`vision_ladder_criteria`
  ordinal **4**, active V1 rung). When built, the VDR `code_grep`/registry probe for that capability moves
  it from `today: no venture-performance gauge` toward `required: venture-performance read in the chairman
  cockpit` — so the build is **measurable against the gauge**.
- **Estate provenance (§8).**
- **Build handoff:** this SD ships **only this spec**. The **build** is a **separate follow-on SD**
  (`SD-EHG-COCKPIT-VENTPERF-BUILD-001`, proposed), recorded on this SD's `metadata.followup` with
  `do_not_auto_source = true`, **gated on** the chairman resolving §6. The build inherits the companion
  shell + this spec's metric/data decisions.

## 8. Estate provenance (semantic, false-positives excluded)

Semantic match over the dispositioned `conversion_ledger` estate (NOT keyword). Informing items:

- **Venture-lifecycle visibility** (`todoist_todo`): *"go through a venture from start to finish…"* and
  *"Venture selection improvements…"* → the desire to **see** where each venture is across the pipeline
  (informs M2 lifecycle progress).
- **Portfolio / investment-categories framing** — inherited from the companion spec §3 (the chairman's
  "portfolio adventures under investment categories" idea), which is the recorded provenance for the
  grouping concept (now flagged as an open question in Q-3 because the grouping field is unpopulated).

### 8a. Excluded keyword false-positives (explicitly NOT venture-performance)

Matched on keywords but semantically unrelated — excluded:

- **"Runway" the AI-video tool** — video generation, not portfolio/venture performance.
- **AI-video / film content** (cinematic / filmmaker items).
- **Design-portfolio (UI/UX) content** — a *design* portfolio, not the *venture* portfolio.

## 9. Non-goals (Phase-0)

- No UI code, components, routes, or styling.
- No new data pipelines, tables, or columns (data sources are *named*, not built).
- No decision on the canonical metric, health thresholds, grouping, or ranking — those are the chairman's
  open questions (§6).
- No re-specification of the cockpit shell or the other four tiles (inherited from the companion).
