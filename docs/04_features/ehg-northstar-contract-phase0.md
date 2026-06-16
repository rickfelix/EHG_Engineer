---
Category: Architecture
Status: Draft
Version: 0.1.0
Author: SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-DESIGN-001 (Phase-0 design pass)
Last Updated: 2026-06-16
Tags: north-star, contract, foundation, vision, cockpit, phase-0, design-only
---

# Canonical North-Star CONTRACT — Phase-0 Design Spec (DESIGN-ONLY, NO BUILD)

> **Status: reviewable design artifact.** No build, no code, no schema in this SD — **where the canonical
> record is physically stored is a build-time decision, out of scope here.** This is the **upstream
> foundation** of the cockpit family: the contract that the distance-to-quit (ord 2), distance-to-broke
> (ord 3), and venture-performance (ord 4) gauges should bind to instead of each inventing its own
> target. The build is a chairman-review-gated follow-on (§9). **The north-star DEFINITION itself is a
> chairman decision — this design must NOT self-authorize it (CONST-002).**

## 1. The gap (why a contract, foundation-first)

Vision-ladder capability ordinal 11 — *"A queryable, structured north star"* — today reads
*"north star tracked but not realized"*. There is **no single canonical, queryable object** that says
"this is what winning is, and here is the current value." Every in-flight cockpit gauge will otherwise
invent its own divergent target lookup. **This is already happening** (see §4: the ord 11 and ord 2 VDR
probes bind the identical KR). Foundation-first says: define the contract FIRST; the cockpit *display*
of it is then a trivial downstream follow-on (and is largely already covered by the ord 2/3/4 gauges).

## 2. FR-1 — Inventory of the scattered substrate (verified live, 2026-06-16)

| Source | Live state | Note |
|--------|-----------|------|
| `objectives` | 9 rows | OKR objectives; no single one is marked "the north star". |
| `strategic_vision` | 1 row | A narrative row — **no quantified metric**. |
| `key_results` | 43 rows | 7 `pending`; **7 PAT-AUTO retro-noise rows** (de-noise target); the 5 `KR-2026-07-*` rows are `pending`, NOT active. |
| `okr_vision_alignment_records` | **0 rows** | The intended alignment ledger is empty. |
| `strategy_objectives` | **0 rows** | Empty. |
| orphan visions | ~68 | Unattached vision rows (de-noise / reconcile target). |
| `north_star` / `northstar` field | **none anywhere** | No canonical object exists in the live schema. |

> *Count note:* the live numbers (7 pending KR, 7 PAT-AUTO) differ slightly from the sourcing prose
> (5 / 14) — the spec uses the **live** numbers. The conclusion is unchanged: **no canonical
> target-of-record exists today.**

## 3. FR-2 — Estate mine: there is NO chairman-blessed north-star metric (a critical finding)

Semantic match over the dispositioned `conversion_ledger` (561 items; the *"Runway"* AI-video
false-positive excluded) found **no explicit, quantified "definition of winning" / north-star
statement**. The chairman's intent is **scattered and mostly qualitative**:

- *"stay on the frontier edge of technology… model where things are going vs current capabilities"* (critical) — posture.
- *"EHG provides the ideas, Lovable builds… the goal is to get early signals and kill ideas early"* (critical) — venture-factory operating goal.
- *"achieve the vision, the values, and the reputation… intention preference economy"* (critical) — vision/values.
- (from sibling grounding) *"10+ validated businesses"* future-state — a portfolio-scale aspiration.

**The ONLY quantified target that exists anywhere** is the income-replacement **quit-threshold**
(~$14–15k/mo net profit sustained 3–6 consecutive months; `SD-LEO-ORCH-ADAM-PLAN-KEEPER-001` metadata,
ratified *as a working target*, amendable).

> **Design consequence:** because no chairman-blessed north-star metric exists, this design specifies the
> **structure** (the object, the reconciliation, the API) and treats the **definition** as an explicit
> chairman-approval open question (§8), with the quit-threshold offered as the **leading candidate** — it
> must NOT be self-blessed by the fleet (CONST-002).

## 4. FR-4 — The latent coherence defect (verified in live code)

In `lib/vision/vdr-registry.js`:
- ord 2 *"See distance-to-quit"* → `kr_status` **KR-2026-07-05** (line ~66)
- ord 11 *"A queryable, structured north star"* → `kr_status` **KR-2026-07-05** (line ~91)

Both bind the **identical** KR. Worse, KR-2026-07-05 is literally *"Distance-to-quit gauge live on the
chairman surface"* — it **semantically belongs to ord 2**, not the north star. So the build gauge is
(a) double-counting one signal across two capabilities and (b) measuring the north star with a
distance-to-quit-gauge KR.

**Fix (design):** repoint **ord 11 OFF KR-2026-07-05** onto a probe of the **new canonical north-star
object** (e.g. a `db_count`/`row_predicate` probe that is `built` only when the canonical record exists
and is populated). KR-2026-07-05 legitimately stays with ord 2. This removes the double-count and the
semantic mis-binding in one change. (Build-time; specified here, applied in the build SD.)

## 5. FR-3 — The contract design

### 5a. The canonical north-star OBJECT (a single record; physical storage deferred)

A single authoritative record with these contract fields (storage TBD at build):

