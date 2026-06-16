# W0 Distillation — EHG Application UI/UX Review + Surface-Consolidation Assessment

**SD:** SD-EHG-UIUX-REVIEW-W0-001
**Type:** Review / report — **NO UI code ships in this SD** (FR-4). Specific UI builds become follow-on SDs after chairman review.
**Subject of review:** the sibling **EHG application** (the operator-facing venture app).
**Source map:** the governed `ehg_page_routes` data (the curated map the VDR vision gauge already reads). This is a **curated starting inventory**, not a guaranteed-complete enumeration of every physical route in the `ehg` repo — see the caveat in §1.
**Lens:** solo-operator survivability + the gauge **application-layer capabilities**: *operator cockpit*, *queryable north-star*, *distance-to-broke*, *distance-to-quit*, *venture-performance read*, and *presentation-surface-consolidation*.

---

## 1. Surface Inventory

The governed `ehg_page_routes` map contains **8 surfaces**. Each is listed with a stable id (S1–S8, alphabetical by route) reused by the assessment (§2) and recommendations (§3).

| id | route_path | page_name | purpose | primary workflow | access | component |
|----|-----------|-----------|---------|------------------|--------|-----------|
| S1 | `/analytics` | AnalyticsDashboard | Business intelligence dashboard with charts and insights | Data Analysis | authenticated | `src/pages/AnalyticsDashboard.tsx` |
| S2 | `/automation` | AutomationDashboardPage | Workflow automation status and configuration | Automation Management | authenticated | `src/pages/AutomationDashboardPage.tsx` |
| S3 | `/chairman` | ChairmanDashboard | Executive overview of all ventures with key metrics and decisions | Executive Monitoring | chairman | `src/components/ventures/ChairmanDashboard.tsx` |
| S4 | `/chairman/settings` | ChairmanSettingsPage | Configure chairman dashboard preferences and settings | Settings Management | chairman | `src/pages/ChairmanSettingsPage.tsx` |
| S5 | `/eva` | EVAAssistantPage | AI assistant chat interface and orchestration | AI Assistance | authenticated | `src/pages/EVAAssistantPage.tsx` |
| S6 | `/reports/builder` | ReportBuilderPage | Create custom reports with flexible data sources | Report Creation | authenticated | `src/pages/ReportBuilderPage.tsx` |
| S7 | `/ventures` | VenturesPage | List all ventures with search, filter, and create capabilities | Venture Discovery | authenticated | `src/pages/VenturesPage.tsx` |
| S8 | `/ventures/:id` | VentureDetailEnhanced | Detailed venture information with teams, metrics, and progress tracking | Venture Management | authenticated | `src/pages/VentureDetailEnhanced.tsx` |

**Curated-subset caveat (honest):** the 8 mapped surfaces collectively reference **7 routes that are not themselves inventoried** via their `related_routes`: `/reports`, `/workflows`, `/chairman/decisions`, `/chairman/reports`, `/eva/orchestration`, `/reports/history`, `/portfolios`. The map is therefore the *governed/curated* view, not a full physical route audit. A follow-on should run a fuller route audit (cross-referencing the live `ehg` repo router) per §3 R6; that audit stays explicitly **out of scope** for this review.

---

## 2. Assessment

This section classifies each surface as **redundant / underdefined / orphaned / adequate** against solo-operator survivability and the gauge capabilities, with a one-line rationale. A **Missing-capabilities** subsection follows.

| id | classification | rationale |
|----|----------------|-----------|
| S1 `/analytics` | **redundant** | Generic BI charts overlap S3's "key metrics" and S6's custom reports; three surfaces present overlapping read-only metrics with no clear division of labor. |
| S2 `/automation` | **adequate** (peripheral) | Automation status/config is a distinct concern (automation-by-default); useful but not a survivability surface. Its `related_routes` (`/workflows`) is unmapped — minor orphan-reference. |
| S3 `/chairman` | **underdefined** | Serves as the executive overview and the closest thing to a cockpit, but stays **venture-portfolio-centric**, not **survivability-centric** — it does not lead with distance-to-broke, distance-to-quit, or a single north-star. Its role as the operator cockpit remains undefined. |
| S4 `/chairman/settings` | **redundant** (consolidation candidate) | A standalone settings page for one dashboard; for a solo operator this is surface bloat that should fold into the cockpit's own settings affordance. |
| S5 `/eva` | **adequate** (under-used) | The AI assistant is the natural host for a *queryable north-star* ("ask EVA: what is my distance-to-broke?") but does not currently expose the north-star as a first-class query. |
| S6 `/reports/builder` | **redundant** (overlaps S1) | Custom report authoring overlaps the BI dashboard (S1); the two reporting surfaces should consolidate into one reporting story. |
| S7 `/ventures` | **adequate** | Core venture discovery (list/search/filter/create); clear, single-purpose, no overlap. |
| S8 `/ventures/:id` | **adequate** | Per-venture detail with metrics/progress is the natural *venture-performance read* at the single-venture level; the gap is the absence of a **portfolio-level rollup** of this read into the cockpit. |

### 2.1 Missing capabilities (no current surface provides)

These operator-critical capabilities are **not surfaced anywhere** in the current map and are the highest-impact gaps:

