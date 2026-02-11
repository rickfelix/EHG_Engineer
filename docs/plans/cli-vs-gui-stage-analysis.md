# CLI vs GUI Stage-by-Stage Gap Analysis

> **Purpose**: Compare the GUI venture workflow (EHG frontend) against the CLI venture workflow (EHG_Engineer EVA orchestrator) for each of the 25 lifecycle stages. Identify gaps, CLI superiorities, and minimum viable changes to make the CLI the authoritative engine (replacing the GUI).
>
> **Method**: Ground-truth analysis (actual code and screenshots, NOT vision docs) + multi-AI triangulation (OpenAI, AntiGravity/Gemini, Claude).
>
> **Started**: 2026-02-11
> **Branch**: main

---

## Stage 1: Draft Idea

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-01.js`
**Type**: Passive validation (NO analysisSteps)

**Schema** (3 fields):
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `description` | string | minLength: 50 | Yes |
| `valueProp` | string | minLength: 20 | Yes |
| `targetMarket` | string | minLength: 10 | Yes |

**Processing**:
- `validate(data)`: Checks 3 fields meet minimum length constraints
- `computeDerived(data)`: No-op (returns data unchanged)
- No `analysisSteps` defined — template is purely passive
- Produces `idea_brief` artifact in `venture_artifacts` table

**Orchestrator flow** (`eva-orchestrator.js` → `processStage()`):
1. Load venture context from `ventures` table
2. Load chairman preferences
3. Execute template analysisSteps (empty for Stage 1)
4. Run stage gates (no kill gate at Stage 1)
5. Run reality gates (none at 1→2 boundary)
6. Run Devil's Advocate review (if configured)
7. Run Decision Filter Engine (cost, tech, score, patterns)
8. Persist artifacts
9. Conditionally advance to Stage 2

**Input source**: `venture_briefs` table from Stage 0 (Intelligent Venture Entry Engine)

**CLI Stage 0** (`lib/eva/stage-zero/`) provides rich upstream data:
- 3 entry paths: Competitor Teardown, Blueprint Browse, Discovery Mode
- 8 synthesis modules: problem-reframing, moat-architecture, archetypes, build-cost-estimation, time-horizon, chairman-constraints, cross-reference, portfolio-evaluation
- Additional: Counterfactual Engine, Stage-of-Death Predictor, Venture Nursery, Portfolio Allocation, Sensitivity Analysis

### GUI Implementation (Ground Truth)

**Sources**: Playwright screenshots (`stage-0-choose-path-desktop.png`, `stage-1-idea-form-desktop.png`, `workflow-stage-1-draft-idea-desktop.png`) + EHG frontend code (`src/components/stages/v2/Stage01DraftIdea.tsx`)

**GUI Stage 0 — "Choose Path"** (wizard step 0):
- 3 entry paths: Manual Idea Entry, Competitor-Based Cloning, Browse Blueprint Ideas
- Simple path selection UI — no synthesis, no analysis

**GUI Stage 1 — "Draft Your Venture Idea"** (wizard step 1):

| Field | Type | Validation | Required | CLI Equivalent |
|-------|------|------------|----------|----------------|
| Venture Name | text input | Required | Yes | None |
| Company | dropdown | Required | Yes | None |
| Description | textarea (2000 char limit) | ≥50 chars | Yes | `description` |
| Problem Statement | textarea | None | No | None |
| Target Market | text input | None | No | `targetMarket` |
| Category | dropdown | None | No | None |
| Key Assumptions | textarea (one per line) | None | No | None |
| Tags | tag input | ≥1 tag | Yes | None |
| Strategic Focus Areas | multi-select (8 options) | ≥1 | Yes | None |
| Venture Archetype | dropdown | None | No (optional) | None |
| Success Criteria | accordion | None | No (optional) | None |

**GUI-only capabilities**:
- "Enhance with AI" button — AI enrichment of the idea text
- "Start from AI-generated opportunities" — browse pre-generated venture ideas
- "Browse Opportunities" link
- Idea Completeness percentage indicator
- Real-time character counting with visual feedback
- Change detection (save button disabled until data changes)
- Multi-step wizard flow: Choose Path → Idea → Research → Review & Create
- "Save Draft" + "Next: Start Research" buttons

**Frontend architecture**: React + ShadcN UI, React Query for async state, `useVenture()` / `useUpdateVenture()` hooks, Supabase direct mutations.

### Triangulation

**Prompt**: `docs/plans/prompts/stage-01-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-01-claude.md`
- OpenAI: `docs/plans/responses/stage-01-openai.md`
- AntiGravity: `docs/plans/responses/stage-01-antigravity.md`

### Synthesis

#### Strong Consensus (All 3 Agree)

1. **Add `problemStatement` as a required field** — All three independently identified this as the highest-priority gap. Direct downstream impact on Stage 3's `customerNeed` metric. Unanimous CLOSE verdict.
2. **Add `keyAssumptions` as an array field** — All three agree assumptions are critical for Stage 3/5 validation. Claude and OpenAI say optional; AntiGravity says optional. Consensus: add as recommended but not required.
3. **Wire Stage 0 output into Stage 1** — All three identified the Stage 0 → Stage 1 data pipeline gap as the critical internal issue. Rich synthesis output exists but is not consumed.
4. **ELIMINATE Tags, Completeness indicator, wizard UX** — All three agree these are GUI-specific UX concerns with no analytical impact on downstream stages.
5. **CLI Stage 0 is far superior to GUI's path selection** — Unanimous. All three identify the synthesis pipeline, deterministic governance, and adversarial review as CLI strengths to preserve.
6. **Keep `valueProp` (CLI has it, GUI doesn't)** — OpenAI explicitly says "do not replace valueProp with problemStatement — keep both." Claude noted this as a GUI gap. AntiGravity includes both in recommended schema.
7. **"Enhance with AI" is covered by Stage 0** — All three agree the GUI's AI enrichment button is functionally redundant given the CLI's Stage 0 synthesis. Claude: ADAPT (wire Stage 0 rather than add new step). OpenAI: ADAPT (optional refinement). AntiGravity: ADAPT (Stage 0 IS the enhancement step).

#### Key Disagreements

| Topic | Claude | OpenAI | AntiGravity |
|-------|--------|--------|-------------|
| **Archetype field required?** | No (optional, from Stage 0) | No (optional enum, hydrated) | **Yes (required enum)** — argues archetypes drive Stage 3 scoring weights |
| **`name` field in Stage 1?** | Not mentioned | Not mentioned | **Yes (required, minLength: 5)** — includes it in recommended schema |
| **Category/Strategic Focus** | ADAPT (P2) | ADAPT (optional enums) | **ELIMINATE** — says derive later, not needed for individual validation |
| **Success Criteria** | ADAPT (P2, optional) | Included in recommended set | Not mentioned |
| **Provenance tracking** | Not mentioned | **Yes** — track `source: stage0|user` per field | Not mentioned |
| **Derived readiness signals** | Not mentioned | **Yes** — `assumption_count`, `problem-solution coherence score` | Not mentioned |

#### Unique Contributions

**Claude found**:
- Detailed mapping of each gap to specific downstream stage consumers (e.g., assumptions → Stage 5 kill gate hypotheses, successCriteria → Stage 23 Growth Gate)
- Company association is a ventures table concern, not a Stage 1 template concern

**OpenAI found**:
- **Provenance tracking** (`source: stage0|user`) — track whether each field was auto-hydrated or human-edited, enabling drift detection downstream
- **Derived readiness signals** — compute `assumption_count` and `problem-solution coherence score` in Stage 1's `computeDerived()` to support Stage 3 prep
- **`lastRefinedBy` metadata** — track whether stage0, user, or ai_refine last touched each field
- "Stage 1 should be the first human-editable checkpoint, not a re-entry form" — framing insight

**AntiGravity found**:
- **Archetype should be required** — argues different archetypes need different Stage 3 scoring weights (e.g., Deep Tech needs higher `executionFeasibility` than SaaS). This is a novel architectural insight.
- **3-year P&L forecast from Stage 0** should be carried forward — specific mention of financial forecasting capability that Claude and OpenAI didn't highlight
- **Specific field mapping from Stage 0 synthesis**: `description` <- `synthesis.problem_reframing.recommended_framing.framing` + `pathOutput.suggested_solution` — most concrete wiring proposal
- **`hydrateFromStage0(brief)` utility function** — suggested implementation pattern

#### Resolved Recommendations (Post-Triangulation)

**Required fields for CLI Stage 1 v2**:
1. `description` (existing, ≥50 chars)
2. `problemStatement` (new, ≥20 chars) — unanimous
3. `valueProp` (existing, ≥20 chars)
4. `targetMarket` (existing, ≥10 chars)
5. `archetype` (new, enum, hydrated from Stage 0) — AntiGravity's argument for required is compelling given Stage 3 scoring weight differentiation

**Recommended optional fields**:
6. `keyAssumptions` (array of strings) — unanimous
7. `moatStrategy` (string, from Stage 0)
8. `successCriteria` (array, for Stage 23)

**System metadata** (per OpenAI's provenance recommendation):
9. `sourceProvenance` (per-field source: stage0 | user | ai_refine)

**Implementation priority**:
1. Wire Stage 0 → Stage 1 hydration (all 3 agree this is the critical fix)
2. Add `problemStatement` required field
3. Add `archetype` required field (hydrated from Stage 0)
4. Add `keyAssumptions` optional field
5. Add provenance tracking
6. Carry forward Stage 0 metadata (moat, buildEstimate) as artifact data

---

## Stage 2: AI Review

*Analysis pending*

---

## Stage 3: Market Validation & RAT

*Analysis pending*

---

## Stage 4: Competitive Intel

*Analysis pending*

---

## Stage 5: Kill Gate Decision

*Analysis pending*

---

## Stage 6: Business Model Canvas

*Analysis pending*

---

## Stage 7: Revenue Architecture

*Analysis pending*

---

## Stage 8: Technology Blueprint

*Analysis pending*

---

## Stage 9: Brand Genome

*Analysis pending*

---

## Stage 10: Technical Review

*Analysis pending*

---

## Stage 11: Strategic Naming

*Analysis pending*

---

## Stage 12: Adaptive Naming

*Analysis pending*

---

## Stage 13: Exit Design

*Analysis pending*

---

## Stage 14: Dev Preparation

*Analysis pending*

---

## Stage 15: Pricing Strategy

*Analysis pending*

---

## Stage 16: AI CEO Agent

*Analysis pending*

---

## Stage 17: GTM Strategy

*Analysis pending*

---

## Stage 18: Documentation

*Analysis pending*

---

## Stage 19: Integration

*Analysis pending*

---

## Stage 20: Quality Assurance

*Analysis pending*

---

## Stage 21: Launch Preparation

*Analysis pending*

---

## Stage 22: Market Entry

*Analysis pending*

---

## Stage 23: Growth Gate

*Analysis pending*

---

## Stage 24: Scale Operations

*Analysis pending*

---

## Stage 25: Portfolio Review

*Analysis pending*
