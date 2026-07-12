# S20-26 Integration Re-Run — Grading Rubric (mechanical; cheap-model-executable)

**Status:** Solomon-authored (Fable 5 / high, 2026-07-12), propose-only. Endgame increment 7 (consult `56edb96c` item 2.5). Purpose: the post-satellite-layer integration re-run executes AFTER the Fable window; this rubric makes its grading **judgment-free** — every check is a verbatim SQL query or journal predicate with a binary outcome, so any model (or a script) grades it identically. The sharpened gate: previously-undrivable loops must not merely fire — they must fire **through org roles**.

**Inputs:** the run's journal (file + `system_events` mirror), per-requirement dispositions (the 0711b format: `positive | blocked | cannot_drive`), `portfolio_evidence` rows, `org_agent_identities`. Fixture venture id = `<VID>`, run id = `<RID>` (bind at run time).

---

## The checks (all must be evaluated; each is PASS/FAIL, no discretion)

**R1 — Evidence durability.** Post-teardown: the `system_events` journal mirror row for `<RID>` exists and `length(payload::text) > 5000`. FAIL = the F6 class regressed.

**R2 — Coverage floor.** Mapping coverage = 9/9 O-requirements (O10 graded at R4, not here), AND positive-path dispositions ≥ 7 (the 0711b baseline) + one per flipped surface claimed by the run. A blocked/cannot_drive disposition counted as positive anywhere = automatic FAIL (the F2 class).

**R3 — THE INTEGRATION GATE: org-role provenance on every flipped loop.** For each surface the run claims flipped from CANNOT_DRIVE to positive (candidate set: O5 support loop, O5 incident loop, O6 attribution, O8 review cadence, O3 visitor/conversion):
```sql
SELECT e.evidence_kind, e.source_identity, i.role_key, e.provenance
FROM portfolio_evidence e JOIN org_agent_identities i ON i.id = e.source_identity
WHERE e.venture_id = '<VID>' AND e.observed_at BETWEEN <run_start> AND <run_end>
  AND e.evidence_kind = '<loop's declared kind>';
```
PASS requires: ≥1 row; `source_identity` NOT NULL; `role_key` in the loop's declared owner set (support → CEO or VP-tier per the org chart; review cadence → CEO; attribution → the rail's service identity); `provenance = 'synthetic'` (fixture run — a `real_event` row from a fixture venture is an automatic FAIL of the provenance-mapping invariant, satellite-E review §1). A loop that fired through a bare worker (NULL source_identity) is **NOT integrated** — disposition stays cannot_drive-equivalent for grading, whatever the journal says.

**R4 — O10 meta-grade.** All three: every O-requirement mapped (R2) ∧ teardown `HARNESS_CLEAN=true` ∧ R1 passed. O10 never appears in the per-loop matrix (the F4 class).

**R5 — Regression checks on the 0711b still-open findings.**
- S20: the code-quality gate produces an artifact (its verdict is admitted by `requireArtifact`, or the verdict enum was reconciled) — journal shows an S20 artifact write, not a verdict-enum rejection.
- S21: the block-marker insert succeeds — zero `venture_artifacts_artifact_type_check` violations in the journal (the F5 class; the gated migration must have landed).
- S24: reads a non-empty S23 checklist (the cross-stage contract) — journal shows S24 contract check with `items > 0`.
Any of the three failing = PARTIAL at best, with the finding re-cited by id.

**R6 — Fence integrity.**
- Teardown assertion list is WRITE-DERIVED: the asserted table set ⊇ the journal's touched-tables set (compare mechanically; hardcoded-list drift = FAIL).
- Fence-7: the real-KPI zero-fixture assertion is implemented AND passing (0711b noted it unimplemented — its absence in the re-run is a FAIL, not a note).
- Residue: zero fixture rows post-teardown in every touched table (the standing sweep).

**R7 — Calibration (the harness can't be fooled).** The H9 seeded-defect dry run still detects its seeded dead loop before the real run. A harness that passes R2–R3 but fails R7 is inadmissible — void the grade.

## Verdict computation (mechanical)

- **PASS** = R1–R7 all pass.
- **PARTIAL** = R1, R4, R7 pass; any of R2/R3/R5/R6 fail → list each failed check with its named-defect attribution (`inflated-artifact | dead-threshold | swallowed-verdict | not-integrated | fence-gap`), one line each.
- **FAIL** = R1, R4, or R7 fails (durability, meta-acceptance, or calibration — the checks that make every other number trustworthy).
- **VOID** = any evidence a fleet agent identified the fixture as a test target mid-run (contamination, inherited from the teeth-proof regime).

The grader writes the verdict as one fabric row: `evidence_kind='integration_rerun_verdict'`, `provenance='derived'`, payload = the per-check table. No prose verdicts; the payload IS the grade.

**Counterfactual (what would change this rubric):** if the satellite build lands with loop-owner identities attached to loops but not yet to their EVIDENCE writes (a plumbing lag, not a design failure), R3 may be graded once against the loop-owner registration in `periodic_process_registry` instead of `source_identity` — ONE run only, with the lag filed as a defect; the second re-run grades on `source_identity` with no exception. Any other relaxation requires a chairman-visible revision of this document, not a grader judgment call.

*Propose-only. Committed at creation. Executes post-window on any model; the sealed structure is the point.*
