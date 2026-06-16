---
Category: Feature
Status: Draft
Version: 0.1.0
Author: SD-EHG-COCKPIT-DTQ-PHASE0-DESIGN-001 (Phase-0 design pass)
Last Updated: 2026-06-16
Tags: cockpit, distance-to-quit, income, gauge, phase-0, design-only
---

# Distance-to-Quit Gauge — Phase-0 Design Spec (DESIGN-ONLY, NO BUILD)

> **Status: reviewable design artifact.** No UI code. This specs **one** cockpit gauge —
> *distance-to-quit* — to build-depth. It is the companion deep-dive to tile **T3** of the parent
> cockpit shell spec ([`ehg-operator-cockpit-phase0.md`](./ehg-operator-cockpit-phase0.md)). The build
> is a separate, chairman-review-gated follow-on (see §8).

## 1. The capability (and why it's the operator's #1 survival signal)

Active vision-ladder rung, ordinal 2 — **"See distance-to-quit"**:
- **Today:** *"income gauge not rendered"*
- **Required:** *"the income/distance-to-quit gauge rendered"*

Distance-to-quit answers the operator's single most important survival/progress question: **"How close
am I to being able to leave the day job?"** It is the headline emotional + financial signal of the whole
EHG endeavor. Per the VDR gauge (the separate vision-probe registry — `lib/vision/vdr-registry.js`, NOT
the `vision_ladder_criteria` table), the application/cockpit layer is the weakest V1 area (~17% at the
gauge run that sourced this work) with this capability **unbuilt**.

## 2. The quit-threshold (live, ratified working target — read at runtime, never hardcoded)

Source of truth: `strategic_directives_v2` where `sd_key='SD-LEO-ORCH-ADAM-PLAN-KEEPER-001'`, metadata path
`chairman_amendment_2026_06_11_income_replacement.target_number_2026_06_11`. Verbatim live values:

- **`draft_quit_threshold`:** *"EHG monthly net profit (after business expenses incl AI/infra costs)
  **≥ ~$14–15k/mo sustained 3–6 CONSECUTIVE months**. Equivalent annualized: ~$170–180k net…"*
- **`status`:** *"**RATIFIED at sitting #1 (2026-06-11) as working target; amendable**"* — i.e. ratified
  **as a working target**, but the dollar figure and sustain-window remain amendable: the
  `draft_quit_threshold` prose itself is still labelled *"DRAFT for chairman ratification at roadmap
  layout"*, and the parent cockpit spec cites a live, unresolved chairman decision (**$14–15k vs $18k**).
  Treat the number as **ratified-but-provisional** — see Q-7.
- **`derived`:** take-home ~$136k/yr ≈ $11.3k/mo, **plus** self-employed must cover health insurance
  (~$1.0–1.5k/mo), retirement replacement for 401k + pension (~$1.5–2.5k/mo), and SE-tax differences.
- **`chairman_facts_verbatim`:** gross ~$200k/yr; ~32% taxes; employer covers health insurance; has 401k AND pension.

> **Build-depth insight #1 — it's a SUSTAINED threshold, not a point-in-time one.** The gauge must track
> **N of M consecutive qualifying months** (M = 3–6), not just "is this month ≥ threshold". "Quit-ready"
> is only true after the consecutive-month run is met. A naive `net ≥ threshold?` gauge would lie.

> **Build-depth insight #2 — read the threshold at runtime.** Mirror `scripts/adam-exec-summary.mjs`
> (§2b, the `quitLine` block): the fleet NEVER hardcodes the dollar figure; it reads the metadata path
> live so a chairman amendment propagates with no code change.

## 3. What the gauge shows

| Element | Definition |
|---------|------------|
| **Current net monthly profit** | revenue − business expenses (incl AI/infra costs). The live operating number. |
| **Quit-threshold** | the live `draft_quit_threshold` (~$14–15k/mo net), shown as the target line. |
| **Distance** | `threshold − current_net` — the dollars/month still to close (the headline number). |
| **Progress** | `clamp(current_net / threshold, 0, 100)%` — how far along the bar. |
| **Sustained-months tracker** | **N / M consecutive months** at-or-above threshold (M = chosen 3–6). The true gate. |
| **State** | `far` (red), `closing` (amber), `at-threshold-counting` (amber, sustained run in progress), `quit-ready` (green, run complete). |
| **Trend** (optional) | net monthly over the recent window (sparkline), reusing the historization pattern from SD-LEO-INFRA-VISION-GAUGE-HISTORIZE-001. |

## 4. Data sources (pointers — NOT new pipelines in Phase-0)

