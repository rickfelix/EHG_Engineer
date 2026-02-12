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
