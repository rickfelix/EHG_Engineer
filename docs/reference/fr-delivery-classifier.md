---
category: reference
status: approved
version: 1.1.0
author: LEO fleet (SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001)
last_updated: 2026-08-18
tags: [reference, gates, fr-delivery, leo-protocol]
---
# FR Delivery Classifier

Single source of truth for per-FR delivery status, consumed by two gates:

| gate_key | Phase | Enforces |
|---|---|---|
| `FR_DELIVERY_VERIFICATION` | LEAD-FINAL-APPROVAL | `CONST-012` — every FR needs delivery evidence before human final sign-off (NIST MEASURE/MANAGE, EU AI Act Art.14) |
| `FR_DELIVERY_TRACEABILITY` | EXEC-TO-PLAN | Early per-FR traceability check, same classifier |

Code: `scripts/modules/handoff/gates/fr-delivery-classifier.js`, entry point `classifyFrDelivery()`.

## Classification states

Each FR in `product_requirements_v2.functional_requirements` resolves to exactly one status:

| Status | Meaning |
|---|---|
| `delivered` | A validated user story or a matched TESTING-evidence entry references this FR id. `delivery_basis` distinguishes which (`story` or `testing_evidence`). |
| `descoped` | An approver-gated descope record exists (`strategic_directives_v2.metadata.descoped_frs[]`, non-self-approved). |
| `undelivered` | The FR-reference convention **is** in use for this SD, but this FR has no reference. Blocks under enforcement. |
| `unverifiable` | The FR-reference convention is **not** in use for this SD at all — no instrument here could have observed delivery either way. Decided per-SD, never per-FR. Never blocks (default ceiling 1.0). |

`unverifiable` exists so a gate that cannot see a signal reports that honestly instead of silently scoring 100 (see the module's own header for the "green-where-blind" incident that motivated it).

## Two delivery-promoting signals

| Signal | Source | Promotes delivery? |
|---|---|---|
| Validated user story reference | `user_stories` rows with `status IN ('completed','done','validated')` whose title/user_want/acceptance_criteria/technical_notes contain the FR id | Yes — original, story-only signal |
| Structured `fr_coverage` entry | `sub_agent_execution_results.metadata.fr_coverage[]`, TESTING sub-agent, EXEC-or-later phase only | Yes — added by SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001, for SD types (e.g. `infrastructure`) that structurally have no user stories and would otherwise read `unverifiable` by construction |
| Regex FR-id mention anywhere in TESTING evidence prose | `extractRegexFrMentions()` | **No — diagnostic only.** Measured: promoting on this would have falsely marked 9/16 blind infra SDs as 100% delivered (a LEAD-phase risk-flagging mention is a claim, not proof). Surfaced as `regex_fr_mentions` for visibility, never consulted for status/phase/convention. |

A validated story always wins on conflict with a TESTING claim (human-reviewed evidence outranks a self-reported one); a descope always wins over a TESTING "delivered" claim. Both kinds of conflict are recorded in `conflicting_signals`, never silently dropped.

### `fr_coverage` entry contract

A `metadata.fr_coverage[]` entry only counts if **all** of the following hold (checked by `isWellFormedCoverageEntry()`, exported so tooling can reuse the real predicate instead of hand-copying it):

```
{ fr_id: string, status: 'delivered' | 'undelivered', test_ref: non-empty string }
```

...and additionally:
- The row's `phase` normalizes into the EXEC-or-later bucket (`classifyPhaseBucket()`) — a pre-EXEC phase (LEAD/PLAN/PLAN_TO_EXEC/DRAFT) is rejected, tracked separately in `rejected_phase_rows` so "fired at the wrong phase" stays distinguishable from "never fired".
- `fr_id` matches a real FR on this SD (case-insensitive, no padding equivalence — `FR-1 !== FR-001`).
- `test_ref` resolves to a real file on disk (`testRefResolvesToRealFile()`, reusing `lib/stories/e2e-path-guard.js`'s `specFileExists`) — a fabrication guard, not proof the file is a real passing test for that FR.

The trusted filesystem root for that existence check comes **exclusively** from `v_sub_agent_repo_compliance.expected_repo_path` (this SD's registered `applications.local_path`), never from the row's own writer-controlled `metadata.repo_path`. A row with no resolvable root is treated as unresolved without ever touching the filesystem — see CLAUDE.md prologue #11 for the same `SUB_AGENT_REPO_RESOLUTION` contract this reuses.

## Enforcement flags

| Env var | Default | Effect |
|---|---|---|
| `LEO_FR_TRACEABILITY_ENFORCE` | off (warn-only) | Governs **blocking only** — `passed`/`required`. The reported score is always the true satisfied/total ratio in both modes. |
| `LEO_FR_UNVERIFIABLE_CEILING` | `1.0` | Max tolerated fraction of `unverifiable` FRs before `over_ceiling` blocks (when enforcement is on). Ratchet down as story→FR / testing_evidence→FR linkage coverage improves fleet-wide. |

## Baseline tooling

`scripts/one-off/pin-fr-delivery-baseline.mjs` snapshots the classifier's output across all SDs with FRs, importing the real `classifyFrDelivery`/`isWellFormedCoverageEntry` rather than re-deriving the logic. Output: `docs/reference/fr-delivery-baseline-30.json`, including a `global_fr_coverage_schema_check` block (rows with `fr_coverage` present vs. rows that actually pass the strict schema above — the two numbers are expected to diverge, since pre-existing ad-hoc `fr_coverage` writers predate this SD's schema).

## Full design history

The module's own header comments carry the detailed rationale (rejected alternatives, exact measured false-positive/false-negative rates, five rounds of SECURITY hardening on the filesystem-root trust model). For the complete derivation, see `product_requirements_v2` (`directive_id=SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001`) and the SD's `sd_phase_handoffs` history.
