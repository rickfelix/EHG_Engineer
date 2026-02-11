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

#### Strong Consensus (All 3 Agree)

1. **CLI Stage 3 needs active metric generation -- Importance 5/5 (Critical).** All three rate this as the #1 gap. Without scores, the kill gate is dead code. No existing infrastructure (DA, DFE) substitutes for primary score generation. Unanimous CLOSE.

2. **Keep CLI's 6-metric structure -- superior to GUI's 3 dimensions.** All three independently conclude the 6-metric model catches failure modes that 3 dimensions average away. AntiGravity: "GUI's 'Technical' lumps Complexity (bad) with Team Capability (good)." OpenAI adds 3 rollups for readability without replacing 6-metric gating.

3. **Hybrid scoring approach with deterministic baseline.** All three agree on a deterministic + AI fusion model. The deterministic component provides reproducibility; the AI component adds nuance. AntiGravity: "Deterministic anchors prevent AI yes-man syndrome."

4. **Devil's Advocate stays separate -- challenger, not scorer.** All three agree DA should challenge the fused result, not participate in score generation. AntiGravity's framing is clearest: "Propose -> Challenge dynamic." Claude: DA at gate boundary is architecturally superior.

5. **Hard kill gate enforcement is superior to GUI's soft gate.** All three prefer `blockProgression=true`. Claude: "fail-closed default." AntiGravity: "Hard gate is better for autonomous pipelines." OpenAI: "Keep hard block behavior for Truth phase integrity."

6. **0-100 integer scale (consistent with Stage 2 consensus).** No dissent. Stage 2 -> Stage 3 pipeline requires consistent scale.

7. **Stage 2 -> Stage 3 formal artifact contract.** All three agree Stage 2 should emit a structured artifact (6 aligned scores + evidence) that Stage 3 consumes and validates. OpenAI and AntiGravity both specify: flag divergences > 20 points between Stage 2 preliminary and Stage 3 validated scores for adversarial review.

8. **Raise per-metric kill threshold from 40.** All three agree 40 is too permissive for "The Truth" phase. (Specific threshold differs -- see disagreements.)

#### Key Disagreements

