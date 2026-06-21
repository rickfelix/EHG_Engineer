---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, north-star, strategy]
---

# Link 1 — The North Star

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

The North Star is the single terminal target every other link points at. It is the top of the
down-flow: the vision ladder (link 2) is the *path* to it, the OKRs (link 3) *measure* progress
toward it, and the build gauge / forecast (links 10/12) report *how far / how fast*.

## Source of truth (verified 2026-06-20)

- **Table:** `north_star` (1 row, `status = 'chairman_ratified'`).
- **Code reader:** `lib/vision/north-star.js`.
- **Probe coupling:** the VDR capability *"A queryable, structured north star"* probes this
  table directly (`row_predicate`, `table: 'north_star'`, `filter: { status: 'chairman_ratified' }`,
  `builtWhen: 'exists'`) — so the north star being a *real, queryable, structured* record is
  itself a measured V1 capability (`lib/vision/vdr-registry.js`, ~line 93–99). The probe was
  deliberately repointed OFF the shared KR-2026-07-05 to avoid double-counting (FR-3 coherence
  fix).

## The live definition (read from the DB)

| Field | Value |
|-------|-------|
| `definition` | "EHG income-replacement: monthly EHG monthly net profit of **$18,000/mo net**, sustained **6 consecutive qualifying months**. Leading sub-target: **10+ validated businesses**." |
| `metric` | EHG monthly net profit |
| `target` | `{ unit: "$/mo", amount: 18000, qualifier: "net" }` |
| `status` | `chairman_ratified` |

> Note: the canonical mission/vision prose (`docs/vision/ehg-mission-vision-canonical.md`)
> describes the *end-state* qualitatively ("a handful (3–5) of self-operating businesses … the
> Chairman in pure strategic oversight … deliberately not timeboxed"). The `north_star` **table**
> is the *quantified, queryable* contract ($18k/mo net, 6 months, 10+ validated businesses). The
> table is the machine-readable source of truth; the prose is the human narrative. They are
> complementary, not contradictory — the prose is the *why*, the table is the *measurable target*.

## Existing documentation

- `docs/reference/schema/engineer/tables/north_star.md` — auto-generated schema reference (columns,
  types). **Coverage: good (schema), but no flywheel context.**
- `docs/04_features/ehg-northstar-contract-phase0.md` — the phase-0 contract feature doc.
- `docs/vision/ehg-mission-vision-canonical.md` — the canonical prose mission/vision.

## How it connects down and up

- **Down:** the North Star is decomposed into the vision ladder's rungs ([02-vision-ladder.md]).
  V1 is explicitly framed as the *income-replacement precursor* (see the V1 rung title), V2 as
  *first revenue*, V3 as *portfolio scaled to the chairman quit-threshold*.
- **Up:** the executive summary email ([15-executive-summary-email.md]) does **not** currently
  print the north-star number directly (it was removed in the v3 email simplification, chairman
  directive 2026-06-14); the email leads with the **build %** instead. The north-star target
  remains the anchor that the V2/V3 rungs and the distance-to-quit instrumentation are built to
  hit. **[Honesty flag]** The chairman's recurring surface today reports *build progress*, not
  *income progress* — by design, because income is a V2/operational concern that is correctly 0
  until a venture earns.