| Input | Source | Status |
|-------|--------|--------|
| **Quit-threshold ($ + sustained months)** | `SD-LEO-ORCH-ADAM-PLAN-KEEPER-001` metadata `…draft_quit_threshold` (read at runtime) | ✅ Exists (ratified). ⚠️ Stored as **prose** — parsing "~$14–15k / 3–6 months" out of text is brittle (see Q-3). |
| **Current net monthly profit** | `income_capture_monthly` (table EXISTS, 14 columns) — intended source for revenue/expense per month | ⚠️ **Populated but NOT wired into the gauge.** The table has begun capturing (1 row: 2026-06, recurring_revenue $25, business_expenses $0, source `ops_payment_events_aggregate`, **`livemode=false`** — i.e. test-mode). But `adam-exec-summary` does not read it — it hardcodes `netMonthly='~$0'` ("when an income source exists this can read income_capture_monthly"). **The blocking dependency (Q-1) is the WIRING + real (livemode) revenue/expense capture, not the table's existence.** |
| **Consecutive-months run** | derived from `income_capture_monthly` history (count trailing months ≥ threshold) | ⚠️ Depends on the table being populated. |
| **Existing headline line** | `scripts/adam-exec-summary.mjs` `quitLine` already renders "Distance-to-quit: net ~$0/mo vs … threshold" | ✅ Reuse — the cockpit tile is the richer visual of the same computation. |

## 5. Honest degrade states (the gauge must NEVER fabricate a number)

Mirror the exec-summary's fail-soft idiom on every branch:

1. **Income not yet instrumented (today's reality):** show *"net ~$0/mo — income not yet instrumented"*
   with the threshold + distance still shown against $0. Do **not** render a fake current number.
2. **Threshold reachable but unset/unparseable:** *"quit-threshold unavailable this run"* (the source
   row/key missing) — never assume a figure.
3. **Threshold ratified (today):** show the ~$14–15k/mo target and the 3–6-month sustain requirement.
4. **At/above threshold but run incomplete:** show *"month K of M"* — not "quit-ready".
5. **Quit-ready:** only after M consecutive qualifying months.

## 6. Layout sketch (the tile / gauge — concept only)

```
┌─ DISTANCE TO QUIT ─────────────────────────────┐
│  net  ~$0 / mo        target  ~$14–15k / mo      │
│  ▕▏░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0%    │  ← progress toward threshold
│  distance:  ~$14–15k / mo to close              │
│  sustained: 0 / 3–6 consecutive qualifying mo   │  ← the true gate
│  state:  [FAR]   (income not yet instrumented)   │
└─────────────────────────────────────────────────┘
```

- State rendered as a color band (far → closing → quit-ready); no emojis (chairman directive). The
  **sustained-months badge** is co-equal with the dollar bar (insight #1).
- In the always-on cockpit shell (parent T4), this collapses to the ticker line
  `Quit: net $0 / $14k` and expands to the card above when the tile rotates in.

## 7. Capability linkage + provenance

- **Capability:** vision-ladder ordinal 2, *"See distance-to-quit"* (required: the income/distance-to-quit
  gauge rendered).
- **Parent:** tile **T3** of `ehg-operator-cockpit-phase0.md` — this spec is its build-depth expansion.
- **Reuse:** `scripts/adam-exec-summary.mjs` `quitLine` (runtime threshold read + ~$0 honest degrade).
- **No estate false-positives apply** here (this is a single-capability deep-dive, not an estate mining pass);
  the parent SD already excluded the Runway/AI-video/design-portfolio look-alikes.

## 8. Open design questions (for the chairman)

1. **Q-1 (BLOCKING):** `income_capture_monthly` exists and has **one test-mode row** ($25, `livemode=false`),
   but it is **not wired into the gauge** and has **no real (livemode) revenue/expense capture** yet. What
   feeds it in production — revenue (from where?) and business expenses **including the fleet's own AI/infra
   costs**? Until the gauge reads it AND real income flows, it honestly shows net ~$0. *This wiring + real
   capture is the prerequisite for the gauge to show a real number.*
2. **Q-2:** Sustained period — **3 or 6** consecutive qualifying months? (The ratified text says 3–6.)
3. **Q-3:** The threshold is stored as **prose** ("~$14–15k/mo sustained 3–6 months"). Should it become a
   **structured field** (`{ amount_min, amount_max, sustain_months }`) so the gauge parses it reliably
   instead of regexing text? (Recommended.)
4. **Q-4:** Net-profit definition — does it net out the **fleet's own AI/infra spend** (the metadata says
   "incl AI/infra costs")? If so, that cost stream needs a source too.
5. **Q-5:** Show the **derived buffer** (health-insurance + retirement-replacement breakdown) inside the
   gauge, or keep the gauge to the single net-vs-threshold number and link the breakdown?
6. **Q-6:** Host surface + interactivity — inherited from the parent cockpit Q-4/Q-6 (read-only assumed).
7. **Q-7:** The quit-threshold is ratified **as a working target** but the dollar figure is still
   amendable — the prose self-labels "DRAFT for chairman ratification" and a live **$14–15k vs $18k**
   decision is pending. Confirm the figure (and whether the gauge should display it as "provisional").

## 9. Build handoff (NO build in this SD)

Ships **only this spec**. The build is a separate follow-on SD, gated on chairman review + resolution of
§8 — **especially Q-1** (income instrumentation), without which the gauge cannot show a real number. A
durable pointer is on this SD's `metadata.followup`. The build SD inherits: the sustained-months gate
(insight #1), the runtime-threshold-read contract (insight #2), the honest-degrade states (§5), and the
reuse of the exec-summary computation.

## 10. Non-goals (Phase-0)

- No UI code, components, or styling.
- No income/expense pipeline (Q-1 is *surfaced*, not built).
- No change to the threshold value or the exec-summary computation.
