# Governance Gap List — Retention, Exec-Path, and CONST-015 Drift

**SD:** SD-LEO-INFRA-L4-GOVERNANCE-FORMALIZATION-NIST-EU-AI-ACT-001 (DESIGN-ONLY, `sd_type=documentation`)
**Companion to:** `governance-mapping-nist-euaiact.md` (crosswalk) and `governance-extension-design-l1-l3.md` (oversight ownership).
**Deadline anchor:** EU AI Act high-risk obligations bind **2026-08-02**. Gaps below carry a **DEADLINE** flag indicating whether closure is *required before* that date (only Art.14/Art.50-touching gaps are treated as deadline-bound; record-keeping/Art.12 items are recommended, not blocking).

**Enumeration:** This list contains **5 gaps across 3 classes** — **Class A (Retention completeness): 2**, **Class B (Exec-Path completeness): 2**, **Class C (Constitution drift): 1**.

> All remediation pointers below are **STUBS ONLY** — a proposed follow-on-SD title plus a one-line scope. Nothing here is designed or built; each stub is future work to be triaged through normal LEAD intake.

---

## Class A — Retention completeness

Baseline: `lib/retention/policies.js` (declarative registry; `scripts/retention-enforce.js` is the sole executor). `MIN_HOT_DAYS = 45`, `DEFAULT_HOT_DAYS = 90`. Completed baseline SDs: `SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001`, `SD-LEO-INFRA-DB-RETENTION-GOVERNANCE-AUDIT-LOG-001`, `SD-MAN-INFRA-RETENTION-OPS-FINISHER-001`.

### GAP-RET-01 — Retention coverage grows *reactively*, not at table-creation time
- **Description:** Tables are added to `RETENTION_POLICIES` only *after* they are discovered unbounded in production. The registry comments document a trail of retro-added tables (`eva_scheduler_metrics`, `sub_agent_execution_results`, `sms_inbound_log`, `cost_governor_log`, `hold_state_contract_violations`), each attributed to a follow-on SD that noticed the omission. There is no gate or convention requiring a new high-volume / append-only / audit table to declare a retention policy *at create time*, so the next unbounded table is found the same reactive way.
- **Evidence:** `lib/retention/policies.js:50-71` (retro-added entries with their originating SDs); `lib/retention/policies.js:1-2` (registry is the SSOT, DB-agnostic).
- **Remediation pointer (STUB):** `SD-LEO-INFRA-RETENTION-COVERAGE-AT-CREATE-001` — *At table-creation/migration time, require a retention-policy declaration (or an explicit "bounded, no policy needed" waiver) for any new table, closing the reactive discovery loop.*
- **DEADLINE:** **Not required before 2026-08-02** — retention/record-keeping maps to EU Art.12 (out of the Art.14/50 scope of this SD); recommended durable hardening.

### GAP-RET-02 — Hot-window vs. consumer-lookback coupling is manually verified, not enforced
- **Description:** The `MIN_HOT_DAYS = 45` floor is justified by a *manual* sweep asserting the longest automated-consumer lookback is 30 days. Each new policy's `hotDays` safety depends on a per-table hand-verification that no consumer reads further back than the hot window. A future consumer added with a >45-day lookback could silently outrun the hot window (archived rows no longer visible to it) with no automated check catching the coupling violation.
- **Evidence:** `lib/retention/policies.js:12-16` (window-floor rationale, "longest enforced automated consumer lookback … is 30 days", manually derived); per-policy `hotDays` comments at `:54-71` each assert consumer lookback by hand.
- **Remediation pointer (STUB):** `SD-LEO-INFRA-RETENTION-LOOKBACK-INVARIANT-001` — *Design a check that fails when any registered consumer's lookback window exceeds the archiving hot window for the tables it reads, making the floor invariant machine-enforced instead of comment-asserted.*
- **DEADLINE:** **Not required before 2026-08-02** — record-keeping integrity (Art.12), not Art.14/50; recommended.

---

## Class B — Exec-Path completeness

Baseline: live-trigger / reachability proof is enforced **only at LEAD-FINAL-APPROVAL** via `INVOCATION_PATH_PROOF` (`scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js` + `lib/invocation-detector/`) and the `WIRE_CHECK` / `WIRE_CHECK_GATE` family.

### GAP-EXEC-01 — Live-trigger proof exists only at the final gate; earlier transitions accept unproven reachability
- **Description:** A gate or feature can pass `LEAD-TO-PLAN`, `PLAN-TO-EXEC`, and `EXEC-TO-PLAN` with **no proof it actually fires**. Reachability/live-trigger proof first appears at `LEAD-FINAL-APPROVAL`. Consequently dead-but-well-formed code (a control that is registered but never dispatched) survives every earlier phase and is only caught — if at all — at the very end, when rework is most expensive. This is the exec-path-completeness gap: proof-of-invocation is concentrated at one late boundary rather than distributed across the path.
- **Evidence:** `scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js` (the only phase wiring `INVOCATION_PATH_PROOF`); `lib/invocation-detector/` (the detector, invoked only from that gate); no equivalent gate binding at the earlier phase executors.
- **Remediation pointer (STUB):** `SD-LEO-INFRA-EARLY-REACHABILITY-PROOF-001` — *Introduce a lightweight reachability assertion at `PLAN-TO-EXEC` / `EXEC-TO-PLAN` so a control's invocation path is proven before final approval, not only at it.*
- **DEADLINE:** **Recommended before 2026-08-02** (medium) — Art.14 requires oversight measures to be *effective*; effectiveness presumes the controls are reachable. Not strictly blocking because the final gate still catches it before release.

