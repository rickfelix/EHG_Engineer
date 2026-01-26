# Strategic Intake Contract v1 — Governance Agreement


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: schema, sd, documentation, reference

**Version:** 1.1 (LOCKED)
**Effective Date:** 2025-12-13
**Parties:** Chairman (Rick Dronkers), Codex (Deterministic Agent), Claude (Judgment Agent)
**Optional Party:** External Strategic Advisor (High-Cost LLM) — non-binding advisory only
**Jurisdiction:** ExecHoldings Global (EHG) Strategic Governance

---

## 1. Purpose

This contract defines the binding roles, responsibilities, decision rights, and audit requirements for the Strategic Intake Pipeline. It ensures reproducibility, accountability, and auditability of all governance decisions.

**Governing Principle:** The Chairman's time is the scarcest resource. All pipeline operations exist to maximize the quality and minimize the quantity of decisions requiring Chairman attention.

---

## 2. Roles & Responsibilities

### 2.1 Codex (Deterministic Agent)

**Identity:** Automated extraction, transformation, and matching processes

**MUST Do (No Judgment):**
| Action | Constraint |
|--------|------------|
| Extract recommendations from raw files | Schema-compliant output only |
| Compute spec overlap scores | Jaccard similarity, no weighting changes |
| Apply hard-fail pattern matching | Exact regex match, no interpretation |
| Generate deterministic samples | Every Nth row, sorted by rec_id ascending |
| Produce CSV/JSON artifacts | Timestamped, immutable after creation |

**MUST NOT Do:**
- Interpret ambiguous language
- Override hard-fail patterns
- Modify frozen artifacts
- Make disposition recommendations

**Failure Mode if Violated:** Pipeline produces inconsistent results; audit trail breaks.

### 2.2 Claude (Judgment Agent)

**Identity:** AI agent applying contextual reasoning within defined constraints

**MUST Do (Judgment Required):**
| Action | Constraint |
|--------|------------|
| Score VAG filters F1-F5 | Within rubric definitions |
| Apply F3 sub-test (direct vs indirect) | "Immediate Decision Impact" test |
| Resolve ambiguity flags | Document reasoning in rationale_short |
| Recommend SD actions | AMEND/CREATE_NEW/DEFER only |
| Propose new SD scopes | ≤2 sentences, parent SD required |
| Perform QA audits | 30-sample variance check |

**MUST NOT Do:**
- Override Chairman decisions
- Create SDs without Chairman approval
- Modify Codex outputs
- Skip STOP points

**Failure Mode if Violated:** Governance bypass; unaudited changes enter system.

### 2.3 Chairman (Human Authority)

**Identity:** Rick Dronkers, sole decision authority for EHG

**ONLY Chairman Can:**
| Decision | Rationale |
|----------|-----------|
| Approve STOP points | Human-in-the-loop for irreversible actions |
| Override VAG dispositions | Business context Codex/Claude cannot access |
| Authorize new SDs | Resource commitment decision |
| Modify frozen artifacts | Requires new version, audit trail |
| Approve contract changes | Meta-governance authority |

**Chairman May Delegate (With Explicit Grant):**
- QA audit review (to Claude, with Chairman sign-off)
- Deferral recommendations (to Claude, Chairman approves list)

**Failure Mode if Violated:** Unauthorized commitments; governance integrity compromised.

### 2.4 External Strategic Advisor (Optional, Non-Binding)

**[ADDITIVE — v1.1]**

**Identity:** High-cost frontier LLM (e.g., GPT-5.2) invoked for second-order governance reasoning

**Epistemic Boundary:**
Advisory outputs are not assumed to be more correct than Claude outputs; they exist to surface different risks, not superior truth. "The external advisor said X" is not valid justification for overriding Claude's judgment or pipeline dispositions.

**Purpose:**
- Surface unstated assumptions in high-stakes decisions
- Identify precedent risks before irreversible commitments
- Provide adversarial review of new SD creation or material scope expansion
- Detect long-horizon complexity not obvious from surface descriptions

**MAY Do (Advisory Only):**
| Action | Constraint |
|--------|------------|
| Surface hidden assumptions | Must cite evidence from frozen artifacts |
| Flag precedent risks | Must explain future behavior normalized |
| Highlight solo-builder stress | Must ground in 6-12 month horizon |
| Distinguish governance vs capability | Must apply filter definitions |
| Pose Chairman questions | Must be actionable, not rhetorical |

**MUST NOT Do:**
- Score, classify, or route any item
- Approve, reject, or override any disposition
- Generate artifacts used in the pipeline
- Replace Claude or Codex in any capacity
- Create binding precedent
- Be cited as justification for future decisions

**Invocation Requirements:**
1. Chairman explicitly requests advisory review
2. Justification documented (e.g., "high precedent risk on new SDs")
3. Scope limited to small, high-impact item sets

**Invocation Test:**
The Chairman must be able to state, in one sentence:
> "What decision would this advisory materially change?"

If no such decision exists, advisory review SHOULD NOT be invoked.

**Cost Constraint:**
External advisors are significantly more expensive than standard operators. Use only when:
- Creating ≥3 new SDs in a single batch
- Material scope expansion affects core governance primitives
- Items have high ambiguity flags
- Decisions are irreversible

