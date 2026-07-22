# Governance Crosswalk — LEO Constitution & Gates → NIST AI RMF + EU AI Act

**SD:** SD-LEO-INFRA-L4-GOVERNANCE-FORMALIZATION-NIST-EU-AI-ACT-001 (DESIGN-ONLY, `sd_type=documentation`)
**Status:** Design artifact. No runtime enforcement is added by this document.
**Deadline anchor:** EU AI Act high-risk obligations bind **2026-08-02**. This crosswalk exists to demonstrate, before that date, which existing LEO controls already satisfy Art.14 (human oversight) and Art.50 (transparency) and where the coverage is N/A by design.

---

## AS-OF snapshot (source-of-truth counts)

| Source table | Count used as denominator | Verified |
|---|---|---|
| `protocol_constitution` | **14 rows** — `CONST-001` … `CONST-014` (mirrored by `docs/03_protocols_and_standards/protocol-constitution-guide.md`) | 2026-07-22 |
| `validation_gate_registry` | **34 DISTINCT `gate_key`** (the table has 113 physical rows — one per phase/SD-type binding — but the crosswalk denominator is the 34 distinct keys, **never** 113) | 2026-07-22 |

Frameworks mapped against:
- **NIST AI RMF 1.0** core functions: **GOVERN, MAP, MEASURE, MANAGE**.
- **EU AI Act** articles in scope: **Art.14** (human oversight of high-risk AI) and **Art.50** (transparency obligations). Record-keeping (Art.12) and prohibited-practice (Art.5) obligations are **out of declared scope**; rows whose only external analogue is Art.12/Art.5 are marked `N/A` against Art.14/50 with that reason.

Legend for the Art. columns: **✓** = the rule/gate materially contributes to that article's obligation; **~** = partial / indirect contribution; **N/A** = no obligation applies (reason given in Rationale).

---

## Sub-table (a) — Constitution rules `CONST-001` … `CONST-014`

Each row is cited by its verbatim `rule_code`. Seeds from the SD grounding are honored: `CONST-001/002/009/013 → Art.14`; `CONST-010 → Art.50`; `CONST-003/004/008 (+ audit gates) → NIST GOVERN/MANAGE`.

| rule_code | Category | NIST AI RMF function(s) | Art.14 | Art.50 | Rationale |
|---|---|---|:--:|:--:|---|
| `CONST-001` | governance | GOVERN, MANAGE | ✓ | N/A | GOVERNED-tier changes require human approval; "AI scores inform, never decide" is textbook human-in-command oversight (Art.14). No transparency-to-user surface → Art.50 N/A. |
| `CONST-002` | safety | GOVERN | ✓ | N/A | Separation of duties — the proposer cannot self-approve. Prevents an AI closing its own oversight loop (Art.14). Internal control, no user disclosure → Art.50 N/A. |
| `CONST-003` | audit | GOVERN, MANAGE | N/A | N/A | Actor/timestamp/payload logging of every protocol change. Maps to NIST accountability + monitoring; externally this is EU Art.12 record-keeping (out of scope), not Art.14/50. |
| `CONST-004` | safety | GOVERN, MANAGE | ~ | N/A | Reversibility within the rollback window underwrites a human's ability to intervene/undo (Art.14 partial). Primary home is NIST MANAGE (incident recovery). |
| `CONST-005` | governance | GOVERN | N/A | N/A | DB is single source of truth; CLAUDE.md is generated, never hand-edited. Internal config-management/SSOT discipline — no Art.14/50 obligation. |
| `CONST-006` | governance | GOVERN, MAP | N/A | N/A | Zero-sum token budget for new rules. Resource governance (GOVERN) + capacity context (MAP). No external-facing obligation. |
| `CONST-007` | safety | GOVERN, MANAGE | ~ | N/A | Max 3 AUTO-tier changes / 24h caps autonomous change velocity so humans retain the ability to keep pace and intervene (Art.14 partial). Core is NIST MANAGE rate-limiting. |
| `CONST-008` | governance | GOVERN, MANAGE | ~ | N/A | No rule removed unless its originating `retrospective_id` is retrieved and reviewed — forces human-reviewed justification before removal (Art.14 partial). |
| `CONST-009` | safety | MANAGE, GOVERN | ✓ | N/A | Human FREEZE halts all AUTO changes immediately — the Art.14 "stop button" / human-in-command kill switch, verbatim. |
| `CONST-010` | safety | MEASURE, GOVERN | N/A | ✓ | Bans manipulative framing, urgency, certainty claims, emotional appeals in AI proposals — factual reasoning only. Directly serves Art.50 transparency/anti-manipulation of AI-generated content. |
| `CONST-011` | governance | GOVERN, MANAGE | ~ | N/A | Rule-conflict priority order (Human Safety > System Integrity > Audit > Operational). Safety-first ordering keeps human-oversight rules paramount in conflicts (Art.14 partial). |
| `CONST-012` | governance | MEASURE, MANAGE | ✓ | N/A | Every FR needs delivery evidence before LEAD-FINAL-APPROVAL — evidence-gated human final sign-off (Art.14). Verification/measurement (NIST MEASURE). |
| `CONST-013` | safety | GOVERN, MANAGE | ✓ | N/A | Gate thresholds/skip-lists frozen during EXEC; runtime bypass is CRITICAL. Prevents runtime circumvention of the oversight controls themselves (Art.14). |
| `CONST-014` | governance | GOVERN, MAP | N/A | N/A | Mandatory decomposition of large SDs (≥3 phases or ≥8 FRs). Complexity/scope governance (GOVERN) + work categorization (MAP). No external obligation. |