### GAP-EXEC-02 — Reachability proof is generic, not oversight-control-specific
- **Description:** `INVOCATION_PATH_PROOF` / `WIRE_CHECK` prove that *some* invocation path exists; they are not specialized to prove that the **Art.14 human-oversight controls themselves** are wired end-to-end. There is no dedicated proof that the FREEZE path (`CONST-009`), the human-approval path for GOVERNED changes (`CONST-001`/`CONST-002`), and the runtime-bypass-block (`CONST-013`) are each individually reachable and effective in a given release. For a high-risk system these are precisely the controls whose silent breakage would be most consequential.
- **Evidence:** `lib/invocation-detector/` (generic invocation detection, control-agnostic); crosswalk rows `CONST_015_BYPASS_RUBRIC`, `GATE_WIRE_CHECK`, `WIRE_CHECK_GATE` in `governance-mapping-nist-euaiact.md` all marked Art.14 **partial** for exactly this reason.
- **Remediation pointer (STUB):** `SD-LEO-INFRA-OVERSIGHT-CONTROL-PROOF-001` — *Add a targeted proof that the FREEZE, GOVERNED-approval, and runtime-bypass-block paths are each reachable and firing, so Art.14 effectiveness is demonstrable, not assumed.*
- **DEADLINE:** **Required before 2026-08-02** — directly underwrites Art.14 (human oversight must be effective); unproven reachability of the FREEZE / human-approval / bypass-block paths is the highest-risk item on this list.

---

## Class C — Constitution numbering / governance drift

### GAP-CONST-015 — `CONST-015` is gate-enforced but has no constitution row, and carries two divergent meanings
- **Description:** `CONST_015_BYPASS_RUBRIC` is a distinct, code-enforced `gate_key`, yet `protocol_constitution` holds only `CONST-001` … `CONST-014` — there is **no `CONST-015` row**. The `CONST-015` token is used under **two different meanings**: (i) in `bypass-rubric.js` it is *"Bypass Governance & Reason Validation"* (owned by `SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-E`), and (ii) in a captured AI-Quality-Judge fixture it is a *proposed* `CONSTITUTION_AMEND` — *"Add CONST-015 enforcing scope-lock during EXEC"*. Meaning (ii) also overlaps semantically with the existing `CONST-013` (gate config/skip-lists frozen during EXEC; runtime bypass = CRITICAL). Net: a rule number that is enforced, ambiguous, absent from its home table, and partly redundant with `CONST-013`.
- **Evidence:** `scripts/modules/handoff/bypass-rubric.js:1-7` (header: "CONST-015: Bypass Governance & Reason Validation"); `scripts/modules/handoff/cli/execution-helpers.js:94-98` (`validateBypassReason` → "BYPASS REJECTED (CONST-015 Bypass Rubric)"); `scripts/one-off/capture-ai-quality-judge-fixtures.mjs:50` (proposed `rule_code: 'CONST-015'`, "enforcing scope-lock during EXEC"); `protocol_constitution` = 14 rows, no `CONST-015` (per AS-OF snapshot in the crosswalk).
- **Remediation pointer (STUB):** `SD-LEO-INFRA-CONST-015-RECONCILE-001` — *Decide one of: (a) ratify a single canonical `CONST-015` `protocol_constitution` row that reconciles the bypass-governance meaning and retires the scope-lock-amendment usage (folding it under `CONST-013` if redundant), or (b) rename the gate to drop the `CONST-` prefix so it stops implying a constitution row that does not exist.*
- **DEADLINE:** **Not required before 2026-08-02** — governance-integrity hygiene, no direct Art.14/50 obligation; recommended to avoid the crosswalk's `doc − live` drift recurring.

---

## Summary

| Gap ID | Class | Deadline (before 2026-08-02)? | Remediation stub SD |
|---|---|:--:|---|
| `GAP-RET-01` | A · Retention | Recommended | `SD-LEO-INFRA-RETENTION-COVERAGE-AT-CREATE-001` |
| `GAP-RET-02` | A · Retention | Recommended | `SD-LEO-INFRA-RETENTION-LOOKBACK-INVARIANT-001` |
| `GAP-EXEC-01` | B · Exec-Path | Recommended (medium) | `SD-LEO-INFRA-EARLY-REACHABILITY-PROOF-001` |
| `GAP-EXEC-02` | B · Exec-Path | **Required** | `SD-LEO-INFRA-OVERSIGHT-CONTROL-PROOF-001` |
| `GAP-CONST-015` | C · Const drift | Recommended | `SD-LEO-INFRA-CONST-015-RECONCILE-001` |

**Total: 5 gaps.** One (`GAP-EXEC-02`) is flagged **required before 2026-08-02** on Art.14-effectiveness grounds; the remainder are recommended durable hardening.
