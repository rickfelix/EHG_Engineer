---
Category: Feature
Status: Draft
Version: 0.1.0
Author: SD-EHG-COCKPIT-PHASE0-DESIGN-001 (Phase-0 design pass)
Last Updated: 2026-06-16
Tags: cockpit, operator, dashboard, vision-gauge, phase-0, design-only
---

# EHG Operator Cockpit — Phase-0 Design Spec (DESIGN-ONLY, NO BUILD)

> **Status: reviewable design artifact.** This document contains **no UI code**. It exists for the
> chairman to **shape** the cockpit before any build is sourced. The build is a **separate follow-on
> SD**, gated on chairman review of this spec (see *§7 Build handoff*).

## 1. Why this exists (the gap)

The first gauge + estate-driven autonomy run-through converged on the **operator cockpit**. The live
Vision Denominator Registry (VDR) gauge puts the **application layer at ~17%**, with **5 capabilities
unbuilt** — these are the weakest, most-buildable parts of V1. The dispositioned estate
(`conversion_ledger`, 561 items) independently surfaces the chairman's own idea for exactly this
surface: an always-on dashboard with a ticker banner and rotating tiles.

The cockpit is the **chairman/operator's single-pane survival + progress view** — the one screen that
answers, at a glance: *Am I going to make it? Is the machine moving? What needs me?*

## 2. The 5 weakest application-layer capabilities (the tile targets)

Sourced verbatim from the active vision-ladder rung (`vision_ladder_criteria`). Every candidate tile
below maps **1:1** to one of these:

| # | Capability (ordinal) | Plain-language meaning |
|---|----------------------|------------------------|
| C1 | **A queryable, structured north star** (11) | One canonical objective the operator can *query*, not prose buried in a doc |
| C2 | **See distance-to-broke** (3) | Runway: how long until cash runs out at the current burn |
| C3 | **See distance-to-quit** (2) | Net income vs the chairman's quit-threshold — "can I leave the day job yet?" |
| C4 | **The cockpit** (9) | The host surface itself — the always-on single-pane shell |
| C5 | **Venture-performance read** (4) | Per-venture/portfolio read: which ventures are moving, stalled, or dead |

## 3. Estate provenance (what the chairman actually asked for)

Semantic match over `conversion_ledger` (NOT keyword). Informing items:

- **ANCHOR (critical, `todoist_todo`):** *"Design a screen saver type of dashboard with a ticker banner
  and rotating tiles and a toggle to switch between personas. This is for use to essentially always
  stay on while I do other work. On this screensaver be good to be able to listen to music and rank my
  music."* → the **layout DNA** (ticker banner + rotating tiles + persona toggle + always-on).
- **SUPPORTING (`todoist_todo`):** the portfolio / investment-categories framing — *"the portfolio
  adventures sit underneath investment categories such as new business capacity expansion, system
  performance, preventative maintenance, corrected maintenance…"* → informs the **venture-performance
  read** tile's grouping (C5).
- **SUPPORTING:** the "10+ validated businesses future state" item → informs the portfolio scale view (C5).

### 3a. Excluded keyword false-positives (explicitly NOT cockpit)

These matched on keywords but are semantically unrelated — excluded per the SD's instruction:

- **"Runway" the AI-video tool** + `dev.runwayml.com` developer portal — video-generation, not financial *runway*.
- **AI-video / film YouTube content** (e.g. "Cinematic Universes with Gen-4.5", "AI Audio Tool for Filmmakers").
- **Design-portfolio (UI/UX) content** ("Portfolio Design Trends 2026", design-portfolio-website items) — a *design* portfolio, not the *venture* portfolio.

## 4. Candidate tiles (mapped 1:1 to capabilities, with data sources)

> Data sources are **pointers to existing/identified models**, not new pipelines. Where a source does
> not yet exist, it is flagged as an **open question** (§6), not assumed.

| Tile | Moves | What it shows | Data source |
|------|-------|---------------|-------------|
| **T1 · North Star** | C1 | The one canonical objective + current value vs target, queryable | The active **vision ladder** rung / OKR objective (`vision_ladder_*`, `key_results`). Currently prose+ladder; "queryable" is the gap to close. |
| **T2 · Distance-to-Broke** | C2 | Runway in weeks/months at current burn; red when < threshold | **Income/runway model** = cash-on-hand + burn rate. ⚠️ *This model does not yet exist* — see Q-1. |
| **T3 · Distance-to-Quit** | C3 | Net monthly income vs the chairman quit-threshold | **Reuse** the existing `adam-exec-summary` distance-to-quit computation: chairman quit-threshold amendment (`SD-LEO-ORCH-ADAM-PLAN-KEEPER-001` metadata `…draft_quit_threshold`) + net-monthly income. |
| **T4 · Cockpit Shell** | C4 | The always-on single-pane host: ticker banner + rotating tiles + persona toggle | Composition of T1–T3, T5; the shell IS the capability. Layout DNA from the chairman anchor idea (§3). |
| **T5 · Venture Performance** | C5 | Per-venture status (moving / stalled / dead), grouped by investment category | **Venture data** (`ventures` + venture KPIs); grouping from the estate investment-categories framing (§3). |

