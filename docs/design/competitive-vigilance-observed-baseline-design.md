# Competitive-Vigilance OBSERVED-Baseline — Phase-0 Design

**SD:** SD-LEO-INFRA-COMPETITIVE-VIGILANCE-OBSERVED-DESIGN-001
**Phase:** 0 (design-only — no production code; does NOT touch `lib/vision/vdr-registry.js`)
**Status:** Design for decomposition into 2-3 buildable child SDs
**Capability anchor:** VDR build gauge, vision-ladder criteria 23-25 (competitive vigilance)

> **Path note:** the SD scope named `docs/plans/competitive-vigilance-observed-baseline-design.md`,
> but the `pre-tool-enforce` hook (SD-LEO-INFRA-ONLY-ENFORCEMENT-STRATEGIC-002) DB-only-blocks
> new markdown under `docs/plans/`. This doc therefore lives at `docs/design/` — same intent
> (a discoverable design doc), harness-compliant location. Spec-conflict signaled to the coordinator.

---

## 0. Why this exists (build-out phase)

We are in the BUILD-OUT phase: drive the VDR gauge up by building genuinely-unbuilt
capabilities. Competitive vigilance — keeping an **observed** (not merely assumed) baseline
of each venture's competitors — is one such capability. It is genuinely unbuilt, and a
design-first rung is correct because the single highest-leverage decision (where observations
come from) is **chairman-gated**, while the other build pieces have independent write-surfaces
and can proceed in parallel once shaped.

This document settles the three unknowns that block any build, then proposes a decomposition.

## 1. Premise corrections (verified live via supabase MCP, 2026-06-22)

The originating SD framing contained two inaccuracies. Build children MUST operate on the
corrected reality below, not the SD's loose wording.

| SD framing | Reality (verified) | Consequence |
|---|---|---|
| "`competitive_baselines` is empty" | **4 seed rows**, all `competitor_name='STATUS_QUO'`, `baseline_type='STATUS_QUO'`, `epistemic_tag='ASSUMPTION'`, one per venture (created 2026-05-22 … 2026-05-31). | There IS existing data. No-backfill decision applies to these 4 (§2.3). |
| "add OBSERVED to BOTH the CHECK and the EPISTEMIC_TAGS enum" | There is **no `epistemic_tags` pg_enum** (`pg_enum` lookup returned null). `epistemic_tag` is a plain `text` column constrained only by a CHECK. | The migration is **CHECK-only**. Drop the "enum" half of the scope entirely. |

Verified facts:
- `competitive_baselines_epistemic_tag_check` = `CHECK (epistemic_tag IN ('FACT','ASSUMPTION','SIMULATION','UNKNOWN'))` — **rejects `OBSERVED` today**.
- `competitive_baselines` columns: `id, venture_id, competitor_name, baseline_type, pricing_data (jsonb), feature_coverage (jsonb), performance_metrics (jsonb), epistemic_tag (text), created_at, updated_at`.
- Candidate downstream tables are empty: `competitor_intelligence` = 0 rows, `ci_snapshots` = 0 rows, `app_rankings` = 0 rows.
- Dormant Apple RSS / Google Play / Product Hunt pollers exist (per `SD-…-COMPETITOR-MONITORING-PHASE-001`, which validated pollers → `app_rankings`).

---

## 2. Unknown #1 — the OBSERVED epistemic contract + migration shape

### 2.1 What OBSERVED means

`epistemic_tag` records the **epistemic provenance** of a baseline row. The existing tags and
the new one:

| Tag | Meaning |
|---|---|
| `FACT` | Established ground truth, not in dispute. |
| `ASSUMPTION` | Assumed/posited (e.g. the 4 `STATUS_QUO` seeds — "the status quo is the competitor"). |
| `SIMULATION` | Produced by a model/simulation run, not observed externally. |
| `UNKNOWN` | Provenance unrecorded. |
| **`OBSERVED`** *(new)* | **Externally observed competitor fact** — captured from a real-world source (web, store ranking, analyst brief) at a point in time. Distinct from `FACT` (which asserts settled truth) and from `ASSUMPTION` (which is posited, not seen). |

