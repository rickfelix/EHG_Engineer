# invariant_gauge_finding Disposition Proposal

**SD:** SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001 (FR-4)
**Status:** STAGED — awaiting chairman decision. This SD does not execute either option below;
it packages the evidence and routes the question.

## The finding

`feedback.category = 'invariant_gauge_finding'` is written by `scripts/gauge-runner.mjs:437`
(`routeFinding`) every time a registered invariant gauge trips, on an hourly GitHub Actions cron
(`.github/workflows/gauge-runner-cron.yml`). Its designed closing path is a row in
`gauge_finding_dispositions` (one disposition per finding fingerprint,
`database/migrations/20260716_gauge_finding_dispositions.sql`).

Live measured (2026-08-24):

| Metric | Value |
|---|---|
| Total outstanding (`status in (new, triaged)`) | 5,419 / 5,419 (100%) |
| Lifetime rows ever written to `gauge_finding_dispositions` | 1 |
| Resulting closing-path rate | 0.018% |
| Findings in the last 24h | 0 |
| Findings in the last 7d | 2 |
| Distinct finding titles behind the 5,419 rows | 16 (roughly 339x duplicate amplification per title) |
| Oldest outstanding row | ~51.5 days |

This is the single channel this SD's census (FR-1) confirms as genuinely neglected — not a
throughput/backlog-size story like `harness_backlog` (15.9% closing rate, actively used) or
`completion_flag` (66.1%), but a channel whose designed disposition mechanism has been used
almost never. The channel has also gone nearly silent (0-2 findings/week) despite the gauge
runner continuing to fire hourly, which is consistent with the class of failure `lib/governance/
drain-inventory.js`'s own commentary warns about: a detector that stops finding new instances of
a problem can look identical to a detector no one is reading, from outside.

A pre-existing logic defect in `lib/governance/drain-inventory.js` (fixed by this SD's FR-2) let
this channel report a clean `PASS` verdict despite the numbers above — the single disposition ever
written was enough to permanently disarm the tool's only check for this exact condition. That defect
is now closed; this proposal is the intended next step the corrected tool surfaces.

## Options

### Option A — Build real review capacity

Commit a recurring reviewer (human or role-assigned) to work through
`gauge_finding_dispositions` against the outstanding `invariant_gauge_finding` backlog, on a
defined cadence (e.g. weekly), dispositioning each of the 16 distinct finding titles as
`accepted_known_state` (with `re_review_at`) or routing it to a fix.

- **Pro:** Preserves the gauge's original intent — invariants that trip should get a human
  disposition, not silent accumulation.
- **Con:** 5,419 rows behind only 16 distinct titles suggests most of the volume is duplicate
  noise from a small number of root causes; a reviewer's first pass would likely spend most of
  its time on deduplication, not genuine triage. No capacity has been allocated for this to date
  (0 dispositions since the mechanism went live 2026-07-11 through 2026-08-19, then 1).

### Option B — Retire or soften the capture mandate

Either stop writing new `invariant_gauge_finding` rows for the specific gauges responsible for the
bulk of the 16 distinct titles (after confirming which ones dominate), or change the write cadence
so genuinely-repeating findings deduplicate at the source instead of writing a fresh row per trip.

- **Pro:** Honesty over theater — if nothing is realistically going to review 5,419 rows, capturing
  them costs storage and false assurance ("we have a gauge for that") without producing any
  disposition.
- **Con:** Loses the audit trail of when each invariant tripped; a future incident investigation
  would have a gap for whichever gauges are softened.

## Recommendation

Option B, scoped narrowly: investigate the 16 distinct titles first (a cheap, single query) to
confirm whether a small number of gauges account for the bulk of the 5,419 rows, and if so,
fix deduplication at the write site (`scripts/gauge-runner.mjs`'s `routeFinding`) rather than
committing open-ended review capacity to a queue that is mostly duplicate volume. This keeps the
audit trail for genuinely-distinct findings while removing the false-assurance cost of a queue
nobody realistically drains. This recommendation is not binding — the chairman may select either
option, a hybrid, or request the title-breakdown investigation as a precondition before deciding.

## Routing

This document is delivered as FR-4's evidence package. Per this SD's PRD (FR-4 AC-2), it is
routed to the chairman via the standard chairman decision channel, not left as a docs/-only
artifact awaiting discovery: `feedback` row `825674d8-8350-4049-bd8b-320c1d2c04ff`
(category=`chairman_decision_capture`, status=`new`, `metadata.doc_path` pointing back at this
file) queues it for the morning ceremony packet, per VALIDATION's identification (evidence
b1dbe3ce) of that channel as the live, actively-used surface for staged chairman decisions.
