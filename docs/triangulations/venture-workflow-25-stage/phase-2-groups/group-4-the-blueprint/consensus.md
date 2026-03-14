# Phase 2 Consensus — Group 4: THE_BLUEPRINT (Stages 13-16)

> Synthesized from OpenAI, Gemini, and Claude opinions, adjusted by ground-truth validation. Claude had direct codebase access; OpenAI and Gemini evaluated from code excerpts in the prompt.

## Consensus Scores

### Per-Stage Scores

#### Stage 13: TechStackInterrogation (actually: Product Roadmap)

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|--------|--------|--------|-----------|-----------|
| Logic & Flow | 8 | 8 | 8 | **8** | Unanimous. Defensive data handling, correct rendering order. |
| Functionality | 7 | 8 | 8 | **8** | Gemini and Claude agree on 8; milestone grouping, gate rendering, and fallback counts all work correctly. |
| UI/Visual Design | 7 | 7 | 8 | **7** | 2-to-1 at 7. Good visual hierarchy but single responsive breakpoint limits it. |
| UX/Workflow | 6 | 3 | 4 | **4** | Ground-truth sides with Gemini/Claude. The naming mismatch (TechStackInterrogation rendering a Product Roadmap) is severe enough to mislead developers; config description is wrong. However, the gate banner label ("Product Roadmap Kill Gate") IS correct, preventing user-visible harm. |
| Architecture | 5 | 4 | 5 | **5** | Locally hardcoded ADVISORY_EXCLUDE (11 elements), locally defined PRIORITY_COLORS, no empty/loading states. |
| Accessibility | — | — | 3 | **3** | Only Claude scored this dimension. Zero aria-* attributes across 324 lines. Color-only priority badges. |

**Stage 13 Average: 5.8/10**

---

#### Stage 14: DataModelArchitecture (actually: Technical Architecture)

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|--------|--------|--------|-----------|-----------|
| Logic & Flow | 8 | 8 | 8 | **8** | Unanimous. Top-down technical decomposition is textbook correct. |
| Functionality | 8 | 8 | 8 | **8** | Unanimous. Defensive normalization, graceful fallback metrics, consistent layer rendering. |
| UI/Visual Design | 7 | 8 | 9 | **8** | The 5-layer architecture visualization with TBD ghosting is the standout visual element. Claude's 9 reflects the protocol-colored integration points. |
| UX/Workflow | 7 | 4 | 6 | **5** | Naming mismatch is mildest in the group (Data Model vs Technical Architecture — adjacent domain), but 4 local color maps and wrong-scope config description still hurt. |
| Architecture | 6 | 5 | 5 | **5** | Ground-truth correction: 4 local color maps (80 lines), ADVISORY_EXCLUDE pattern, brittle static LAYER_ORDER. OpenAI's 6 is slightly generous. |
| Accessibility | — | — | 3 | **3** | Zero aria-* attributes across 396 lines. Layer colors and protocol badges rely solely on color. |

**Stage 14 Average: 6.2/10**

---

#### Stage 15: EpicUserStoryBreakdown (actually: Risk Register)

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|--------|--------|--------|-----------|-----------|
| Logic & Flow | 7 | 8 | 9 | **8** | Defensive normalization, inline severity breakdown with division-by-zero protection, financial contract grounding. Claude's 9 reflects the robustness of the data handling. |
| Functionality | 7 | 9 | 8 | **8** | Severity visualization, mitigation/contingency panels, and financial contract all work correctly. Gemini's 9 is slightly generous for a stage with binary budget status. |
| UI/Visual Design | 7 | 9 | 8 | **8** | The severity breakdown bar chart is the strongest micro-visualization in Group 4. Gemini and Claude both highlight the mitigation/contingency color differentiation. |
| UX/Workflow | 6 | 4 | 4 | **4** | Ground-truth sides with Gemini/Claude. EpicUserStoryBreakdown rendering a Risk Register is a complete domain mismatch. Config description is entirely wrong. Gap Importance 5. |
| Architecture | 5 | 5 | 5 | **5** | Unanimous. SEVERITY_COLORS defined locally (shared version exists as SEVERITY_BANNER_COLORS in stage-primitives.ts). Inline currency formatting uses a third pattern distinct from both Stage 16 and the shared utility. |
| Accessibility | — | — | 3 | **3** | Zero aria-* attributes across 306 lines. Severity bar chart has no accessible labels; bars use only color. |

**Stage 15 Average: 6.0/10**

---