**Every one of the 14 rows is filled.** No constitution row is left un-mapped; `N/A` cells carry a reason.

---

## Sub-table (b) — The 34 DISTINCT `validation_gate_registry.gate_key` values

Each row is cited by its verbatim `gate_key`. Denominator = **34**.

| gate_key | NIST AI RMF function(s) | Art.14 | Art.50 | Rationale |
|---|---|:--:|:--:|---|
| `1:prdQualityValidation` | MEASURE | N/A | N/A | PRD artifact-quality check. Internal verification; no external obligation. |
| `2A:uiComponentsImplemented` | MEASURE, MANAGE | N/A | N/A | Confirms UI components exist/were built. Delivery verification only. |
| `2B:migrationsCreatedAndExecuted` | MANAGE | N/A | N/A | DB migration created + executed. Change-execution verification. |
| `2C:databaseQueriesIntegrated` | MEASURE, MANAGE | N/A | N/A | DB query integration check. Delivery verification. |
| `ACCEPTANCE_CRITERIA_TRACE` | MEASURE | N/A | N/A | Traces acceptance criteria to delivery. Internal traceability/measurement. |
| `CONST_015_BYPASS_RUBRIC` | GOVERN, MANAGE | ~ | N/A | Validates bypass reasons against a rubric before a gate override is allowed — governs human/agent override of controls (Art.14 partial). **DRIFT: see the CONST-015 note below — this is a gate-only construct with no `protocol_constitution` row.** |
| `DECOMPOSITION_CHECK` | GOVERN, MAP | N/A | N/A | Enforces `CONST-014` decomposition. Scope governance + work mapping. |
| `FR_DELIVERY_VERIFICATION` | MEASURE, MANAGE | ✓ | N/A | Enforces `CONST-012` FR-delivery evidence before human final approval (Art.14). |
| `GATE1_DESIGN_DATABASE` | MAP, MEASURE | N/A | N/A | Design/database-planning gate. Context mapping + verification. |
| `GATE5_GIT_COMMIT_ENFORCEMENT` | GOVERN, MANAGE | N/A | N/A | Enforces commit provenance/traceability. Change control. |
| `GATE6_BRANCH_ENFORCEMENT` | GOVERN | N/A | N/A | Enforces branch discipline. Change control. |
| `GATE_ACCEPTANCE_TRACEABILITY` | MEASURE | N/A | N/A | Acceptance-to-artifact traceability. Internal measurement. |
| `GATE_ARCHITECTURE_VERIFICATION` | MAP, MEASURE | N/A | N/A | Verifies architecture against plan. Mapping + verification. |
| `GATE_AUTOMATED_UAT` | MEASURE | ~ | N/A | Automated user-acceptance test. Supports a human acceptance decision (Art.14 partial) but runs unattended. |
| `GATE_CONTRACT_COMPLIANCE` | GOVERN, MEASURE | N/A | N/A | Checks conformance to the governed contract. Policy conformance. |
| `GATE_DOCUMENTATION_LINK_VALIDATION` | MANAGE | N/A | N/A | Validates documentation links. Documentation integrity; internal. |
| `GATE_EXPLORATION_AUDIT` | MAP, GOVERN | N/A | N/A | Audits exploration/context-gathering. Context mapping + audit. |
| `GATE_INTEGRATION_SECTION_VALIDATION` | MEASURE | N/A | N/A | Validates the PRD integration section. Verification. |
| `GATE_INTEGRATION_SMOKE_TEST` | MEASURE | N/A | N/A | Integration smoke test. Verification/testing. |
| `GATE_INTEGRATION_TEST_REQUIREMENT` | MEASURE | N/A | N/A | Requires integration tests. Verification/testing. |
| `GATE_MIGRATION_DATA_VERIFICATION` | MEASURE, MANAGE | N/A | N/A | Verifies migration data integrity. Verification + change management. |
| `GATE_PLANNING_COMPLETENESS` | MAP | N/A | N/A | Planning-completeness check. Scoping/mapping. |
| `GATE_PRD_EXISTS` | GOVERN, MAP | N/A | N/A | Requires a PRD to exist. Process gate. |
| `GATE_TEST_COVERAGE_QUALITY` | MEASURE | N/A | N/A | Test-coverage quality bar. Verification/measurement. |
| `GATE_VISION_SCORE` | MAP, MEASURE | N/A | N/A | Scores alignment to vision. Context alignment + measurement. |
| `GATE_WIREFRAME_QA_VALIDATION` | MEASURE | N/A | N/A | Wireframe QA. Verification. (Disclosure UI, if any, is checked by product surfaces, not this gate.) |
| `GATE_WIREFRAME_REQUIRED` | MAP, MEASURE | N/A | N/A | Requires a wireframe. Design-mapping gate. |
| `GATE_WIRE_CHECK` | MEASURE, MANAGE | ~ | N/A | Reachability / live-trigger proof that a feature actually fires. Confirms control mechanisms are wired (Art.14 partial — see EXEC-PATH gap in the gap-list). |
| `HEAL_BEFORE_COMPLETE` | MANAGE | N/A | N/A | Requires remediation before completion. Risk response. |
| `SD_TYPE_THRESHOLD` | GOVERN | N/A | N/A | Applies SD-type-specific thresholds. Risk-tiering governance. |
| `SMOKE_TEST_GATE` | MEASURE | N/A | N/A | Smoke test. Verification/testing. |
| `TRANSLATION_FIDELITY` | MEASURE, MAP | N/A | N/A | Verifies fidelity of intent → PRD → code translation. Internal measurement, not user transparency. |
| `UAT_GATE` | MEASURE | ~ | N/A | User-acceptance-test gate — a human acceptance step before release (Art.14 partial). |
| `WIRE_CHECK_GATE` | MEASURE, MANAGE | ~ | N/A | Wire-check enforcement variant of `GATE_WIRE_CHECK`; same Art.14-partial reachability rationale. |