### 4a. Capability → tile linkage (coverage check)

All 5 capabilities are covered, each by exactly one primary tile:

`C1→T1 · C2→T2 · C3→T3 · C4→T4 (shell) · C5→T5`

## 5. Layout sketch (ticker banner + rotating tiles + persona toggle)

Concept only — not a final visual design.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◀ TICKER:  North★ 34% ·· Broke in ~6wk ·· Quit: net $0 / $18k ·· 4 active │  ← T4 banner (always scrolling)
├──────────────────────────────────────────────────────────────────────────┤
│  Persona:  ( Operator ) ( Chairman ) ( Builder )            [ always-on ]  │  ← persona toggle
├──────────────────────────────┬───────────────────────────────────────────┤
│  ┌────────────┐ ┌──────────┐ │  rotating tiles (cycle on a timer; the     │
│  │ T1 NORTH★  │ │ T2 BROKE │ │  banner stays fixed, the tile grid rotates │
│  │  34% → 100%│ │  ~6 weeks│ │  through detail cards for T1..T5)          │
│  └────────────┘ └──────────┘ │                                            │
│  ┌────────────┐ ┌──────────┐ │  (stretch, from the anchor idea: a music  │
│  │ T3 QUIT    │ │ T5 VENT. │ │   strip the operator can rank — see Q-5)  │
│  │  $0 / $18k │ │ 3↑ 1→ 0✗ │ │                                            │
│  └────────────┘ └──────────┘ │                                            │
└──────────────────────────────┴───────────────────────────────────────────┘
```

- **Ticker banner (T4):** always-scrolling one-line summary of the headline numbers — survives even in
  screensaver mode.
- **Rotating tiles:** the tile grid cycles through detail cards on a timer (the "rotating tiles" of the
  anchor idea), so a glance always lands on *something* current.
- **Persona toggle:** switches the tile set/emphasis per persona (Operator vs Chairman vs Builder).
- **Always-on / screensaver mode:** designed to stay on a secondary screen while the operator works.

## 6. Open design questions (for the chairman to resolve)

1. **Q-1 (blocking T2):** There is **no income/runway model** yet (cash-on-hand + burn). Distance-to-broke
   needs one. Build a minimal runway model first, or ship T2 as "not yet measurable"?
2. **Q-2 (north star):** What is the single canonical **north-star metric** T1 should show, and at what
   target? (Today it's the vision ladder %, ~34% — is that the north star, or something revenue-based?)
3. **Q-3 (personas):** Which personas does the toggle switch between, and what changes per persona
   (different tiles, or same tiles different emphasis)?
4. **Q-4 (host surface):** Where does the cockpit **build** live — the EHG operator app, a standalone
   always-on screen app, or an EHG_Engineer surface? (Affects the build SD's target_application.)
5. **Q-5 (music / ranking):** The anchor idea includes "listen to music and rank my music." Is that
   **in scope** for the cockpit, or a separate personal-tooling SD? (Recommended: defer; out of the
   survival/progress core.)
6. **Q-6 (interactivity):** Is the cockpit **read-only** (a glanceable status surface) or does it allow
   actions (e.g. claim/approve from a tile)? Phase-0 assumes read-only.
7. **Q-7 (refresh cadence):** How fresh must each tile be — live, hourly (matching the exec-summary
   gauge), or on-demand?

## 7. Build handoff (NO build in this SD)

This SD ships **only this spec**. The cockpit **build** is a **separate follow-on SD**, to be sourced
**after** the chairman reviews this spec and resolves §6. A durable pointer is recorded on this SD's
`metadata.followup`. The build SD inherits: the 5 capability→tile mappings (§4), the layout DNA (§5),
and the chairman's answers to the open questions (§6) — especially **Q-1** (runway model) and **Q-4**
(host surface), which shape its scope and target_application.

## 8. Non-goals (Phase-0)

- No UI code, components, routes, or styling.
- No new data pipelines or schema (data sources are *named*, not built).
- No decision on the host app, personas, or music feature — those are open questions for the chairman.