#### Stage 16: SchemaFirewall (actually: Financial Projections)

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|--------|--------|--------|-----------|-----------|
| Logic & Flow | 7 | 8 | 8 | **8** | Strong defensive normalization, maxVal clamped to 1, Infinity runway handled, case-insensitive gate matching. |
| Functionality | 7 | 8 | 8 | **8** | Monthly projections, cash balance timeline with zero-crossing, P&L summary, funding rounds — comprehensive financial narrative. |
| UI/Visual Design | 8 | 8 | 9 | **8** | The overlapping revenue/cost bars are the most visually sophisticated data visualization in Group 4. Cash balance zero-crossing color change is effective. |
| UX/Workflow | 5 | 3 | 3 | **3** | The "Schema Firewall Promotion Gate" banner text renders in user-visible UI on a financial projections screen. This is the single most trust-damaging defect in Group 4. All three AIs agree on maximum severity. |
| Architecture | 4 | 3 | 4 | **4** | Local formatCurrency duplicates the shared utility with different null behavior. Gate nomenclature entirely diverges from Stage 13. Config description is wrong. |
| Accessibility | — | — | 3 | **3** | Zero aria-* attributes across 377 lines. Revenue/cost bars have title attributes but no screen reader text. Cash balance negative indicator is color-only. |
| Gate Implementation | — | — | 5 | **5** | Functionally correct in isolation but uses entirely different vocabulary and constant names from Stage 13. User-visible label is wrong. |

**Stage 16 Average: 5.6/10**

---

### Group-Level Consensus Scores

| Dimension | OpenAI | Gemini | Claude | Consensus | Rationale |
|-----------|--------|--------|--------|-----------|-----------|
| Logic & Flow | 7 | 8 | 8 | **8** | The Roadmap-Architecture-Risks-Financials arc is the strongest narrative in the 25-stage workflow. Two correctly placed gates bookend the phase. |
| Functionality | 7 | 8 | 8 | **8** | All 4 stages render correctly, handle data defensively, compute fallbacks gracefully. No bugs. |
| UI/Visual Design | 7 | 8 | 8 | **8** | Excellent micro-visualizations (severity bars, overlapping revenue/cost bars, architecture layers). Uncommonly high visual quality given the architectural problems. |
| UX/Workflow | 5 | 3 | 4 | **4** | The defining problem of the group. 3 of 4 component names are completely unrelated to rendered content. Config descriptions wrong for 3 of 4. Stage 16 leaks wrong name into user-facing UI. |
| Architecture | 5 | 4 | 5 | **5** | Heavy duplication (ADVISORY_EXCLUDE x4, formatCurrency, local color maps), gate nomenclature fragmentation, no shared components used. |
| Accessibility | — | — | 3 | **3** | Zero aria-* attributes across 1,403 total lines. All color-coded indicators lack text alternatives. |

**Group 4 Weighted Average: 6.0/10**

> Phase 1 estimated Group 4 at 6.2/10. The Phase 2 deep dive reveals that accessibility (unscored in Phase 1) and the Stage 16 user-visible naming leak pull the average down slightly.

---

## Unanimous Findings (All 3 AIs Agree)

1. **Stage 16 "Schema Firewall Promotion Gate" renders in user-visible UI** — This is the most urgent single fix in Group 4. A non-technical stakeholder reviewing financial viability sees a database security label. Gap Importance 5.

2. **All 4 stages need file/component/config renames** — The phantom pivot left component shells with old names while content shifted to new domains. The backend files already use correct names (e.g., `stage-16-financial-projections.js`).

3. **The Blueprint narrative arc is excellent** — Roadmap (where are we going?) leads to Architecture (how do we build it?) leads to Risks (what could go wrong?) leads to Financials (can we afford it?). This is a textbook strategic planning sequence.

4. **Gate nomenclature must be unified** — Stage 13 and Stage 16 solve the same UI problem with different constant names and value vocabularies but identical CSS classes. A shared `<GateBanner>` component is the correct fix.

5. **formatCurrency must be consolidated** — A shared version exists in `stage-primitives.ts` but Stage 16 reimplements it locally with different null behavior. Stage 15 uses yet a third pattern (`$${value.toLocaleString()}`). Three currency formatting behaviors in 4 stages.

6. **Stage 16 belongs in THE_BLUEPRINT** — 2-to-1 consensus (OpenAI + Claude vs Gemini). Financial Projections depend on the roadmap, architecture, and risk data from Stages 13-15. Moving it to THE_ENGINE would decouple it from its planning context. The promotion gate correctly serves as the blueprint's capstone viability check.

---

## Key Disputes Resolved