**Non-Precedent Rule:**
Advisory outputs are ephemeral. They:
- Do NOT create precedent for future intakes
- Cannot be cited to justify pipeline behavior changes
- Must not be incorporated into VAG patterns or SD alignment heuristics
- Are not stored as pipeline artifacts

**Failure Mode if Violated:** Advisory role becomes quasi-decision-maker; governance boundaries erode.

---

## 3. Decision Rights Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DECISION RIGHTS MATRIX                           │
├─────────────────────────────────────┬─────────┬─────────┬──────────┤
│ Decision                            │ Codex   │ Claude  │ Chairman │
├─────────────────────────────────────┼─────────┼─────────┼──────────┤
│ Extract recommendation from text    │ EXECUTE │    —    │    —     │
│ Score VAG filter (0/1/2)            │    —    │ EXECUTE │ OVERRIDE │
│ Apply hard-fail pattern             │ EXECUTE │    —    │ OVERRIDE │
│ Assign disposition (adv/park/rej)   │    —    │ EXECUTE │ OVERRIDE │
│ Route to existing SD                │ EXECUTE │ REVIEW  │ OVERRIDE │
│ Propose new SD                      │    —    │ PROPOSE │ APPROVE  │
│ Set new SD scope                    │    —    │ PROPOSE │ APPROVE  │
│ Approve STOP point                  │    —    │    —    │ APPROVE  │
│ Modify frozen artifact              │    —    │    —    │ APPROVE  │
│ Change this contract                │    —    │    —    │ APPROVE  │
├─────────────────────────────────────┼─────────┼─────────┼──────────┤
│ Request external advisory           │    —    │    —    │ INVOKE   │
│ Receive advisory output             │    —    │    —    │ RECEIVE  │
└─────────────────────────────────────┴─────────┴─────────┴──────────┘

Legend:
  EXECUTE  = Performs action autonomously
  PROPOSE  = Recommends action, requires approval
  REVIEW   = Can flag issues, cannot change
  OVERRIDE = Can reverse any lower-level decision
  APPROVE  = Required sign-off before action proceeds
  INVOKE   = Chairman explicitly requests (optional)
  RECEIVE  = Chairman receives non-binding output
```

---

## 4. Rules of Evidence

### 4.1 Frozen Artifacts Are Authoritative

Once an artifact is timestamped and written to `_outputs/`, it becomes **frozen evidence**:

- **Immutable:** No modifications to frozen files
- **Versioned:** Changes require new file with incremented version
- **Traceable:** All references must use exact filename with timestamp

**Enforcement:**
```
FROZEN: sd_alignment_adv_to_sd_pipeline_classification_20251213.csv
MUTABLE: sd_alignment_adv_to_sd_pipeline_classification_WORKING.csv
```

### 4.2 No Silent Changes

Any change to pipeline logic, VAG rubric, or SD alignment rules must:
1. Be documented in contract amendment
2. Receive Chairman approval
3. Trigger re-run of affected pipeline stages
4. Produce new timestamped artifacts

**Violation:** Silent changes invalidate all downstream artifacts.

### 4.3 Audit Trail Requirements

Every pipeline run must produce:
| Artifact | Required Fields |
|----------|-----------------|
| Extraction log | source_file, rec_id, extraction_confidence, timestamp |
| VAG adjudication | rec_id, f1-f5, total_score, hard_fail, rationale_short |
| SD alignment | rec_id, classification, top_sd_id, match_rationale |
| Decision sheet | rec_id, action, target_sd, chairman_approval_timestamp |

---

## 5. Audit Requirements

### 5.1 Mandatory Audits

| Audit Type | Trigger | Sample Size | Pass Criteria |
|------------|---------|-------------|---------------|
| VAG QA Audit | Every intake batch | 30 (every Nth row) | Score variance ≤10% |
| Schema Parity | Every extraction | 100% | All required columns present |
| Hard-Fail Review | Every VAG run | All hard-fails | Rationale documented |

### 5.2 Reproducibility Standard

A pipeline run is **reproducible** if:
1. Same inputs + same contract version → same outputs
2. All random seeds are fixed (none used in v1)
3. Deterministic sampling method documented
4. All intermediate artifacts preserved

**Test:** Re-run Dec-13 inputs with v1 contract → identical artifacts (within floating-point tolerance for scores).

### 5.3 Audit Log Retention

| Log Type | Retention Period | Storage Location |
|----------|------------------|------------------|
| Raw inputs | Permanent | Dropbox (dated folder) |
| Pipeline artifacts | Permanent | Dropbox `_outputs/` |
| Audit reports | 2 years | Repo `docs/audit/` |
| Decision sheets | Permanent | Repo `docs/governance/decisions/` |

---

## 6. STOP Points (Human Gates)

### Definition
A STOP point is a pipeline stage where execution **halts** until Chairman provides explicit approval.

### Current STOP Points

| STOP ID | Stage | Trigger | Required Approval |
|---------|-------|---------|-------------------|
| STOP-1 | Post-VAG QA | QA audit complete | Chairman reviews variance report |
| STOP-2 | Post-Decision Sheet | Decision sheet generated | Chairman approves per-item actions |
| STOP-3 | Hard-Fail Dispute | Claude disagrees with Codex | Chairman adjudicates |

### Approval Format
```
APPROVAL: STOP-1
DATE: 2025-12-13
CHAIRMAN: Rick Dronkers
DECISION: APPROVED / APPROVED_WITH_MODIFICATIONS / REJECTED
NOTES: [optional]
```

---

## 7. Versioning Rules

### 7.1 Version Numbering

```
v{MAJOR}.{MINOR}.{PATCH}

