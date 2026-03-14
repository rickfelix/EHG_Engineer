# Phase 2 Ground-Truth Validation — Group 4: THE_BLUEPRINT (Stages 13-16)

> This document compares claims from all three AI assessments (OpenAI, Gemini, Claude) against each other, resolving disputes with codebase evidence. Claude had direct codebase access; OpenAI and Gemini evaluated from code excerpts provided in the prompt.

## Disputed Claims Resolution

### Dispute 1: Stage 16 "Schema Firewall Promotion Gate" Renders in User-Visible UI

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Wrong concept is visible in the banner text" — Gap Importance 5 | **CORRECT** |
| Gemini | "Most jarring name divergence in the group" — Score 5 Critical | **CORRECT** |
| Claude | Line 122 renders literal string `"Schema Firewall Promotion Gate"` in user-facing banner; non-technical stakeholder sees database security label on financial projections screen | **CORRECT** |

**Evidence**: `Stage16SchemaFirewall.tsx` line 122 contains the hardcoded string `"Schema Firewall Promotion Gate"` which renders directly in the browser. This is not a developer-only identifier — it is user-visible text in the promotion gate banner.

**Unanimous agreement** — all three AIs rate this as Gap Importance 5 / Critical. Claude's additional emphasis that this is a user-facing defect (not just a developer-experience issue) is the correct framing. A non-technical venture evaluator will see "Schema Firewall" when reviewing financial viability. This is the single most urgent fix in Group 4.

---

### Dispute 2: Gate Nomenclature — Three-Way Vocabulary Split

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "Gate semantics are local and inconsistent" — Gap Importance 3-4 | **CORRECT but understated** |
| Gemini | Identifies `DECISION_BANNER` vs `GATE_BANNER` fork — Score 4 Significant | **CORRECT** |
| Claude | Documents full three-way split across Stages 13, 16, 17 with identical CSS underneath | **CORRECT and most complete** |

**Evidence** — the full gate vocabulary within and adjacent to Group 4:

| Stage | Constant Name | Green State | Amber State | Red State |
|-------|--------------|-------------|-------------|-----------|
| 13 | `DECISION_BANNER` | `pass` | `conditional_pass` | `kill` |
| 16 | `GATE_BANNER` | `promote` | `conditional` | `hold` |
| 17 | `DECISION_BANNER` | `go` | `conditional_go` | `no_go` |

Three different constant names, three different value vocabularies, but the CSS classes (`bg-emerald-900/30`, `bg-amber-900/30`, `bg-red-900/30` and corresponding badges) are identical across all three. This confirms the split is purely in naming, not in behavior. The wider codebase (Phase 1 ground-truth) documents 8+ total variants.

**Resolution**: OpenAI scored this as Gap 3-4 which underweights its system-wide impact. Gemini and Claude correctly identify it as a structural problem. Claude's observation that the CSS is identical is the key evidence — it proves these are the same component duplicated with different labels. The correct fix is a single shared `<GateBanner>` component.

---

### Dispute 3: Stage 15 UX Severity — Split Between OpenAI and Gemini/Claude

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | UX/Workflow: 6/10 | **OVERSCORED** |
| Gemini | UX/Workflow: 4/10 | **CORRECT** |
| Claude | Sides with Gemini — naming mismatch is as severe as Stage 16 | **CORRECT** |

**Evidence**: The naming mismatch at Stage 15 is among the worst in the group:
- Component name: `EpicUserStoryBreakdown`
- Actual content: Risk Register
- Config description (`venture-workflow.ts` line 197): "Create epics, break down into user stories with estimates"
- Backend file: `stage-15-risk-register.js`

A developer searching for risk management code will never find this file. A developer looking for user story breakdown will be confused by risk data. The config description is entirely wrong, not merely imprecise. OpenAI's 6/10 UX score treats this as a moderate naming issue; Gemini and Claude correctly identify it as critically misleading to both developers and anyone reading config metadata.

**Resolution**: UX score for Stage 15 should be 4/10, aligning with Gemini and Claude. The naming mismatch severity is equivalent to Stage 16's (both are complete domain mismatches), with the only difference being Stage 16's also leaks into user-visible text.

---

### Dispute 4: Naming Mismatch Severity Ratings Differ Per Stage