| Field | Meaning |
|-------|---------|
| `definition` | the chairman's quantified statement of "winning" (prose + structured) |
| `metric` | the single measured quantity (e.g. EHG monthly net profit) |
| `target` | the quantified goal (`{ amount, unit, qualifier }`, e.g. ≥$14–15k/mo net) |
| `sustain` | any sustained-window requirement (e.g. 3–6 consecutive months) |
| `measurement_source` | where the current value is read (pointer, e.g. income_capture_monthly) |
| `cadence` | how often it is recomputed |
| `status` | `proposed` / `chairman_ratified` / `amended` (CONST-002 gate state) |
| `provenance` | which substrate/estate item the definition derives from |

### 5b. Reconcile / populate + de-noise policy

- **Populate** the canonical record from the substrate (§2) — NOT auto-invent. The candidate definition
  is reconciled from the quantified quit-threshold + the active objective(s); presented for ratification.
- **De-noise:** EXCLUDE the 7 PAT-AUTO retro-noise KR rows and the ~68 orphan visions from any
  north-star reconciliation; treat the 5 `KR-2026-07-*` as `pending` (not the north star). The
  `okr_vision_alignment_records` ledger (currently 0) is the intended home for the alignment links.

### 5c. Single read API / queryable contract

One canonical read the cockpit gauges consume — e.g. `getNorthStar() → { definition, metric, target,
sustain, current_value, status, measured_at }` (fail-soft: returns `status:'unset'` when no ratified
record exists, never a fabricated target). This is the **one** lookup ord 2/3/4 bind to.

### 5d. Prerequisite designation (target-of-record)

The canonical object is the **PREREQUISITE target-of-record**: the distance-to-quit (ord 2),
distance-to-broke (ord 3), and venture-performance (ord 4) gauges should read their target from
`getNorthStar()` (or its sub-targets), not invent their own. Recorded in this SD's `metadata` as the
dependency the cockpit build SDs bind to.

## 6. Layout / shape sketch (concept only)

```
getNorthStar() ──► { definition: "<chairman-ratified>",
                     metric: "EHG monthly net profit",
                     target: { amount: 14-15k, unit: "$/mo", qualifier: "net, sustained 3-6 mo" },
                     current_value: ~$0  (from measurement_source; honest until instrumented),
                     status: "proposed"   ← becomes "chairman_ratified" only via CONST-002 approval }
        │
        ├──► ord 2  distance-to-quit gauge  (binds target)
        ├──► ord 3  distance-to-broke gauge (binds a runway sub-target)
        └──► ord 4  venture-performance     (binds portfolio sub-targets)
```

## 7. FR-3/4 linkage + provenance

- **Capability:** vision-ladder ordinal 11, *"A queryable, structured north star"*.
- **Upstream of:** ord 2 (distance-to-quit), ord 3 (distance-to-broke), ord 4 (venture-performance) — they bind this contract.
- **Coherence fix:** repoint the ord 11 VDR probe off KR-2026-07-05 (§4).
- **Estate provenance:** scattered chairman intent (§3); quit-threshold as the leading quantified candidate.
- **Replaces** the mis-framed SD-EHG-COCKPIT-NORTHSTAR-PHASE0-DESIGN-001 (this is a foundation contract, NOT a cockpit tile).

## 8. Open design questions (CHAIRMAN approval required — CONST-002)

1. **Q-1 (the definition — CHAIRMAN ONLY):** What IS the north star? The design must not self-bless it.
   Leading candidate: the income-replacement **quit-threshold** (~$14–15k/mo net, sustained 3–6 months).
   Alternatives the chairman may prefer: a venture-count ("10+ validated businesses"), a distance-to-broke
   runway, or a composite. **This SD only structures the contract; the chairman picks the metric.**
2. **Q-2:** Single metric or a small composite (e.g. income AND venture-count)? The contract supports one
   canonical record — a composite would need sub-targets.
3. **Q-3 (build-time):** Physical storage of the canonical record — a new `north_star` table, a row in an
   existing OKR table, or the `okr_vision_alignment_records` ledger? (Deferred to the build SD.)
4. **Q-4:** De-noise authority — is auto-excluding the 7 PAT-AUTO KR rows + 68 orphan visions from
   north-star reconciliation acceptable, or should they be triaged first?
5. **Q-5:** Should ord 2/3/4 read sub-targets from this contract, or only ord 11? (Affects how tightly the
   cockpit gauges couple to the canonical object.)

## 9. Build handoff (NO build in this SD)

Ships **only this spec**. The build/wire is a separate follow-on SD, gated on chairman review **and on
Q-1 (the chairman choosing the north-star definition)** — without which the canonical record cannot be
populated with a real target. A durable pointer is on this SD's `metadata.followup`. The build SD
inherits: the contract field set (§5a), the de-noise policy (§5b), the `getNorthStar()` read contract
(§5c), the target-of-record designation (§5d), and the FR-4 ord-11 probe repoint (§4).

## 10. Non-goals (Phase-0)

- No build, no code, no schema, no migration. No physical storage decision.
- No self-authored north-star definition (CONST-002 — chairman ratifies).
- No change to the live VDR registry (the ord-11 repoint is *specified* here, *applied* in the build SD).
