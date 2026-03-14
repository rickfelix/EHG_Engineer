# Ground Truth Validation — Group 2: THE_ENGINE (Stages 6-9)

> Resolved disputes across OpenAI, Gemini, and Claude Phase 2 deep-dive opinions.
> Verdicts based on source code evidence in the EHG frontend repo.

---

## Methodological Divergence

Before examining individual disputes, a critical methodological difference must be acknowledged:

- **OpenAI** analyzed backend files: `lib/eva/stage-templates/`, `lib/eva/reality-gates.js`, `lib/eva/eva-orchestrator.js`, and docs. OpenAI explicitly states: "The referenced UI files like Stage6RiskEvaluation.tsx... are not present in the workspace."
- **Gemini** analyzed the actual TSX renderer components in the EHG frontend repo (`src/components/stages/`).
- **Claude** analyzed the TSX renderers, `venture-workflow.ts` config, and `stage-primitives.ts` shared utilities, with line-number references.

This means OpenAI and Claude/Gemini are often scoring different codebases (backend templates vs. frontend renderers). This is the root cause of the largest score divergences, particularly in UI/Visual Design.

---

## Disputed Claims Table

### Dispute 1: UI/Visual Design Scores

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Stage 6 UI/Visual Design | 4/10 | 8/10 | 9/10 (Visual Hierarchy) | **Gemini/Claude correct (8-9/10)** |
| Stage 7 UI/Visual Design | 4/10 | 8/10 | 8/10 | **Gemini/Claude correct (8/10)** |
| Stage 8 UI/Visual Design | 5/10 | 9/10 | 9/10 | **Gemini/Claude correct (9/10)** |
| Stage 9 UI/Visual Design | 4/10 | 8/10 | 8/10 (Visual Hierarchy) | **Gemini/Claude correct (8/10)** |

**Evidence**: OpenAI explicitly acknowledges it could not validate UI claims: "The prompt's table/row-expansion/mobile claims cannot be validated because the Stage 6 TSX renderer is missing." The TSX files exist at `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage6RiskEvaluation.tsx` (410 LOC), `Stage7RevenueArchitecture.tsx` (358 LOC), `Stage8BusinessModelCanvas.tsx` (276 LOC), and `Stage9ExitStrategy.tsx` (401 LOC). OpenAI scored backend template code on a visual design dimension, which is not the correct codebase for that evaluation.

**Verdict**: OpenAI's UI/Visual Design scores are invalid for this group. Gemini and Claude scores, derived from the actual renderer source code, are authoritative. OpenAI's backend analysis remains valuable for Logic & Flow and Architecture dimensions where backend behavior matters.

---

### Dispute 2: formatCurrency Duplication Scope and Severity

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Number of implementations | Not quantified | 3 (Stages 5, 7, 9) | 6 (Stages 5, 7, 9, 12, 16 + stage-primitives.ts) | **Claude correct: 6 implementations** |
| Behavioral divergence | Not identified | Noted as "duplication" only | 3 distinct behaviors; Stage 9 silently drops negative signs | **Claude correct: behavioral divergence confirmed** |
| Shared utility exists but unused | Not mentioned | Not mentioned | stage-primitives.ts line 139 has the weakest implementation | **Claude correct: shared file exists, unused, and weakest** |

