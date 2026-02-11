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

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-02.js`
**Type**: Passive validation (NO analysisSteps)

**Schema**:
| Field | Type | Validation | Required | Derived |
|-------|------|------------|----------|---------|
| `critiques` | array | minItems: 1 | Yes | No |
| `critiques[].model` | string | minLength: 1 | Yes | No |
| `critiques[].summary` | string | minLength: 20 | Yes | No |
| `critiques[].strengths` | array of strings | minItems: 1 | Yes | No |
| `critiques[].risks` | array of strings | minItems: 1 | Yes | No |
| `critiques[].score` | integer | 0-100 | Yes | No |
| `compositeScore` | integer | 0-100 | -- | Yes (average of critique scores) |

**Processing**:
- `validate(data)`: Checks critiques array is non-empty, each critique has model, summary (>=20), strengths (>=1), risks (>=1), score (0-100)
- `computeDerived(data)`: Calculates `compositeScore = Math.round(sum / count)` -- simple average of all critique scores
- No `analysisSteps` defined -- template is purely passive
- **Does NOT generate critiques** -- expects them to already exist in the venture artifacts

**Critical observation**: The CLI Stage 2 template is a "dumb container." It validates and averages pre-existing critiques but has zero capability to generate AI analysis. The critiques must come from elsewhere (e.g., a DB `analysisStep` in `venture_stage_templates`, or manual insertion).

**Score scale**: 0-100 (integer)

**Orchestrator flow** (`eva-orchestrator.js` -> `processStage()`):
1. Load venture context
2. Load chairman preferences
3. Execute template analysisSteps (empty for Stage 2 in hardcoded template)
4. Merge artifact outputs (extracts cost, score, technologies, vendors, patterns)
5. Run stage gates (no kill gate at Stage 2)
6. Run Decision Filter Engine
7. Persist artifacts
8. Conditionally advance to Stage 3

**Note**: The `venture_stage_templates` DB table CAN override the local JS template and define `analysisSteps` that would generate critiques. But the base JS template has none.

### GUI Implementation (Ground Truth)

**Sources**: Playwright screenshots (stage-2 desktop views) + EHG frontend code (`src/components/stages/Stage2AIReview.tsx`, `src/hooks/useAIReviewService.ts`, `supabase/functions/ai-review/index.ts`)

**GUI Stage 2 -- "AI Review"** (active AI research):

**4-Agent Ensemble** (all use GPT-4 backend despite symbolic frontend labels):
| Agent ID | Display Name | Symbolic Model | Actual Model | Focus Area |
|----------|-------------|----------------|--------------|------------|
| LEAD | Strategic Lead | Gemini | GPT-4 | Market positioning, competitive landscape, strategic differentiation |
| PLAN | Tactical Planner | Cursor | GPT-4 | Resource requirements, timeline feasibility, technical complexity, risk factors |
| EXEC | Technical Executor | Claude | GPT-4 | Architecture requirements, development complexity, scalability, integration |
| EVA | Quality Orchestrator | GPT-4 | GPT-4 | Synthesizes all analyses, identifies opportunities and risks |

**Trigger mechanism**: Auto-triggers on component mount (`useEffect` -> `startReview()`). No button click required -- entering Stage 2 immediately starts AI analysis.

**Backend**: Supabase edge function `ai-review` invoked via `supabase.functions.invoke("ai-review", { body: {...} })`

**Output schema**:
| Field | Type | Scale | Description |
|-------|------|-------|-------------|
| `overallScore` | decimal | 0-10 | Average of 5 category scores |
| `categoryScores.quality` | decimal | 0-10 | Quality assessment |
| `categoryScores.viability` | decimal | 0-10 | Business viability |
| `categoryScores.originality` | decimal | 0-10 | Novelty/innovation |
| `categoryScores.market` | decimal | 0-10 | Market opportunity |
| `categoryScores.feasibility` | decimal | 0-10 | Execution feasibility |
| `recommendation` | enum | -- | advance / revise / reject / fast-track |
| `confidence` | decimal | 0-1 | Derived: `0.7 + (score/10) * 0.25`, max 0.95 |
| `agentAnalysis` | object | -- | 4 text summaries (one per agent) |
| `llmInsights.strengths` | array | -- | Max 3 strengths |
| `llmInsights.weaknesses` | array | -- | Max 3 weaknesses |
| `llmInsights.opportunities` | array | -- | Max 3 opportunities |
| `llmInsights.risks` | array | -- | Max 3 risks |
| `llmInsights.suggestions.immediate` | array | -- | Max 3 quick wins |
| `llmInsights.suggestions.strategic` | array | -- | Max 3 strategic actions |

**Recommendation thresholds** (hardcoded):
- >= 8.5 -> fast-track
- >= 7.0 -> advance
- >= 5.0 -> revise
- < 5.0 -> reject

**Chairman override**: Full support via `chairman_overrides` table. Can override any recommendation with rationale, optional voice note URL and transcript.

**Database tables**:
- Writes: `ai_reviews` (full result), `chairman_overrides` (optional)
- Reads: `user_company_access` (company scoping)

**Category score calculation**: Uses `min=4, max=10` range with randomization -- **not purely deterministic**.

**UI display**:
- Progress bar during processing
- Summary card with score/10 and color-coded recommendation badge
- 5 category score grid
- 3 tabs: Agent Analysis (accordion), AI Insights (SWOT cards), Next Steps (immediate + strategic)
- Button varies by recommendation: "Fast Track", "Continue", "Revise & Continue", "Not Recommended" (disabled)

### Triangulation

**Prompt**: `docs/plans/prompts/stage-02-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-02-claude.md`
- OpenAI: `docs/plans/responses/stage-02-openai.md`
- AntiGravity: `docs/plans/responses/stage-02-antigravity.md`

### Synthesis

#### Strong Consensus (All 3 Agree)

1. **CLI Stage 2 needs active analysis capability -- this is the #1 gap.** All three independently identified the passive container as the critical blocker. Without Stage 2 generating analysis, Stage 3's kill gate starts blind. Unanimous CLOSE verdict.

2. **Adopt 0-100 integer score scale.** All three reject the GUI's 0-10 decimal scale. Reasoning: matches Stage 3's expected input, avoids lossy conversion, provides better granularity. No dissent.

3. **Align Stage 2 categories directly to Stage 3's 6 kill gate metrics.** All three independently arrived at the same conclusion: replace the GUI's 5 generic categories (quality, viability, originality, market, feasibility) with Stage 3's 6 specific metrics (marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility). This transforms Stage 2 into a "pre-flight check" for Stage 3.

4. **ELIMINATE the GUI's recommendation logic (advance/revise/reject/fast-track).** All three agree the Decision Filter Engine is superior. Claude: "would duplicate existing infrastructure." OpenAI: "informational only, not required for deterministic gating." AntiGravity: "DFE is superior and centrally managed."

5. **ELIMINATE non-deterministic scoring.** All three reject the GUI's randomized category scores (min=4, max=10). The CLI should enforce deterministic computation. AntiGravity: "Randomness hurts regression testing and 'The Truth' phase reliability."

6. **Do NOT replicate the 4-agent ensemble.** All three agree the GUI's multi-agent architecture is unnecessary overhead. The 4 agents all use GPT-4 -- it's prompt engineering disguised as multi-agent. A single structured call achieves the same analytical coverage.

7. **Preserve Decision Filter Engine as the gating authority.** All three identify it as a CLI superiority over GUI's hardcoded thresholds. It supports chairman preferences, is configurable, and is centrally managed.

8. **Preserve Devil's Advocate as a separate adversarial layer.** All three agree the CLI's decoupled adversarial review is architecturally superior to the GUI's all-in-one approach.

#### Key Disagreements

| Topic | Claude | OpenAI | AntiGravity |
|-------|--------|--------|-------------|
| **Number of analysisSteps** | 3 steps (market_analysis, technical_feasibility, strategic_fit) | 1 step with structured sub-prompts + optional consistency check | 1 step with "MoA" multi-persona prompt |
| **Devil's Advocate at Stage 2** | **Yes** -- wire DA to challenge Stage 2 output (P1 priority) | **Conditional** -- only when confidence low or scores near thresholds | **No** -- rely on existing DA at Stage 3 gate; Stage 2 stays "optimistic/realistic" |
| **SWOT completeness** | ADAPT -- add weaknesses only (keep strengths/risks, skip opportunities) | **CLOSE** -- full SWOT + immediate/strategic actions needed for Stage 4 | ADAPT -- include suggestions but not full SWOT |
| **Chairman override at Stage 2** | ADAPT (wire existing Chairman Preference Store) | **ELIMINATE** at Stage 2 (Stage 3/5 gates enforce governance) | Not explicitly addressed |
| **Provenance tracking** | Not mentioned | **Yes** -- promptHash, modelVersion, temperature, seed for reproducibility | Not mentioned |
| **Schema structure** | Array of analyses (one per analysisStep), each with dimensionScores | Single flat schema with evidence packs, stage3MetricDraft, critiques array | Object with analysis (3 text fields), metrics (6 scores), suggestions array |
| **Recommendation field** | ELIMINATE entirely | ADAPT -- optional informational label | ELIMINATE (use DFE) |
| **inputContext block** | Not in schema (wired via Stage 0->1 pipeline) | **Yes** -- explicit ideaBriefRef, problemStatement, keyAssumptions, archetype | Not in schema |

#### Unique Contributions

**Claude found**:
- Detailed mapping of which analysisStep covers which Stage 3 metric (market_analysis -> marketFit/customerNeed/momentum; technical_feasibility -> executionFeasibility; strategic_fit -> revenuePotential/competitiveBarrier)
- LLM client factory integration point (`getLLMClient({ purpose: 'stage-analysis', phase: 'stage-02' })`) for routing through existing infrastructure
- Backward compatibility path: v1 `critiques` is a subset of v2 `analyses`, enabling migration without breaking existing data
- Confidence score is ELIMINATE -- it's a trivially derived metric (`0.7 + score * 0.0025`) with no independent signal

**OpenAI found**:
- **Provenance block** (`promptHash`, `modelVersion`, `temperature`, `seed`) -- critical for reproducibility and audit trail in "The Truth" phase. Neither Claude nor AntiGravity mentioned this.
- **Evidence packs** organized by domain (market, customer, competitive, execution) -- separates the raw evidence from the scores, making it easier for Stage 3 to validate
- **inputContext** as an explicit schema field -- captures what data from Stage 0/1 was used as input, creating a complete audit chain
- Optional "consistency check" second pass after initial analysis -- lightweight quality gate before Stage 3

**AntiGravity found**:
- **"MoA" (Mixture of Agents) pattern** -- single LLM call with explicit persona delineation in the system prompt. Most cost-effective way to maintain perspective diversity.
- **Stage 2 as "Pre-flight Check" framing** -- reframes Stage 2's purpose as hypothesis generation for Stage 3 validation, not independent judgment. This is the clearest articulation of the Stage 2->3 relationship.
- **`low_score` DFE trigger** -- specific integration point for wiring Stage 2 metrics into the Decision Filter Engine's existing trigger system
- **Explicit GUI-to-CLI category mapping** (Market->marketFit, Viability->revenuePotential, Originality->competitiveBarrier, Feasibility->executionFeasibility, Quality->momentum) -- most concrete mapping proposal

#### Resolved Recommendations (Post-Triangulation)

**Architecture**:
- Single LLM call with multi-persona prompt (AntiGravity's MoA pattern, endorsed by OpenAI's "single orchestration step"). Claude's 3-step approach is valid but over-engineers for Draft Idea level input.
- Devil's Advocate NOT at Stage 2 (AntiGravity's argument is most compelling: keep Stage 2 optimistic/realistic, DA provides pessimistic check at Stage 3).
- Decision Filter Engine remains the gating authority (unanimous).

**Schema** (merged best of all three):
1. `analysis` object with 3 text perspectives: strategic, technical, tactical (AntiGravity's structure)
2. `metrics` object with 6 Stage-3-aligned scores: marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility (unanimous)
3. `evidence` object organized by domain: market, customer, competitive, execution (OpenAI's contribution)
4. `suggestions` array with type (immediate/strategic) + text (AntiGravity's structure, OpenAI agrees)
5. `compositeScore` derived as average of 6 metrics (unanimous)
6. `provenance` block for reproducibility (OpenAI's contribution -- valuable for "The Truth" phase)
7. `inputContext` referencing Stage 0/1 data used (OpenAI's contribution)

**Implementation priority**:
1. Add single `analysisStep` to Stage 2 DB template with MoA multi-persona prompt
2. Update schema to produce 6 Stage-3-aligned metric scores (0-100 integer)
3. Add evidence packs organized by domain
4. Add provenance tracking for reproducibility
5. Wire metrics into Decision Filter Engine's `low_score` trigger
6. Wire Stage 0 -> Stage 1 -> Stage 2 context pipeline

**What to NOT build**:
- Multi-agent ensemble (unanimous: unnecessary overhead)
- Recommendation enum (unanimous: DFE handles this)
- Non-deterministic scoring (unanimous: enforce determinism)
- Confidence score (Claude: trivially derived, no signal)
- Chairman override at Stage 2 (OpenAI: rely on Stage 3/5 gates)

---

## Stage 3: Market Validation & RAT

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-03.js`
**Type**: Passive validation with **KILL GATE** (NO analysisSteps)