| Topic | Claude | OpenAI | AntiGravity |
|-------|--------|--------|-------------|
| **Deterministic/AI weight** | 60% deterministic / 40% DA | 60% deterministic / 40% AI | **30% deterministic / 70% AI** (matches GUI) |
| **Per-metric kill threshold** | Keep 40, maybe raise to 50 | **Raise to 50** | **Raise to 60** (matches GUI's 6/10) |
| **Market data source** | Wire Stage 0 synthesis (no forms, no new services) | **3 sources**: Stage 0 + Stage 2 evidence + Stage 3 questionnaire step | **MarketAssumptions Service** (search agent fills `market_assumptions.json`) |
| **Competitor extraction** | Not emphasized (deferred to Stage 4) | **CLOSE** (importance 4) -- Stage 4 needs structured intel from Stage 3 | **CLOSE** (importance 4) -- Stage 3 MUST output competitor entities |
| **3-dimension rollups** | Not mentioned | **Yes** -- add 3 rollups (Market, Technical, Financial) for readability | Not explicitly proposed, but maps GUI 3 dimensions -> CLI 6 metrics |
| **Confidence scores** | ELIMINATE (trivially derived) | **CLOSE** (importance 3) -- false precision can trigger bad kills | Not addressed |
| **"Revise" outcome** | Add via DFE (score 50-70) | Add as "conditional hold" if confidence low | Not proposed (prefers raising floor instead) |
| **AI adjustment bounds** | Not specified | **Max +/-15 per metric** cap on AI adjustments | Not specified |

#### Unique Contributions

**Claude found**:
- Detailed Stage 0 data point mapping (TAM from `market-sizing`, growth from `time-horizon`, complexity from `build-cost-estimation`) -- most concrete "wire existing data" proposal
- Chairman Preference Store is PROACTIVE governance (adjusts thresholds before scoring) vs GUI's REACTIVE override (after gate). Proactive is architecturally superior.
- "Revise" path via DFE for ventures scoring 50-70 reduces false kills without lowering quality bar
- Financial modeling at Stage 3 is premature -- Stage 7 (Revenue Architecture) does the real financial work

**OpenAI found**:
- **3 rollup dimensions** (Market, Technical, Financial) computed FROM the 6 metrics -- best of both worlds for gating precision + governance readability
- **Bounded AI adjustments** (max +/-15 per metric) -- prevents AI from overriding deterministic baseline by too much
- **Evidence completeness check** -- if < 80% of required fields present, block as "insufficient evidence" before scoring
- **Confidence per metric** -- explicit confidence scores prevent false precision in kill decisions
- **Formal Stage 2->3 schema contract** with delta checks and divergence flagging

**AntiGravity found**:
- **"Assumption Brief" pattern** -- generate `market_assumptions.json` template pre-filled with defaults/inferences, allow chairman review, then execute. Elegant solution for CLI data acquisition.
- **MarketAssumptions Service** with search agent -- fully autonomous alternative to forms. "Use Search Agent to fill 'The Truth' data."
- **Explicit input-to-metric mapping**: TAM+Growth -> marketFit, Pain+Clarity -> customerNeed, Price+Margin+CAC+LTV -> revenuePotential, Competitors+Differentiation -> competitiveBarrier, Complexity+Team+Stack -> executionFeasibility. Most concrete derivation rules.
- **Structured competitor output** for Stage 4 -- Stage 3 MUST produce competitor entities (not just abstract score) because Stage 4 is passive and needs entities to analyze.

#### Resolved Recommendations (Post-Triangulation)

**Metric structure**: Keep 6 metrics as canonical gate inputs (unanimous). Add 3 rollup dimensions for readability (OpenAI's contribution).

**Score generation**: Deterministic-first hybrid. Weight: **50% deterministic / 50% AI** (compromise between Claude/OpenAI's 60/40 and AntiGravity's 30/70). Cap AI adjustments at +/-15 per metric (OpenAI's bound). DA challenges fused result separately.

**Per-metric threshold**: **Raise to 50** (compromise between Claude's 40-50, OpenAI's 50, AntiGravity's 60). 40 is too permissive; 60 may be too aggressive without data to calibrate. 50 provides meaningful floor while allowing tuning from real venture data.

**Market data acquisition**: Layered approach:
1. Stage 0 synthesis (seed data -- Claude's mapping)
2. Stage 2 evidence pack (pre-flight signals)
3. MarketAssumptions Service for gaps (AntiGravity's search agent pattern)
4. Completeness check before scoring (OpenAI's 80% threshold)

**Competitor extraction**: Stage 3 MUST output structured competitor entities (name, positioning, threat level) for Stage 4 consumption (OpenAI + AntiGravity agree, importance 4). This is a new addition to the Stage 3 schema.

**Kill gate formula**:
- **Kill**: `overallScore < 70 OR any metric < 50`
- **Revise** (new): `overallScore >= 50 AND < 70 AND no metric < 50` -- routes back for Stage 2 re-analysis
- **Pass**: `overallScore >= 70 AND all metrics >= 50`
- Hard block enforcement preserved (`blockProgression=true`)

**Implementation priority**:
1. Add `analysisStep` to Stage 3 that loads Stage 2 artifact + Stage 0 data and generates 6 metric scores
2. Define formal Stage 2->3 artifact schema contract (scores, evidence, confidence, assumptions)
3. Implement deterministic scorer with AntiGravity's input-to-metric mapping rules
4. Add AI calibration step with +/-15 bounded adjustments
5. Add MarketAssumptions Service for autonomous data acquisition
6. Add structured competitor extraction to Stage 3 output (for Stage 4)
7. Raise per-metric threshold from 40 to 50
8. Add "revise" outcome path via DFE
9. Add 3 rollup dimensions for governance readability
10. Add confidence scores and evidence completeness checks

**What to NOT build**:
- Market data input forms (use pipeline data + search agent instead)
- Chairman override at Stage 3 (CLI's proactive governance is superior)
- Per-dimension rationales/recommendations (UX concerns for GUI dashboard)

---

## Stage 4: Competitive Intel

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-04.js`
**Type**: Passive validation (NO analysisSteps)

**Schema**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `competitors` | array | minItems: 1 | Yes |
| `competitors[].name` | string | minLength: 1, unique (case-insensitive) | Yes |
| `competitors[].position` | string | minLength: 1 | Yes |
| `competitors[].threat` | enum | H / M / L | Yes |
| `competitors[].strengths` | array of strings | minItems: 1 | Yes |
| `competitors[].weaknesses` | array of strings | minItems: 1 | Yes |
| `competitors[].swot.strengths` | array of strings | minItems: 1 | Yes |
| `competitors[].swot.weaknesses` | array of strings | minItems: 1 | Yes |
| `competitors[].swot.opportunities` | array of strings | minItems: 1 | Yes |
| `competitors[].swot.threats` | array of strings | minItems: 1 | Yes |

**Processing**:
- `validate(data)`: Checks competitors array non-empty, validates each card's fields, detects duplicate names (case-insensitive)
- `computeDerived(data)`: No-op (returns data unchanged)
- No `analysisSteps` -- purely passive
- No scoring or derived metrics

**Critical observation**: Like Stages 1-3, Stage 4 is a passive container. It validates competitor card structure but has zero capability to discover competitors, research their positioning, or generate SWOT analyses. All data must come from elsewhere.

**No kill gate at Stage 4.** This is an information-gathering stage between two kill gates (3 and 5).

### GUI Implementation (Ground Truth)

**Sources**: EHG frontend code (`src/components/stages/Stage4CompetitiveIntelligence.tsx` [v1], `src/components/stages/v2/Stage04CompetitiveIntelligence.tsx` [v2], competitive intelligence services, edge function `competitive-intelligence`)

**GUI Stage 4 -- "Competitive Intelligence"** (hybrid: manual entry + AI agent):

**Manual competitor entry** (per competitor):
| Field | Type | Required |
|-------|------|----------|
| Company name | text | Yes |
| Website URL | text | No |
| Market segment | text | No |
| Market share estimate | percentage | No |
| Pricing model | dropdown (Freemium/Subscription/One-time/Usage-based/Tiered/Enterprise) | No |
| Additional notes | textarea | No |
| Strengths | array | No |
| Weaknesses | array | No |

**Feature comparison framework** (6 default features):
| Feature | Category | Weight |
|---------|----------|--------|
| user_interface | core | 3 |
| performance | core | 3 |
| pricing | core | 2 |
| integration | advanced | 2 |
| analytics | advanced | 2 |
| unique_feature | moat | 4 |

Coverage levels per (feature, competitor): none / basic / advanced / superior (0-3 scale)

**AI-Powered Analysis** (active, via edge function):
- 5 API endpoints at `/api/agent-execution/`
- Start -> Poll (3-second intervals) -> Results across 6 tabs: Overview, Competitors, Market, Features, Pricing, SWOT
- "Skip Agent Execution" button after 10 seconds
- Fallback: synthetic analysis if edge function unavailable

**Scoring**:
| Metric | Scale | Calculation |
|--------|-------|-------------|
| Differentiation Score | 0-10 | Weighted feature coverage comparison vs best competitor |
| Defensibility Grade | A-F | A (8+), B (6-8), C (4-6), D (2-4), F (<2) |
| Market Position | String | Challenger (>=6), Follower (4-6), Niche Player (<4) |

**Edge cases handled**:
- Blue Ocean (0 competitors found) -- shows "Blue Ocean Opportunity" alert
- Partial extraction (AI ran but structured parsing failed) -- shows raw text with warning
- Quality metadata: confidence_score (0-100%), extraction_method, quality_issues, validation_warnings

**Persona mapping**: Links Stage 3 customer personas to competitors with fit scores (80% if segment matches, 60% otherwise)

**Stage 5 integration**: Passes `competitiveData` to Stage 5 for pricing assumptions, market size, CAC/LTV calculations

**Completion requirements**: At least 1 competitor + differentiation score calculated. No minimum score enforced.

**Database tables**:
- Writes: `competitors` (per-venture), `feature_coverage`, `market_defense_strategies`, `agent_executions` (tracking)
- Reads: `ventures`, `customer_intelligence` (Stage 3 personas)

### Triangulation

**Prompt**: `docs/plans/prompts/stage-04-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-04-claude.md`
- OpenAI: `docs/plans/responses/stage-04-openai.md`
- AntiGravity: `docs/plans/responses/stage-04-antigravity.md`

### Synthesis

**Consensus strength: VERY HIGH** -- All three respondents agree on fundamentals with minor tactical differences.

#### Unanimous Agreement (3/3)

1. **Competitor discovery is the #1 gap (Importance 5/5)**: All three rate the CLI's lack of active competitor research as critically blocking. Stage 4 is currently a passive container that validates structure but cannot discover or research competitors. Without this capability, Stage 5's financial projections are ungrounded.

2. **ELIMINATE the feature comparison matrix**: All three agree the GUI's weighted 6-feature coverage matrix is a product management tool, not a financial gate input. Stage 5's kill gate (ROI/break-even) does not consume feature-level data. The CLI's SWOT analysis per competitor is sufficient for qualitative competitive positioning.

3. **ELIMINATE standalone differentiation/defensibility scoring**: All agree the GUI's differentiation score (0-10) and defensibility grade (A-F) are redundant given Stage 3's `competitiveBarrier` metric (0-100) already quantifies defensibility. Don't duplicate it in Stage 4.

4. **Pricing model per competitor is essential for Stage 5**: All three rate this as importance 5/5 or equivalent. Stage 5 cannot build realistic revenue projections without knowing competitor pricing structures (freemium vs enterprise vs subscription).

5. **Stage 3 -> Stage 4 pipeline must be explicit**: All agree Stage 4 should consume Stage 3's structured competitor entities as its starting point, then enrich them rather than discovering from scratch.

6. **ELIMINATE persona-to-competitor mapping**: All agree this is a GUI-specific feature chain. Stage 4 should focus on the competitor, not the customer.

7. **Preserve CLI superiorities**: Deterministic validation, SWOT structure, duplicate name detection, synchronous pipeline, hard-coded data integrity.

#### Tactical Disagreements

| Dimension | Claude | OpenAI (GPT 5.3) | AntiGravity (Gemini) |
|-----------|--------|-------------------|----------------------|
| **Blue Ocean handling** | `minItems: 0` for competitors (allow empty) + `blueOcean: true` flag | Explicit edge-case handling branch | Keep `minItems: 1` (search harder before declaring Blue Ocean) |
| **Scoring approach** | `competitiveIntensity` (0-100) -- single deterministic metric measuring market crowdedness | `pricing_pressure_index` + `defensibility_risk_index` + `intel_confidence` (three 0-1 indices) | **No scoring at all** -- only `confidence_score` on data quality. Stage 3 and 5 handle all scoring. |
| **Market share representation** | `marketShareRange` enum (dominant/significant/moderate/niche/unknown) -- honest classification | `market_concentration_signal` (fragmented/moderate/concentrated) -- aggregate, not per-competitor | `market_size_estimate` as global SAM string -- single market-level field |
| **Competitor pricing detail** | `pricingModel` enum + `pricingSummary` derived aggregate | `pricing_model` + `price_band` (low/mid/high) + per-competitor `confidence` | `pricing_model` enum + `pricing_tiers` array (e.g., "$10/mo", "$99/year") |
| **Stage 5 handoff** | `pricingSummary` (dominant model, price range, avg count) | Explicit `stage5_handoff` artifact with normalized assumptions payload | No explicit handoff -- Stage 5 reads Stage 4 data directly |
| **Discovery mechanism** | Single LLM call (3-layer pipeline: Stage 3 handoff + AI enrichment + deterministic validation) | Two-tier pipeline (consume seed set + targeted enrichment with graceful failure) | Live web search via `analysisStep` (browser_search tool per competitor) |
| **URL importance** | Low (2/5) -- citations, not analytical data | Optional field | Critical (5/5) -- required for verification |
| **Light feature comparison** | Not needed (SWOT covers it) | Yes -- `feature_parity`, `switching_cost_signal`, `price_pressure_signal` as simple enums | Not needed (differentiation goes in strengths) |

#### Consensus Recommendation

**Schema changes (agreed by all):**
- Add `pricingModel` per competitor (enum: freemium/subscription/one-time/usage-based/tiered/enterprise/unknown)
- Add `url` per competitor (optional, for provenance)
- Add `confidence` metadata (quality signal for Stage 5)
- Preserve existing SWOT structure (CLI superiority)

**Processing changes (agreed by all):**
- Add `analysisStep` that loads Stage 3 competitors and enriches them via LLM
- Add `computeDerived()` logic for at least one competitive pressure metric
- Handle Blue Ocean edge case (0 valid competitors after research)

**Arbitrated decisions:**
- **Scoring**: Use Claude's `competitiveIntensity` (0-100) as the single derived metric. OpenAI's three-index approach is more granular but adds complexity that Stage 5 may not consume distinctly. AntiGravity's "no scoring" is too minimal -- Stage 5 needs some quantified competitive signal.
- **Market share**: Use Claude's `marketShareRange` enum per competitor (honest classification). AntiGravity's global market size field is useful but different data. OpenAI's aggregate concentration signal can be derived from the per-competitor data.
- **Blue Ocean**: Use Claude's `minItems: 0` approach. AntiGravity's "search harder" philosophy is sound but the schema must still handle the case where no competitors exist. Allow 0 with explicit `blueOcean: true` flag.
- **Stage 5 handoff**: Use OpenAI's explicit `stage5_handoff` artifact pattern. This creates a clean contract rather than forcing Stage 5 to parse raw Stage 4 data.
- **Discovery**: Use Claude's single LLM call approach. AntiGravity's live web search is ideal but adds infrastructure complexity. The CLI's synchronous pipeline is simpler and more reliable than browser-based search.
- **Pricing detail**: Merge Claude's enum with AntiGravity's `pricing_tiers` array. Both are useful -- the enum classifies the model, the tiers capture actual price points.
- **Light feature comparison**: Skip OpenAI's feature_parity/switching_cost/price_pressure signals. These overlap with SWOT strengths/weaknesses and the competitiveIntensity metric. Keep it simple.

#### What to Build (Priority Order)

1. **P0**: `analysisStep` for competitor research enrichment (loads Stage 3 competitors, enriches via LLM)
2. **P0**: Schema additions -- `pricingModel`, `pricingTiers`, `url`, `confidence` per competitor
3. **P0**: `minItems: 0` for Blue Ocean support + `blueOcean` derived flag
4. **P1**: `computeDerived()` with `competitiveIntensity` (0-100) deterministic formula
5. **P1**: `stage5Handoff` derived artifact (pricing summary, competitive pressure, confidence)
6. **P1**: `provenance` tracking (which data from Stage 3, which from Stage 4 enrichment)
7. **P2**: `marketShareRange` per competitor (honest bucket classification)

#### What NOT to Build

- Feature comparison matrix (any form)
- Differentiation score (Stage 3's `competitiveBarrier` handles it)
- Defensibility grade (letter-grade presentation of existing metric)
- Market position label (cosmetic string derived from score)
- Persona-to-competitor mapping (GUI-specific feature chain)
- Agent polling infrastructure (CLI's synchronous pipeline is superior)

---

## Stage 5: Profitability (Kill Gate #2)

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-05.js`
**Type**: Passive validation + **active `computeDerived()`** (first stage with real computation)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `initialInvestment` | number | min: 0.01 | Yes |
| `year1.revenue` | number | min: 0 | Yes |
| `year1.cogs` | number | min: 0 | Yes |
| `year1.opex` | number | min: 0 | Yes |
| `year2.revenue` | number | min: 0 | Yes |
| `year2.cogs` | number | min: 0 | Yes |
| `year2.opex` | number | min: 0 | Yes |
| `year3.revenue` | number | min: 0 | Yes |
| `year3.cogs` | number | min: 0 | Yes |
| `year3.opex` | number | min: 0 | Yes |

**Schema (Derived)**:
| Field | Calculation |
|-------|-------------|
| `grossProfitY1-3` | `revenue - cogs` per year |
| `netProfitY1-3` | `grossProfit - opex` per year |
| `breakEvenMonth` | `ceil(initialInvestment / (netProfitY1 / 12))` or null if Y1 net <= 0 |
| `roi3y` | `(totalNetProfit - initialInvestment) / initialInvestment` |
| `decision` | `'pass'` or `'kill'` |
| `blockProgression` | `true` if killed |
| `reasons` | Array of structured kill reasons |

**Kill Gate Logic** (`evaluateKillGate()`):
- Kill if `roi3y < 0.5` (50% 3-year ROI threshold)
- Kill if `breakEvenMonth === null` (Y1 net profit non-positive)
- Kill if `breakEvenMonth > 24` (break-even too slow)
- Constants: `ROI_THRESHOLD = 0.5`, `MAX_BREAKEVEN_MONTHS = 24`
- Exported as pure function for testability

**Processing**:
- `validate(data)`: Checks all 10 input fields are valid numbers
- `computeDerived(data)`: Calculates all derived fields + runs kill gate
- **No `analysisSteps`** -- data must come from elsewhere (no financial model generation)
- **No unit economics** -- no CAC, LTV, churn, or payback period
- **No scenario analysis** -- single deterministic projection
- **No AI involvement** -- purely mathematical

**Critical observation**: The CLI has a strong kill gate but no way to generate the input data. There is no `analysisStep` to build the 3-year financial model from Stage 4's competitive intel. All 10 input numbers must be provided externally.

### GUI Implementation (Ground Truth)

**Sources**: `EHG/src/components/stages/Stage5ProfitabilityForecasting.tsx` (v1), `EHG/src/components/stages/v2/Stage05ProfitabilityForecasting.tsx` (v2), `EHG/src/hooks/useProfitabilityForecasting.ts`, `EHG/src/services/recursionEngine.ts`, `EHG/src/components/ventures/Stage5ROIValidator.tsx`

**GUI Stage 5 -- "Profitability Forecasting"** (AI-powered + local fallback):

**Revenue Assumptions** (input):
| Field | Type | Description |
|-------|------|-------------|
| `pricingModel` | string | Pricing strategy |
| `monthlyPrice` | number | Unit price |
| `marketSize` | number | TAM |
| `targetPenetration` | number | % of market |
| `growthRate` | number | Monthly growth % |
| `churnRate` | number | Monthly churn % |
| `conversionRate` | number | Lead-to-customer % |

**Cost Structure** (input):
| Field | Type | Description |
|-------|------|-------------|
| `fixedCosts` | number | Monthly fixed |
| `variableCostPerUnit` | number | Per-customer |
| `marketingBudget` | number | Monthly marketing |
| `developmentCosts` | number | Monthly dev |
| `operationalCosts` | number | Monthly ops |
| `customerAcquisitionCost` | number | CAC |

**Financial Metrics** (computed):
| Metric | Description |
|--------|-------------|
| `cac` | Customer Acquisition Cost |
| `ltv` | Lifetime Value (price / churn rate) |
| `ltvCacRatio` | Key health metric |
| `paybackPeriod` | Months to recover CAC |
| `monthlyChurnRate` | % |
| `averageOrderValue` | Per-transaction |
| `projectedRoi` | % |
| `grossMargin` | % |
| `breakEvenMonth` | Month number or null |

**Profitability Score** (weighted 0-100):
| Component | Weight | Scoring |
|-----------|--------|---------|
| LTV:CAC ratio | 40% | >=3: 40pts, >=2: 30pts, >=1.5: 20pts, else 10pts |
| Payback period | 30% | <=6mo: 30pts, <=12mo: 25pts, <=18mo: 15pts, else 5pts |
| Gross margin | 20% | >=80%: 20pts, >=60%: 15pts, >=40%: 10pts, else 5pts |
| Break-even timing | 10% | 10pts default |

**Kill Gate**: ROI >= 15% to pass (much lower than CLI's 50%)
- If ROI < 15%: triggers FIN-001 recursion (routes back to Stage 3)
- FIN-001 is auto-executed (no Chairman approval needed)
- 3+ recursions on same stage → escalation to Chairman

**Recursion Engine** (8 scenarios total, FIN-001 for Stage 5):
- `FIN-001`: ROI Below 15% → Stage 5→3 (Critical, auto-execute)
- Loop prevention: tracks `recursion_count_for_stage` per venture

**Scenario Analysis** (3 scenarios):
| Scenario | Revenue Modifier | Cost Modifier |
|----------|-----------------|---------------|
| Optimistic | 1.5x | 0.85x |
| Realistic | 1.0x | 1.0x |
| Pessimistic | 0.7x | 1.2x |

**Local Fallback Calculations**:
- S-curve customer adoption with monthly growth
- 2% monthly operating cost inflation
- LTV = price / (churn_rate / 100)
- 36-month projection horizon

**Validation Rules**:
- Market size > 0, Pricing > 0
- Growth rate 0-100%, Churn rate 0-100%
- CAC >= 0, CAC <= pricing × 24 months (warning)
- Churn > 20% triggers sustainability warning

**AI Integration**: Calls `profitability-forecasting` edge function, falls back to local calculations

**UI Components**: 4 tabs (Assumptions, Projections chart, Metrics KPIs, Scenarios)

**Database**:
- Writes: recursion_events (if triggered)
- Reads: ventures (projectedRevenue, projectedROI, fundingRequired)

**Stage 5 Completion**: ROI >= 15% OR Chairman override with justification

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Input model | 10 annual aggregates (investment + 3 years × revenue/cogs/opex) | Detailed assumptions (pricing, growth, churn, CAC, market size, etc.) |
| Projection horizon | 3 years (annual) | 36 months (monthly) |
| Unit economics | None | CAC, LTV, LTV:CAC, payback period, churn |
| ROI threshold | 50% (3-year cumulative) | 15% (projected) |
| Break-even threshold | 24 months max | No explicit threshold |
| Scenario analysis | None | 3 scenarios (optimistic/realistic/pessimistic) |
| Scoring | Binary pass/kill | Weighted profitability score (0-100) |
| Kill behavior | Hard block (`blockProgression: true`) | Recursion to Stage 3 (FIN-001) |
| Override | None | Chairman override with justification |
| AI | None | Edge function + local fallback |
| Data generation | None (passive input) | AI-powered + local S-curve model |
| Validation | Basic numeric checks | Business logic warnings (churn >20%, CAC limits) |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-05-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-05-claude.md`
- OpenAI: `docs/plans/responses/stage-05-openai.md`
- AntiGravity: `docs/plans/responses/stage-05-antigravity.md`

### Synthesis

**Consensus strength: VERY HIGH** -- All three respondents agree on fundamentals. This is the most aligned stage so far.

#### Unanimous Agreement (3/3)

1. **Financial model generation is the #1 gap (Importance 5/5)**: All three rate the CLI's lack of an `analysisStep` to generate the 10 input numbers as critically blocking. Without it, "Stage 5 is dead code" (AntiGravity), "Stage 5 is not autonomous" (OpenAI). The kill gate logic is solid but has no data to evaluate.

2. **Stage 4 consumption is mandatory (Importance 5/5)**: All three agree Stage 5 must consume Stage 4's `stage5Handoff` artifact to ground financial projections in competitive reality. Disconnected stages produce garbage-in results.

3. **Unit economics are required**: All three agree the CLI needs CAC, LTV, LTV:CAC, and payback period. AntiGravity calls them "the physics of the business" and rates it 5/5 Critical. OpenAI and Claude rate 4/5 High. The minimum set is consistent: CAC, LTV, LTV:CAC ratio, payback months, churn rate.

4. **CLI's 50% ROI threshold is too aggressive**: All three agree it must be lowered. None endorse the current threshold. AntiGravity: "1.5x MOIC is an aggressive target for a mature business or a PE firm."

5. **ELIMINATE monthly projections**: All three agree annual granularity is sufficient for the kill gate. OpenAI explicitly marks this ELIMINATE. Claude and AntiGravity note that monthly adds false precision at this stage.

6. **Keep hard block over recursion**: All three agree recursion is problematic for autonomous pipelines. AntiGravity: "Recursive loops are dangerous in a CLI/Agentic environment without a human brake." OpenAI: "Hard block + structured remediation, not unbounded recursion."

7. **ELIMINATE GUI AI UX features**: Polling, progress bars, skip buttons, tabbed results -- none of this is needed in the CLI pipeline.

8. **Preserve CLI's pure function kill gate**: All three praise `evaluateKillGate()` as a superior pattern -- deterministic, testable, auditable.

9. **Add scenario analysis (lightweight)**: All three want some form of scenario testing, but all agree full monthly simulation is overkill. Apply pessimistic/optimistic multipliers to the base case and classify robustness.

#### Key Disagreement: ROI Threshold Value

| Respondent | Recommended Threshold | Formula | Notes |
|------------|----------------------|---------|-------|
| Claude | **30%** | Keep current formula, single threshold | Conservative middle ground |
| OpenAI (GPT 5.3) | **25% with bands** | 25%+ = pass, 15-25% = conditional, <15% = kill | Introduces a "conditional" band requiring strong unit economics |
| AntiGravity | **15%** | Keep current formula | Matches GUI's existing threshold, "standard for investable" |

**Arbitration**: Use **25% with OpenAI's banded approach**. Rationale:
- 15% (AntiGravity) is too lenient -- it's closer to a savings account return spread over 3 years. Ventures need to compensate for high failure rates.
- 30% (Claude) is reasonable but a single hard cliff creates false precision at the boundary.
- 25% with bands (OpenAI) is the best design: clear pass at 25%+, conditional zone at 15-25% that requires corroboration from unit economics, definitive kill below 15%. This gives the kill gate nuance without recursion complexity.

#### Key Disagreement: Unit Economics as Gate Inputs

| Respondent | Unit Economics Role | Kill on UE Failure? |
|------------|-------------------|---------------------|
| Claude | Intermediate calculations stored for Stage 6, NOT gate inputs | No -- gate only evaluates roi3y + breakEvenMonth |
| OpenAI (GPT 5.3) | Minimal gate set with thresholds | Yes -- `ltvCacRatio >= 2`, `paybackMonths <= 18` |
| AntiGravity | Full gate inputs | Yes -- `ltvCacRatio >= 1.5`, `paybackMonths <= 18`, `grossMargin >= 20%` |

**Arbitration**: Use **OpenAI's approach -- unit economics as supplementary gate inputs**. Rationale:
- Claude's position that unit economics are "intermediate, not gate inputs" is technically clean but misses the point: a venture with a 25% ROI but 0.5 LTV:CAC ratio is fundamentally broken. The aggregate numbers might look fine while the unit economics scream failure.
- AntiGravity's thresholds are slightly too aggressive (1.5 LTV:CAC minimum is very low).
- OpenAI's `ltvCacRatio >= 2` and `paybackMonths <= 18` are reasonable supplementary gates that catch cases where aggregate ROI passes but unit economics fail.

**Implementation**: Kill gate evaluates roi3y + breakEvenMonth (primary), PLUS ltvCacRatio and paybackMonths as supplementary checks. In the 15-25% conditional band, strong unit economics (LTV:CAC >= 3, payback <= 12) can save the venture from a kill.

#### Key Disagreement: Kill Behavior Nuance

| Respondent | Kill Behavior | Recovery Mechanism |
|------------|--------------|-------------------|
| Claude | Hard block, no recovery | `lowConfidenceKill` flag for future human review |
| OpenAI (GPT 5.3) | Hard block + structured remediation | `remediationRoute` + max 1 auto-retry, then escalate |
| AntiGravity | Hard block + "Pivot" option | Manual pivot command or override |

**Arbitration**: Use **Claude's hard block with OpenAI's `remediationRoute` metadata**. Emit the remediation suggestion (which stage to revisit and why) but don't auto-execute it. This gives humans actionable guidance without autonomous loop risk. No automatic retries.

#### Consensus Recommendation

**Kill Gate v2.0:**
- Primary: `roi3y >= 0.25` AND `breakEvenMonth <= 24` AND `breakEvenMonth !== null`
- Supplementary: `ltvCacRatio >= 2` AND `paybackMonths <= 18`
- Conditional band: `0.15 <= roi3y < 0.25` passes ONLY IF supplementary metrics are strong (LTV:CAC >= 3, payback <= 12)
- Below 0.15 ROI: unconditional kill

**Schema changes (agreed by all):**
- Add `analysisStep` for LLM-based financial model generation consuming Stage 4 + Stage 3
- Add unit economics (CAC, LTV, LTV:CAC, churn, payback, gross margin) as derived fields
- Add lightweight scenario spread (pessimistic/optimistic ROI with robustness classification)
- Add `assumptions` object capturing the inputs used to generate projections
- Add `stage4Context` carrying through pricing and competitive data
- Add `remediationRoute` in kill reasons (suggested stage to revisit)

**Processing changes (agreed by all):**
- Add `analysisStep` that generates financial projections from venture + competitive intel
- Enhance `computeDerived()` to calculate unit economics + scenario spread
- Enhance `evaluateKillGate()` with supplementary unit economics checks + banded ROI
- Add business logic validation warnings (churn >20%, negative margins, unrealistic growth)

#### What to Build (Priority Order)

1. **P0**: `analysisStep` for financial model generation (LLM call consuming Stage 4 handoff + Stage 3 market data)
2. **P0**: Stage 4 `stage5Handoff` consumption (wire it into the analysisStep)
3. **P0**: Calibrate ROI threshold from 50% to 25% with banded decision logic
4. **P1**: Unit economics derived fields + supplementary kill checks (LTV:CAC >= 2, payback <= 18)
5. **P1**: Business logic validation warnings
6. **P1**: Lightweight scenario spread (pessimistic/optimistic multipliers + robustness flag)
7. **P2**: Provenance tracking (data source, Stage 4 confidence carry-through)
8. **P2**: `remediationRoute` in kill reasons

#### What NOT to Build

- Monthly projections (annual is sufficient for gate)
- Recursion to Stage 3 (hard block is correct for autonomous pipelines)
- GUI's weighted profitability score (binary pass/kill with structured reasons is superior)
- Chairman override at Stage 5 (existing DFE + Chairman Preference Store handles this)
- S-curve customer adoption model (adds complexity without improving gate accuracy)
- AI-powered GUI forecasting workflow (polling, skip button, tabbed results)

---

## Stage 6: Risk Matrix

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-06.js`
**Type**: Passive validation + **active `computeDerived()`** (computes risk scores)
**Phase**: THE ENGINE (Stages 6-9 in CLI, 6-10 in GUI)

**Schema**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `risks` | array | minItems: 1 | Yes |
| `risks[].id` | string | minLength: 1 | Yes |
| `risks[].category` | enum | Market/Product/Technical/Legal-Compliance/Financial/Operational | Yes |
| `risks[].description` | string | minLength: 10 | Yes |
| `risks[].severity` | integer | 1-5 | Yes |
| `risks[].probability` | integer | 1-5 | Yes |
| `risks[].impact` | integer | 1-5 | Yes |
| `risks[].score` | integer | Derived: severity * probability * impact | Derived |
| `risks[].mitigation` | string | minLength: 10 | Yes |
| `risks[].owner` | string | minLength: 1 | Yes |
| `risks[].status` | enum | open/mitigated/accepted/closed | Yes |
| `risks[].review_date` | string | minLength: 1 | Yes |
| `risks[].residual_severity` | integer | 1-5 | Optional |
| `risks[].residual_probability` | integer | 1-5 | Optional |
| `risks[].residual_impact` | integer | 1-5 | Optional |
| `risks[].residual_score` | integer | Derived: residual_severity * residual_probability * residual_impact | Derived |

**Risk Categories** (6): Market, Product, Technical, Legal/Compliance, Financial, Operational

**Processing**:
- `validate(data)`: Validates array of risks, each with all required fields, validates enums and ranges, validates optional residual fields if present
- `computeDerived(data)`: Computes `score = severity * probability * impact` per risk, plus `residual_score` if residual fields present
- **No `analysisSteps`** -- risks must be provided externally
- **No kill gate** -- information-gathering stage
- **No aggregate metrics** -- individual risk scores only, no overall risk assessment

**Critical observation**: The CLI's risk matrix is structurally complete -- it has categories, severity/probability/impact scoring, mitigation tracking, and residual risk. But like earlier stages, it has no `analysisStep` to generate risks. All risk data must come from elsewhere.

**CLI Strengths**: 6 risk categories (vs GUI's 4), 3-factor scoring model (severity × probability × impact = 1-125 range vs GUI's 2-factor), residual risk tracking (post-mitigation scoring), mitigation owner assignment, risk status lifecycle (open → mitigated → accepted → closed), review date tracking.

### GUI Implementation (Ground Truth)

**Sources**: `EHG/src/components/stages/v2/Stage06RiskEvaluation.tsx` (223 lines), `EHG/src/hooks/useVentureArtifacts.ts`, `EHG/src/config/venture-workflow.ts`

**GUI Stage 6 -- "Risk Evaluation"**:

**Risk Data Structure**:
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Risk name |
| `description` | string | Risk description |
| `category` | enum | market/financial/technical/operational (4 categories) |
| `severity` | enum | high/medium/low |
| `probability` | number | 0-100% |
| `impact` | number | 0-100% |
| `mitigation` | string | Mitigation strategy |

**Risk Scoring**: probability × impact (2-factor, 0-10000 range)

**Sample Risks** (pre-populated):
- Market Adoption Risk (severity: high)
- Funding Gap (severity: medium)
- Technical Complexity (severity: medium)
- Team Scaling (severity: low)

**UI Components**:
- Overall Risk Assessment card with score badge
- Risk category grid (4 columns) showing count by category
- Accordion with detailed risk cards
- High-risk warning alert

**Gate Type**: None (`gateType: 'none'`)
**Artifact Type**: `risk_matrix` (stored in `venture_artifacts` table with versioning)
**Completion**: Manual via `onComplete()` callback

**Database**:
- Writes: `venture_artifacts` (versioned artifact), `ventures.metadata.risks`
- Reads: Venture data from previous stages

**Stage numbering note**: Both CLI and GUI agree Stage 6 = Risk assessment. However, the GUI's `venture-workflow.ts` SSOT has naming conflicts with actual component implementations for Stages 7-10.

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Risk categories | 6 (Market, Product, Technical, Legal/Compliance, Financial, Operational) | 4 (market, financial, technical, operational) |
| Scoring model | 3-factor (severity × probability × impact, 1-125) | 2-factor (probability × impact, 0-10000) |
| Severity scale | Integer 1-5 | Enum high/medium/low |
| Probability scale | Integer 1-5 | 0-100% |
| Impact scale | Integer 1-5 | 0-100% |
| Residual risk | Yes (post-mitigation scoring) | No |
| Risk status lifecycle | open/mitigated/accepted/closed | No |
| Mitigation owner | Yes (required field) | No |
| Review date | Yes (required field) | No |
| Pre-populated risks | No | Yes (4 sample risks) |
| Risk generation | None (passive) | None (manual entry with samples) |
| Aggregate assessment | None | Overall risk score badge |
| Artifact versioning | No | Yes (venture_artifacts table) |
| Kill gate | No | No |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-06-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-06-claude.md`
- OpenAI: `docs/plans/responses/stage-06-openai.md`
- AntiGravity: `docs/plans/responses/stage-06-antigravity.md`

### Synthesis

**Consensus strength: VERY HIGH** -- All three respondents agree on every fundamental. Stage 6 is remarkably well-aligned.

#### Unanimous Agreement (3/3)

1. **Risk generation `analysisStep` is the #1 gap (Importance 5/5)**: All three rate autonomous risk generation as critically missing. Neither CLI nor GUI generates risks automatically. The CLI must add an `analysisStep` that produces 10-15 venture-specific risks from Stages 1-5 output.

2. **Stage 5 seeding is mandatory (Importance 5/5)**: All three agree financial risks from Stage 5 unit economics must be auto-seeded deterministically. Specific triggers are consistent across all responses: churn >10%, gross margin <40%, LTV:CAC <3, extended payback period.

3. **Aggregate risk metrics are needed (Importance 4/5)**: All three agree Stage 6 must produce summary signals for downstream consumption. All propose similar outputs: overall risk index/score, critical risk count, category distribution, top risk categories/risks.

4. **Preserve CLI's 6 risk categories**: All three agree the CLI's expanded taxonomy (adding Product, Legal/Compliance) is superior to the GUI's 4 categories.

5. **Preserve CLI's residual risk tracking**: All three agree this is a CLI strength. AntiGravity rates it 5/5 Critical ("crucial for showing value of mitigations"), Claude and OpenAI keep it optional but valuable.

6. **Add `source` field per risk**: All three recommend tracking whether each risk was LLM-generated, auto-seeded from Stage 5, or manually added. Enables provenance tracking.

7. **Preserve CLI's governance fields**: Owner, status, and review_date are CLI strengths. All agree they should be kept (some suggest making optional vs required).

#### Key Disagreement: Scoring Model (2-factor vs 3-factor)

| Respondent | Scoring Model | Rationale |
|------------|--------------|-----------|
| Claude | **2-factor** (probability × consequence) | Severity and impact are too correlated; merge into "consequence". Cleaner 1-25 range. Better LLM consistency. |
| AntiGravity | **2-factor** (probability × impact) | Same reasoning -- "Severity overlaps with Impact". Cites ISO 31000 standard. |
| OpenAI (GPT 5.3) | **3-factor** (keep severity × probability × impact) | Argues severity, probability, and impact are separable with proper rubrics. Adds LLM normalization layer: qualitative labels → deterministic mapping to 1-5. |

**Arbitration: Use 2-factor model (probability × consequence).** Two of three recommend it. The 3-factor model's theoretical advantage (separating severity from impact) doesn't hold in practice -- both humans and LLMs score them nearly identically. ISO 31000 uses 2-factor. The 1-25 range is easier to threshold. OpenAI's normalization approach (qualitative labels → integer mapping) is good practice regardless of factor count and should be adopted.

#### Key Disagreement: Risk Name Field

| Respondent | Name Field? | Rationale |
|------------|------------|-----------|
| Claude | No -- description is sufficient | Pure UI concern. Adds no analytical value. |
| AntiGravity | No -- not mentioned | Not part of recommended schema. |
| OpenAI (GPT 5.3) | Yes -- add `name` field | Improves readability/searchability of risk artifacts. |

**Arbitration: Add `name` field (optional).** OpenAI is right that a short name improves usability when referencing risks in downstream stages (e.g., Stage 9 Exit Strategy referencing "Margin Pressure" is cleaner than quoting a 10+ word description). Low cost, reasonable benefit. Make it optional.

#### Key Disagreement: Stage 9 Quality Gate Enhancement

| Respondent | Stage 9 Gate | Enhancement |
|------------|-------------|-------------|
| Claude | Raise `minItems` to 10 at Stage 6 | Enforce early to avoid Stage 9 rejection. |
| AntiGravity | Keep `minItems: 10` with soft warn at Stage 6 | Hard gate at Stage 9, not Stage 6. |
| OpenAI (GPT 5.3) | Keep count floor + add quality checks | Category coverage (4/6), mitigation completeness, high-confidence risk count. |

**Arbitration: Use OpenAI's quality-enhanced gate at Stage 9.** Keep `minItems: 1` at Stage 6 (the `analysisStep` will produce 10+, but don't hard-gate at generation time). Stage 9's Reality Gate should evolve from pure count to: count >= 10 AND category coverage >= 4 of 6 AND mitigation coverage > 80%.

#### Consensus Recommendation

**Schema changes (agreed by all):**
- Add `analysisStep` for LLM-based risk generation consuming Stages 1-5
- Add deterministic risk seeding from Stage 5 unit economics
- Add aggregate summary metrics (overall score, distribution, top risks)
- Add `source` field per risk (generated/seeded/manual)
- Simplify to 2-factor scoring (probability × consequence, 1-25 range)
- Add `name` field (optional) per risk
- Preserve 6 categories, residual risk, owner, status, review_date

**Processing changes (agreed by all):**
- Add `analysisStep` that generates 10-15 risks from venture context
- Enhance `computeDerived()` with aggregate metrics
- Add Stage 5 metric-triggered risk seeding rules
- Add LLM scoring normalization (qualitative → quantitative mapping)

#### What to Build (Priority Order)

1. **P0**: `analysisStep` for risk generation (LLM generates 10-15 risks from Stages 1-5 context)
2. **P0**: Deterministic risk seeding from Stage 5 unit economics (churn, margin, LTV:CAC thresholds)
3. **P1**: Aggregate metrics in `computeDerived()` (overall risk score, distribution, top risks)
4. **P1**: Simplify to 2-factor scoring (probability × consequence = 1-25)
5. **P1**: Add `source` and `source_ref` fields for provenance
6. **P2**: Add optional `name` field per risk
7. **P2**: LLM scoring normalization (qualitative labels → integer mapping)
8. **P3**: Enhance Stage 9 Reality Gate quality checks (category coverage, mitigation completeness)

#### What NOT to Build

- Pre-populated sample risks (GUI pattern replaced by LLM generation)
- GUI-style risk badge/card UI (CLI produces structured data, not display widgets)
- Artifact versioning at Stage 6 level (handle at platform persistence layer)
- Required review dates at Stage 6 (premature; keep optional with sensible defaults)

---

## Stage 7: Pricing

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-07.js`
**Type**: Passive validation + **active `computeDerived()`** (unit economics formulas)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `currency` | string | minLength: 1 | Yes |
| `tiers` | array | minItems: 1 | Yes |
| `tiers[].name` | string | minLength: 1 | Yes |
| `tiers[].price` | number | min: 0 | Yes |
| `tiers[].billing_period` | enum | monthly/quarterly/annual | Yes |
| `tiers[].included_units` | string | -- | No |
| `tiers[].target_segment` | string | minLength: 1 | Yes |
| `gross_margin_pct` | number | 0-100 | Yes |
| `churn_rate_monthly` | number | 0-100 | Yes |
| `cac` | number | min: 0 | Yes |
| `arpa` | number | min: 0 | Yes |

**Schema (Derived)**:
| Field | Formula | Notes |
|-------|---------|-------|
| `ltv` | `(ARPA * gross_margin_pct/100) / churn_rate_monthly_decimal` | null if churn = 0 |
| `cac_ltv_ratio` | `CAC / LTV` | null if LTV = 0 or churn = 0 |
| `payback_months` | `CAC / (ARPA * gross_margin_pct/100)` | null if gross profit = 0 |
| `warnings` | Business logic warnings | High churn (>30%), zero churn, zero gross profit |

**Processing**:
- `validate(data)`: Validates all input fields, tiers array, enum values, numeric bounds
- `computeDerived(data)`: Calculates LTV, CAC:LTV ratio, payback months; handles zero-churn edge case gracefully (returns null + warning instead of dividing by zero)
- **No `analysisSteps`** -- pricing data must be provided externally
- **No pricing model selection** -- just tier structure
- **No competitor pricing analysis**
- **No discount policies**

**CLI Strengths**: Clean unit economics formulas, zero-churn edge case handling, high-churn warning (>30%), billing period flexibility (monthly/quarterly/annual).

### GUI Implementation (Ground Truth)

**Sources**: `EHG/src/components/stages/v2/Stage7PricingStrategy.tsx` (1,041 lines), `EHG/src/hooks/usePricingStrategy.ts`

**GUI Stage 7 -- "Pricing Strategy"** (comprehensive pricing design):

**7 Pricing Models**: freemium, subscription_flat, subscription_tiered, usage_based, per_seat, transaction_fee, hybrid

**Tier Structure** (per tier):
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | e.g., "Starter", "Pro", "Enterprise" |
| `description` | string | Tier description |
| `price` | number | Base price USD |
| `billingCycle` | enum | monthly/yearly/one_time |
| `features` | string[] | Feature list |
| `limits` | Record<string, number> | Usage limits |
| `isPopular` | boolean | Visual prominence flag |
| `cta` | string | CTA button text |

**Discount Policies**: percentage/fixed/volume/promotional with conditions, validity dates, max uses

**Competitor Pricing Analysis**: name, lowest/highest tier, pricing model, notes per competitor

**Value Metrics**: primary metric, secondary metrics, price anchor

**Projections**: target ACV, expected ARPU, conversion rate (0-20%), churn rate (0-20%)

**9 Auto-Generated Recommendations**:
1. Missing tiers warning
2. Freemium without free tier
3. No popular tier marked
4. No competitors added
5. Low conversion rate (<1%)
6. High churn rate (>10%)
7. Missing primary value metric
8. Price >30% above competitors
9. Price >30% below competitors

**Completion**: At least 1 tier required. No minimum score.

**Database**: `pricing_strategies`, `pricing_competitive_analysis`, `chairman_pricing_overrides` tables + `venture_artifacts` (type: pricing_model)

**Inputs from prior stages**: Stage 4 competitive data, Stage 5 financial model, Stage 6 risk matrix

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Pricing model selection | None | 7 models with rationale |
| Tier richness | name, price, billing, units, segment | name, description, price, billing, features[], limits{}, isPopular, CTA |
| Billing periods | monthly/quarterly/annual | monthly/yearly/one_time |
| Discount policies | None | 4 types with conditions |
| Competitor analysis | None | Per-competitor pricing benchmarks |
| Value metrics | None | Primary/secondary metrics, price anchor |
| Unit economics | Yes (LTV, CAC:LTV, payback) | Projections (ACV, ARPU, conversion, churn) |
| Edge cases | Zero-churn handling | Freemium without free tier |
| Recommendations | Warnings only (churn >30%) | 9 auto-generated recommendations |
| Pricing generation | None (passive) | None (manual entry with AI hooks) |
| Chairman override | None | Override table with rationale |
| Prior stage consumption | None | Stages 4-6 data as props |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-07-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-07-claude.md`
- OpenAI: `docs/plans/responses/stage-07-openai.md`
- AntiGravity: `docs/plans/responses/stage-07-antigravity.md`

### Synthesis

**Consensus (3/3 agree)**:

1. **Add `analysisStep` for pricing strategy generation (P0)**. All three agree Stage 7 must become an active strategy generator consuming Stages 4-6, not a passive data entry form. Claude: single LLM call with risk-informed pricing rules. OpenAI: optional with human-in-the-loop and multiple proposals. AntiGravity: mandatory, AI proposes tiers based on competitive/financial/risk context. **Decision**: Add `analysisStep` that generates a complete pricing strategy from Stages 4-6 context. Single LLM call producing pricing model, tiers, and unit economics inputs. Risk-informed rules (high risk → conservative pricing).

2. **Add explicit pricing model enum (P0)**. All three agree tier structure alone doesn't describe the monetization mechanic. Claude: 6 models (merge flat/tiered subscription). OpenAI: 7 models (keep flat/tiered separate) + `revenueDriver` field. AntiGravity: 7 models including `enterprise`. **Decision**: Use 6-model enum: `freemium`, `subscription`, `usage_based`, `per_seat`, `transaction_fee`, `hybrid`. Merge flat/tiered subscription (tier count makes it obvious). Add required `modelRationale` string.

3. **ELIMINATE discount policies**. All three rate discounts as Low/2 importance. Go-to-market implementation detail, not venture evaluation. **Decision**: Omit from CLI.

4. **Consume Stage 4 competitive pricing, don't re-analyze**. All three agree Stage 7 should read Stage 4's output, not duplicate competitor analysis. Claude: `stage4PricingContext` carry-through. OpenAI: `competitiveReference` with `positioningDecision` enum. AntiGravity: pipeline consumption model. **Decision**: Add `competitiveContext` object (derived) carrying Stage 4's dominant model, price range, competitive intensity. Add `positioningDecision` enum: `below_market | at_market | premium`.

5. **Add value metrics**. All three agree on adding primary value metric and price anchor. Small schema cost, high strategic payoff for Stage 8 BMC Value Propositions. **Decision**: Add `primaryValueMetric` (string) and `priceAnchor` (string). Drop secondary metrics (minimal value-add).

6. **Preserve CLI's clean unit economics**. All three recognize CLI's LTV/CAC/payback formulas as superior to GUI's projection-based approach. Zero-churn edge case handling, high-churn warning, deterministic computation. **Decision**: Preserve all existing `computeDerived()` logic unchanged.

**2-1 Splits**:

7. **Tier richness** -- AntiGravity (5/Critical) vs Claude (2/Low, ELIMINATE) vs OpenAI (3/Medium, add minimal). AntiGravity argues features/limits are essential for Stage 8 BMC Value Propositions. Claude argues features are product specification for BUILD phase, not venture evaluation. OpenAI adds lightweight `valueProposition`, `keyLimit`, `isPrimaryOffer`. **Decision**: Keep CLI's simple 5-field tier structure. Do NOT add features[], limits{}, or presentation fields. Stage 8 BMC can derive Value Propositions from the venture description + pricing model + value metrics without per-tier feature lists. If AntiGravity is right that Stage 8 needs tier-level detail, it will surface during Stage 8 analysis.

8. **Unit economics reconciliation (Stage 5 vs Stage 7)** -- OpenAI uniquely proposes `baselineRef`, `deltaFromBaseline`, `assumptionOverrides` fields for formal reconciliation tracking. Claude proposes a validation warning when Stage 7 economics are worse than Stage 5 projections. AntiGravity doesn't address reconciliation. **Decision**: Add validation warning comparing Stage 7 LTV:CAC to Stage 5 projections (Claude's approach). Skip formal reconciliation fields (OpenAI's approach adds complexity for a rare edge case in autonomous generation).

**Novel Contributions**:

- **AntiGravity**: Correctly flags that the *current* Stage 4 CLI schema doesn't have pricing fields -- the Stage 4 consensus (adding pricingModel, pricingTiers, pricingSummary per competitor) must be implemented before Stage 7 can consume it. This is a dependency, not a gap.
- **OpenAI**: `revenueDriver` field (seat/usage/transaction/subscription/hybrid) is redundant with pricing model enum -- the model already implies the driver.
- **Claude**: Risk-informed pricing rules (overallRiskScore > 70 → conservative pricing, Market risk → competitive pricing, Financial risk → higher margins) provide actionable LLM guidance.

**ELIMINATE (all three agree)**:
- Discount policies (implementation detail)
- Chairman override table (existing governance handles this)
- CTA/presentation fields (UI/marketing concern)

**Recommended Changes (Priority Order)**:

| Priority | Change | Rationale |
|----------|--------|-----------|
| P0 | Add `analysisStep` consuming Stages 4-6 | Core gap: Stage 7 is empty without generation |
| P0 | Add `pricingModel` enum (6 values) + `modelRationale` | Essential for Stage 8 Revenue Streams |
| P0 | Wire Stage 4/5/6 consumption into analysisStep | Pricing in vacuum is guesswork |
| P1 | Add `primaryValueMetric` + `priceAnchor` | Feeds Stage 8 Value Propositions |
| P1 | Add `competitiveContext` + `positioningDecision` | Traceability from Stage 4 |
| P1 | Add Stage 5 reconciliation warning | Catch pricing that doesn't support financial model |
| P2 | Risk-informed pricing rules in analysisStep prompt | Better LLM output quality |
| P3 | Do NOT add tier features/limits | BUILD phase concern |
| P3 | Do NOT add discount policies | Implementation detail |

**Recommended Schema v2.0.0**:
```
pricingModel: enum [freemium, subscription, usage_based, per_seat, transaction_fee, hybrid] (required)
modelRationale: string, minLength: 20 (required)
currency: string (required, existing)
tiers[]: name, price, billing_period, included_units, target_segment (existing, unchanged)
gross_margin_pct, churn_rate_monthly, cac, arpa (existing, unchanged)
primaryValueMetric: string (new)
priceAnchor: string (new)
competitiveContext: { dominantModel, priceRange, competitiveIntensity, positioningDecision } (new, derived)
ltv, cac_ltv_ratio, payback_months, warnings (existing derived, unchanged)
provenance: { dataSource, model, riskInfluence } (new, derived)
```

---

## Stage 8: Business Model Canvas

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-08.js`
**Type**: Passive validation + **active `computeDerived()`** (cross-stage links only)

**9 BMC Blocks** (all share identical item structure):
| Block | Min Items | Description |
|-------|:---------:|-------------|
| `customerSegments` | 2 | Groups of people/organizations served |
| `valuePropositions` | 2 | Unique value delivered to customers |
| `channels` | 2 | How you reach and deliver value |
| `customerRelationships` | 2 | How you acquire, retain, grow customers |
| `revenueStreams` | 2 | How the company earns money |
| `keyResources` | 2 | Assets needed to deliver value |
| `keyActivities` | 2 | Critical actions to deliver value |
| `keyPartnerships` | 1 | Strategic alliances and suppliers |
| `costStructure` | 2 | Major costs of operating the model |

**Item Schema** (per block):
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `text` | string | minLength: 1 | Yes |
| `priority` | integer | 1-3 | Yes |
| `evidence` | string | -- | No |

**Processing**:
- `validate(data)`: Validates all 9 blocks exist as objects, checks item arrays meet min counts, validates text/priority/evidence per item
- `computeDerived(data)`: Returns static `cross_links` array: Stage 6 (Cost Structure ↔ Risk mitigations) and Stage 7 (Revenue Streams ↔ Pricing tiers)
- **No `analysisSteps`** -- BMC content must be provided externally
- **No completeness scoring** -- validation is pass/fail
- **No recommendations engine**

**CLI Strengths**: Clean schema design (all blocks share identical item structure), priority field (1-3) for item ranking, evidence field for traceability, low minItems threshold for keyPartnerships (1 vs 2 for others), static cross-links to related stages.

### GUI Implementation (Ground Truth)

**Sources**: `EHG/src/components/stages/v2/Stage8BusinessModelCanvas.tsx` (594 lines), `EHG/src/hooks/useVentureArtifacts.ts`, `EHG/src/components/stage-outputs/viewers/Stage8Viewer.tsx`

**GUI Stage 8 -- "Business Model Canvas"** (interactive canvas editor):

**9 BMC Blocks** (same 9 as CLI, different structure):
| Block | Min Items | Unique Features |
|-------|:---------:|-----------------|
| Customer Segments | 1 | Indigo color, row-span 2 |
| Value Propositions | 2 | Red color, center position, row-span 2 |
| Channels | 1 | Cyan color |
| Customer Relationships | 1 | Green color |
| Revenue Streams | 1 | Emerald color, bottom row, col-span 2 |
| Key Resources | 2 | Orange color |
| Key Activities | 2 | Purple color |
| Key Partnerships | 1 | Blue color, row-span 2 |
| Cost Structure | 2 | Amber color, bottom row, col-span 2 |

**Item Schema** (per block):
```
{ id: string, items: string[] }  // Simple string array -- no priority, no evidence
```

**Features**:
- **5-column CSS grid layout**: Visual BMC canvas with proper spatial arrangement
- **Per-block prompts**: 2-4 guiding questions per block (e.g., "What value do you deliver?")
- **Completeness scoring**: 0-100% based on (filledItems / minItems) * weight
- **Completion threshold**: 50% minimum to proceed, warning at 50-80%
- **Real-time recommendations**: Block-specific ("Add X more items to [Block]") and cross-block ("Define customer segments for your value propositions")
- **Draft saving**: Can save incomplete canvas as draft
- **Artifact versioning**: Each save increments version, marks previous as not current

**Prior stage inputs** (passed but UNUSED):
- `pricingStrategy` (Stage 7) -- passed as prop but never consumed
- `riskMatrix` (Stage 6) -- passed as prop but never consumed
- `phase1Data` (Stages 1-5) -- passed as prop but never consumed

**Database**: `venture_artifacts` table (artifact_type: 'business_model_canvas'), versioned with metadata

**No AI generation**: Purely manual entry with static recommendation engine
**No chairman overrides**: No governance layer in Stage 8
**Viewer mismatch**: Stage8Viewer.tsx has different data structure (snake_case, separate revenue_streams array with type/pricing_model/estimated_pct) than the editor component (camelCase)

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Block count | 9 (identical) | 9 (identical) |
| Item structure | text + priority (1-3) + evidence | string[] (text only) |
| Min items per block | 2 (except keyPartnerships: 1) | 1-2 (varies, generally lower) |
| Completeness scoring | None (pass/fail validation) | 0-100% with 50% minimum threshold |
| Recommendations | None | Real-time block-specific + cross-block |
| Visual layout | None (data only) | 5-column CSS grid canvas |
| Guiding prompts | None | 2-4 per block |
| Draft support | None | Save incomplete as draft |
| Prior stage consumption | None | Passed but unused (Stage 6, 7, Phase 1) |
| AI generation | None (passive) | None (manual with static recs) |
| Priority/ranking | Yes (priority 1-3 per item) | No |
| Evidence tracking | Yes (evidence field per item) | No |
| Cross-stage links | Static array (Stage 6, 7) | None explicit |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-08-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-08-claude.md`
- OpenAI: `docs/plans/responses/stage-08-openai.md`
- AntiGravity: `docs/plans/responses/stage-08-antigravity.md`

### Synthesis

**Consensus (3/3 agree)**:

1. **Add `analysisStep` for BMC generation from Stages 1-7 (P0)**. All three rate this as 5/Critical -- the single highest-leverage change. Neither CLI nor GUI currently generates BMC content. Claude: single LLM call synthesizing all 7 prior stages into 9 blocks with evidence citations. OpenAI: draft generation with human edits allowed. AntiGravity: "Generation-First Workflow" where user reviews/edits rather than starting from blank. **Decision**: Add `analysisStep` that generates a complete 9-block BMC from prior stages. Single LLM call with explicit mapping rules (Stage 7 → Revenue Streams, Stage 6 → Cost Structure, Stage 4 → Value Propositions, Stage 1 → Customer Segments). Every generated item must include text, priority, and evidence.

2. **Preserve CLI's item structure (text + priority + evidence) (P0)**. All three explicitly agree the CLI's structured items are superior to the GUI's plain string arrays. Claude: "analytically superior." OpenAI: "CLI structure as canonical." AntiGravity: "strictly better for identifying Key partners vs trivial ones." **Decision**: Keep text + priority (1-3) + evidence per item. Do NOT regress to string[].

3. **Wire prior stage consumption (P0)**. All three rate this 5/Critical. The GUI passes prior stage data as props but never uses it. The CLI has static cross-links but doesn't consume data. **Decision**: The `analysisStep` must explicitly consume Stages 1-7 data with deterministic mapping rules. Evidence field traces each item back to its source stage.

4. **Keep pass/fail validation, skip completeness scoring**. Claude: "pass/fail is sufficient for LLM-generated content." OpenAI: adds optional readiness score (informational only). AntiGravity: "56% vs 62% is vanity capability." **Decision**: Keep pass/fail via minItems validation. Add `blockCompleteness` metadata (item counts per block) for observability only. No percentage score or threshold.

5. **Add structural validation/recommendations**. All three agree to add validation but disagree on approach. Claude: structural validation rules in `computeDerived()`. OpenAI: minimal rules engine with warnings[] + recommendations[]. AntiGravity: post-generation "Critique" step (like Stage 2's Devil's Advocate). **Decision**: Add cross-block validation warnings in `computeDerived()`: Revenue-Pricing alignment, Cost-Risk alignment, Segment-Market alignment, block balance check. Output as `warnings[]` array. No separate recommendations engine.

6. **Integrate guiding prompts into analysisStep, not schema**. All three agree prompts belong in the LLM prompt, not the data model. **Decision**: Use the GUI's per-block questions as LLM prompt instructions. Don't add prompt fields to the schema.

7. **Keep CLI's min items thresholds**. All three agree CLI's 2 per block (1 for partnerships) is appropriate. **Decision**: No change.

8. **Preserve CLI's cross_links + add dynamic validation**. Static cross-links provide deterministic baseline. Dynamic validation catches contradictions. **Decision**: Keep existing `cross_links` array. Add `warnings[]` for dynamic checks.

**No splits** -- Remarkable 3/3 agreement across all major decisions. The only minor variation is OpenAI's optional readiness score (0-100), which Claude and AntiGravity both reject as unnecessary.

**Novel Contributions**:

- **AntiGravity**: "Post-Generation Critique" pattern -- after BMC generation, run a consistency check as a secondary prompt. Analogous to Stage 2's Devil's Advocate. Interesting but adds a second LLM call; can be folded into the primary analysisStep prompt instead.
- **OpenAI**: Explicit `readinessScore` with thresholds (>=70 ready, 50-69 flagged, <50 incomplete). Useful for manual entry workflows but unnecessary when LLM generates the full BMC.
- **Claude**: Detailed Stage-to-Block mapping showing ALL 7 stages feeding into specific blocks (not just 1, 4, 6, 7). Stages 2, 3, and 5 also contribute.

**ELIMINATE (all three agree)**:
- Visual layout / CSS grid (CLI is data, not presentation)
- Draft saving (orchestrator handles this)
- Artifact versioning (platform-level concern)
- GUI's plain string[] item format (regressive)

**Recommended Changes (Priority Order)**:

| Priority | Change | Rationale |
|----------|--------|-----------|
| P0 | Add `analysisStep` generating 9-block BMC from Stages 1-7 | Core gap: Stage 8 is empty without generation |
| P0 | Wire all prior stage consumption with mapping rules | BMC must synthesize the pipeline, not restart |
| P0 | Require evidence field on all generated items | Prevents hallucination, enables audit trail |
| P1 | Add cross-block validation warnings | Revenue-Pricing, Cost-Risk, Segment-Market alignment |
| P1 | Add `blockCompleteness` and `provenance` metadata | Observability without complexity |
| P2 | Include GUI's per-block prompts in analysisStep system prompt | Better LLM output quality |
| P3 | Do NOT add completeness scoring | Pass/fail is sufficient |
| P3 | Do NOT add recommendations engine | Validation warnings replace it |

**Recommended Schema v2.0.0**:
```
9 BMC blocks (unchanged): items[] with { text, priority (1-3), evidence }
blockCompleteness: { blockName: itemCount } (new, derived)
warnings: string[] (new, derived) -- cross-block validation
cross_links: array (existing, unchanged)
provenance: { dataSource, model, stagesConsumed[] } (new, derived)
```

---

## Stage 9: Exit Strategy

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-09.js`
**Type**: Passive validation + **active `computeDerived()`** (Reality Gate evaluation)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `exit_thesis` | string | minLength: 20 | Yes |
| `exit_horizon_months` | integer | 1-120 | Yes |
| `exit_paths[]` | array | minItems: 1 | Yes |
| `exit_paths[].type` | string | minLength: 1 | Yes |
| `exit_paths[].description` | string | minLength: 1 | Yes |
| `exit_paths[].probability_pct` | number | 0-100 | No |
| `target_acquirers[]` | array | minItems: 3 | Yes |
| `target_acquirers[].name` | string | minLength: 1 | Yes |
| `target_acquirers[].rationale` | string | minLength: 1 | Yes |
| `target_acquirers[].fit_score` | integer | 1-5 | Yes |
| `milestones[]` | array | minItems: 1 | Yes |
| `milestones[].date` | string | minLength: 1 | Yes |
| `milestones[].success_criteria` | string | minLength: 1 | Yes |

**Schema (Derived -- Reality Gate)**:
| Field | Type | Description |
|-------|------|-------------|
| `reality_gate.pass` | boolean | All Phase 2 prerequisites met |
| `reality_gate.rationale` | string | Summary of pass/fail |
| `reality_gate.blockers` | string[] | Specific items preventing passage |
| `reality_gate.required_next_actions` | string[] | Steps to resolve blockers |

**Reality Gate Requirements** (Phase 2 → Phase 3 transition):
- Stage 06: >= 10 risks captured
- Stage 07: >= 1 tier with non-null LTV and payback
- Stage 08: All 9 BMC blocks populated with items

**Processing**:
- `validate(data)`: Validates all input fields
- `computeDerived(data, prerequisites)`: Evaluates Reality Gate using Stages 6-8 data
- `evaluateRealityGate({ stage06, stage07, stage08 })`: Pure function checking prerequisites
- **No `analysisSteps`** -- exit strategy must be provided externally
- **No valuation methods** -- no DCF, multiples, or comparable transactions
- **No exit readiness checklist**
- **No AI generation**

**CLI Strengths**: Clean Reality Gate with explicit blockers and next actions, `evaluateRealityGate` is a pure exported function (testable), fit_score (1-5) per acquirer for ranking, probability_pct per exit path, milestone-based tracking.

### GUI Implementation (Ground Truth)

**Sources**: `EHG/src/components/stages/v2/Stage9ExitStrategy.tsx` (1,043 lines), `EHG/src/hooks/useExitReadiness.ts` (404 lines), `EHG/src/components/stage-outputs/viewers/Stage9Viewer.tsx` (365 lines)

**GUI Stage 9 -- "Exit-Oriented Design"** (comprehensive exit planning):

**Exit Scenarios** (per scenario):
| Field | Type | Description |
|-------|------|-------------|
| `type` | enum | acquisition/ipo/merger/strategic_sale/mbo/liquidation |
| `buyerType` | enum | strategic/financial/competitor/private_equity |
| `targetValuation` | number | Expected valuation amount |
| `targetMultiple` | number | Revenue/EBITDA multiple |
| `timeframeMonths` | number | Time to exit |
| `probability` | number | 0-100% |
| `keyRequirements` | string[] | What's needed for this path |
| `risks` | string[] | Risks specific to this path |
| `notes` | string | Additional context |

**Valuation Targets** (per method):
- 4 methods: revenue_multiple, ebitda_multiple, dcf, comparable_transactions
- Each has: method, multiple, baseMetric, baseValue, estimatedValuation (derived), comparables[]

**Exit Timeline**: milestone, targetDate, status (not_started/in_progress/completed), dependencies[], owner

**Exit Readiness Checklist**: 6 categories (financials, legal, technical, operational, governance, documentation) as booleans

**Exit Grading**: A-F based on checklist (50%), valid scenario (25%), avg probability (25%)

**AI Features**:
- `assessReadiness()` -- AI-powered readiness scoring
- `generateImprovementPlan()` -- targeted improvement roadmap
- `analyzeExitTiming()` -- market window analysis
- `identifyBuyers()` -- AI buyer candidate identification

**Database**: `exit_readiness_tracking`, `exit_improvement_plans`, `exit_opportunities`, `buyer_candidates` tables

**Prior stage inputs**: Stage 6 risk, Stage 7 pricing, Stage 8 BMC -- consumed for readiness assessment

**4 UI tabs**: Scenarios, Valuation, Timeline, Readiness

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Exit path types | Freeform string | 6 explicit types (acquisition, IPO, etc.) |
| Buyer types | None (just name + rationale) | 4 types (strategic, financial, etc.) |
| Valuation methods | None | 4 methods (revenue multiple, EBITDA, DCF, comps) |
| Target acquirers | 3 min with fit_score (1-5) | Detailed buyer candidates with outreach tracking |
| Exit readiness | None | 6-category checklist with A-F grading |
| Milestones | date + success_criteria | date + status + dependencies + owner |
| Reality Gate | Explicit (Stage 6/7/8 checks) | None (exit grade serves similar purpose) |
| AI generation | None | 4 AI functions (readiness, plans, timing, buyers) |
| Improvement plans | None | AI-generated improvement roadmaps |
| Market timing | None | Market window analysis |
| Prior stage consumption | Stage 6/7/8 via Reality Gate | Stage 6/7/8 via readiness assessment |
| Database tables | None (stage template only) | 4 dedicated tables |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-09-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-09-claude.md`
- OpenAI: `docs/plans/responses/stage-09-openai.md`
- AntiGravity: `docs/plans/responses/stage-09-antigravity.md`

### Synthesis

**Agreement: 3/3 on all major decisions.** Stage 9 produced the strongest consensus yet -- all three respondents converge on the same architecture with only minor differences in enum values and valuation detail level.

#### Unanimous Decisions (3/3)

| Decision | Claude | OpenAI | AntiGravity | Consensus |
|----------|--------|--------|-------------|-----------|
| Add `analysisStep` consuming Stages 1-8 | Yes (P0) | Yes (priority 1) | Yes (most critical gap) | **Add single analysisStep synthesizing exit strategy from all prior stages** |
| Exit type enum (replace freeform) | Yes, 5 values | Yes, 6 values + `other` | Yes, 6 values | **Add exit type enum** (see divergence below for values) |
| Add buyer_type to target_acquirers | Yes, 4 values | Yes, 4 + `other` | Yes, 4 values | **Add buyer_type enum** |
| Lightweight valuation only | Revenue multiple only | Revenue multiple primary, comps secondary | Revenue multiple only | **Revenue multiple with range, no DCF** |
| ELIMINATE exit readiness checklist | Defer to BUILD | Defer to BUILD, keep light signals | Defer to BUILD | **Readiness is execution, not evaluation** |
| PRESERVE CLI Reality Gate | Superior to exit grade | Keep as primary, add optional score | CLI superior | **Keep explicit blockers + next_actions** |
| ELIMINATE dedicated DB tables | Stage artifact sufficient | Over-engineering | Not mentioned (implicit agree) | **No new tables** |
| ELIMINATE exit grading (A-F) | Reality Gate is better | Grade is opaque for automation | Fuzzy grade inferior | **No letter grades** |
| ELIMINATE improvement plans | Execution tool | Not mentioned | Not mentioned | **Deferred to BUILD** |
| BMC-to-exit content mapping | 7-block mapping table | Explicit mapping in analysis output | 4-block mapping | **analysisStep must map BMC blocks to exit components** |
| No dependency conflicts with Stages 1-8 | Minor gap (Stage 4 competitor scale) | No conflicts if lightweight valuation | No conflict | **No blocking conflicts** |

#### Divergence Points

| Topic | Claude | OpenAI | AntiGravity | Resolution |
|-------|--------|--------|-------------|------------|
| **Exit type values** | 5 (drop strategic_sale, it's acquisition + buyer_type) | 6 + `other` (uses orderly_winddown instead of liquidation) | 6 (keeps GUI's full list) | **5 values: acquisition, ipo, merger, mbo, liquidation.** Claude's reasoning is correct: strategic_sale is redundant with acquisition + buyer_type=strategic. OpenAI's `other` is unnecessary -- these 5 cover the standard taxonomy. |
| **Buyer type values** | 4: strategic, financial, competitor, pe | 4 + `other` | 4: strategic, financial, competitor, private_equity | **4 values: strategic, financial, competitor, pe.** No `other` needed -- PE and financial cover the non-strategic categories. |
| **Valuation detail** | Single estimate (base × multiple = value) | Range (low/base/high) + assumptions | Range (conservative/aggressive multiple) | **Range approach wins.** Low/base/high is more honest than a single number at blueprint stage. Avoids the anchoring bias Claude warned about. |
| **Milestone enrichment** | Add optional `category` (financial/product/market/team) | Add `dependencies[]` only | Keep simple | **Add category only.** Dependencies are execution-phase; at blueprint, milestones are independent planning artifacts. Category provides useful grouping. |
| **Reality Gate additions** | No changes | Add optional readiness_score (0-100) | Add exit_thesis quality check | **No additions.** The Reality Gate checks Phase 2 completeness, not exit quality. Adding scores or quality checks blurs its purpose. Keep it pure. |
| **Contrarian focus** | Valuation false precision / anchoring bias | Over-modeled mini-M&A system | AI hallucination of acquirers (suggests "Google" for everything) | **All three raise valid risks.** Claude's anchoring bias concern is addressed by using ranges. AntiGravity's hallucination risk is addressed by requiring rationale + human review. OpenAI's over-engineering warning validates the "keep it light" consensus. |

#### Stage 9 Consensus Schema

```
exit_thesis: string (minLength: 20, required)
exit_horizon_months: integer (1-120, required)
exit_paths[]: array (minItems: 1)
  .type: enum [acquisition, ipo, merger, mbo, liquidation] (required)
  .description: string (required)
  .probability_pct: number (0-100)
target_acquirers[]: array (minItems: 3)
  .name: string (required)
  .rationale: string (required)
  .fit_score: integer (1-5, required)
  .buyer_type: enum [strategic, financial, competitor, pe] (NEW)
milestones[]: array (minItems: 1)
  .date: string (required)
  .success_criteria: string (required)
  .category: enum [financial, product, market, team] (NEW, optional)
valuation_estimate: object (NEW)
  .method: string (default: revenue_multiple)
  .revenue_base: number
  .multiple_low: number
  .multiple_base: number
  .multiple_high: number
  .estimated_range: { low, base, high } (derived)
  .rationale: string
reality_gate: object (derived, UNCHANGED)
provenance: object (derived, NEW -- tracks analysisStep source)
```

**Changes from CLI v1**: (1) exit_paths.type freeform → 5-value enum, (2) buyer_type added to acquirers, (3) milestone category added, (4) valuation_estimate added with range, (5) provenance tracking added, (6) Reality Gate preserved unchanged.

**Eliminated from GUI**: exit readiness checklist, A-F grading, 4 AI functions (replaced by single analysisStep), 4 dedicated DB tables, improvement plans, outreach tracking, strategic_sale exit type (redundant).

#### BMC-to-Exit Mapping (for analysisStep prompt)

| BMC Block | Exit Strategy Application |
|-----------|--------------------------|
| Revenue Streams | Valuation method selection (recurring → revenue multiple) |
| Key Partnerships | Potential acquirer targets (partners who might acquire) |
| Cost Structure | Profitability profile (high margin → PE interest) |
| Customer Segments | Buyer audience (who wants access to these users?) |
| Value Propositions | IP/technology value for acquirers |
| Key Resources | Assets of interest (tech, talent, data) |
| Channels | Distribution value for strategic acquirers |

#### Contrarian Synthesis

All three raised legitimate risks that reinforce the "keep it light" consensus:
- **False precision** (Claude): Revenue multiples on pre-revenue ventures are educated guesses. Ranges mitigate this.
- **Over-engineering** (OpenAI): Stage 9 should optimize for decision quality at phase transition, not simulation completeness.
- **AI hallucination** (AntiGravity): Acquirer suggestions like "Google" for everything are a real risk. Rationale + fit_score + human review are the defense.

The consensus architecture balances these risks: structured enough for downstream parsing (enums, ranges), honest enough to avoid false precision (ranges not point estimates), and light enough to avoid mini-M&A theater.

---

## Stage 10: Naming / Brand

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-10.js`
**Phase**: THE IDENTITY (Stages 10-12)
**Type**: Passive validation + **active `computeDerived()`** (weighted scoring + ranking)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `brandGenome.archetype` | string | minLength: 1 | Yes |
| `brandGenome.values` | array | minItems: 1 | Yes |
| `brandGenome.tone` | string | minLength: 1 | Yes |
| `brandGenome.audience` | string | minLength: 1 | Yes |
| `brandGenome.differentiators` | array | minItems: 1 | Yes |
| `scoringCriteria[]` | array | minItems: 1, weights sum to 100 | Yes |
| `scoringCriteria[].name` | string | minLength: 1 | Yes |
| `scoringCriteria[].weight` | number | 0-100 | Yes |
| `candidates[]` | array | minItems: 5 | Yes |
| `candidates[].name` | string | minLength: 1 | Yes |
| `candidates[].rationale` | string | minLength: 1 | Yes |
| `candidates[].scores` | object | Score per criterion (0-100) | Yes |

**Schema (Derived)**:
| Field | Type | Description |
|-------|------|-------------|
| `candidates[].weighted_score` | number | Weighted average of scores × criteria weights |
| `ranked_candidates` | array | Candidates sorted by weighted_score descending |

**Processing**:
- `validate(data)`: Validates brand genome (5 keys), criteria weights sum to 100, min 5 candidates with scores per criterion
- `computeDerived(data)`: Computes weighted scores, sorts into ranked_candidates
- **No `analysisSteps`** -- brand genome, criteria, and candidates must be provided externally
- **No AI generation** -- no name generation, no brand archetype suggestion
- **No domain availability checking**
- **No trademark checking**
- **No visual identity** (colors, fonts, design style)
- **No cultural style selection**

**CLI Strengths**: Clean weighted scoring (weights sum to 100), minimum 5 candidates forces breadth, per-criterion scores allow nuanced ranking, brand genome captures strategic identity (archetype, tone, values, audience, differentiators).

### GUI Implementation (Ground Truth)

**Sources**: `Stage10TechnicalReview.tsx` (technical assessment), `Stage10Narrative.tsx` (brand positioning), `Stage10Viewer.tsx` (naming output), `Stage10TechnicalValidator.tsx` (blocker detection), `useTechnicalReview.ts` (hook)

**IMPORTANT: Stage mapping divergence.** The GUI's Stage 10 is "Technical Review" -- a fundamentally different stage than the CLI's "Naming / Brand". The GUI combines technical feasibility assessment with brand narrative, while the CLI separates these concerns.

**GUI Stage 10 has THREE sub-components**:

**A. Technical Review** (Stage10TechnicalReview.tsx):
- 6 assessment categories: Architecture, Security, Scalability, Data, Infrastructure, Performance
- Each category scored 0-10, total max 60, displayed as percentage
- 19 validation rules across 4 domains (Architecture AR-001 to AR-005, Security SE-001 to SE-005, Scalability SC-001 to SC-005, Maintainability MA-001 to MA-004)
- 10 artifact types (system_architecture, database_schema, api_specification, security_plan, deployment_plan, testing_strategy, performance_requirements, integration_map, data_flow_diagram, infrastructure_requirements)
- Readiness status: blocked / incomplete / needs_review / conditionally_ready / ready / approved

**B. Strategic Narrative** (Stage10Narrative.tsx):
- Vision statement, mission statement, value proposition, target audience, market position
- Brand voice, cultural style (5 predefined design aesthetics), strategic narrative (AI-generatable)
- Key messages[] and differentiators[] (dynamic arrays)
- 5 cultural styles: California Modern, Tech Forward, Classic Professional, Playful Creative, Eco Sustainable
- Each style has color palette (4 colors) and characteristics badges
- 3 tabs: Narrative, Positioning, Cultural Style

**C. Stage10Viewer (naming output)**:
- Name candidates with: score (0-100), domain availability, trademark status, pros/cons
- Visual identity: colors, fonts, visual style
- Brand guidelines by category with rationale
- Composite score, confidence, unified decision (ADVANCE/REVISE/REJECT)

**D. Technical Validator** (Stage10TechnicalValidator.tsx):
- TECH-001 recursion scenarios: blockers → Stage 8, timeline impact → Stage 7, cost impact → Stage 5, feasibility → Stage 3
- Chairman override required for critical blockers

**Database**: `technical_reviews`, `technical_artifacts`, `chairman_technical_overrides`

**Prior stage inputs**: All Stages 1-9 data passed as props

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Stage name | Naming / Brand | Technical Review |
| Primary purpose | Brand identity + name selection | Technical feasibility + brand narrative |
| Brand genome | 5-key object (archetype, values, tone, audience, differentiators) | Split across Narrative component (vision, mission, brand voice, cultural style) |
| Name candidates | 5+ with weighted multi-criteria scoring | Name candidates in viewer with domain/trademark checks |
| Scoring | User-defined criteria with weights summing to 100 | 6 technical categories (0-10 each) |
| Technical assessment | None | 6 categories, 19 rules, 10 artifact types |
| Cultural/design style | None | 5 predefined styles with color palettes |
| Domain checking | None | Domain availability status |
| Trademark checking | None | Trademark status (available/pending/conflict/unknown) |
| Visual identity | None | Colors, fonts, visual style |
| AI generation | None | Strategic narrative generation |
| Recursion | None | TECH-001 back to Stages 3-8 |
| Gate type | None | None (no blocker) |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-10-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-10-claude.md`
- OpenAI: `docs/plans/responses/stage-10-openai.md`
- AntiGravity: `docs/plans/responses/stage-10-antigravity.md`

### Synthesis

**Agreement: 3/3 on core architecture, meaningful divergence on brand genome expansion and decision gates.** Stage 10 produced the first real debate in the analysis -- how much "brand strategy" belongs in the naming stage.

#### Unanimous Decisions (3/3)

| Decision | Claude | OpenAI | AntiGravity | Consensus |
|----------|--------|--------|-------------|-----------|
| Add `analysisStep` consuming Stages 1-9 | Yes (P0) | Yes (priority 1) | Yes (priority 4, but agreed) | **Add single analysisStep generating brand genome + name candidates from prior stages** |
| Stage mapping: CLI is correct | Technical review belongs in Stage 14 | No tech review contamination | Correctly out-of-scope for Identity | **CLI's "Naming/Brand" scope is correct. GUI's technical review at Stage 10 is a design error.** |
| Preserve flexible weighted scoring | Keep user-defined criteria | Keep flexible + add defaults | Keep CLI scoring, add hybrid | **Keep fully flexible scoring with weights summing to 100** |
| Defer full visual identity | Defer to BUILD | Defer, add visual_direction only | Defer, add visual_direction only | **Defer full visual identity. Optional visual_direction string at most.** |
| Defer live domain/trademark checking | Defer live checks | Defer real checks | Defer automated checks | **No live checking at IDENTITY phase** |
| Exit strategy informs brand positioning | buyer_type → brand tone | exit_type/buyer_type → naming strategy | Exit Strategy as Brand Editor | **Stage 9 buyer_type and exit_type must flow into analysisStep as brand conditioning** |
| No dependency conflicts | None blocking | Wiring/contract tasks only | Stage 1 sparseness risk, Stage 9 gate check | **No blocking conflicts** |

#### Divergence Points

| Topic | Claude | OpenAI | AntiGravity | Resolution |
|-------|--------|--------|-------------|------------|
| **Brand genome expansion** | Add optional `positioning_statement` only. Vision/mission are premature. | Add narrative extension (vision/mission/voice/messages/position) as separate layer. | Restructure into Identity/Purpose/Expression/Market subgroups with vision + mission. | **Add narrative extension as optional layer.** OpenAI's core+narrative split is the right balance. Keep existing 5-key genome as `core`, add `narrative` (vision, mission, brand_voice, key_messages[]) as optional fields populated by analysisStep. Don't restructure the existing schema -- extend it. |
| **Decision output** | Ranking IS the decision. ADVANCE/REVISE/REJECT adds complexity without clarity. | Add soft decision signal (ADVANCE/REVISE). | Need decision field + "Working Title" status. | **Add soft `decision` object.** Claude's point about ranking-as-decision is valid, but Stage 11 needs a clear signal: "Is naming complete or does it need more work?" Use `status: approved | revise | working_title` -- AntiGravity's "working_title" option handles the contrarian case well. |
| **Domain/trademark schema** | Defer entirely (trademark) / heuristic suggestions only (domain) | Add placeholder fields (not_checked status) | Include as schema with unknown/available/taken statuses | **Add placeholder fields with `not_checked` default.** OpenAI/AntiGravity are right that the schema should support storing results even if checking is deferred. Claude's point about false confidence is valid -- status defaults to `not_checked`. |
| **Candidate count** | Generate 7-10 | Generate 12-20, shortlist to 5-8 | Generate 10, curate to 5 | **Generate 8-12, shortlist to 5+.** 20 is excessive; 7 is tight. 8-12 gives diversity without noise. Keep minItems: 5 for the final shortlist. |
| **Candidate metadata** | naming_approach enum (6 values) + domain_suggestions | strategy_cluster + semantic_tags[] + risks[] | origin + risks + availability object | **Add naming_strategy enum + risks[].** All three want some kind of naming approach classification. Claude's 6-value enum (portmanteau, metaphor, acronym, invented, real_word, compound) is the cleanest. Add `risks[]` per OpenAI/AntiGravity for negative connotation flags. Drop semantic_tags (redundant with rationale). |
| **Default scoring criteria** | Suggest defaults based on venture type (B2B vs B2C) | Provide editable default rubric (6 criteria) | Hybrid: mandatory validity + custom criteria | **Provide suggested defaults, keep fully flexible.** The analysisStep should propose criteria and weights based on venture type. Users accept or customize. Don't make any criteria mandatory -- that removes the CLI's flexibility advantage. |
| **Contrarian focus** | naming_approach and domain_suggestions may be unnecessary noise | Over-engineering identity too early, analysis theater | The name doesn't matter yet, use working title | **AntiGravity's contrarian is the strongest.** The "working_title" concept is pragmatic -- ventures may pivot. The `decision.status = working_title` option addresses this without deferring naming entirely. |

#### Stage 10 Consensus Schema

```
brandGenome: object (required)
  .archetype: string (required) -- existing
  .values: array (minItems: 1) -- existing
  .tone: string (required) -- existing
  .audience: string (required) -- existing
  .differentiators: array (minItems: 1) -- existing
  .positioning_statement: string (optional, NEW)
  .narrative: object (optional, NEW -- populated by analysisStep)
    .vision: string
    .mission: string
    .brand_voice: string
    .key_messages: array

scoringCriteria[]: array (minItems: 1, weights sum to 100) -- existing, unchanged

candidates[]: array (minItems: 5)
  .name: string (required) -- existing
  .rationale: string (required) -- existing
  .naming_strategy: enum [portmanteau, metaphor, acronym, invented, real_word, compound] (NEW, optional)
  .risks: array (NEW, optional -- negative connotation flags)
  .availability: object (NEW, optional)
    .domain_status: enum [not_checked, available, taken] (default: not_checked)
    .trademark_status: enum [not_checked, clear, conflict, unknown] (default: not_checked)
    .notes: string
  .scores: object (required) -- existing
  .weighted_score: number (derived) -- existing

ranked_candidates: array (derived) -- existing, unchanged

decision: object (NEW)
  .selected_name: string
  .status: enum [approved, revise, working_title]
  .rationale: string

provenance: object (derived, NEW)
```

**Changes from CLI v1**: (1) Added optional narrative extension to brandGenome, (2) Added positioning_statement, (3) Added naming_strategy enum to candidates, (4) Added risks[] per candidate, (5) Added availability placeholder per candidate, (6) Added decision object with working_title option, (7) Added provenance tracking. All existing fields preserved unchanged.

**Eliminated from GUI**: Cultural design styles (5 presets → defer), full visual identity system, technical review content (→ Stage 14), AI readiness assessment, improvement plans, dedicated brand/naming database tables.

#### Contrarian Synthesis

The three contrarian takes form a coherent argument:
- **Naming approach is retrospective** (Claude): Classification doesn't help users decide. But it does help users verify diversity of options.
- **Over-engineering identity** (OpenAI): Risk of "analysis theater" before market traction. Mitigated by keeping the schema lean and most additions optional.
- **The name doesn't matter yet** (AntiGravity): The strongest argument. Ventures pivot. The `working_title` status is the elegant solution -- it acknowledges that naming is important for Stage 11 GTM but may change.

The consensus architecture handles this: the `decision.status = working_title` option lets ventures proceed with a provisional name without pretending it's final.

---

## Stage 11: Go-To-Market

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-11.js`
**Phase**: THE IDENTITY (Stages 10-12)
**Type**: Passive validation + **active `computeDerived()`** (budget/CAC aggregation)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `tiers[]` | array | exactItems: 3 | Yes |
| `tiers[].name` | string | minLength: 1 | Yes |
| `tiers[].description` | string | minLength: 1 | Yes |
| `tiers[].tam` | number | min: 0 | No |
| `tiers[].sam` | number | min: 0 | No |
| `tiers[].som` | number | min: 0 | No |
| `channels[]` | array | exactItems: 8 | Yes |
| `channels[].name` | string | minLength: 1 | Yes |
| `channels[].monthly_budget` | number | min: 0 | Yes |
| `channels[].expected_cac` | number | min: 0 | Yes |
| `channels[].primary_kpi` | string | minLength: 1 | Yes |
| `launch_timeline[]` | array | minItems: 1 | Yes |
| `launch_timeline[].milestone` | string | minLength: 1 | Yes |
| `launch_timeline[].date` | string | minLength: 1 | Yes |
| `launch_timeline[].owner` | string | | No |

**Schema (Derived)**:
| Field | Type | Description |
|-------|------|-------------|
| `total_monthly_budget` | number | Sum of all channel budgets |
| `avg_cac` | number | Average CAC across channels with CAC > 0 |

**Predefined channel names** (12 available): Organic Search, Paid Search, Social Media, Content Marketing, Email Marketing, Partnerships, Events, Direct Sales, Referrals, PR/Media, Influencer Marketing, Community.

**Processing**:
- `validate(data)`: Validates exactly 3 tiers, exactly 8 channels with budget/CAC/KPI, launch timeline min 1
- `computeDerived(data)`: Sums total budget, averages CAC (excluding zero-CAC channels)
- **No `analysisSteps`** -- tiers, channels, and timeline must be provided externally
- **No AI generation**
- **No channel type classification** (paid/organic/earned/owned)
- **No segment personas** or pain points
- **No conversion rate estimates**
- **No GTM metrics** beyond budget and CAC

**CLI Strengths**: Exact 3-tier market segmentation (forces TAM/SAM/SOM thinking), exact 8-channel allocation (forces breadth), per-channel budget + CAC + KPI, derived budget/CAC aggregation, 12 predefined channel names.

### GUI Implementation (Ground Truth)

**Sources**: `Stage11GtmStrategy.tsx` (active per SSOT), `Stage11Viewer.tsx` (output viewer). Note: GUI has multiple conflicting Stage 11 implementations (GtmStrategy, MvpDevelopment, Naming) but venture-workflow.ts routes to GtmStrategy.

**Input component** (Stage11GtmStrategy.tsx):
- Target markets: name, size, priority (primary/secondary/tertiary), characteristics
- Acquisition channels: channel, strategy, budget, expectedCac, selected boolean
- Default channels: Content Marketing, SEM, Social Media Ads, Email Marketing, Partnerships, SEO, Referral Program, Direct Sales
- Launch timeline: milestone, targetDate, status (pending/in_progress/completed)
- Launch date, gtmApproach field

**Output viewer** (Stage11Viewer.tsx -- richer than input):
- Marketing channels: channel, type (paid/organic/earned/owned), priority (primary/secondary/experimental), budget_allocation_pct, expected_cac, expected_reach, tactics[]
- Target segments: name, persona, size, priority, pain_points[], acquisition_channels[], estimated_conversion_pct
- Launch milestones: phase, name, target_date, objectives[], success_metrics[], status
- GTM metrics: total_marketing_budget, expected_leads_first_quarter, target_conversion_rate, expected_customers_year_one, cac_target
- Decision: ADVANCE / REVISE / REJECT
- Key findings, red flags, composite score, confidence

**Multiple implementations confusion**: Stage 11 has 6 component files (GtmStrategy, MvpDevelopment, Naming, legacy variants). SSOT routes to GtmStrategy.

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Market tiers | Exactly 3 with TAM/SAM/SOM | Variable count with priority enum |
| Channel count | Exactly 8 | Variable (8 default, toggle-based) |
| Channel metadata | budget + CAC + KPI | budget + CAC + strategy + type + priority + reach + tactics[] |
| Channel types | None | paid/organic/earned/owned classification |
| Segment depth | name + description | persona + pain_points[] + conversion_pct |
| Launch timeline | milestone + date + owner | milestone + date + status + objectives[] + success_metrics[] |
| GTM metrics | total_budget + avg_cac | budget + leads + conversion + customers + CAC target |
| AI generation | None | None in input (viewer shows AI-processed output) |
| Decision | None | ADVANCE/REVISE/REJECT |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-11-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-11-claude.md`
- OpenAI: `docs/plans/responses/stage-11-openai.md`
- AntiGravity: `docs/plans/responses/stage-11-antigravity.md`

### Synthesis

**Agreement: 3/3 on all critical decisions. One genuine debate on channel count rigidity.**

#### Unanimous Decisions (3/3)

| Decision | Claude | OpenAI | AntiGravity | Consensus |
|----------|--------|--------|-------------|-----------|
| Add `analysisStep` consuming Stages 1-10 | Yes (P0) | Yes (priority 1) | Yes (priority 2) | **Add single analysisStep generating tiers + channels + timeline from prior stages** |
| Add channel_type classification | paid/organic/earned/owned (4 types) | paid/organic/earned/owned + priority | PAID/ORGANIC/EARNED/OWNED/PARTNER (5 types) | **Add channel_type enum: paid, organic, earned, owned** (4 values -- "partner" is a subset of "earned") |
| Add persona + pain_points to tiers | Yes, defer conversion_pct | persona-lite + top 3 pain_points + value_claim | persona + pain_points + behavior | **Add persona (string) + pain_points[] to tiers. Stage 12 depends on these.** |
| Keep exactly 3 tiers | Yes (forces TAM/SAM/SOM discipline) | Yes (good forcing function) | Yes (preserve rigidity) | **Keep exactItems: 3** |
| Add CAC/LTV coherence check | Warnings (CAC < LTV, payback feasibility) | Critical gate (ltv_cac_ratio >= 3.0) | Hard warning (CAC > LTV/3) | **Add coherence warnings: CAC < LTV, payback feasibility. Warnings, not blockers.** |
| Stage 10 brand → channel selection | Archetype/tone → channel voice/selection | Archetype/tone/audience → channel fit | Archetype → channel tactics | **Brand genome informs channel selection and messaging tone** |
| Add milestone objectives | Add objectives but not status | Add objective + success_metric | Partial (deliverables) | **Add objectives[] per milestone. Do NOT add status tracking.** |
| No blocking dependency conflicts | Minor (Stage 4 lacks explicit channels) | Schema normalization needed | Stage 5 vs 11 budget conflict (warning) | **No blocking conflicts. Budget top-down vs bottom-up divergence is expected and should be flagged.** |

#### Divergence Points

| Topic | Claude | OpenAI | AntiGravity | Resolution |
|-------|--------|--------|-------------|------------|
| **Channel count** | Relax to 5-12 | Relax to 5-10 with validation rules | KEEP exactly 8, allow $0 budget channels | **Keep exactly 8 but allow $0 budget channels.** AntiGravity makes the strongest argument: forced breadth is the EVA method. A $0 budget channel with a KPI is a "backlog channel" -- acknowledged but not funded yet. Claude's contrarian take actually supports this. The constraint moves from "must spend on 8" to "must consider 8." |
| **Conversion rate** | Defer entirely (too speculative) | Add range (low/high, not exact) | Add est_conversion_rate (0-1) | **Add conversion_pct_range as optional (low/high).** OpenAI's range approach is the most honest. Not exact, not absent. Optional because early-stage ventures genuinely can't estimate this. |
| **Funnel metrics depth** | total_budget, avg_cac, budget_allocation_pct, estimated_monthly_acquisitions, cac_to_ltv_ratio | Full funnel: leads_q1_range, conversion_pct_range, customers_year_one_range, payback_months | projected_monthly_leads, projected_monthly_customers, cac_payback_sanity_check | **Add derived funnel metrics: estimated_monthly_acquisitions (budget/CAC), cac_to_ltv_ratio (cross-stage). Add funnel_assumptions as analysisStep output (ranges, not point estimates). Label everything "estimated."** |
| **Channel priority field** | Not mentioned | Add priority: primary/secondary/experimental | Not mentioned (but allows $0 budget) | **Do NOT add priority enum.** Budget allocation already implies priority. A channel with 30% of budget is "primary" by definition. Adding a priority label on top is redundant. |
| **Tactics per channel** | Not in schema | Add tactics[] | Add tactics[] | **Add tactics[] (optional).** Both external respondents want it. Brief (1-2 bullet) tactical notes help the analysisStep output be actionable. |
| **Decision output** | approved/revise only | ADVANCE/REVISE/REJECT + reason | Not mentioned | **Add decision: approved/revise only.** REJECT doesn't fit GTM -- you adjust strategy, you don't reject having a market. Following Stage 10 pattern. |
| **Contrarian focus** | FOR keeping 8 channels (constraint breeds strategy) | Over-specifying creates false precision | CAC at IDENTITY phase is hallucination | **AntiGravity's CAC contrarian is the strongest.** Pre-revenue CAC estimates are speculative. But they force quantitative thinking about acquisition costs. Resolution: rename field to `target_cac` to signal it's aspirational, not measured. |

#### Stage 11 Consensus Schema

```
tiers[]: array (exactItems: 3)
  .name: string (required)
  .description: string (required)
  .persona: string (NEW)
  .pain_points: array (NEW)
  .tam: number
  .sam: number
  .som: number
  .conversion_pct_range: { low, high } (NEW, optional)

channels[]: array (exactItems: 8)
  .name: string (required)
  .channel_type: enum [paid, organic, earned, owned] (NEW)
  .monthly_budget: number (required, min: 0 -- $0 allowed for backlog channels)
  .target_cac: number (required, min: 0) -- RENAMED from expected_cac
  .primary_kpi: string (required)
  .tactics: array (NEW, optional)

launch_timeline[]: array (minItems: 1)
  .milestone: string (required)
  .date: string (required)
  .owner: string
  .objectives: array (NEW)

total_monthly_budget: number (derived)
avg_cac: number (derived)
budget_allocation: array (derived, NEW -- per-channel %)
estimated_monthly_acquisitions: number (derived, NEW -- budget/CAC)
cac_to_ltv_ratio: number (derived, NEW -- cross-stage with Stage 7)
coherence_warnings: array (derived, NEW -- flags for unsustainable economics)

funnel_assumptions: object (NEW, analysisStep output)
  .leads_q1_range: { low, high }
  .customers_year_one_range: { low, high }

decision: object (NEW)
  .status: enum [approved, revise]
  .rationale: string

provenance: object (derived, NEW)
```

**Changes from CLI v1**: (1) Added persona + pain_points to tiers, (2) Added channel_type enum, (3) Renamed expected_cac → target_cac, (4) Added tactics[], (5) Added milestone objectives, (6) Added funnel metrics + coherence warnings, (7) Added decision object, (8) Kept exactly 8 channels but allow $0 budget. All existing fields preserved.

**Eliminated from GUI**: milestone status tracking, expected_reach, full persona documents, campaign-level operational metrics, REJECT decision option.

#### Contrarian Synthesis

Three distinct contrarian angles that form a coherent warning:
- **Constraint is educational** (Claude): Keeping 8 channels forces founders to think broadly. The $0 budget allowance makes this practical.
- **False precision risk** (OpenAI): Over-specifying creates the illusion of certainty. Ranges instead of point estimates mitigate this.
- **CAC is hallucination** (AntiGravity): Pre-revenue CAC estimates are speculative. Renaming to `target_cac` acknowledges the aspiration while preserving the forcing function.

The consensus handles all three: 8 channels with $0 allowed (constraint without waste), ranges for funnel metrics (honest uncertainty), and `target_cac` naming (aspiration, not measurement).

---

## Stage 12: Sales Logic

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-12.js`
**Phase**: THE IDENTITY (Stages 10-12) -- **final stage of THE IDENTITY phase**
**Type**: Passive validation + **active `computeDerived()`** (Reality Gate evaluation)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `sales_model` | enum | self-serve/inside-sales/enterprise/hybrid/marketplace/channel | Yes |
| `sales_cycle_days` | number | min: 1 | Yes |
| `deal_stages[]` | array | minItems: 3 | Yes |
| `deal_stages[].name` | string | minLength: 1 | Yes |
| `deal_stages[].description` | string | minLength: 1 | Yes |
| `deal_stages[].avg_duration_days` | number | min: 0 | No |
| `funnel_stages[]` | array | minItems: 4 | Yes |
| `funnel_stages[].name` | string | minLength: 1 | Yes |
| `funnel_stages[].metric` | string | minLength: 1 | Yes |
| `funnel_stages[].target_value` | number | min: 0 | Yes |
| `customer_journey[]` | array | minItems: 5 | Yes |
| `customer_journey[].step` | string | minLength: 1 | Yes |
| `customer_journey[].funnel_stage` | string | minLength: 1 | Yes |
| `customer_journey[].touchpoint` | string | minLength: 1 | Yes |

**Schema (Derived -- Reality Gate)**:
| Field | Type | Description |
|-------|------|-------------|
| `reality_gate.pass` | boolean | All Phase 3 prerequisites met |
| `reality_gate.rationale` | string | Summary of pass/fail |
| `reality_gate.blockers` | string[] | Specific items preventing passage |
| `reality_gate.required_next_actions` | string[] | Steps to resolve blockers |

**Reality Gate Requirements** (Phase 3 → Phase 4 transition):
- Stage 10: >= 5 scored naming candidates
- Stage 11: exactly 3 tiers and 8 channels
- Stage 12: >= 4 funnel stages with metrics, >= 5 journey steps

**Processing**:
- `validate(data)`: Validates sales_model enum, deal stages, funnel stages, customer journey
- `computeDerived(data, prerequisites)`: Evaluates Reality Gate using Stages 10-12 data
- `evaluateRealityGate({ stage10, stage11, stage12 })`: Pure exported function checking all prerequisites
- **No `analysisSteps`** -- sales logic must be provided externally
- **No conversion rates** per deal stage (just duration)
- **No LTV/CAC tracking** (cross-stage only)
- **No success metrics** with frequency/owner

**CLI Strengths**: 6-value sales_model enum (forces model choice), clean deal pipeline (stages with durations), funnel stages with quantitative metrics, customer journey mapped to funnel stages, Reality Gate as pure function (Phase 3→4 transition check), imports Stage 10/11 constants for cross-stage validation.

### GUI Implementation (Ground Truth)

**Sources**: `Stage12SalesSuccessLogic.tsx` (active per SSOT), `Stage12Viewer.tsx` (shows adaptive naming output -- different purpose)

**Active component** (Stage12SalesSuccessLogic.tsx):
- Sales pipeline: 5 default stages (Lead → Qualified → Demo/Trial → Proposal → Closed Won), each with conversionRate, avgTimeInStage, actions, description
- Success metrics: user-defined with name, target, frequency (daily/weekly/monthly/quarterly), owner
- Customer journey milestones: stage, milestone, triggerAction, successCriteria
- Key metrics: salesCycle, avgDealSize, targetLtv, targetCac, calculated LTV:CAC ratio
- No sales model enum
- No Reality Gate

**Stage12Viewer** (different purpose -- adaptive naming):
- Brand variants with variant_type, confidence_delta, domain/trademark status
- Market test results
- ADVANCE/REVISE/REJECT decision
- Not aligned with sales logic

**Additional Stage 12 components** (not SSOT-active):
- Stage12Resources.tsx: team/budget/technical resource planning
- Stage12TechnicalImplementation.tsx: tech stack documentation
- Stage12AdaptiveNaming.tsx: brand variant management

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Sales model | 6-value enum (self-serve, enterprise, etc.) | None (no model classification) |
| Deal/pipeline stages | min 3, name + description + duration | 5 default with conversion rates + actions |
| Funnel stages | min 4, name + metric + target_value | Not integrated (separate ROI dashboard) |
| Customer journey | min 5 steps mapped to funnel stages | Milestones with triggerAction + successCriteria |
| Sales metrics | None (via funnel target_values) | salesCycle, avgDealSize, targetLtv, targetCac, LTV:CAC |
| Success metrics | None | User-defined with frequency + owner |
| Conversion rates | None | Per pipeline stage |
| Reality Gate | Explicit Phase 3→4 check (Stages 10-12) | None (gateType: none) |
| Brand variants | None | Adaptive naming with market testing |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-12-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-12-claude.md`
- OpenAI: `docs/plans/responses/stage-12-openai.md`
- AntiGravity: `docs/plans/responses/stage-12-antigravity.md`

### Synthesis

**Consensus strength**: Strong (3/3 on core architecture, 2/3 on most details)

#### Unanimous Decisions (3/3)

| Decision | Claude | OpenAI | AntiGravity | Confidence |
|----------|:------:|:------:|:-----------:|:----------:|
| Keep CLI deal/funnel stage separation | Y | Y | Y | High |
| Keep 6-value sales_model enum | Y | Y | Y | High |
| Add `analysisStep` consuming Stages 5/7/10/11 | Y | Y | Y | High |
| Enhance Reality Gate beyond count checks | Y | Y | Y | High |
| Don't duplicate LTV/CAC in Stage 12 | Y | Y (ref only) | Y (split brain risk) | High |
| Add conversion rates to schema | Y | Y | Y | High |
| Enrich customer journey beyond touchpoint | Y | Y | Y | High |
| No upstream dependency conflicts | Y | Y | Y (minor Stage 7 watch) | High |

#### Divergences Resolved

**1. Where to put conversion rates** (deal stages vs funnel stages)
- Claude: `conversion_rate` on deal_stages (enables per-stage funnel math)
- OpenAI: `baseline_conversion` + `target_conversion` on funnel_stages
- AntiGravity: `conversion_rate_estimate` on funnel_stages (enables dynamic target calculation)
- **Resolution: funnel_stages** (2:1). Funnel stages measure volume flow; deal stages measure workflow progression. Conversion is inherently a volume metric. AntiGravity's insight is key: storing rates on funnel stages enables `Stage N Target = Stage N-1 Target × Rate`, which is more powerful than static targets alone.
- **Field name**: `conversion_rate_estimate` (signals these are projections, not actuals)

**2. Customer journey enrichment scope**
- Claude: Add `touchpoint_type` (automated/manual/hybrid)
- AntiGravity: Add `trigger` + `exit_criteria`
- OpenAI: Add `trigger_action` + `success_criteria` + `owner`
- **Resolution**: Add `trigger` (what advances the customer -- 2/3 want it). Add `touchpoint_type` (1/3 but analytically valuable for sales model alignment: self-serve=automated, enterprise=manual). Skip `exit_criteria`/`success_criteria` (execution detail). Skip `owner` (pre-team at IDENTITY phase, AntiGravity correctly calls this premature).
- **Fields added**: `trigger`, `touchpoint_type` (enum: automated/manual/hybrid)

**3. Success metrics (owner + frequency)**
- Claude: Don't add (P3, execution tracking)
- AntiGravity: Ignore (premature at IDENTITY)
- OpenAI: Add `success_metrics[]` with owner/frequency
- **Resolution: Don't add** (2:1). At IDENTITY phase, there's no team to assign owners to. Funnel target_values already define success thresholds. Push to Stage 13+ execution planning.

**4. Deal stage enrichment**
- Claude: No enrichment (just add conversion_rate, resolved above to funnel instead)
- AntiGravity: Add `mapped_funnel_stage` (link deal stages to funnel stages)
- OpenAI: Add optional `entry_criteria`, `exit_criteria`, `key_actions`
- **Resolution**: Add `mapped_funnel_stage` (lightweight traceability, enforces deal→funnel relationship). Skip entry/exit criteria and key_actions (execution detail for IDENTITY phase).

**5. Sales metrics handling**
- Claude: Add only `avg_deal_size` (new, not captured elsewhere). Cross-reference Stage 5/7 for rest.
- AntiGravity: Add nothing. AnalysisStep reads from prior stages (split brain risk).
- OpenAI: Add lightweight `sales_kpis_snapshot` (references, not recomputation)
- **Resolution**: Add `avg_deal_size` only (Claude's insight: connects pricing ARPA to sales reality with discounts/multi-seat). All other metrics (CAC, LTV, churn) are read from Stages 5/7/11 by the analysisStep. No snapshot object -- the provenance tracking already handles cross-stage references.

**6. Reality Gate enhancement scope**
- Claude: Add Stage 10 decision status check, Stage 11 non-zero budget channel, Stage 12 conversion rates present
- AntiGravity: Add coherence check (deal→funnel mapping), velocity check (cycle = sum of durations), **Economy Check** (funnel volume × conversion × price ≥ revenue target)
- OpenAI: Sales model vs channel mix, cycle vs pricing/CAC, journey covers funnel transitions, named metric owners
- **Resolution**: Preserve existing count checks. Add:
  1. **Coherence check**: deal_stages must map to funnel_stages via `mapped_funnel_stage`
  2. **Velocity check**: `sales_cycle_days` ≈ sum of `deal_stages[].avg_duration_days` (±20% tolerance)
  3. **Economy Check** (AntiGravity's key contribution): Stage 11 lead volume × Stage 12 conversion rates × Stage 7 price ≥ Stage 5 revenue target. If this fails, the venture identity is mathematically invalid. This is the most impactful Reality Gate enhancement.
  4. Skip owner/frequency checks (no success metrics added)

#### Contrarian Synthesis

All three raised valid concerns about over-engineering:
- **Claude**: Sales model enum might lock in too early → Mitigate by having analysisStep propose model with rationale AND flag alternatives
- **AntiGravity**: Deal stages are premature CRM → Counter: sales cycle length/complexity defines venture DNA, but keep deal stages lightweight (no entry/exit criteria)
- **OpenAI**: Over-engineering operational detail → Counter: keep generated defaults, require only coherence-critical fields

The synthesis reflects these concerns: minimal new fields, conversion rates on the analytically correct entity (funnel), no execution-time fields (owners, frequencies), and the Economy Check as the only "heavy" addition (but it's derived, not user-input).

#### Consensus Schema (Stage 12 v2.0)

```javascript
const TEMPLATE = {
  id: 'stage-12',
  slug: 'sales-logic',
  title: 'Sales Logic',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    sales_model: { type: 'enum', values: ['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel'], required: true },
    sales_cycle_days: { type: 'number', min: 1, required: true },

    // === Updated: deal_stages with mapped_funnel_stage ===
    deal_stages: {
      type: 'array', minItems: 3,
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        avg_duration_days: { type: 'number', min: 0 },
        mapped_funnel_stage: { type: 'string' },  // NEW: traceability to funnel
      },
    },

    // === Updated: funnel_stages with conversion_rate_estimate ===
    funnel_stages: {
      type: 'array', minItems: 4,
      items: {
        name: { type: 'string', required: true },
        metric: { type: 'string', required: true },
        target_value: { type: 'number', min: 0, required: true },
        conversion_rate_estimate: { type: 'number', min: 0, max: 1 },  // NEW
      },
    },

    // === Updated: customer_journey with trigger + touchpoint_type ===
    customer_journey: {
      type: 'array', minItems: 5,
      items: {
        step: { type: 'string', required: true },
        funnel_stage: { type: 'string', required: true },
        touchpoint: { type: 'string', required: true },
        touchpoint_type: { type: 'enum', values: ['automated', 'manual', 'hybrid'] },  // NEW
        trigger: { type: 'string' },  // NEW: what advances the customer
      },
    },

    // === NEW ===
    avg_deal_size: { type: 'number', min: 0 },

    // === Existing derived (enhanced) ===
    reality_gate: { type: 'object', derived: true },  // Enhanced with coherence, velocity, economy checks
    provenance: { type: 'object', derived: true },
  },
};
```

#### Minimum Viable Change (Priority-Ordered)

1. **P0**: Add `analysisStep` for sales logic generation (single LLM call consuming Stages 1-11, producing sales_model with rationale, deal stages, funnel stages, customer journey)
2. **P0**: Wire sales model selection to prior stages (Stage 7 pricing model + ARPA → model heuristic, Stage 11 channel mix → model refinement)
3. **P1**: Add `conversion_rate_estimate` to funnel_stages (enables dynamic target calculation and Economy Check)
4. **P1**: Add `mapped_funnel_stage` to deal_stages (deal→funnel traceability for coherence check)
5. **P1**: Add `trigger` + `touchpoint_type` to customer_journey
6. **P1**: Add `avg_deal_size` (new metric not captured in prior stages)
7. **P2**: Enhance Reality Gate with coherence check, velocity check, and Economy Check
8. **P3**: Do NOT add success_metrics (execution tracking, not IDENTITY planning)
9. **P3**: Do NOT add LTV/CAC/churn fields (already in Stage 5/7/11, split brain risk)
10. **P3**: Do NOT add entry/exit criteria to deal stages (execution detail)
11. **P3**: Do NOT add KPI snapshot object (provenance tracking handles cross-stage refs)

#### Cross-Stage Impact

| Change | Stage 13 (Product Roadmap) | Stage 15 (Resource Planning) | Broader Pipeline |
|--------|--------------------------|----------------------------|--------------------|
| Sales model selection | Product roadmap prioritizes for sales model (self-serve → onboarding UX, enterprise → admin/security) | Staffing: self-serve = few sales reps, enterprise = large sales team | Most impactful identity decision. Affects staffing, product, marketing, financials. |
| Conversion rates on funnel | Identifies conversion bottlenecks → product features to fix them | Sales enablement resource allocation | Enables end-to-end funnel modeling from marketing spend to revenue |
| Economy Check (Reality Gate) | Stage 13 only starts if funnel math works | Resource plans based on validated economics | Prevents mathematically invalid ventures from entering BLUEPRINT |
| Customer journey triggers | `trigger` → feature requirements for Stage 13 product roadmap | Automation vs manual touchpoints → resource allocation | Touchpoint types define automation-human balance for the venture |

---

## Stage 13: Product Roadmap

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-13.js`
**Phase**: THE BLUEPRINT (Stages 13-16) -- **first stage of Phase 4**
**Type**: Passive validation + **active `computeDerived()`** (Kill Gate evaluation)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `vision_statement` | string | minLength: 20 | Yes |
| `milestones[]` | array | minItems: 3 | Yes |
| `milestones[].name` | string | minLength: 1 | Yes |
| `milestones[].date` | string | minLength: 1 | Yes |
| `milestones[].deliverables[]` | array | minItems: 1 | Yes |
| `milestones[].dependencies[]` | array | -- | No |
| `phases[]` | array | minItems: 1 | Yes |
| `phases[].name` | string | minLength: 1 | Yes |
| `phases[].start_date` | string | minLength: 1 | Yes |
| `phases[].end_date` | string | minLength: 1 | Yes |

**Schema (Derived -- Kill Gate)**:
| Field | Type | Description |
|-------|------|-------------|
| `timeline_months` | number | Computed from earliest to latest milestone date |
| `milestone_count` | number | Count of milestones |
| `decision` | enum | `pass` or `kill` |
| `blockProgression` | boolean | true if kill gate triggered |
| `reasons[]` | array | Specific kill reasons with type, message, threshold, actual |

**Kill Gate Criteria** (deterministic, any failure = kill):
- < 3 milestones → `insufficient_milestones`
- Any milestone missing deliverables → `milestone_missing_deliverables`
- Timeline < 3 months → `timeline_too_short`

**Processing**:
- `validate(data)`: Schema validation of all input fields
- `computeDerived(data)`: Calculates timeline_months from milestone dates, runs kill gate
- `evaluateKillGate({ milestone_count, milestones, timeline_months })`: Pure exported function
- **No `analysisSteps`** -- roadmap must be provided externally
- **No feature prioritization** (no priority field on milestones/deliverables)
- **No resource estimation** per milestone (no effort, team, cost)
- **No tech stack alignment** (no connection to technical constraints)
- **No sales model consumption** (no connection to Stage 12 sales identity)

**CLI Strengths**: Clean milestone/phase structure, deterministic kill gate as pure function, exported constants for cross-stage use, date-based timeline computation.

**CLI Gaps**: Very lightweight for a BLUEPRINT stage. No feature backlog, no prioritization framework, no dependency graph beyond simple array, no connection to prior Identity stages (brand, GTM, sales model don't inform the roadmap), no resource or cost estimation.

### GUI Implementation (Ground Truth)

**No GUI Stage 13 component exists.** The GUI was built only through Stage 12 (THE IDENTITY phase). No React/TSX components for Product Roadmap were found.

The original GUI design documents (database migrations) envisioned stages 13-16 as:
- Stage 13: "Tech Stack Interrogation" (with AI interrogation)
- Stage 14: "Data Model & Architecture" (ERD/data model builder)
- Stage 15: "Epic/Story Breakdown" (INVEST validation)
- Stage 16: "Schema Completeness Checklist" (decision gate)

This is a **completely different stage mapping** from the CLI:
- CLI Stage 13: Product Roadmap
- CLI Stage 14: Technical Architecture
- CLI Stage 15: Resource Planning
- CLI Stage 16: Financial Projections

The GUI's planned Blueprint was developer-centric (tech stack → data model → stories → schema). The CLI's Blueprint is business-centric (product roadmap → architecture → resources → financials). The CLI mapping is authoritative.

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Implementation | Backend template (203 lines) | **None** (not built) |
| Vision statement | Required (min 20 chars) | N/A |
| Milestones | min 3 with name/date/deliverables | N/A |
| Phases | min 1 with date ranges | N/A |
| Feature prioritization | None | N/A |
| Resource estimation | None | N/A |
| Kill Gate | Deterministic (milestone count, completeness, timeline) | N/A |
| Stage 12 consumption | None | N/A |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-13-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-13-claude.md`
- OpenAI: `docs/plans/responses/stage-13-openai.md`
- AntiGravity: `docs/plans/responses/stage-13-antigravity.md`

### Synthesis

**Consensus strength**: Strong (3/3 on core decisions, interesting divergence on prioritization)

#### Unanimous Decisions (3/3)

| Decision | Claude | OpenAI | AntiGravity | Confidence |
|----------|:------:|:------:|:-----------:|:----------:|
| Add `analysisStep` consuming Stages 7/10/11/12 | Y | Y | Y | High |
| Sales model → roadmap alignment (warn on mismatch) | Y | Y | Y | High |
| Keep flat dependency array (no DAG) | Y | Y | Y | High |
| No full RICE/MoSCoW scoring | Y | Y | Y | High |
| Enhance kill gate beyond structural checks | Y | Y | Y | High |
| Link milestones to phases (phase_ref) | Y | Y | Y | High |
| No upstream dependency conflicts | Y | Y | Y | High |
| Defer detailed resource estimation to Stage 15 | Y (explicit) | Partial (wants S/M/L bands) | Y (explicit) | High |

#### Divergences Resolved

**1. Feature prioritization: explicit tiers vs timeline-as-priority**
- Claude: P0/P1/P2 on milestones AND deliverables
- AntiGravity: SKIP -- "Date is priority in a roadmap. If it's Month 1, it's P0."
- OpenAI: now/next/later bands + confidence
- **Resolution: Add priority on milestones only** (2:1 for some priority signal). AntiGravity's insight that timeline implies priority is valid, but Claude and OpenAI correctly note that Stage 14 needs an explicit signal about what to architect first -- two milestones could share the same date but have different criticality. Use `now/next/later` (OpenAI's framing, equivalent to P0/P1/P2 but reads more naturally for roadmaps). Skip per-deliverable priority (AntiGravity's simplicity argument wins here).

**2. Deliverable typing: on deliverables vs on milestones**
- Claude: Type enum on deliverables (feature/infrastructure/integration/content)
- AntiGravity: Keep deliverables as strings. Add type to MILESTONE instead (release/validation/infrastructure/compliance). "Detailed ticket typing belongs in Jira/Linear."
- OpenAI: Lightweight enum on deliverables (feature/integration/infrastructure/compliance)
- **Resolution: Type on deliverables** (2:1, Claude + OpenAI). But make it optional -- the analysisStep assigns types, users don't have to. AntiGravity's milestone-level typing is a different dimension (what kind of milestone) which is also valuable. Add BOTH: `milestone.type` (release/validation/infrastructure/compliance) AND `deliverable.type` (feature/infrastructure/integration/content) -- both optional, both set by analysisStep.

**3. Milestone outcomes / alignment tags**
- Claude: No explicit outcomes field
- AntiGravity: Add `outcomes[]` string array linking milestones to business results (e.g., "Hit 50% retention")
- OpenAI: Add `alignment_tags[]` and `expected_outcome` (activation/revenue/retention/compliance)
- **Resolution: Add `outcomes[]`** (2:1, AntiGravity + OpenAI). Simple string array linking milestones back to Stage 3 validation metrics and Stage 5 economics. Lightweight and valuable -- forces the roadmap to connect to business reality. Skip OpenAI's `alignment_tags` (overlaps with outcomes).

**4. Effort estimation**
- Claude: Don't add (Stage 15's job)
- AntiGravity: Don't add (Stage 15/16's job)
- OpenAI: Add coarse effort bands (S/M/L) per milestone
- **Resolution: Don't add** (2:1). Stage 13 = WHAT and WHEN. Stage 15 = WHO and HOW MUCH. Clean separation of concerns. If Stage 15 needs a seed, it can infer from milestone scope.

**5. Phase goal/purpose field**
- Claude: No goal field
- AntiGravity: Add `goal` to phases ("What is the purpose of this phase?")
- OpenAI: Keep phases simple (name/start/end only)
- **Resolution: Add `goal`** (optional). AntiGravity's single-string field adds meaningful context with zero complexity cost. A phase named "Foundation" with goal "Validate core hypothesis and achieve first paying customer" is materially more useful than just "Foundation" alone.

**6. Kill gate enhancement specifics**
- Claude: P0 coverage, sales model alignment warnings, vision coherence, min 8 deliverables
- AntiGravity: Density check (timeline > 6mo with only 3 milestones), metrics/analytics mention check. Rely on AI critique for content quality.
- OpenAI: Hard fail on sales-model-critical deliverables, dependency cycle, no phase assignment, no customer value in first half. Soft fail on infra-heavy, pricing not reflected, GTM unsupported.
- **Resolution**: Keep existing hard kills (structural). Add:
  1. **Density check** (AntiGravity): If timeline_months > 6 and milestone_count < 4, warn (too sparse)
  2. **Customer value check** (OpenAI): At least one milestone in the first half of timeline must contain a feature-type deliverable (not all infrastructure)
  3. **Sales model coherence** (all three): Warning if sales_model requires capabilities not present in any deliverable
  4. **Phase integrity** (AntiGravity + OpenAI): All milestone dates must fall within their referenced phase range
  5. Skip vision-coherence fuzzy matching (too subjective for deterministic gate)

#### Contrarian Synthesis

All three raised complementary concerns:
- **Claude**: Typed deliverables and priority may be "categorization theater" → Mitigate by making types optional, set by analysisStep
- **AntiGravity**: "The Roadmap is a Lie" -- any plan beyond 3 months is fiction → Mitigate by treating later phases as low-resolution hypotheses. The kill gate ensures a plan exists, not that it's correct.
- **OpenAI**: "Rich PM machinery" is over-engineering → Mitigate by keeping schema lean, using lightweight enums

The synthesis reflects all three concerns: optional typing, implicit timeline priority supplemented by simple bands, outcomes connecting to business reality rather than process theater.

#### Consensus Schema (Stage 13 v2.0)

```javascript
const TEMPLATE = {
  id: 'stage-13',
  slug: 'product-roadmap',
  title: 'Product Roadmap',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    vision_statement: { type: 'string', minLength: 20, required: true },

    // === Updated: phases with goal ===
    phases: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        start_date: { type: 'string', required: true },
        end_date: { type: 'string', required: true },
        goal: { type: 'string' },  // NEW: purpose of this phase
      },
    },

    // === Updated: milestones with priority, type, phase_ref, outcomes ===
    milestones: {
      type: 'array', minItems: 3,
      items: {
        name: { type: 'string', required: true },
        date: { type: 'string', required: true },
        phase_ref: { type: 'string' },  // NEW: references phases[].name
        type: { type: 'enum', values: ['release', 'validation', 'infrastructure', 'compliance'] },  // NEW
        priority: { type: 'enum', values: ['now', 'next', 'later'] },  // NEW
        deliverables: {
          type: 'array', minItems: 1,
          items: {
            name: { type: 'string', required: true },
            type: { type: 'enum', values: ['feature', 'infrastructure', 'integration', 'content'] },  // NEW (optional)
          },
        },
        dependencies: { type: 'array' },  // Keep flat (milestone names)
        outcomes: { type: 'array', items: { type: 'string' } },  // NEW: business results
      },
    },

    // === Existing derived (enhanced) ===
    timeline_months: { type: 'number', derived: true },
    milestone_count: { type: 'number', derived: true },
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
    warnings: { type: 'array', derived: true },  // NEW: quality warnings (non-blocking)

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

#### Minimum Viable Change (Priority-Ordered)

1. **P0**: Add `analysisStep` for roadmap generation (single LLM call consuming Stages 1-12, producing vision, milestones with typed deliverables, phases with goals, outcomes linking to Stage 3/5 metrics)
2. **P0**: Wire sales_model → feature generation (Stage 12 sales_model determines mandatory capability themes in deliverables)
3. **P1**: Add `priority` (now/next/later) to milestones. Enables Stage 14 architecture prioritization and kill gate quality checks.
4. **P1**: Add `type` to milestones (release/validation/infrastructure/compliance) and optional `type` to deliverables (feature/infrastructure/integration/content)
5. **P1**: Add `phase_ref` to milestones + `goal` to phases. Links milestones to phases with purpose.
6. **P1**: Add `outcomes[]` to milestones. Connects roadmap to business metrics (Stage 3/5).
7. **P2**: Enhance kill gate with density check, customer value check, sales model coherence, phase integrity. Warnings only (not hard kills) except phase integrity.
8. **P3**: Do NOT add effort/resource bands (Stage 15's job)
9. **P3**: Do NOT add RICE/MoSCoW scoring (false precision at BLUEPRINT)
10. **P3**: Do NOT add dependency DAG (flat array sufficient)

#### Cross-Stage Impact

| Change | Stage 14 (Technical Architecture) | Stage 15 (Resource Planning) | Stage 16 (Financial Projections) |
|--------|----------------------------------|----------------------------|---------------------------------|
| Typed deliverables | Architecture maps to deliverable types (features → app arch, infrastructure → DevOps, integrations → API design) | Resource allocation by category (infrastructure ≠ feature skills) | Cost estimation by deliverable type |
| Milestone priority (now/next/later) | Architect for "now" milestones first | Allocate resources to "now" priority | Revenue projections weighted by priority ordering |
| Sales model alignment | Architecture aligned to sales model (self-serve → scalable frontend, enterprise → security-first) | Team composition matches model | Revenue model tied to sales model |
| Outcomes | Architecture supports measurable outcomes (analytics, metrics instrumentation) | Resource allocation tied to outcome importance | Financial projections connected to business outcomes |
| Phase goals | Architecture can be phased (Foundation → Growth → Scale) | Resource ramp-up follows phases | Burn rate projections per phase |

---

## Stage 14: Technical Architecture

### CLI Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-14.js`
**Phase**: THE BLUEPRINT (Stages 13-16)
**Type**: Passive validation + **active `computeDerived()`** (layer count, component totals)

**Schema (Input)**:
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `architecture_summary` | string | minLength: 20 | Yes |
| `layers` | object | Must have all 4 required layers | Yes |
| `layers.{frontend,backend,data,infra}` | object | Each required layer | Yes |
| `layers.*.technology` | string | minLength: 1 | Yes |
| `layers.*.components[]` | array | minItems: 1 | Yes |
| `layers.*.rationale` | string | minLength: 1 | Yes |
| `integration_points[]` | array | minItems: 1 | Yes |
| `integration_points[].name` | string | minLength: 1 | Yes |
| `integration_points[].source_layer` | string | minLength: 1 | Yes |
| `integration_points[].target_layer` | string | minLength: 1 | Yes |
| `integration_points[].protocol` | string | minLength: 1 | Yes |
| `constraints[]` | array | Optional | No |
| `constraints[].name` | string | minLength: 1 | If present |
| `constraints[].description` | string | minLength: 1 | If present |

**Required Layers**: `['frontend', 'backend', 'data', 'infra']` -- all four mandatory.

**Schema (Derived)**:
| Field | Type | Description |
|-------|------|-------------|
| `layer_count` | number | Count of defined layers (target: 4) |
| `total_components` | number | Sum of components across all layers |
| `all_layers_defined` | boolean | True if all 4 required layers present |

**Processing**:
- `validate(data)`: Schema validation of all layers, integration points, constraints
- `computeDerived(data)`: Counts layers and components, checks completeness
- **No `analysisSteps`** -- architecture must be provided externally
- **No kill gate** (unlike Stage 13)
- **No connection to Stage 13** (product roadmap doesn't inform architecture)
- **No security/compliance layer** (only frontend/backend/data/infra)
- **No scalability/performance considerations**
- **No cost estimation** for technology choices

**CLI Strengths**: Clean 4-layer architecture model (forces all layers to be addressed), integration points with protocol specification, rationale required per layer (forces justification), exported constants for cross-stage use.

**CLI Gaps**: Very generic -- same 4 layers for every venture regardless of sales model or product roadmap. No connection to Stage 13 deliverables (typed features don't map to architecture). No security/compliance layer despite enterprise sales model potentially requiring it. No scalability or performance architecture.

### GUI Implementation (Ground Truth)

**Component**: `Stage14DataModelArchitecture.tsx` (in ehg app: `src/components/stages/v2/`)
**Additional**: `Stage14ERDBuilder.tsx` (Entity-Relationship Diagram visual builder)

**Scope difference**: GUI Stage 14 is a **data model builder**, not a general technical architecture template. It focuses on database entities, fields, relationships, and data flows.

**GUI Stage 14 features**:
- Entity builder: name, description, fields[] (name, type, required, isPrimaryKey, isForeignKey, referencesEntity), rlsPolicy
- Relationship modeling: one-to-one, one-to-many, many-to-many with descriptions
- Data flows: name, source, destination, description, frequency
- Architecture notes (free text)
- Database choice
- Schema version tracking
- ERD builder component for visual entity-relationship diagrams

**GUI is narrower but deeper**: Focuses exclusively on data modeling (entities, fields, foreign keys, RLS policies). CLI is broader but shallower (4 architecture layers with technology + components + rationale).

### Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Scope | Full technical architecture (4 layers) | Data model only (entities + relationships) |
| Layers | frontend, backend, data, infra | Data layer only (deep) |
| Entity modeling | None | Entities with typed fields, PKs, FKs, RLS |
| ERD | None | Visual ERD builder |
| Data flows | None (integration_points covers protocols) | Explicit data flow definitions |
| Integration points | source/target layer + protocol | Implicit in relationships |
| Technology rationale | Required per layer | Database choice only |
| Constraints | Generic name/description | None |
| Kill gate | None | None |
| Stage 13 consumption | None | None |

### Triangulation

**Prompt**: `docs/plans/prompts/stage-14-triangulation.md`

**Responses**:
- Claude: `docs/plans/responses/stage-14-claude.md`
- OpenAI: `docs/plans/responses/stage-14-openai.md`
- AntiGravity: `docs/plans/responses/stage-14-antigravity.md`

### Synthesis

**Consensus strength**: Strong (3/3 on all core decisions, divergence only on extension approach)

#### Unanimous Decisions (3/3)

| Decision | Claude | OpenAI | AntiGravity | Confidence |
|----------|:------:|:------:|:-----------:|:----------:|
| Add `analysisStep` consuming Stages 12/13 | Y | Y | Y | High |
| Map Stage 13 deliverable types → architecture layers | Y | Y | Y | High |
| Keep 4 core layers as base model | Y | Y | Y | High |
| Add security/compliance architecture section | Y | Y | Y | High |
| Add scaling/performance consideration | Y | Y | Y | High |
| Link integration points to Stage 13 deliverables | Y | Y | Y | High |
| No full ERD/entity-level data modeling | Y | Y (lite) | Y (lite) | High |
| No upstream dependency conflicts | Y | Y | Y | High |

#### Divergences Resolved

**1. How to extend beyond 4 layers** (additional layers vs overlays vs cross-cutting)
- Claude: `additional_layers[]` array for conditional layers (mobile, platform, content)
- AntiGravity: Rename frontend→client, add `cross_cutting` section for Security & DevOps
- OpenAI: `capability_overlays` object (security, observability, delivery, mobile, ai_ml)
- **Resolution**: Keep 4 mandatory layers (don't rename frontend -- 2:1 for keeping standard term). Add **cross-cutting concerns** for security and DevOps/observability (AntiGravity + OpenAI's shared insight: these apply to ALL layers, not a single layer). For genuinely new architectural layers (mobile, ML), use `additional_layers[]` (Claude's approach). This gives a clean three-tier model: mandatory layers + cross-cutting concerns + conditional layers.

**2. Data modeling depth** (none vs schema-lite)
- Claude: No entity-level modeling. Data architecture approach only (technology + pattern).
- AntiGravity: "Schema-Lite" -- entities with name, description, relationships, complexity (low/med/high)
- OpenAI: Blueprint-level -- core entities, relationships, data ownership, sensitivity class
- **Resolution: Schema-Lite** (2:1). Claude's pure architecture-only approach leaves Stage 15 too blind about backend complexity. AntiGravity's insight is key: "5 simple entities vs 50 complex ones" drives resource estimation. Add lightweight `data_entities[]` with name, description, relationships[] (strings), complexity (low/med/high). Skip field-level detail, sensitivity class, retention flags (implementation detail).

**3. Constraint categorization**
- Claude: Don't categorize (generic is sufficient)
- AntiGravity: Add category enum (budget/compliance/legacy/skillset/performance)
- OpenAI: Add category + severity + affected_layers + mitigation_note
- **Resolution: Add category only** (2:1 for categorization, but keep it simple). AntiGravity's 5-value enum is right-sized. Skip severity/affected_layers/mitigation (OpenAI over-engineers this). The category helps Stage 15 route constraints to appropriate resource decisions.

**4. Rename frontend → client**
- Claude: Keep "frontend"
- AntiGravity: Rename to "client" (better for mobile/IoT)
- OpenAI: Keep "frontend"
- **Resolution: Keep "frontend"** (2:1). Standard web terminology. Mobile products add a `mobile` additional layer rather than redefining the base model.

**5. Cost estimation**
- Claude: Defer to Stage 16
- AntiGravity: Add order-of-magnitude cost (Low/Med/High)
- OpenAI: Defer (improved estimation in Stage 16)
- **Resolution: Defer** (2:1). Stage 16 handles financial projections. Architecture rationale can mention cost-sensitive choices (e.g., "serverless to minimize fixed costs") but no dedicated cost fields.

**6. Integration point enrichment scope**
- Claude: Add `deliverable_ref` only
- AntiGravity: Add `relates_to_milestone` ref
- OpenAI: Add integration_type, source_deliverable_ref, contract_style, reliability, latency_class, failure_impact
- **Resolution**: Add `deliverable_ref` (all agree) and `integration_type` enum (internal/external/partner -- OpenAI's useful addition). Skip reliability/latency/failure_impact (implementation detail, not BLUEPRINT).

#### Contrarian Synthesis

All three raised valid over-engineering concerns:
- **Claude**: Security requirements and scaling strategy may lock in choices too early → Mitigate by keeping them high-level (capability descriptions, not technology specifications)
- **AntiGravity**: "Implementation details like entities and protocols belong in Stage 17" → Mitigate with Schema-Lite (volume estimation, not specification)
- **OpenAI**: "Heavy Stage 14 can become pseudo-implementation design" → Mitigate with "structured minimalism" -- traceability and risk-awareness, not low-level precision

The synthesis follows the "structured minimalism" principle: enough architecture to inform Stage 15 resourcing and Stage 16 costing, but not so much that it becomes premature implementation design.

#### Consensus Schema (Stage 14 v2.0)

```javascript
const TEMPLATE = {
  id: 'stage-14',
  slug: 'technical-architecture',
  title: 'Technical Architecture',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    architecture_summary: { type: 'string', minLength: 20, required: true },

    // === Existing (unchanged) ===
    layers: {
      type: 'object', required: true,
      properties: {
        frontend: { technology, components[], rationale },
        backend:  { technology, components[], rationale },
        data:     { technology, components[], rationale },
        infra:    { technology, components[], rationale },
      },
    },

    // === NEW: additional layers (conditional on product roadmap) ===
    additional_layers: {
      type: 'array',
      items: {
        name: { type: 'string', required: true },  // e.g., "mobile", "ml_pipeline"
        technology: { type: 'string', required: true },
        components: { type: 'array', minItems: 1 },
        rationale: { type: 'string', required: true },
      },
    },

    // === NEW: cross-cutting concerns (apply to all layers) ===
    security: {
      type: 'object',
      properties: {
        auth_approach: { type: 'string', required: true },
        authorization_model: { type: 'string' },  // e.g., "RBAC", "ABAC"
        compliance_targets: { type: 'array' },  // e.g., ["SOC2", "GDPR"]
        data_isolation: { type: 'string' },
        rationale: { type: 'string' },
      },
    },

    // === Updated: integration_points with deliverable_ref + type ===
    integration_points: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        source_layer: { type: 'string', required: true },
        target_layer: { type: 'string', required: true },
        protocol: { type: 'string', required: true },
        integration_type: { type: 'enum', values: ['internal', 'external', 'partner'] },  // NEW
        deliverable_ref: { type: 'string' },  // NEW: Stage 13 deliverable reference
      },
    },

    // === Updated: constraints with category ===
    constraints: {
      type: 'array',
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        category: { type: 'enum', values: ['budget', 'compliance', 'skillset', 'performance', 'legacy'] },  // NEW
      },
    },

    // === NEW: lightweight data entity model (Schema-Lite) ===
    data_entities: {
      type: 'array',
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string' },
        relationships: { type: 'array' },  // string refs to other entity names
        complexity: { type: 'enum', values: ['low', 'medium', 'high'] },
      },
    },

    // === NEW: scaling strategy ===
    scaling_strategy: { type: 'string' },

    // === Existing derived (unchanged) ===
    layer_count: { type: 'number', derived: true },
    total_components: { type: 'number', derived: true },
    all_layers_defined: { type: 'boolean', derived: true },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

#### Minimum Viable Change (Priority-Ordered)

1. **P0**: Add `analysisStep` for architecture generation (single LLM call consuming Stages 7/8/12/13; maps deliverable types to architecture components, sales model to security profile)
2. **P0**: Wire Stage 13 deliverable types → architecture layers (feature→frontend+backend, infrastructure→infra, integration→integration_points, content→CDN/CMS)
3. **P1**: Add `security` object (auth_approach, authorization_model, compliance_targets, data_isolation). Driven by Stage 12 sales_model.
4. **P1**: Add `data_entities[]` Schema-Lite (name, description, relationships, complexity). Enables Stage 15 backend resource estimation.
5. **P1**: Add `additional_layers[]` for conditional layers (mobile, ML pipeline). AnalysisStep determines from Stage 13 deliverables.
6. **P1**: Add `integration_type` enum + `deliverable_ref` to integration_points. Traceability to Stage 13.
7. **P2**: Add `category` enum to constraints (budget/compliance/skillset/performance/legacy)
8. **P2**: Add `scaling_strategy` field
9. **P3**: Do NOT add full ERD / entity-field modeling (BUILD phase, Stages 17-22)
10. **P3**: Do NOT rename frontend→client (standard terminology, 2:1)
11. **P3**: Do NOT add cost estimation fields (Stage 16's job)
12. **P3**: Do NOT add reliability/latency/failure_impact to integration points (implementation detail)

#### Cross-Stage Impact

| Change | Stage 15 (Resource Planning) | Stage 16 (Financial Projections) | Stage 17+ (BUILD LOOP) |
|--------|----------------------------|---------------------------------|----------------------|
| Technology selections | Team skills map to tech choices (React→frontend devs, PostgreSQL→DBA) | Technology licensing costs | Tech stack set; build implements |
| Security profile | Security team/compliance skills needed | Compliance audit costs (SOC2 ~$50K) | Security architecture implemented |
| Data entities (Schema-Lite) | Entity count × complexity = backend resource estimate | Database hosting costs scale with entity complexity | Entities become tables in build |
| Constraint categories | "Skillset" → hire. "Budget" → limit choices. "Compliance" → audit resources. | Constraints translate to cost categories | Constraints become requirements |
| Additional layers | Extra layers = extra specialized skills | Extra layer infrastructure costs | Additional build streams |

---

## Stage 15: Resource Planning

*Analysis pending*

---

## Stage 16: Financial Projections

*Analysis pending*

---

## Stage 17: Pre-Build Checklist

*Analysis pending*

---

## Stage 18: Sprint Planning

*Analysis pending*

---

## Stage 19: Build Execution

*Analysis pending*

---

## Stage 20: Quality Assurance

*Analysis pending*

---

## Stage 21: Integration Testing

*Analysis pending*

---

## Stage 22: Release Readiness

*Analysis pending*

---

## Stage 23: Launch Execution

*Analysis pending*

---

## Stage 24: Metrics & Learning

*Analysis pending*

---

## Stage 25: Venture Review

*Analysis pending*