| Stage | OpenAI Gap | Gemini Score | Claude Gap | Ground-Truth |
|-------|-----------|-------------|-----------|-------------|
| 13: TechStackInterrogation (Product Roadmap) | 4 | 5 Critical | 4 | **4** |
| 14: DataModelArchitecture (Technical Architecture) | 2 | 3 Moderate | 2 | **2** |
| 15: EpicUserStoryBreakdown (Risk Register) | 4 | 5 Critical | 5 Critical | **5** |
| 16: SchemaFirewall (Financial Projections) | 5 | 5 Critical | 5 Critical | **5** |

**Evidence and rationale**:
- **Stage 13 (Gap 4, not 5)**: The component name is wrong, but the gate banner label at line 117 reads "Product Roadmap Kill Gate" — which is correct. The mismatch is filename/export/config only, not user-visible. OpenAI and Claude correctly score this as 4.
- **Stage 14 (Gap 2)**: All three agree this is the mildest mismatch. "Data Model Architecture" is a subset of "Technical Architecture" — wrong scope but adjacent domain. Unanimous at Gap 2-3.
- **Stage 15 (Gap 5)**: Gemini and Claude rate this as Critical. OpenAI rates it as 4. The config description is completely wrong (user stories vs risk register), and the domains are entirely unrelated. This is as bad as Stage 16 minus the user-visible leak. Ground truth: 5.
- **Stage 16 (Gap 5)**: Unanimous at Critical/5. The user-visible banner text makes this uniquely damaging.

---

### Dispute 5: formatCurrency Reimplementation in Stage 16

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | "formatCurrency duplicated again" — Gap Importance 3 | **CORRECT** |
| Gemini | "Re-implements the standard formatCurrency function locally" — Score 3 Moderate | **CORRECT** |
| Claude | Shared version at `stage-primitives.ts` lines 139-144 is more robust (uses `ensureNumber`), local copy at line 58 is both redundant and inferior; null handling differs ($0 vs ---) | **CORRECT and most detailed** |

**Evidence**: Stage 16 lines 58-63 define a local `formatCurrency` that:
- Returns `"---"` for null inputs (em-dash)
- Accepts `number | undefined`

The shared version in `stage-primitives.ts` lines 139-144:
- Returns `"$0"` for null/undefined inputs
- Accepts `unknown` (more defensive typing)
- Uses `ensureNumber` internally for safer coercion

**Resolution**: All three agree this is a duplication issue. Claude's finding that the behavior differs (null handling) adds a consistency concern — the same venture's financial data could display differently depending on which stage renders it. The fix is to delete the local copy and import from `stage-primitives.ts`, with a policy decision on whether null should render as "$0" or "---".

---

### Dispute 6: Accessibility — Zero aria-* Attributes Across 1,403 Lines

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | Mentions "color badges rather than textual cues" for Stage 14 — Gap 2 | **UNDERSTATED** |
| Gemini | Does not score Accessibility as a distinct dimension | **INCOMPLETE** |
| Claude | Scores Accessibility 3/10 across all 4 stages; zero `aria-*`, zero `role`, zero `sr-only` across 1,403 total lines; severity bars and revenue charts completely opaque to screen readers | **CORRECT and uniquely detailed** |

**Evidence**: Claude's assessment is based on direct codebase inspection. Specific failures:
- Stage 13 (324 LOC): Zero `aria-*` attributes; priority badges use color alone
- Stage 14 (396 LOC): Zero `aria-*` attributes; layer colors, protocol badges rely solely on color
- Stage 15 (306 LOC): Zero `aria-*` attributes; severity bar chart has no accessible labels; bars use only color
- Stage 16 (377 LOC): Zero `aria-*` attributes; revenue/cost bars have `title` for hover but no screen reader text; cash balance negative indicator is color-only

**Resolution**: OpenAI acknowledged this for one stage at Gap 2; Gemini did not surface it. Claude's systematic audit (Accessibility 3/10 group-wide) is the authoritative finding. This is a significant gap that OpenAI and Gemini both underweighted. Claude's recommendation for an accessibility pass across Group 4 is well-justified.

---

