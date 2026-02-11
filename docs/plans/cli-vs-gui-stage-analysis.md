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

### Gap Analysis

#### Gaps: GUI has, CLI lacks

| ID | Gap | GUI Capability | Impact | Priority |
|----|-----|---------------|--------|----------|
| G1.1 | Problem Statement field | Separate textarea for problem statement (distinct from description) | Medium — enriches downstream analysis with explicit pain point | P2 |
| G1.2 | Category classification | Dropdown to categorize the venture | Medium — enables portfolio-level analytics and filtering | P2 |
| G1.3 | Key Assumptions capture | Textarea for listing assumptions (one per line) | High — assumptions are critical for later validation stages (3, 5) | P1 |
| G1.4 | Tags system | Required tag input for categorization | Low — organizational, not analytical | P3 |
| G1.5 | Strategic Focus Areas | Multi-select from 8 strategic themes | Medium — informs strategic alignment scoring | P2 |
| G1.6 | Venture Archetype | Optional dropdown for archetype selection | Low — CLI Stage 0 already has archetype detection via `archetype-profile-matrix.js` | P3 |
| G1.7 | Success Criteria | Optional free-form success criteria | Medium — provides measurable targets for later stages | P2 |
| G1.8 | AI Enrichment | "Enhance with AI" button to improve idea description | High — the GUI's main value-add over manual entry | P1 |
| G1.9 | AI Opportunities browsing | Browse pre-generated venture ideas | Low — CLI Stage 0 Discovery Mode serves same purpose | P3 |
| G1.10 | Company association | Link venture to a company entity | Medium — required for multi-company portfolios | P2 |
| G1.11 | Idea Completeness indicator | Visual percentage of form completion | Low — UX nicety, not functional | P3 |
| G1.12 | valueProp field missing from GUI | GUI has no explicit "value proposition" field (uses Description + Problem Statement instead) | Note — this is a GUI gap, not a CLI gap | N/A |

#### CLI Superiorities (CLI has, GUI lacks)

| ID | Capability | CLI Implementation | Impact |
|----|-----------|-------------------|--------|
| C1.1 | Stage 0 Synthesis Pipeline | 8 modules: problem-reframing, moat-architecture, archetypes, build-cost, time-horizon, chairman-constraints, cross-reference, portfolio-evaluation | Critical — CLI produces far richer pre-analysis than GUI's simple path selection |
| C1.2 | Counterfactual Engine | `counterfactual-engine.js` — what-if analysis on venture parameters | High — no GUI equivalent |
| C1.3 | Stage-of-Death Predictor | `stage-of-death-predictor.js` — mortality curve prediction | High — no GUI equivalent |
| C1.4 | Venture Nursery | `venture-nursery.js` — park/reactivate/feedback tracking | Medium — no GUI equivalent |
| C1.5 | Portfolio Allocation | `portfolio-allocation.js` — portfolio-level venture allocation | Medium — no GUI equivalent |
| C1.6 | Sensitivity Analysis | `sensitivity-analysis.js` — parameter sensitivity testing | Medium — no GUI equivalent |
| C1.7 | Decision Filter Engine | Deterministic risk evaluation with chairman preferences | High — GUI has no comparable gating mechanism at Stage 1 |
| C1.8 | Devil's Advocate | GPT-4o adversarial review | High — no GUI equivalent |
| C1.9 | Idempotent artifact persistence | Dedup via idempotency keys | Medium — prevents duplicate data |
| C1.10 | Gate infrastructure | Stage gates + reality gates at every boundary | High — CLI has fail-closed enforcement |

#### Critical Finding: Stage 0 → Stage 1 Data Pipeline Gap

**The CLI's Stage 0 produces a rich `venture_brief`** with fields like:
- `problem_statement`, `solution`, `target_market`, `archetype`, `moat_strategy`, `build_estimate`

**But Stage 1's template only consumes 3 fields**: `description`, `valueProp`, `targetMarket`

Much of Stage 0's output (assumptions, archetype, moat strategy, build estimate, problem reframing) is **available but not consumed** by Stage 1. This represents a wiring gap internal to the CLI itself.

