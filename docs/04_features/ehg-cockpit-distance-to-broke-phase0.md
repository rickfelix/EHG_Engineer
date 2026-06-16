---
Category: Feature
Status: Draft
Version: 0.1.0
Author: SD-EHG-COCKPIT-DTB-PHASE0-DESIGN-001 (Phase-0 design pass)
Last Updated: 2026-06-16
Tags: cockpit, distance-to-broke, runway, cash, gauge, phase-0, design-only
---

# Distance-to-Broke Gauge — Phase-0 Design Spec (DESIGN-ONLY, NO BUILD)

> **Status: reviewable design artifact.** No UI code, no migration, no schema change.
> This specs **one** cockpit gauge — *distance-to-broke* (cash runway) — to build-depth. It
> is the companion deep-dive to the parent cockpit shell spec
> ([`ehg-operator-cockpit-phase0.md`](./ehg-operator-cockpit-phase0.md)) and a sibling to the
> distance-to-quit ([`ehg-cockpit-distance-to-quit-phase0.md`](./ehg-cockpit-distance-to-quit-phase0.md))
> and venture-performance ([`ehg-cockpit-venture-performance-phase0.md`](./ehg-cockpit-venture-performance-phase0.md))
> deep-dives. The build is a separate, chairman-review-gated follow-on (see §6).

## 1. Metric definition (FR-1)

**Headline number:** *months of runway* — how many months the portfolio (or a single
venture) can operate before liquid cash is exhausted.

**Formula:**

```
months_of_runway = current_liquid_cash / monthly_net_burn

monthly_net_burn = monthly_cash_outflow - monthly_cash_inflow
```

**Definition of "broke":** runway `<= 0`, i.e. cash is exhausted. The gauge treats a runway
of `0` (or negative, if cash has already gone below zero) as the **critical / broke** state.

**Units & sign conventions:**
- `current_liquid_cash` — USD, a point-in-time balance (`>= 0`).
- `monthly_net_burn` — USD/month. **Positive** = losing cash each month (the normal
  pre-revenue case); runway is finite and meaningful.
- When `monthly_net_burn <= 0` (cash-flow-positive: inflow ≥ outflow), runway is
  **effectively infinite** — the gauge renders a distinct "not burning / cash-positive"
  state rather than a misleading huge number (mirrors the live `Infinity` branch at
  `stage-16-financial-projections.js:201-203`).
- Headline rendering: **months** (one decimal, e.g. `7.4 mo`). A calendar "broke date"
  (today + runway months) is **Q2** for the chairman (§4) — months primary, date optional.

## 2. Data-source grounding (FR-2)

Every input is mapped to a **verified live source** or recorded as an **open question**. No
source is invented. Grounded against the live repo on 2026-06-16.

| Input | Live source | Symbol / field | Unit | Status |
|-------|-------------|----------------|------|--------|
| **(a) Liquid cash** | `lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js:132` | `initial_capital` (`Math.max(0, Number(parsed.initial_capital) || 0)`) | USD | **GROUNDED** — but it is the *starting* capital from the Stage-16 projection, **not a live/real-time balance** (Q3). |
| **(b) Monthly burn (outflow)** | `stage-16-financial-projections.js:137,200` | `monthly_burn_rate` → aliased `burn_rate` | USD/month | **GROUNDED** — fixed scalar monthly burn from the Stage-16 projection. |
| **(c) Monthly income (inflow)** | `stage-16-financial-projections.js:148` | `revenue_projections[].revenue` (per-month array) | USD/month | **PARTIAL** — revenue exists **per-month in an array**, not as a single monthly-income scalar; the live runway formula **does not subtract it** (§2.1, Q4). |

**Existing live runway calculation** (the design extends, does not re-derive):

```javascript
// lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js:200-203
const burn_rate = monthly_burn_rate;
const runway_months = burn_rate > 0
  ? Math.round((initial_capital / burn_rate) * 100) / 100
  : initial_capital > 0 ? Infinity : 0;
```

### 2.1 Honesty flag — the live formula ignores revenue

The live `runway_months = initial_capital / burn_rate` divides by **gross** burn, not
**net** burn — it assumes revenue = 0. For a true *distance-to-broke* the design calls for
`initial_capital / (monthly_burn_rate - average_monthly_revenue)`. The per-month revenue
array exists but is **not** aggregated into an `average_monthly_revenue` scalar. The gauge
must either (i) reuse the live gross-burn runway and **label it "gross-burn runway (revenue
not netted)"**, or (ii) the build SD adds a small `average_monthly_revenue` derivation over
`revenue_projections[]`. This is **Q4** — the gauge must not silently present gross-burn
runway as net-burn distance-to-broke.

