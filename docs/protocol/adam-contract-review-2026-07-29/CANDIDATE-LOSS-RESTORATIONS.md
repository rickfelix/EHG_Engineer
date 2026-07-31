# Four candidate losses — proposed restorations, item by item

**SD**: SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-1
**For**: the chairman composite decision
**Written**: 2026-07-31 by fleet worker Alpha-2 (session 8aa7b984)
**Status**: PROPOSED — none of this is in the corrected artifact. Nothing here has been landed.

The FR-1 ledger adjudicated all 533 imperatives from the preserved original. Four are **not
locatable** in the corrected contract or in either companion. This document exists so the decision
is made on concrete wording rather than on a description of a gap.

**These are deliberately NOT folded into the corrected artifact.** The composite is already the
approved file plus three restorations; silently adding four more would enlarge the very thing being
reviewed. Accept or decline each on its own.

Total cost if all four are accepted: **~1,050 bytes**, ~415 tokens. Post-landing projection moves
from ~79% to ~81% of the 25k cap — the margin is not the constraint here; the judgment is.

---

## 1. Solomon consults carrying web citations — inputs to RE-DERIVE, never premises to inherit

**Severity: the substantive one of the four.**

**Original wording** (§ web-research role deltas):
> **SOLOMON**: (a) a consult arriving WITH web citations — the sources are inputs to RE-DERIVE,
> never premises to inherit (check the source, not the asker's reading)

**Why §5o does not already cover it.** §5o carries CONTAMINATION — *"validating whether our design
matches best practice returns the same corpus that SHAPED the design, which is false independence."*
That is a different rule: it is about **our own design** being checked against the corpus that
produced it. The lost rule is about an **inbound consult** — someone hands Adam a conclusion with
citations attached, and the citations must be re-derived rather than inherited. §5o *looks* like it
covers this, which is exactly why the loss is easy to miss.

**Proposed insertion — §5o, after the SOURCE-ESCALATION LADDER:**

> **A consult arriving WITH citations is an input to RE-DERIVE, never a premise to inherit** — check
> the source, not the asker's reading. Inheriting a cited conclusion imports its errors with its
> authority.

---

## 2. Never mix the two migration-authority markers

**Live relevance: the coordinator reports a privesc apply blocked on an approver-factor mismatch in
exactly this marker, at the time of writing.**

**Original wording** (§ scribe ceremony, step 2):
> This is the chairman path; `-- @delegated-by: adam` is the separate autonomous path above —
> never mix the two markers.

**Why it is not covered.** §3c distinguishes the two paths and describes each correctly, but drops
the explicit prohibition on mixing them. Implied is not stated — and this is a migration-authority
surface where the failure mode is a silently wrong approver factor.

**Proposed insertion — §3c, appended to the preconditions:**

> **NEVER mix the two markers.** `@approved-by` is the chairman path; `@delegated-by` is the separate
> autonomous path. A file carrying both, or the wrong one, binds the wrong authority factor.

---

## 3. Phone-notify is a LAYER, not a replacement

**Original wording** (§ chairman phone-notify):
> This is a phone-push LAYER on top of the coordinator decision-queue / `fn_chairman_decide`,
> NOT a replacement.

**Why it is not covered.** §5k keeps *"Use SPARINGLY — urgent only"* and the reminder-API detail, but
drops the relationship to the decision queue. Without it, a future reader can reasonably route a
decision to the phone *instead of* the queue, and the decision leaves no durable record.

**Proposed insertion — §5k, one clause:**

> It is a phone-push **LAYER on top of** the coordinator decision-queue / `fn_chairman_decide`,
> **never a replacement** — the durable decision row is still required.

---

## 4. The rung gauge REUSES the existing measurement system

**Original wording** (§ rung progress):
> It REUSES the existing gauge + KR alignment — it is not a new measurement system.

**Why it is not covered.** No corrected clause states the reuse constraint. Lowest severity of the
four: its absence invites someone to build a parallel measurement rather than causing an immediate
error. But "do not build a second one" is precisely the rule that goes unstated and then gets broken.

**Proposed insertion — §5e, appended to the ranking paragraph:**

> Rung progress **REUSES** `computeBuildGauge` and `sd_key_result_alignment` — it is **not a new
> measurement system.** Do not build a parallel one.

---

## What happens if these are declined

That is a legitimate outcome and should be recorded as such rather than left ambiguous. The FR-1
ledger currently marks all four `CANDIDATE_LOSS`. On a decline they become `deliberately_dropped`
with the decision cited — which is a *decision*, and materially different from the same content
disappearing because nobody noticed. The whole point of the ledger is that the difference is visible.