#### Observations

1. **The CLI is front-loaded, the GUI is form-loaded**: CLI puts its sophistication in Stage 0 (synthesis pipeline). GUI puts sophistication in the Stage 1 form (more fields, AI enrichment). Both capture similar information but through different architectural patterns.

2. **The GUI's "Enhance with AI" is the key differentiator**: The CLI has no equivalent in Stage 1. However, the CLI's Stage 0 Discovery Mode and Competitor Teardown paths arguably provide more thorough AI analysis upstream.

3. **The GUI's wizard flow (0→1→2→3) compresses what the CLI separates**: GUI bundles path selection, idea entry, AI research, and review into a 4-step wizard. CLI separates these into Stage 0 (entry), Stage 1 (idea), Stage 2 (AI review) as distinct lifecycle stages. The CLI approach is more modular but less guided for novice users.

4. **Screenshot anomaly**: The workflow screenshot says "Stage 1 of 40" but there are only 25 stage templates. The GUI may reference an older 40-stage design that was consolidated to 25.

### Minimum Viable Change (MVC)

To close the critical gaps while preserving CLI superiorities:

1. **Extend Stage 1 schema** to consume Stage 0 output: Add `problemStatement`, `assumptions`, `strategicFocusAreas`, `category` fields that map from `venture_briefs` data. This wires the existing Stage 0 output into Stage 1 validation.

