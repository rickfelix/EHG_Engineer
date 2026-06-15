# O-2026-07 V1-Exit Gap Report — make V1 progress *measured*, not asserted

**Category:** Report · **Status:** Approved · **Version:** 1.0.0 · **Author:** SD-LEO-INFRA-OKR-KR-ALIGNMENT-WIRE-001 · **Last Updated:** 2026-06-15 · **Tags:** okr, v1-exit, roadmap-phase-1, key-results

**Objective:** O-2026-07 — *July 2026 Objectives — Roadmap Phase 1: Stabilize/vet EHG (solo-operator launch-readiness).*

This report assesses the true V1-exit state of each O-2026-07 Key Result. It accompanies the
`sd_key_result_alignment` rows wired by `scripts/okr/wire-o-2026-07-kr-alignment.mjs` (run
`npm run okr:wire-o-2026-07 -- --apply`), which link each KR to the **completed** Phase-1 SD(s)
that satisfy it. The distinction the report makes — *achieved* vs *substrate-shipped-but-pending* —
is what turns "we shipped a lot of SDs" into a measured V1-exit picture.

Before this SD there were **zero** alignment rows for these 5 KRs (verified live): V1 progress was
asserted, not traceable.

## Verdict summary

| KR | Title | Live status | Satisfying SD(s) | Verdict |
|----|-------|-------------|------------------|---------|
| KR-2026-07-01 | Support intake/triage pipeline live end-to-end | **achieved** (1/1) | SUPPORT-INTAKE-TRIAGE-001 `direct` | **ACHIEVED** |
| KR-2026-07-02 | Production-breaking defects detected internally before any customer report | pending (0/90 %) | BREAKAGE-DETECTOR-SURFACE-001 `enabling` | **SUBSTRATE-SHIPPED / METRIC-PENDING** |
| KR-2026-07-03 | Launch-spike absorption rehearsal passed & documented | pending (0/1) | SOLO-OPERATOR-CONTINUITY-001 `enabling` | **CAPABILITY-SHIPPED / EXECUTION-PENDING** |
| KR-2026-07-04 | First venture with a live revenue pathway (offer + payment rail) | pending (0/1) | PAYMENT-RAIL-FOUNDATION-001 `enabling` + REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 `supporting` | **SUBSTRATE-SHIPPED / GENUINELY-PENDING NET-NEW** |
| KR-2026-07-05 | Distance-to-quit gauge live on the chairman surface | pending (0/1) | VISION-LADDER-V1-001 `enabling` (primary — ships the gauge) + AUTOMATED-ONE-ROADMAP-001 `enabling` (VDR feed) + REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 `supporting` (substrate) | **SUBSTRATE-SHIPPED / SURFACE-LIVENESS-PARTIAL** |

> **Contribution-type honesty:** only the achieved KR-01 is `direct`. KR-02 & KR-03 are `enabling` (not `direct`) because the SDs ship the capability/substrate while the KR's completion event (the 90 % metric / the rehearsal run) has not happened — `direct` would overstate done-ness.

**Net V1-exit picture: 1 of 5 achieved; 4 have shipped substrate with four *distinct* pending classes** — measurement, execution, net-new venture work, and surface-liveness. None of the four is "build the thing from scratch"; each has a specific, narrower remaining action.

## Per-KR assessment

### KR-2026-07-01 — Support intake/triage pipeline — **ACHIEVED**
`SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001` (`direct`, completed) ships the venture-agnostic
intake → triage → route pipeline with a no-operator-in-loop happy path. The KR is marked `achieved`
(1/1) in `key_results`. Wired and done.

### KR-2026-07-02 — Detect breakage internally before the customer — **SUBSTRATE-SHIPPED / METRIC-PENDING**
`SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001` (`direct`, orchestrator + 6 children A–F, all completed)
builds the internal breakage detector + the surface board (the SD rationale explicitly cites
KR-2026-07-02; it corrected the original plan's false "synthetic canary already exists" premise and
built the detector + board). **The capability to detect breakage internally exists; the KR's 90 %
*metric* is 0/90 — unmeasured.** Remaining action is **measurement**, not build: an
incident-attribution mechanism that records "detected internally vs reported by a customer" and
accrues real incidents until the 90 % rate is observable. There are no real customers yet, so the
metric is structurally un-fillable until customer traffic exists.

### KR-2026-07-03 — Launch-spike rehearsal passed & documented — **CAPABILITY-SHIPPED / EXECUTION-PENDING**
`SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001` (`direct`, completed) ships solo-operator
machine-continuity (~80 %: orphan-adoption, auto-push-WIP, reaper-guard, DR rehearsal,
decision-queue) **and the spike-rehearsal capability** (`npm run continuity:spike-rehearsal`); the
SD rationale cites KR-2026-07-03. **The rehearsal *run + documentation* (0/1) is unexecuted** —
remaining action is **execution**: run the launch-spike absorption rehearsal and document the
result. The SD itself flagged residual governance-path gaps (11 chairman-gated gates with no defined
away-behavior), which bound the "passed" bar.

### KR-2026-07-04 — First live revenue pathway — **SUBSTRATE-SHIPPED / GENUINELY-PENDING NET-NEW**
`SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001` (`enabling`, completed) lays the payment-rail foundation
(promoted to Phase-1 SD-0 as the true critical path to first dollar; the SD rationale cites
KR-2026-07-04), and `SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001` (`supporting`, completed)
adds the structured replacement-net input so the first dollar lands as net-income data. **The
substrate is shipped; a *live venture with an offer + payment rail* (0/1) is genuinely pending
net-new work** — and it carries irreducible external latency (state filing, Stripe underwriting)
that no fleet parallelism compresses. No venture is currently revenue-ready (DataDistill is a
test-fixture/scaffolding pilot per SD-LEO-INFRA-PILOT-VENTURE-GUARD-001). This is the hardest gate.

### KR-2026-07-05 — Distance-to-quit gauge live on the chairman surface — **SUBSTRATE-SHIPPED / SURFACE-LIVENESS-PARTIAL**
**Primary:** `SD-LEO-INFRA-VISION-LADDER-V1-001` (`enabling`, completed) ships the literal
Distance-to-Quit gauge line on the hourly chairman exec-email (the North-Star tracker) — the most
direct contributor to KR-05. **Feed:** `SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001` (`enabling`,
completed) is the Vision Denominator Registry / one-roadmap build-% gauge that feeds the surface
and explicitly cites KR-2026-07-05. **Substrate:** `SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001`
(`supporting`, completed) provides the structured replacement-net (net $) the gauge reads.
**Chairman-surface *liveness* is partial** — remaining action is to confirm the gauge renders live on
the chairman surface and to apply the dormant gauge migrations (chairman-gated) that the
VDR/one-roadmap work left un-applied. The gauge is fed honestly (could-not-measure ≠ zero) but is
currently projection-fed until a real dollar lands (see the KR-04 dependency).

## How to verify

```bash
npm run okr:wire-o-2026-07 -- --apply      # idempotent; inserts the 8 KR->SD rows (or no-op)
# then query sd_key_result_alignment for the 5 KR uuids — expect 8 rows (KR-04 has 2, KR-05 has 3)
```

## Scope note

Row-level data inserts into the existing `sd_key_result_alignment` table only. **No** structural DB
changes, **no** new tables/columns, **no** roadmap ratification (that is separate Adam/chairman
governance, already handled).