**Schema** (6 metrics + 4 derived fields):
| Field | Type | Range | Required | Derived |
|-------|------|-------|----------|---------|
| `marketFit` | integer | 0-100 | Yes | No |
| `customerNeed` | integer | 0-100 | Yes | No |
| `momentum` | integer | 0-100 | Yes | No |
| `revenuePotential` | integer | 0-100 | Yes | No |
| `competitiveBarrier` | integer | 0-100 | Yes | No |
| `executionFeasibility` | integer | 0-100 | Yes | No |
| `overallScore` | integer | 0-100 | -- | Yes (average of 6 metrics) |
| `decision` | enum | pass/kill | -- | Yes |
| `blockProgression` | boolean | -- | -- | Yes |
| `reasons` | array | -- | -- | Yes (kill gate violation details) |

**Kill Gate Logic** (`evaluateKillGate()` -- exported pure function):
- `overallScore < 70` -> KILL (overall below threshold)
- Any single metric `< 40` -> KILL (metric below per-metric threshold)
- Both conditions checked independently; either triggers kill
- Kill reasons are structured objects with type, metric, message, threshold, actual

**Processing**:
- `validate(data)`: Checks all 6 metrics are integers 0-100
- `computeDerived(data)`: Calculates `overallScore = Math.round(sum / 6)`, then runs `evaluateKillGate()`
- No `analysisSteps` -- template is purely passive
- **Does NOT generate metrics** -- expects them to already exist (same pattern as Stage 2)