### Dispute 7: Financial Content Placement — Should Stage 16 Move to THE_ENGINE?

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | Stage 16 "belongs in THE_BLUEPRINT as the integrated viability checkpoint" | **CORRECT** |
| Gemini | "Evaluate if Stage 16 belongs in THE_ENGINE instead of THE_BLUEPRINT" | **INCORRECT** |
| Claude | Disagrees with Gemini; Stage 16 is correctly placed as blueprint capstone; it depends on Stages 13-15 context | **CORRECT** |

**Evidence**: THE_ENGINE (Stages 6-9) covers business model foundations: Risk Evaluation, Revenue Architecture, Business Model Canvas, Exit Strategy. Stage 16's Financial Projections synthesize plan-level numbers (capital, burn rate, runway, break-even) that can only be computed after the full blueprint (roadmap, architecture, risks) is known. Moving Stage 16 to THE_ENGINE would decouple it from the planning context it depends on.

The promotion gate at Stage 16 serves as the blueprint's capstone question: "Given this roadmap, architecture, and risk profile, is the venture financially viable to proceed to build?" This is architecturally correct.

**Resolution**: 2-to-1 consensus (OpenAI + Claude vs Gemini). Stage 16 stays in THE_BLUEPRINT. Gemini's suggestion to evaluate relocation is noted but rejected on dependency grounds.

---

### Dispute 8: Stage 14 Architecture Score

| AI | Claim | Verdict |
|----|-------|---------|
| OpenAI | Architecture: 6/10 | **SLIGHT OVERSCORE** |
| Gemini | Architecture: 5/10 | **CORRECT** |
| Claude | Implicit 5-6 range; notes 4 local color maps (80 lines of constants) + ADVISORY_EXCLUDE + brittle LAYER_ORDER | **CORRECT** |

**Evidence**: Stage 14 has the mildest naming mismatch but still carries:
- 4 local color maps (`LAYER_COLORS`, `LAYER_LABELS`, `PROTOCOL_COLORS`, `CONSTRAINT_COLORS`) — 80 lines of locally-defined constants
- `ADVISORY_EXCLUDE` pattern duplicated from all other stages
- Static 5-element `LAYER_ORDER` that will silently drop data if backend adds a new layer

**Resolution**: Architecture score for Stage 14 is 5/10. The 4 local color maps and brittle static array are moderate architectural concerns. OpenAI's 6 is slightly generous.

---

## Score Adjustment Summary

### Per-Stage Score Adjustments

| Stage | Dimension | OpenAI | Gemini | Claude | Ground-Truth |
|-------|-----------|--------|--------|--------|-------------|
| 15 | UX/Workflow | 6 | 4 | 4 | **4** (OpenAI overscored) |
| 14 | Architecture | 6 | 5 | ~5.5 | **5** (OpenAI slightly overscored) |
| 16 | Gate Implementation | 7 (Functionality) | 8 (Functionality) | 5 (Gate-specific) | **5** (Claude's dedicated gate dimension is more precise) |

### Key Ground-Truth Findings (Only Codebase Access Reveals)

1. **Stage 13 gate label is correct**: Line 117 reads "Product Roadmap Kill Gate" — the naming mismatch does NOT leak into user-visible text at Stage 13, only at Stage 16.
2. **CSS classes are identical across all gate variants**: The three-way vocabulary split (`pass/conditional_pass/kill`, `promote/conditional/hold`, `go/conditional_go/no_go`) maps to the same `bg-emerald-900/30`, `bg-amber-900/30`, `bg-red-900/30` classes. Only the keys differ.
3. **Shared formatCurrency has different null behavior**: `stage-primitives.ts` returns `"$0"` for null; Stage 16's local copy returns `"---"`. This is a consistency bug, not just duplication.
4. **Stage 15 has inline currency formatting that uses a third pattern**: Lines 239-251 use `$${value.toLocaleString()}` — neither the shared utility nor Stage 16's local copy. Three different currency formatting behaviors across Group 4.
5. **Config descriptions in venture-workflow.ts are wrong for 3 of 4 stages**: Lines 179, 197, 209 describe the old content. Only Stage 14's description (line 188: "Define entity relationships, data flows, and schema design") is partially accurate.
6. **ADVISORY_EXCLUDE is defined in 22 stage renderers**: Not just Group 4. This is a codebase-wide smell, but Group 4's 4 instances contribute to the pattern.