- **distance-to-broke** — no surface shows the operator how close they are to running out of runway. *(gauge capability: distance-to-broke)*
- **distance-to-quit** — no surface shows progress toward the income/quit threshold. *(gauge capability: distance-to-quit)*
- **queryable north-star** — no surface lets the operator ask for the current north-star metric and its drivers; S5 (`/eva`) could host this but does not. *(gauge capability: queryable north-star)*
- **survivability-first operator cockpit** — partial: S3 (`/chairman`) is the candidate but is venture-exec-centric, not survivability-first. *(gauge capability: operator cockpit)*
- **portfolio venture-performance rollup** — partial: S8 provides per-venture performance, but there is no consolidated portfolio read for the operator. *(gauge capability: venture-performance read)*

---

## 3. Prioritized Recommendations

Ranked by **operator-survivability impact** (highest first). Each maps to the named gauge **application-layer capability** it advances and to **presentation-surface-consolidation**, flags whether it **feeds the cockpit design** (SD-EHG-COCKPIT-PHASE0-DESIGN-001), and names the affected surface ids.

### R1 — Make `/chairman` (S3) a survivability-first Operator Cockpit
Evolve S3 from a venture-portfolio overview into the operator cockpit that **leads** with the survivability gauges and a single north-star number, demoting venture-exec detail to a secondary tier.
- **Capabilities:** operator cockpit; distance-to-broke; distance-to-quit.
- **Feeds cockpit design:** **YES** (this *is* the cockpit).
- **Affects:** S3; absorbs the §2.1 survivability gaps.

### R2 — Add distance-to-broke and distance-to-quit as first-class cockpit gauges
These capabilities are entirely **missing** today. Add them as the cockpit's lead tiles (built on the gauge's existing distance-to-broke / distance-to-quit measures).
- **Capabilities:** distance-to-broke; distance-to-quit.
- **Feeds cockpit design:** **YES**.
- **Affects:** §2.1 missing-caps → new tiles in S3.

### R3 — Surface a queryable north-star through EVA (S5)
Expose the north-star metric as a first-class query in the AI assistant so the operator can ask for the current north-star and its drivers; link it from the cockpit.
- **Capabilities:** queryable north-star; operator cockpit.
- **Feeds cockpit design:** **YES** (cockpit links to the EVA query path).
- **Affects:** S5; links from S3.

### R4 — Consolidate the overlapping reporting/BI surfaces (S1 + S6)
`/analytics` (S1) and `/reports/builder` (S6) overlap each other and S3's metrics. Consolidate into **one** reporting story: summary metrics live in the cockpit (S3), one deep report-builder remains; retire the redundant BI dashboard.
- **Capabilities:** presentation-surface-consolidation; venture-performance read.
- **Feeds cockpit design:** **PARTIAL** (cockpit shows the summary read; deep reporting stays a separate surface).
- **Affects:** S1, S6, S3.

### R5 — Roll venture-performance up into the cockpit
Add a portfolio-level venture-performance rollup tile to the cockpit, sourced from the per-venture metrics that already exist in S8; the operator should see portfolio health without drilling into each venture.
- **Capabilities:** venture-performance read; operator cockpit.
- **Feeds cockpit design:** **YES**.
- **Affects:** S8, S7, S3.

### R6 — Audit the orphaned/unmapped routes and fold settings (lowest)
Audit the 7 related-but-unmapped routes (`/reports`, `/workflows`, `/chairman/decisions`, `/chairman/reports`, `/eva/orchestration`, `/reports/history`, `/portfolios`) for orphans, and fold `/chairman/settings` (S4) into a cockpit settings affordance to reduce standalone surface count.
- **Capabilities:** presentation-surface-consolidation.
- **Feeds cockpit design:** **PARTIAL** (cockpit owns its settings affordance; the route audit is independent).
- **Affects:** S4 + the 7 unmapped related routes.

---

## 4. Follow-on Builds (candidate SDs — after chairman review)

This SD ships **no UI code**. The following are candidate follow-on build SDs, to be created via the standard `sd-create` flow **after** chairman review of this report. They are recorded on this SD as `metadata.followup` for traceability.

1. **Operator-cockpit survivability tiles** (R1 + R2) — distance-to-broke / distance-to-quit / north-star lead tiles; *extends/feeds* SD-EHG-COCKPIT-PHASE0-DESIGN-001.
2. **EVA queryable-north-star path** (R3).
3. **Reporting-surface consolidation** (R4) — merge `/analytics` + `/reports/builder`.
4. **Portfolio venture-performance rollup tile** (R5).
5. **Route-map orphan audit + settings fold** (R6).

---

## 5. Coordination — compose, don't overlap (SD-EHG-COCKPIT-PHASE0-DESIGN-001)

This review and the in-flight **operator-cockpit design** effort (SD-EHG-COCKPIT-PHASE0-DESIGN-001) **compose** rather than overlap:

- **This review** owns the *surface inventory* (§1), the *assessment* (§2), and the *prioritized consolidation targets* (§3) — and ships **no UI**.
- **The cockpit-design SD** owns the actual cockpit UX/layout/design.
- The recommendations flagged **"feeds cockpit design: YES"** (R1, R2, R3, R5) are direct inputs the design SD can consume; R4 and R6 are consolidation work the design SD should *assume* but not *own*.
- Because this SD produces only a report (no UI code), there is **no implementation overlap** — it hands prioritized, capability-mapped targets to the design SD and to chairman review for build sequencing.

---

*Generated by SD-EHG-UIUX-REVIEW-W0-001 (W0 distillation). Review/report only — no UI code. Inventory sourced read-only from the governed `ehg_page_routes` map.*