2. **Add `analysisSteps` to Stage 1 DB template** that:
   - Load `venture_briefs` data for this venture
   - Auto-populate Stage 1 fields from Stage 0 synthesis output
   - Optionally run AI enrichment (equivalent to GUI's "Enhance with AI")
   - Compute an idea completeness score

3. **Keep all existing enforcement**: Decision Filter Engine, Devil's Advocate, chairman preferences, gate infrastructure.

4. **Do NOT replicate GUI form UX**: The CLI doesn't need a multi-field form. It needs the data pipeline to flow from Stage 0 → Stage 1 → Stage 2 with all relevant fields carried forward.

### Triangulation Status

- [ ] Claude analysis complete (this section)
- [ ] Triangulation prompt generated (see below)
- [ ] OpenAI response received
- [ ] AntiGravity response received
- [ ] Synthesis written

---

## Triangulation Prompt — Stage 1: Draft Idea

```markdown
# EVA Venture Lifecycle — Stage 1 "Draft Idea" — CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing relative to the GUI, what the CLI does better, and what minimum changes would make the CLI self-sufficient.

This is Stage 1 of a 25-stage venture lifecycle. The stages are grouped into phases:
- **Stages 1-5**: THE TRUTH (Foundation/Validation)
- **Stages 6-10**: BLUEPRINT (Planning/Design)
- **Stages 11-15**: BUILD (Development)
- **Stages 16-20**: LAUNCH
- **Stages 21-25**: GROWTH

## Pipeline Context

**What comes BEFORE Stage 1** — Stage 0 (Intelligent Venture Entry Engine):
- CLI: Rich synthesis pipeline with 8 modules (problem-reframing, moat-architecture, archetypes, build-cost-estimation, time-horizon, chairman-constraints, cross-reference, portfolio-evaluation). Also has: Counterfactual Engine, Stage-of-Death Predictor, Venture Nursery. Produces a structured `venture_brief` with: problem_statement, solution, target_market, archetype, moat_strategy, build_estimate.
- GUI: Simple 3-path selection UI (Manual Entry, Competitor Cloning, Browse Blueprints). No synthesis or analysis at this step.

**What comes AFTER Stage 1** — Stage 2 (AI Review):
- Expects: An array of AI critiques, each with model name, summary, strengths, risks, and a score (0-100). Computes composite score as average.
- Stage 2 does NOT directly consume Stage 1 fields — it adds AI analysis ON TOP of whatever the venture idea contains.

**What Stage 3 (Market Validation & RAT) needs from earlier stages**:
- 6 validation metrics: marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility (each 0-100)
- Kill gate: overall < 70 OR any metric < 40 → KILL the venture
- Stage 3 needs structured market/customer/competitive data that must originate in Stages 1-2

## CLI Stage 1 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-01.js` — Passive validation only

**Schema** (3 fields):
- `description` (string, minLength: 50, required)
- `valueProp` (string, minLength: 20, required)
- `targetMarket` (string, minLength: 10, required)

**Processing**:
- `validate(data)` — checks 3 fields exist and meet minimum lengths
- `computeDerived(data)` — no-op (returns data unchanged)
- NO `analysisSteps` — template is purely passive
- Produces `idea_brief` artifact

**Infrastructure** (applied to all stages including Stage 1):
- Decision Filter Engine: deterministic risk evaluation (cost, tech, score, patterns, constraint drift)
- Devil's Advocate: GPT-4o adversarial review
- Chairman Preference Store: per-chairman, per-venture thresholds
- Stage gates + reality gates
- Idempotent artifact persistence

**Known issue**: Stage 0 produces a rich `venture_brief` (problem_statement, archetype, moat_strategy, build_estimate, etc.) but Stage 1 only consumes 3 fields. Much of Stage 0's output is available but NOT wired into Stage 1.

## GUI Stage 1 Implementation (Ground Truth)

**Component**: `src/components/stages/v2/Stage01DraftIdea.tsx`

**Form fields** (~12 fields vs CLI's 3):
1. Venture Name (text, required)
2. Company (dropdown, required)
3. Description (textarea, 2000 char limit, ≥50 chars required)
4. Problem Statement (textarea, optional)
5. Target Market (text, optional)
6. Category (dropdown, optional)
7. Key Assumptions (textarea, one per line, optional)
8. Tags (tag input, ≥1 required)
9. Strategic Focus Areas (multi-select from 8 themes, ≥1 required)
10. Venture Archetype (dropdown, optional)
11. Success Criteria (accordion, optional)

**GUI-only capabilities**:
- "Enhance with AI" button — AI enrichment of the idea description
- "Start from AI-generated opportunities" — browse pre-generated venture ideas
- Idea Completeness percentage indicator
- Real-time character counting
- Change detection (tracks if user modified data before allowing save)
- Multi-step wizard: Choose Path → Idea → Research → Review & Create
- "Save Draft" intermediate save

**Note**: The GUI does NOT have a `valueProp` field. It uses Description + Problem Statement to capture value proposition implicitly.

## Your Task

Analyze the gap between CLI and GUI for Stage 1, considering:

1. **Gap identification**: What does the GUI capture that the CLI doesn't? For each gap, assess whether it matters for downstream stages (2-5 especially, since Stage 3 is a kill gate).

2. **CLI superiority assessment**: What does the CLI do better? The CLI's Stage 0 is far more sophisticated than the GUI's path selection. How should this factor into the analysis?

3. **Data pipeline analysis**: The CLI has a Stage 0 → Stage 1 gap where rich synthesis output isn't consumed. How critical is this? What's the right way to wire it?

4. **"Enhance with AI" equivalent**: The GUI's main differentiator is AI enrichment of the idea. Should the CLI add this as an analysisStep, or does Stage 0's synthesis pipeline already cover this?

5. **Field mapping**: The CLI has `valueProp` but the GUI doesn't. The GUI has `Problem Statement` but the CLI doesn't. What's the right field set for a CLI-native Stage 1 that serves downstream stages well?

6. **Minimum viable change**: What's the smallest set of changes to make the CLI's Stage 1 self-sufficient (no GUI dependency) while preserving its architectural advantages?

## Output Format

Please structure your response as:

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Downstream Impact (Stages 2-5) | Verdict (CLOSE / ADAPT / ELIMINATE) |

### 2. CLI Superiorities (preserve these)
- List with brief justification

### 3. Stage 0 → Stage 1 Pipeline Recommendation
- How to wire the existing synthesis output into Stage 1

### 4. Recommended Field Set
- The ideal Stage 1 schema for a CLI-native workflow

### 5. Minimum Viable Change
- Specific, actionable changes ranked by priority

### 6. Cross-Stage Impact
- How these changes affect Stages 2-5 (especially the Stage 3 kill gate)
```

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