**Score scale**: 0-100 (integer)

**Critical observation**: Like Stage 2, the CLI Stage 3 is a passive container. It validates and applies the kill gate formula but has zero capability to generate the 6 metric scores. The scores must come from somewhere upstream or from DB-defined `analysisSteps`.

**Orchestrator flow**:
1. Load venture context + chairman preferences
2. Execute analysisSteps (empty in hardcoded template)
3. Merge artifact outputs
4. **Run stage gates -- KILL GATE enforced here**
5. Run Decision Filter Engine
6. Persist artifacts
7. If decision=kill, block progression; if pass, advance to Stage 4

**Infrastructure at Stage 3 boundary**:
- Devil's Advocate runs at Stage 3 (one of the configured gate stages: 3, 5, 13, 23)
- Decision Filter Engine evaluates cost, tech, score, patterns, constraint drift
- Reality gates may apply

### GUI Implementation (Ground Truth)

**Sources**: EHG frontend code (`src/components/stages/Stage3ComprehensiveValidation.tsx` [legacy], `src/components/stages/v2/Stage03ComprehensiveValidation.tsx` [v2], `src/hooks/comprehensive_validation/service.ts`, edge function `comprehensive-validation`)

**Two parallel systems exist**:
1. **Legacy** (`Stage3ComprehensiveValidation.tsx`): Form-based input + AI scoring
2. **V2** (`Stage03ComprehensiveValidation.tsx`): Read-only metrics viewer (appears primary)