`OBSERVED` is the tag that turns competitive vigilance from "we assume X about competitor Y"
into "we observed X about competitor Y on date D from source S".

### 2.2 Migration shape (designed, NOT applied here)

Additive, idempotent CHECK-expansion — the standard widen-the-allowlist pattern
(DROP IF EXISTS + re-ADD). **No enum.** Designed shape for the migration child:

```sql
ALTER TABLE competitive_baselines
DROP CONSTRAINT IF EXISTS competitive_baselines_epistemic_tag_check;

ALTER TABLE competitive_baselines
ADD CONSTRAINT competitive_baselines_epistemic_tag_check
CHECK (epistemic_tag IN ('FACT','ASSUMPTION','SIMULATION','UNKNOWN','OBSERVED'));
```

Properties: additive (widens only — never rejects existing rows), idempotent (safe to
re-apply), no data migration. This SD does **not** apply it — the migration child does
(and MCP `apply_migration` is read-only in worker sessions, so it ships as a `.sql` applied
by pipeline/chairman; MERGED ≠ LIVE — flag the apply step).

### 2.3 Backfill decision: NO backfill

The 4 existing `STATUS_QUO` seeds are correctly `ASSUMPTION` — they are *assumed* baselines
("the status quo is the competitor"), not externally observed. Re-tagging them `OBSERVED`
would be a provenance lie. **Decision: leave the 4 seeds as `ASSUMPTION`; no backfill.**
`OBSERVED` rows are only ever written by a real observation path (Unknown #2).

---

## 3. Unknown #2 — the observation SOURCE-OF-TRUTH (⚠️ CHAIRMAN-GATED)

> ### ⚠️ CHAIRMAN-GATED DECISION
> **The observation source-of-truth is OPEN and requires chairman input. This Phase-0 design
> FLAGS the decision and enumerates the options — it does NOT choose one.** A build child for
> ingestion (§5, child 2) is BLOCKED on this decision.

`competitive_baselines` currently has no feed for `OBSERVED` rows. Four candidate sources,
each with its extraction path, feasibility, and whether it is buildable without chairman input:

| # | Option | Extraction path | Feeds `competitive_baselines`? | Buildable w/o chairman? | Notes |
|---|---|---|---|---|---|
| a | **Web research** | Agentic web search/fetch → structured extract → insert `OBSERVED` row per competitor fact | Yes (richest, broadest) | **No** — requires chairman direction on which competitors/dimensions to watch + cost posture | Highest fidelity to "observed"; highest open-endedness. |
| b | **Dormant store pollers** (Apple RSS / Google Play / Product Hunt) | Re-activate existing pollers → `app_rankings` → adapter maps ranking facts → `OBSERVED` baseline rows | Partial (ranking/visibility facts only, app-store-shaped ventures) | Mostly yes (pollers already exist) — but **only meaningful for app-store ventures**, a chairman call on relevance | Cheapest to build (reuse); narrowest signal. `app_rankings`=0 today. |
| c | **Manual chairman/analyst briefs** | Chairman/analyst submits a brief → simple intake → `OBSERVED` rows | Yes (curated, low volume) | **No** — the source IS the chairman | Highest trust, lowest automation; a natural bootstrap. |
| d | **Empty `competitor_intelligence` / `ci_snapshots` tables** | Wire whatever populates those → adapter → `OBSERVED` baseline rows | Only if a producer is built (both 0 rows today) | No — there is **no producer**; choosing this means also building the producer | Today these are hollow; not a source until fed. Do not assume they are a source. |

**Recommended default (advisory, not a decision):** bootstrap with **(c) manual briefs** for
immediate trustworthy `OBSERVED` rows, while building **(b) store pollers** as the first
automated feed (cheapest, reuses dormant infra) — and defer **(a) web research** until the
chairman scopes competitors/dimensions/cost. Reject **(d)** as a "source" unless a producer
is explicitly funded. **Final selection is the chairman's.**

---

## 4. Unknown #3 — the recurrence (recurring-vigilance) model

Recurrence keeps `OBSERVED` baselines fresh. It is **downstream of the §3 decision** (you
can't schedule a feed you haven't chosen), so it is designed conditionally.

- **Mechanism:** reuse existing scheduler/cron infrastructure (the EVA scheduler / existing
  cron job pattern). **Do NOT invent a net-new scheduler.** The ingestion child registers a
  job with the existing scheduler, mirroring how the dormant pollers were scheduled.
- **Cadence:** propose **weekly** for automated feeds (store pollers / web research) and
  **ad-hoc** for manual briefs. Rationale: competitor positioning changes on a weekly-to-
  monthly horizon; weekly is fresh enough without burning observation cost. Cadence is a
  config knob, not hardcoded.
- **Scope — per-venture vs global:** **per-venture.** `competitive_baselines.venture_id` is
  per-venture and the 4 seeds are per-venture; observations are venture-relative (each venture
  has different competitors). A global sweep would lose the venture→competitor mapping.
  *(Caveat: if the chairman picks a global source like a single market-wide feed, the fan-out
  to per-venture rows happens at the adapter, not the scheduler — the storage stays
  per-venture either way.)*
- **Dependency:** the recurrence child (§5, child 3) depends on the ingestion child (§5,
  child 2) and therefore transitively on the §3 chairman decision.

---

## 5. Proposed decomposition — 2-3 buildable child SDs

Each child has a bounded scope and an **independent write-surface** (per the SD rationale).

### Child 1 — OBSERVED CHECK-expansion migration *(independently buildable NOW)*
- **Scope:** ship the additive idempotent CHECK-only migration from §2.2 adding `OBSERVED`.
- **Write-surface:** `database/migrations/<date>_add_observed_to_competitive_baselines_check.sql` (+ a deliberately live-probe-free static test asserting UP adds / DOWN removes `OBSERVED`).
- **Dependencies:** none.
- **Gating:** none (no chairman gate). MCP apply is read-only → ships as `.sql`, applied by pipeline/chairman; **flag the apply step (MERGED ≠ LIVE)**.
- **Type/size:** `database` (or `infrastructure`), small. This is the unblocker — without it every `OBSERVED` insert 23514-errors.

### Child 2 — Observation ingestion path *(BLOCKED on §3 chairman decision)*
- **Scope:** build the chosen source-of-truth feed (per §3 selection): extraction → adapter → insert `OBSERVED` rows (venture-relative). Includes the source adapter and the intake/extract code.
- **Write-surface:** new `lib/competitive-vigilance/…` ingestion + adapter modules; writes to `competitive_baselines` (and, if option (b), reads `app_rankings`).
- **Dependencies:** Child 1 (CHECK must admit `OBSERVED`); **chairman decision (§3)**.
- **Gating:** chairman-gated — **do not start until §3 is resolved.** Scope/size depends on which option(s) the chairman picks (manual-brief intake is small; web research is large).

### Child 3 — Recurrence / scheduler *(depends on Child 2)*
- **Scope:** register the §4 recurrence job with the existing scheduler — cadence + per-venture scope + freshness.
- **Write-surface:** scheduler/cron registration + a thin runner that invokes Child 2's ingestion; config for cadence.
- **Dependencies:** Child 2 (nothing to schedule without a feed).
- **Gating:** inherits Child 2's chairman gate. Could be folded into Child 2 if the feed is small — keep separate only if the scheduling surface is non-trivial.

**Sequencing:** Child 1 (now) → [chairman §3 decision] → Child 2 → Child 3.
Child 1 is the immediate, ungated next build; it drives the gauge without waiting on the chairman.

---

## 6. Out of scope (Phase-0 guardrails)

- No production code, no migration **applied**, no `lib/vision/vdr-registry.js` changes.
- The source-of-truth is **not** chosen here (chairman-gated).
- Children are **proposed** (this doc); creating their rows is a separate, optional step.

## 7. References

- Verified live via supabase MCP (2026-06-22): table contents, CHECK def, absence of enum, empty downstream tables.
- `SD-…-COMPETITOR-MONITORING-PHASE-001` — dormant Apple RSS / Google Play / Product Hunt pollers → `app_rankings`.
- VDR vision-ladder criteria 23-25 — competitive-vigilance capability anchor.
- VALIDATION evidence row `c3db0777-7693-45ad-a538-d6e1d2bb493c` (duplicate-clear; premise corrections confirmed).