**Evidence (from Claude's analysis)**:

| Location | Handles null? | Handles negatives? | Uses locale? |
|----------|:---:|:---:|:---:|
| Stage 5, line 89 | Yes ("--") | Yes (sign prefix) | Yes |
| Stage 7, line 59 | Yes ("--") | Yes (sign prefix) | Yes |
| Stage 9, line 74 | Yes ("--") | **NO** (drops sign) | Yes |
| stage-primitives.ts, line 139 | No (treats null as 0) | No | No |
| Stage 12, line 87 | Yes | Yes | Yes |
| Stage 16, line 58 | Partial (no null) | No | No |

**Verdict**: The duplication is worse than any single opinion reported. There are 6 implementations with 3 different behaviors. The Stage 9 negative-sign bug is real and was caught only by Claude. The shared utility in `stage-primitives.ts` exists but has the weakest implementation of all copies, meaning naive consolidation would introduce regressions. Any fix must first upgrade the shared version, then migrate all consumers.

---

### Dispute 3: Stage 9 Phantom Gate Severity

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Phantom gate severity | "Two different gate concepts create false trust" (5/10) | Significance 4 ("The Phantom Gate") | Gap Importance 5 — trust erosion is system-wide | **Claude correct: Severity 5 (system-wide trust impact)** |
| Nature of the problem | Conflation of artifact gate vs. local gate | UI says "Gate" but config says `gateType: 'none'` | Distinguishes "no gate" (deliberate) from "fake gate" (misleading) | **All three identify the issue; Claude's framing is most precise** |
| Impact scope | Stage 9 only | Stage 9 UX | All 25 stages (if one gate is fake, all gates lose credibility) | **Claude's system-wide trust argument is well-founded** |

**Evidence**: `venture-workflow.ts` line 136 sets `gateType: 'none'` for Stage 9. The renderer (Stage9ExitStrategy.tsx lines 149-175) displays a "Phase 2->3 Reality Gate" banner with PASS/BLOCKED badges. The stage-advance-worker does not enforce this gate. This is not "no gate" (a deliberate design choice) but "displayed-but-unenforced gate" (a contradiction). Phase 1 consensus already identified 6 phantom gates across the workflow (Stages 9, 12, 19, 20, 21, 24), confirming that this is a systemic pattern, not an isolated incident.

**Verdict**: Severity 5 is correct. The phantom gate problem is compounded by the Stage 7->9 data contract break (see next dispute), which means the gate will almost always show BLOCKED — not because the venture fails viability checks, but because upstream data is missing. This makes the trust damage even worse.

---

### Dispute 4: Stage 7 to Stage 9 Runtime Contract

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Contract is broken | Yes: 21/84 test failures, Stage 7 backend missing ltv, payback_months | Not explicitly identified as a contract break | Yes: Stage 7 renderer computes LTV/ARR in React state only, never persisted; Stage 9 backend expects persisted fields | **OpenAI + Claude correct: contract is broken** |
| Where derivations happen | Backend `computeDerived()` is dead code | Frontend computes them safely (LTV:CAC, ARR) | Frontend-only: lines 100-105 compute in React state, never written to advisory_data | **Claude most precise: dual location issue** |
| Test failure count | 21/84 assertions failed | Not tested | Cannot verify from frontend alone | **OpenAI's count accepted (backend tests)** |
| Impact on phantom gate | Gate is fail-closed due to missing data | Not connected to phantom gate | Gate will always show BLOCKED because stage07?.ltv is never persisted | **Claude correct: compounds the phantom gate problem** |

**Evidence**: Stage 7's backend `computeDerived()` is confirmed dead code by OpenAI (returns `{ ...data }` unchanged). Stage 7's frontend renderer (lines 100-105) computes `ltv`, `ltvCacRatio`, `projectedArr` from raw inputs — but these exist only in React component state and are never persisted to `advisory_data`. Stage 9's backend `evaluateRealityGate()` checks `stage07?.ltv` and `stage07?.payback_months`, which will always be undefined.

**Verdict**: The contract is broken at two levels: (1) the backend `computeDerived()` is dead, and (2) the frontend computes the correct values but does not persist them. This creates a cascading failure: the reality gate evaluator always finds missing data, making the phantom gate always display BLOCKED regardless of actual venture viability.

---

### Dispute 5: Accessibility (Zero aria-* Attributes)

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Accessibility assessment | Not evaluated (backend analysis) | Minor concerns noted (accessibility order 2, empty states 2) | Zero aria-*, zero role, zero tabIndex, zero onKeyDown across all 1,445 lines | **Claude correct: zero accessibility attributes** |
| Severity | N/A | Minor (1-2) | 3/10 across all stages | **Claude's assessment is authoritative** |
| Specific WCAG failures | None identified | Screen reader order concern for BMC grid | Stage 6 expandable rows are mouse-only (WCAG 2.1.1 Keyboard); Stage 9 fit score dots are color-only (WCAG 1.4.1 Use of Color) | **Claude identifies specific WCAG violations** |

**Evidence**: Claude's file-level search confirms zero `aria-*`, zero `role`, zero `tabIndex`, and zero `onKeyDown` handlers across all four renderer files (1,445 LOC total). Gemini mentions accessibility tangentially (DOM order vs. visual order for BMC, empty states) but does not audit for attribute presence. OpenAI analyzed backend templates where accessibility attributes would not exist.

**Verdict**: The complete absence of accessibility attributes across 1,445 lines is a significant finding caught only by Claude's systematic audit. Gemini identified a valid concern (BMC grid reading order) but underestimated the scope. This is a WCAG compliance failure affecting all four stages.

---

### Dispute 6: Stage 8 Placeholder Quality

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Placeholder autofill concern | "Placeholder autofill can make incomplete canvases look artificially complete" (Gap 4) | Not flagged | Evidence filter exists: line 120 filters `item.evidence.startsWith("No evidence")` | **Both partially correct** |
| Stage 9 checks placeholder quality | "Stage 9 only checks blocks are populated, not evidence-backed" (Gap 4) | Not addressed | Not directly addressed but covered by phantom gate analysis | **OpenAI concern is valid for backend** |

**Evidence**: Stage 8's renderer does have an evidence filter at line 120 that excludes placeholder evidence strings starting with "No evidence". This partially addresses OpenAI's concern at the UI layer — users will not see placeholder evidence in the rendered BMC. However, OpenAI's concern about the backend (Stage 9 promotion logic checking only population, not quality) remains valid. The frontend mitigation does not fix the backend quality gap.

**Verdict**: The renderer handles placeholder filtering better than OpenAI expected, but the backend quality check gap is real. This is a split finding: frontend partially mitigated, backend unaddressed.

---

### Dispute 7: Stage 6 Risk Count Mismatch

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Risk count mismatch | Stage 6 generates 8 risks, Stage 9 promotion requires 10 (Gap 4) | Not flagged | Not flagged | **Requires verification** |

**Evidence**: OpenAI identified this from backend analysis. Neither Gemini nor Claude examined the backend generation targets vs. promotion thresholds. OpenAI's backend analysis is the authoritative source for this claim since it pertains to backend logic.

**Verdict**: Accepted based on OpenAI's backend evidence. This is a backend-only issue that neither frontend-focused analysis would detect. The misalignment (generating 8 risks when 10 are required for promotion) will cause a systematic bottleneck.

---

### Dispute 8: Architecture Group Score

| Claim | OpenAI | Gemini | Claude | Verdict |
|-------|--------|--------|--------|---------|
| Architecture group score | 5/10 | 6.5/10 | 5.5/10 | **5.5/10 (Claude's reasoning most complete)** |

**Evidence**: All three agree architecture is the weakest dimension. Gemini gives the highest score (6.5) but does not account for the fact that `stage-primitives.ts` already exists with shared utilities that no Group 2 stage imports. Claude correctly identifies this as worse than pre-extraction duplication: "the extraction work was done and then not adopted." OpenAI's score (5) is partially deflated by scoring backend architecture which has additional issues (dead `computeDerived()`).

**Verdict**: 5.5/10. The shared primitives file existing but being unused is a meaningful architectural failure beyond simple duplication. Gemini's 6.5 is too generous; OpenAI's 5 is slightly too harsh (it mixes in backend issues not directly comparable to the frontend architecture dimension).

---

## Summary of Verdicts

| # | Dispute | Winner | Key Reason |
|---|---------|--------|------------|
| 1 | UI/Visual Design scores | Gemini + Claude | OpenAI analyzed backend, not frontend renderers |
| 2 | formatCurrency scope | Claude | Found 6 implementations with 3 behaviors; identified Stage 9 negative-sign bug |
| 3 | Phantom gate severity | Claude | System-wide trust erosion, not just Stage 9 |
| 4 | Stage 7->9 contract | OpenAI + Claude | Both identify the break from different angles (backend tests + frontend analysis) |
| 5 | Accessibility | Claude | Only opinion to systematically audit for aria/role/tabIndex presence |
| 6 | Stage 8 placeholders | Split | Frontend has evidence filter (Claude); backend lacks quality check (OpenAI) |
| 7 | Risk count mismatch | OpenAI | Backend-only finding; valid and uncontested |
| 8 | Architecture score | Claude | Accounts for unused shared primitives file |