| Dispute | Resolution | Basis |
|---------|-----------|-------|
| Stage 15 UX severity | **4/10** (Gemini/Claude win) | Naming mismatch is complete domain mismatch; config description entirely wrong |
| Stage 14 Architecture | **5/10** (Gemini/Claude win) | 4 local color maps + ADVISORY_EXCLUDE + brittle LAYER_ORDER |
| Stage 16 Gate score | **5/10** (Claude's dedicated dimension) | Works in isolation but fails architecturally; user-visible wrong label |
| Gate nomenclature severity | **Gap 4** (Gemini/Claude win) | Identical CSS proves these are the same component; OpenAI underweighted |
| Financial placement | **Stays in THE_BLUEPRINT** (OpenAI/Claude win) | Dependency on Stages 13-15 context; capstone gate logic |
| Accessibility severity | **3/10 group-wide** (Claude-only finding) | Zero aria-* in 1,403 lines; ground truth confirmed |

---

## Correct Stage Names (Consensus)

| Stage | Current Name | Consensus Name | Backend Already Uses |
|-------|-------------|---------------|---------------------|
| 13 | TechStackInterrogation | **ProductRoadmap** | stage-13-product-roadmap.js |
| 14 | DataModelArchitecture | **TechnicalArchitecture** | stage-14-technical-architecture.js |
| 15 | EpicUserStoryBreakdown | **RiskRegister** | stage-15-risk-register.js |
| 16 | SchemaFirewall | **FinancialProjections** | stage-16-financial-projections.js |

---

## Prioritized Action Items

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | Fix Stage 16 line 122: change `"Schema Firewall Promotion Gate"` to `"Financial Projections Promotion Gate"` | Eliminates user-visible trust defect | 1 line |
| **P1** | Rename all 4 component files, exports, venture-workflow.ts config entries (lines 172-210), and config descriptions | Eliminates the group's defining problem; aligns developer discovery with actual content | 4 file renames + 4 config updates |
| **P1** | Create shared `<GateBanner>` component; consolidate gate vocabularies into canonical `pass/conditional/fail` | Eliminates 2 duplicate gate implementations in Group 4 (+ 2 more in Stages 17, 24); prevents future nomenclature drift | ~100 LOC new component, ~200 LOC removed |
| **P2** | Delete Stage 16 local `formatCurrency`; import from `stage-primitives.ts`; update Stage 15 to use same utility; decide null-handling policy ($0 vs ---) | Consistent currency display across all stages | ~10 LOC per stage |
| **P2** | Migrate local color maps (PRIORITY_COLORS, SEVERITY_COLORS, LAYER_COLORS, PROTOCOL_COLORS, CONSTRAINT_COLORS) to shared constants | Removes ~80 lines of duplicated constants from Group 4 alone | Shared constants file + imports |
| **P2** | Extract ADVISORY_EXCLUDE filtering into shared utility | Deduplicate a pattern present in 22 stage renderers | ~30 LOC shared + 22 call-site updates |
| **P3** | Add empty/loading states to all 4 stages | Prevents blank renders when advisoryData is null | ~15 LOC per stage using existing StageEmptyState |
| **P3** | Accessibility pass: add aria-label to gate banners, role="img" aria-label to severity bars and revenue charts, sr-only text for color-only indicators | Lifts Accessibility from 3/10 to 6-7/10 | ~20 LOC per stage |
| **P3** | Add responsive breakpoints (sm:, lg:) beyond the single md:grid-cols-4 | Better use of screen real estate on mobile and wide screens | ~5-10 LOC per stage |

---

## Comparison to Phase 1 Estimates

| Dimension | Phase 1 Consensus | Phase 2 Consensus | Delta | Explanation |
|-----------|------------------|------------------|-------|-------------|
| Logic & Flow | 7 | **8** | +1 | Phase 2 deep dive confirms the narrative arc is stronger than Phase 1 estimated. |
| Functionality | 7 | **8** | +1 | All 4 stages work correctly with robust defensive data handling. No bugs found. |
| UI/Visual Design | 7 | **8** | +1 | The micro-visualizations (severity bars, revenue charts, architecture layers) are standout quality. |
| UX/Workflow | 5 | **4** | -1 | Phase 2 reveals the Stage 16 user-visible leak and confirms 3 of 4 config descriptions are wrong. |
| Architecture | 5 | **5** | 0 | Confirmed. Gate fragmentation, local color maps, format duplication, ADVISORY_EXCLUDE pattern. |
| Accessibility | (unscored) | **3** | N/A | New dimension from Phase 2 deep dive. |

**Phase 1 average: 6.2 | Phase 2 average: 6.0** — The slight decrease reflects the newly scored Accessibility dimension and the UX downgrade from the user-visible naming leak.

---

## Summary

Group 4 THE_BLUEPRINT has the strongest narrative arc in the 25-stage workflow and the best micro-visualizations, but suffers from the worst naming crisis. The content is excellent — the containers are mislabeled. The single most urgent fix is a one-line change at Stage 16 line 122 to stop showing "Schema Firewall" to users reviewing financial projections. The full rename of all 4 stages, unification of gate nomenclature, and consolidation of duplicated utilities will transform this group from a 6.0 to a projected 7.5+.