**GUI Stage 3 -- "Comprehensive Validation"** (hybrid: deterministic + AI):

**Input Form** (4 tabs):

| Tab | Fields | Defaults |
|-----|--------|----------|
| Market Analysis | TAM (USD, default $10M), Annual Growth Rate (%, default 15%), 3 Key Competitors (name/URL/positioning), Problem Clarity (derived from Stage 2) | -- |
| Technical Assessment | Complexity Points (0-100, default 40), Team Capability (0-2, default 1.5), Integration Risk (0-2, default 1), Target Stack (array, default: React/TS/Supabase) | -- |
| Financial Modeling | Monthly Price ($, default $99), Gross Margin (%, default 80%), CAC ($, default $250), LTV Months (default 24), LTV/CAC Min Ratio (default 3x) | -- |
| Customer Intelligence | Dynamically loaded from venture data | -- |

**Scoring approach -- Hybrid (30% deterministic + 70% GPT-4)**:

1. **Deterministic baseline (30% weight)**:
   - Market: TAM >= $1M (+3), Growth >= 5% (+2), Competitors <= 12 (+2), Problem Clarity 0-2 (+0-2) = 1-10 scale
   - Technical: Complexity <= 80pts (+3), Integration Risk <= 2 (+2), Team 0-2 (+0-2), Stack defined (+1) = 1-10 scale
   - Financial: GM >= 50% (+3), LTV/CAC >= 3 (+3), Payback <= 18mo (+2) = 1-10 scale