### 2.2 Honesty flag — "burn rate" in LEO tooling is NOT cash

`scripts/sd-burnrate.js` and `scripts/pipeline/burn-rate-worker.js` compute
`velocity = completedCount / (baselineAgeDays / 7)` — **Strategic-Directive completion
velocity in SDs/week**, *not* dollars. They are **NOT** a source for this gauge. Any build
that wires "burn rate" must use the Stage-16 `monthly_burn_rate` (USD/month), never the
SD-velocity burn-rate scripts. This is the single most likely wiring mistake; it is called
out here so the build SD cannot fall into it.

## 3. Gauge design (FR-3)

### 3.1 Visual states / threshold bands

Runway in months drives a three-band gauge. **Candidate** cut points (exact numbers are
**Q1** for the chairman):

| State | Candidate band | Meaning | Treatment |
|-------|----------------|---------|-----------|
| **Healthy** | `runway >= 12 mo` | Over a year of cash | green |
| **Warning** | `6 mo <= runway < 12 mo` | Plan a raise / cut burn | amber |
| **Critical / broke** | `runway < 6 mo` (`<= 0` = broke) | Urgent | red; at `<= 0` show "BROKE", not a number |
| **Cash-positive** | `monthly_net_burn <= 0` | Not burning | distinct neutral/positive state, no finite runway |

The 6/12-month cut points are **placeholders pending chairman ratification** (Q1); not
asserted as final.

### 3.2 Refresh cadence

`initial_capital` / `monthly_burn_rate` are written when a venture's Stage-16 projection
runs, not continuously. The gauge refreshes **on cockpit render** from the latest stored
Stage-16 contract (no new polling infrastructure). Source-projection staleness is **Q3**
(there is no live cash balance).

### 3.3 Placement

Within the cockpit overview's **ticker-banner + rotating-tiles** concept
([`ehg-operator-cockpit-phase0.md`](./ehg-operator-cockpit-phase0.md)): distance-to-broke is
a **rotating tile** (full three-band gauge + headline months) and contributes a compact
"X mo runway" token to the always-on **ticker banner** when in the warning/critical band, so
a deteriorating runway is visible without waiting for tile rotation.

### 3.4 VDR capability linkage

The gauge advances exactly one V1 VDR capability, already registered:

```javascript
// lib/vision/vdr-registry.js:67-68
{ capability: 'See distance-to-broke', layer: 'application',
  probe: { type: 'code_grep', repo: 'ehg', path: 'src',
           pattern: 'distance[-_ ]?to[-_ ]?broke', builtWhen: 'present' } },
```

The build SD's UI lives in the `ehg` repo `src/` and must contain the literal
`distance-to-broke` token so this `code_grep` probe flips the capability to *built* — the
gauge and its capability probe are 1:1.

## 4. Open design questions for the chairman (FR-4)

1. **Q1 — Threshold cut points.** Are healthy ≥ 12 mo / warning 6–12 mo / critical < 6 mo
   correct, or should bands reflect a specific runway target?
2. **Q2 — Months vs date.** Headline as *months of runway* (primary) with an optional
   secondary "projected broke date"? Or date-primary?
3. **Q3 — Live vs projected cash.** `initial_capital` is the *starting* capital from the
   Stage-16 projection, not a live balance. Is projection-derived runway acceptable for V1,
   or is a live cash-balance feed required (out of scope here; would need an accounting
   integration that does not exist today)?
4. **Q4 — Gross vs net burn.** Reuse the live gross-burn runway (revenue not netted, clearly
   labeled), or have the build SD derive `average_monthly_revenue` from
   `revenue_projections[]` for true net-burn distance-to-broke?
5. **Q5 — Scope.** Per-venture runway, portfolio-aggregate runway, or both (portfolio
   headline + per-venture drill-down)?

## 5. Non-goals (design-only boundary)

- **No** UI components, React, or CSS.
- **No** migration, schema change, or governed-row writes.
- **No** change to the live `stage-16-financial-projections.js` formula (the gross-vs-net
  decision is Q4, resolved in the build SD).
- This spec **reads** live financial-model code only to ground §2; it writes no data.

## 6. Follow-up (build SD)

After chairman sign-off on §4, a separate **build SD** implements the gauge in the `ehg`
repo: it derives runway from the Stage-16 contract per the Q1/Q4 decisions, renders the
three-band tile + ticker token (§3), and includes the `distance-to-broke` token so the VDR
probe (§3.4) flips to *built*. A durable pointer is recorded on this SD's `metadata.followup`.
