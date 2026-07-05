# Runbook: Chairman Product-Review Walkthrough

**Category**: Protocol
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-DOC-CHAIRMAN-REVIEW-RUNBOOK-001
**Last Updated**: 2026-07-05
**Tags**: chairman-review, product-review, qa, walkthrough

> **Update trigger**: This doc's precheck gate and verdict semantics are sourced from
> `SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001`. If that gate's stages, thresholds, or
> trigger logic change, re-verify this doc against the live implementation before
> trusting it for the next walkthrough.

## Purpose

This is the repeatable procedure for staging and running a chairman hands-on
product-review walkthrough. It exists because walkthrough #1 (2026-07-05) was
run ad hoc, terminated at Stop 1 with a SEND-BACK verdict, and its learnings
lived only in session context and SD metadata — nothing an operator, or a
future Adam/coordinator session, could read end-to-end to run walkthrough #2
correctly. This doc is that missing artifact.

See also: [qa-convergence-loop-operations.md](./qa-convergence-loop-operations.md)
(the QA loop that must complete *before* a chairman review stages) and
`SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001` / `SD-LEO-INFRA-POST-BUILD-ARTIFACT-001`
(the SDs that built this machinery).

## Preconditions: the MACHINE-PRECHECK GATE

A chairman review must **only** be staged after the following pass. This is
the chairman's own words from walkthrough #1: *"there is nothing I'm doing
right now that you could not have done yourself."* Every one of these is
machine-checkable — if a stop in the walkthrough asks a question the machine
could have answered, the precheck failed to run, or the stop should be deleted.

1. **Scorecard zero-MISSING** — the venture's `post_build_verdicts` table has
   zero rows with `disposition = 'MISSING'`. See the QA doc for how the
   scorecard is produced.
2. **Gating-PARTIALs closed** — any `PARTIAL` verdict flagged as gating
   (blocks launch) has been remediated to `BUILT` or explicitly re-scored.
3. **Styling/brand present** — the identity-asset coverage dimension
   (brand assets, logo, tone/guidelines) is evidence-linked as rendered in
   the product, not just wired in code.
4. **Core journey green** — the primary user journey (land → core action →
   result) passes automated E2E.
5. **Synthetic-persona T3 pass** — the REQUIRED synthetic-persona journey
   walk (see QA doc) has run and passed for this venture.

If any of the five fail, do **not** stage the review. Route the gap through
the QA convergence loop's remediation path first (see QA doc, "Remediation
routing").

## Guided Walkthrough Format

Once the precheck passes, the review is staged as a **guided, one-stop-at-a-time**
walkthrough:

- **One stop at a time.** Present exactly one item, wait for the chairman to
  say "done" (or an equivalent explicit confirmation), then advance. Never
  batch multiple stops into one message.
- **No opaque IDs.** Never surface a bare UUID, SD key, or internal row ID as
  the thing the chairman is asked to judge. Translate every reference into
  plain, product-facing language.
- **Taste-only questions.** Every question posed to the chairman must require
  human judgment — "does this feel right," "is this the tone you want,"
  "would you ship this." If a stop's question is machine-answerable (a
  scorecard number, a pass/fail check, a link that either resolves or
  doesn't), **delete that stop** — the precheck gate already covers it. The
  chairman's time is reserved for judgments the machine cannot make.

## Environment Setup Learnings (from Walkthrough #1)

Three concrete failures from walkthrough #1 that must not recur:

### 1. Verify the app's OWN port

Walkthrough #1 hit a **false boot-verify**: a stale daemon holding port 3001
answered health checks, so the boot-verify step reported success while the
chairman was actually looking at the wrong (or a dead) process. Before
staging any review:
- Confirm the port the chairman will actually browse to matches the port the
  target app's own dev/preview server is bound to — do not assume a
  health-check response on *a* port means it's *this app's* server.
- Kill any stray process holding the expected port before starting the
  app's own server.

### 2. Screenshot-verify what the chairman actually sees

Do not rely on a server-side "it's running" signal alone. Capture a
screenshot of the actual rendered page immediately before staging the
review, and cross-check it against what will be described to the chairman.
A server can report healthy while the browser renders a blank or broken
page.

### 3. State the styling maturity up front

Before the chairman looks at anything, tell him explicitly what styling/brand
state to expect (e.g. "this is unstyled — layout only, no brand pass yet" or
"brand pass complete"). Walkthrough #1's Stop 1 SEND-BACK was, in part, a
surprise at unstyled landing — stating this up front turns a surprise into an
expected, already-acknowledged constraint, and lets the chairman's judgment
focus on what he's actually there to judge.

## Verdict Recording and Triggers

Each stop (and the walkthrough as a whole) ends in one of two verdicts:

| Verdict | What it means | What it triggers |
|---|---|---|
| **Approve** | The chairman accepts this stop / the whole review | Advances to the launch-path / live-mode decision. If it's the final stop, the venture is cleared for its next lifecycle stage. |
| **Send-back** | The chairman rejects this stop, with reasons | Triggers a **remediation wave**: the stated reasons are routed the same way a QA-loop deviation is routed (see QA doc, "Remediation routing"). The review **auto-re-stages** once the machine-precheck gate clears again — no manual re-invitation needed. |

Record the verdict and its reasons durably (the same evidence trail the QA
loop uses — do not let a send-back's reasons live only in chat history).

## Re-Stage Semantics

When a send-back's remediation completes and the precheck gate clears again,
the re-stage invitation to the chairman **must explicitly state what changed
since he last looked** — do not re-invite with a generic "ready for review"
message. Name the specific items that were fixed, referencing the exact
reasons he gave at send-back. This keeps each re-stage fast: he should be
able to confirm the specific fix, not re-review the whole product from
scratch.

## Smoke Test

To verify this runbook is current: walk its precondition section against the
live state of MarketLens (the first venture through this gate). As of this
writing, MarketLens's landing page is unstyled — walking this section should
correctly report a **FAIL** on precondition 3 (styling/brand present), naming
that exact gap. If it instead reports PASS, this runbook (or the live gate
it describes) has drifted and needs re-verification.