2. **AI enhancement (70% weight)**:
   - GPT-4 call with temperature 0.3 (low variance)
   - Returns enhanced scores (1-10), rationales, blockers, recommendations per dimension
   - Max tokens: 1500

3. **Fusion**: `final_score = (baseline * 0.30) + (ai_score * 0.70)`

**Output schema**:
| Field | Type | Scale | Description |
|-------|------|-------|-------------|
| `dimensions[].key` | enum | -- | market / technical / financial |
| `dimensions[].score` | number | 1-10 | Fused score |
| `dimensions[].pass` | boolean | -- | >= 6 threshold |
| `dimensions[].rationale` | string | -- | 2-4 sentence justification |
| `dimensions[].blockers` | array | -- | Max 5 blocking issues |
| `dimensions[].recommendations` | array | -- | Max 5 actionable items |
| `overall` | number | 1-10 | Average of 3 dimensions |
| `kpiThresholdsMet` | boolean | -- | All dimensions >= 6 |
| `decision` | enum | -- | advance / revise / reject |

**Kill gate logic (GUI)**:
- `overall >= 7 AND each dimension >= 6` -> advance
- `overall >= 5 but failed dimension threshold` -> revise
- `overall < 5` -> reject
- Chairman can override any decision with rationale + voice notes

**Stage 2 consumption**: Weak -- only `problemClarity = Math.min(2, reviewData.overallScore / 5)`. No direct Stage 2 data object passed.

**Score scale**: 1-10 per dimension, 0-100% for display

**Database tables**:
- Writes: `validations` (main results), `validation_reports` (enhanced framework), `chairman_overrides` (optional)
- Reads: `user_company_access`, venture data

### Triangulation

**Prompt**: `docs/plans/prompts/stage-03-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-03-claude.md`
- OpenAI: `docs/plans/responses/stage-03-openai.md`
- AntiGravity: `docs/plans/responses/stage-03-antigravity.md`

### Synthesis

*Pending external AI responses*

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