**All 34 distinct `gate_key` values are mapped.** `N/A` cells carry a reason.

---

## CONST-015 — gate-enforced construct with NO constitution row (classified drift)

`CONST_015_BYPASS_RUBRIC` is a **distinct `gate_key`** and is enforced in code:
- `scripts/modules/handoff/bypass-rubric.js` — header: *"Bypass Rubric — CONST-015: Bypass Governance & Reason Validation"* (part of `SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-E`).
- `scripts/modules/handoff/cli/execution-helpers.js:94-98` — `validateBypassReason(bypassReason)` rejects with *"BYPASS REJECTED (CONST-015 Bypass Rubric)"*.

However, `protocol_constitution` contains **only `CONST-001` … `CONST-014`** — there is **no `CONST-015` row**. A fixture (`scripts/one-off/capture-ai-quality-judge-fixtures.mjs:50`) additionally shows `CONST-015` once existed as a *proposed* `CONSTITUTION_AMEND` (`rule_code: 'CONST-015'`, *"Add CONST-015 enforcing scope-lock during EXEC"*) — a different meaning from the bypass-rubric usage.

**Classification:** `CONST-015` is a **numbering / governance drift** — a rule number that is (1) enforced by a gate, (2) referenced under two divergent meanings, and (3) absent from the constitution table it appears to belong to. It is therefore listed **as a gate row above** (mapped like any other gate) **and** carried as an itemized gap in `governance-gap-list.md` (gap `GAP-CONST-015`). This document does **not** resolve the drift; it only classifies it.

---

## Verification appendix (design-only — do NOT wire an automated gate)

The completeness of this crosswalk is **mechanically re-derivable**. Run the two SELECTs, extract the mapped tokens from this document, and set-diff.

```sql
-- (1) Constitution completeness — expect exactly 14 rows: CONST-001 .. CONST-014
SELECT rule_code
FROM   protocol_constitution
ORDER  BY rule_code;

-- (2) Gate completeness — expect exactly 34 DISTINCT gate_keys
--     (the physical row count ~113 is one row per phase/SD-type binding; do NOT use it)
SELECT DISTINCT gate_key
FROM   validation_gate_registry
ORDER  BY gate_key;
```

**Set-diff procedure (manual, by design):**
1. From this doc, take the first column of Sub-table (a) → `doc_const_tokens`, and the first column of Sub-table (b) → `doc_gate_tokens` (strip backticks).
2. Sort-unique each list and compare against the live SELECT output (e.g. `comm -3`, or paste both columns and diff):
   - **live − doc (constitution):** any `rule_code` present live but absent here = **missing mapping** → this doc is stale, add the row.
   - **doc − live (constitution):** any token here but not live = **drift** (this is exactly how `CONST-015` would surface — it appears among gate tokens, never among constitution tokens).
   - **live − doc (gates):** any `gate_key` present live but absent here = **missing gate mapping** → add the row.
   - **doc − live (gates):** any token here but not live = a retired/renamed gate → prune the row.
3. Re-run whenever `protocol_constitution` or the set of distinct `gate_key`s changes. The AS-OF header's counts (14 / 34) are the expected cardinalities; a mismatch is the trigger to re-map.

This appendix is a **manual re-derivation recipe only**. Building an automated completeness gate around it is explicitly out of scope for this design-only SD and is left as a follow-on (see `governance-gap-list.md`).

---

## Cross-references

- Gaps surfaced by this crosswalk (retention completeness, exec-path completeness, CONST-015 drift): `governance-gap-list.md`.
- L1–L3 oversight-ownership design (who signs off on Art.14 / discloses under Art.50 / owns audit+retention duties): `governance-extension-design-l1-l3.md`.
- Source of the 14 rules: `protocol-constitution-guide.md`.