MAJOR: Breaking changes to pipeline structure or decision rights
MINOR: New filters, new STOP points, new artifact types
PATCH: Clarifications, typo fixes, no behavioral change
```

### 7.2 Change Process

1. **Proposal:** Claude or Codex identifies need for change
2. **Documentation:** Change documented in `docs/governance/proposals/`
3. **Review:** Chairman reviews proposal
4. **Approval:** Chairman signs off (or rejects)
5. **Implementation:** Contract updated, version incremented
6. **Announcement:** Change communicated to all operators

### 7.3 Backwards Compatibility

- **v1.x → v1.y:** Artifacts produced under v1.x remain valid under v1.y
- **v1.x → v2.x:** Artifacts must be re-processed or explicitly grandfathered

---

## 8. Codex–Claude–Chairman Boundary Contract

### The Single-Sentence Decision Rule

> **If in doubt about whether an action requires Chairman approval, it does.**

### Boundary Definitions

```
┌────────────────────────────────────────────────────────────────────┐
│                         RESPONSIBILITY BOUNDARIES                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   CODEX ZONE                CLAUDE ZONE              CHAIRMAN ZONE  │
│   (Deterministic)           (Judgment)               (Authority)    │
│                                                                     │
│   ┌─────────────┐          ┌─────────────┐         ┌─────────────┐ │
│   │ Extract     │          │ Score VAG   │         │ Approve     │ │
│   │ Match specs │    →     │ Resolve     │    →    │ Override    │ │
│   │ Compute     │          │ Recommend   │         │ Authorize   │ │
│   │ Pattern     │          │ Propose     │         │ Commit      │ │
│   └─────────────┘          └─────────────┘         └─────────────┘ │
│                                                                     │
│   NO interpretation        NO unilateral           FINAL authority  │
│   NO judgment              NO creation             on all decisions │
│   NO modification          NO modification                          │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Failure Modes by Boundary Violation

| Violation | Consequence | Recovery |
|-----------|-------------|----------|
| Codex interprets | Inconsistent extraction | Re-run with stricter prompt |
| Claude creates SD without approval | Unauthorized commitment | Revert, escalate |
| Claude modifies Codex output | Audit trail broken | Restore from frozen artifact |
| Chairman bypasses STOP | No audit record | Document retroactively |

---

## 9. Dispute Resolution

### Priority Order
1. **Contract text** (this document)
2. **VAG v1.1 Governance Contract** (for scoring disputes)
3. **Chairman verbal clarification** (documented immediately)
4. **Historical precedent** (Dec-13 decisions)

### Escalation Path
```
Codex/Claude disagreement
    → Claude documents in rationale_short
    → Claude flags for Chairman review
    → Chairman adjudicates at STOP point
    → Decision recorded in audit log
```

---

## 10. Signatures

### Chairman Approval

```
I, Rick Dronkers, as Chairman of ExecHoldings Global, approve this
Strategic Intake Contract v1 as the binding governance agreement for
all Strategic Intake Pipeline operations.

Effective: 2025-12-13
Signature: [PENDING]
```

### Operator Acknowledgment

```
Codex acknowledges these constraints are embedded in its prompts.
Claude acknowledges these constraints govern its judgment scope.

Date: 2025-12-13
```

---

## Appendix A: Referenced Contracts

| Contract | Version | Location |
|----------|---------|----------|
| VAG v1.1 Governance Contract | 1.1 | (frozen, Dec-13 session) |
| VAG v1.1 Intake Checklist | 1.0 | (frozen, Dec-13 session) |
| VAG v1.1 Decision Record Template | 1.0 | (frozen, Dec-13 session) |

---

## Appendix B: Dec-13 Known Issues (Historical Record)

| Issue ID | Description | Resolution |
|----------|-------------|------------|
| DEC13-001 | Dropbox path not found initially | Use absolute paths, verify with `ls` |
| DEC13-002 | Large JSON exceeded token limit | Use chunked reads, summary extraction |
| DEC13-003 | Spec/06 routed to wrong SD | Add explicit spec→SD override table |
| DEC13-004 | VAG inserted mid-pipeline | Formalized as mandatory gate in v1 |

---

## Appendix C: Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-13 | Chairman | Initial contract based on Dec-13 intake |
| 1.1 | 2025-12-13 | Chairman | Added External Strategic Advisor role (Section 2.4), Decision Rights Matrix rows (INVOKE/RECEIVE), Invocation Test, Epistemic Boundary, Non-Precedent Rule |

---

*End of Strategic Intake Contract v1.1*
