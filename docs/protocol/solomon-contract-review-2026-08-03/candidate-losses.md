---
Category: Report
Status: Review
Version: 1.0.0
Author: rickfelix
Last Updated: 2026-08-03
Tags: [protocol, solomon, contract, readability]
---
# Solomon contract split — candidate losses for chairman accept/decline

**SD**: SD-FDBK-INFRA-CLAUDE-SOLOMON-EXCEEDS-001
**Date**: 2026-08-03
**Precedent**: SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 (which surfaced its candidate losses the same way)

The builder **stages** these. This seat sent nothing and applied no chairman decision. Each item is a
judgment call where a reader could reasonably want the content kept in the **gated** file.

**Diff baseline**: the pre-change contract is commit `9809add6e96` — read it with
`git show 9809add6e96:CLAUDE_SOLOMON.md`. This review deliberately does NOT commit a duplicate copy:
git already preserves the exact bytes, and a second copy only adds a file that can drift from the
thing it claims to reproduce. DB row snapshots and their sha256 hashes are in
`db-row-snapshot-manifest.json` beside this file.

---

## What actually happened, in one paragraph

`CLAUDE_SOLOMON.md` did not fit a single Read. The harness said so itself:

```
PARTIAL view — showing lines 1-301 of 371 total (26138 tokens, cap 25000)
```

Four reference/procedure sections moved to a new ungated companion, `CLAUDE_SOLOMON_MANUAL.md`.
Post-change, a no-offset Read returns **all 309 lines with no truncation notice**. Every rule,
prohibition and durable duty stayed in the gated file.

## Why this mattered more than "some reference text was unreadable"

The surviving head states, at §3:

> **SILENCE-BY-DEFAULT (cost contract)**: … An idle oracle is a correctly-behaving oracle.

The **dropped** tail carried the chairman-ratified repeal of exactly that:

> **P1 — WORK POSTURE (silence-by-default as an IDLENESS rule is REPEALED)**

So head truncation **preserved the superseded rule and discarded its repeal**. A Solomon session
reading its own contract the obvious way obeyed a posture the chairman had revoked on 2026-07-19,
and nothing anywhere looked wrong. Solomon is a SINGLETON with no peer seat, so there is no second
reader who could have noticed. Both clauses are now inside one read.

---

## DECISION 1 — the Web Research rubric moved; four constraints were held back

**Moved to the companion**: the GO-ONLINE / STAY-OFFLINE triggers, the source-escalation ladder,
the HOW (quality + cost) guidance, and the Adam/Solomon role deltas.

**Retained in the gated file** as `## Web Research — binding constraints`:

- the **HARD security stop** on secrets / credentials / internal-IDs / chairman-private queries;
- web citations inside a consult are **inputs to RE-DERIVE, never premises to inherit**;
- web research rides the **existing `task_budget`**, no separate allowance;
- questions about **OUR system** are answered from repo/DB ground truth, **never the web**
  (the CONTAMINATION case).

**The judgment call**: the fourth bullet was added late. It is a *routing* rule, and the gated stub
otherwise delegates all routing to the companion, so retaining one routing rule is arguably
inconsistent. It was retained anyway on the stated doctrine — *if you are unsure whether something
binds, it belongs in the gated file* — because its violation is the least self-correcting of the
set.

**If declined**: it moves to the companion and the gated stub delegates routing cleanly.

## DECISION 2 — §11 split: the DUTY stayed, the mechanics moved

`11. Advice-Outcome Ledger, Accuracy Review & Success Metrics` is mostly measurement procedure —
ledger field semantics (`applied`/`declined`/`partial`, `worked`/`did_not_work`), and the
keep/expand/kill success metrics.

But it contained **ACCURACY REVIEW DUTY (durable)**, which is a duty, not a procedure. It was
retained in §9 alongside the other durable duties and now points at the companion for the ledger
mechanics it reads.

**The judgment call**: the PRD anticipated exactly one retained clause. This second one was found by
the prohibition tripwire, not by reading — which is the whole reason the tripwire runs.

**If declined**: the whole of §11 returns to the gated file (~562 cl100k tokens, still under cap).

## DECISION 3 — origin history moved wholesale

`1. Background & History` — the Canary idea, the Fable token-limit incident that created the role,
the pantheon naming convention — moved entirely. Zero binding clauses.

**The judgment call**: the "unbiased perspective" rationale is recounted here *and* binds via §4b,
which stays. A reader who wants the *why* now needs the companion.

**If declined**: it returns; ~502 cl100k tokens.

## DECISION 4 — crew-comms routing moved by retyping, not editing

`Crew-comms routing protocol (organizing layer)` was already its own DB row (id=616). It moved by
changing that row's `section_type` only — **no content edit at all**, so it could not be corrupted
in transit. It is a pointer to the canonical `docs/protocol/crew-comms-routing-protocol.md`, which
remains authoritative.

**The judgment call**: it summarises 5 bounding rules. The canonical doc governs, so the summary is
reference — but a summary of rules is one step from rules.

---

## Not moved, and deliberately

- **Operating Posture — WORK/SPEECH SPLIT** (chairman-ratified). This is the content truncation was
  destroying. Moving it would have re-created the defect in a new place.
- **§4 Scope & Duties** — the largest section in the file (5,519 cl100k, ~32%). It is where the
  growth pressure actually is, and it is nearly all duties. Cutting it means prose surgery inside
  individual duties rather than moving whole sections, which is a different and riskier operation.
  **Flagged as the next place this file will breach the cap.**

---

## Numbers, and one correction worth recording

| | value |
|---|---|
| harness-measured before | 26,138 tokens (lines 1-301 of 371 shown) |
| harness-measured after | no truncation notice; all 309 lines returned |
| cap / budget | 25,000 / 22,500 |

**The size figure this SD inherited was wrong by ~23% and was not used.** The SD carried "32,144
tokens", and the repo's own calibrated instrument (`lib/protocol/contract-read-coverage.cjs`)
independently reported 32,139. The harness says 26,138. That instrument derives
`CL100K_TO_HARNESS = 1.85` in its own source comment as `26142 / 14617` — dividing a **whole-file**
token count by the cl100k count of a **delivered slice**, two different spans of text. Against the
same ground truth the honest ratio is `26142 / 17372 = 1.505`.

Had the inherited number been trusted, this SD would have cut ~30% of the contract to fix a 14%
problem. The instrument defect is real, affects every protocol file, and is **routed separately**
(signal `5feb32ee`) rather than fixed here — it sits in a module wired into role activation, and no
single constant serves both content shapes (1.505 for Solomon-shaped prose, 1.200 for
LEAD-shaped structural text).

**Consequence to expect**: until that is fixed, `singleReadFit()` will still report Solomon's
contract as not fitting, even though it demonstrably now does. Gate output is **not** a valid
success signal for this change; the harness Read is.
