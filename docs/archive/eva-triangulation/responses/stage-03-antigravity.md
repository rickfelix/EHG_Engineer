---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 3 "Market Validation & RAT" -- AntiGravity Response

> Independent response to the Stage 3 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|---|---|---|---:|---|---|---|
| Data Input | Active Form (TAM, Growth, CAC, Competitors, etc.) | None (Passive Template) | 5 (Critical) | Without "hard facts" (TAM, CAC), validation is hallucinated. Stage 4 loses competitor context. | CLOSE | Can we infer these from Stage 1/2? No, Stage 3 is "The Truth" - it requires explicit assumptions/facts. |
| Scoring Engine | Hybrid (30% Definite / 70% AI) | None (Passive Template) | 5 (Critical) | No scores generated = no kill gate evaluation. | CLOSE | Can we just use LLM scoring? No, deterministic anchors prevent "AI yes-man" syndrome. |
| Metric Taxonomy | 3 Dimensions (Market, Tech, Financial) | 6 Metrics (Market Fit, Need, Momentum, Revenue, Barrier, Feasibility) | 3 (Medium) | CLI metrics are more granular but map poorly to GUI's 3-bucket inputs. | ADAPT | CLI's 6 metrics are better for specific kill reasons. |
| Kill Logic | Soft Gate (User/Chair override, thresholds 6/10) | Hard Gate (Code enforced, thresholds 40/100) | 2 (Low) | CLI is stricter. GUI allows "Revise". | ADAPT | Hard gate is better for autonomous pipelines, provided reasons are clear. |
| Competitor Intel | List of 3 specific competitors + URLs | Abstract "Competitive Barrier" score | 4 (High) | Stage 4 expects specific competitor entities to analyze. | CLOSE | Stage 3 MUST output structured competitor data for Stage 4. |

### 2. Metric Structure Recommendation

**Verdict: Retain CLI's 6-Metric Structure (but map inputs to it)**

The CLI's 6 metrics provide superior granularity for a "Kill Gate". The GUI's "Three Dimensions" are too broad -- e.g., "Technical" lumps "Complexity" (bad) with "Team Capability" (good).

**Mapping GUI Inputs to CLI Metrics**:
- **Market Fit**: Derived from TAM, Growth Rate, Problem Clarity (Stage 2).
- **Customer Need**: Derived from Pain Point Severity (Stage 1), Problem Clarity.
- **Momentum**: New to CLI. Requires inputs like "Waitlist size", "Traffic", or inferred logic "Growth Rate".
- **Revenue Potential**: Derived from Price, Margin, CAC, LTV, LTV/CAC.
- **Competitive Barrier**: Derived from Competitor Count, Differentiation features.
- **Execution Feasibility**: Derived from Complexity, Team Capability, Tech Stack Risk.

### 3. Score Generation Architecture

**Recommendation: Hybrid Fusion Engine (Adopt GUI Logic)**

The CLI must implement an `analysisStep` (via eva-orchestrator or a new Stage 3 handler) that performs the following 3-step process:

1. **Input Acquisition**: Load a `stage3_inputs.json` (or extract from conversation history/Stage 2 artifacts).
2. **Deterministic Scoring (30%)**: Run the exact logic from `supabase/functions` mapped to the 6 CLI metrics.
   - Example: If TAM < $1M, Market Fit deterministic component = 0.
3. **AI Analysis (70%)**: Prompt Model (Claude/GPT-4) with the Inputs + Stage 2 Critique. Ask it to score the 6 CLI metrics.
4. **Fusion**: `Final Score = (Deterministic * 0.3) + (AI * 0.7)`.

**Role of Devil's Advocate**: Keep it separate. The Hybrid Engine generates the "Proponent" score. The Devil's Advocate (already in CLI) reviews the result of the Hybrid Engine. This creates a strong "Propose -> Challenge" dynamic.

### 4. Market Data Acquisition

This is the hardest problem for a text-only CLI.

**Recommendation: The "Assumption Brief" Artifact**

Stage 3 cannot run on empty air.

1. **Step 1 (Pre-computation)**: The system generates a `market_assumptions.json` template filled with defaults or inferred values from Stage 1/2 (e.g., infers Industry, maybe guesses TAM category).
2. **Step 2 (User Action)**: The user (Chairman) is asked to review/edit `market_assumptions.json`.
3. **Step 3 (Execution)**: Stage 3 `analysisStep` reads this file to drive the Deterministic Scoring.

**Alternative**: If fully autonomous, use an Agent to research these values (using Search Tool) to fill the `market_assumptions.json` before validation runs.

**Verdict**: Use Search Agent to fill "The Truth" data.

### 5. Kill Gate Comparison

| Feature | GUI | CLI Recommendation | Note |
|---------|-----|-------------------|------|
| Overall Cutoff | 7.0 (70%) | 70% | Maintain high bar. |
| Metric Cutoff | 6.0 (60%) | **60% (Currently 40%)** | Raise CLI floor to 60. 40 is too permissive for "The Truth" phase. |
| Logic | AND (All must pass) | AND (All must pass) | Current CLI is "OR" (Kill if any < 40). "AND" (Kill if any < 60) is effectively the same rigor but cleaner. |

### 6. Stage 2 -> Stage 3 Pipeline

- **Stage 2 output**: `dimensionScores` (Market, Tech, etc.) + critique.
- **Stage 3 Consumption**:
  - Stage 2 scores serve as the "Gut Check".
  - If Stage 3 Score (Data-backed) deviates > 20 points from Stage 2 Score (Intuition-backed), flag as "Validation Divergence".
- **Direct Dependency**: Stage 3 reads Stage 2's `problemClarity` score to seed the Customer Need metric.

### 7. CLI Superiorities (Preserve These)

- **Hard Gating**: `blockProgression: true` in CLI is safer than GUI's "warn but allow" approach for autonomous runs.
- **Adversarial Separation**: The CLI's `devils-advocate.js` is a distinct architectural step, whereas GUI mixes AI critique into the generation prompt. This separation is superior.
- **Granularity**: 6 metrics > 3 dimensions for diagnostic clarity.

### 8. Minimum Viable Change (Action Plan)

1. **Create MarketAssumptions Service**: A simple service/agent that takes the Venture Description and produces the `market_assumptions.json` (TAM, Competitors, Pricing defaults) via Search/LLM.
   - Why: Closes the "Data Input" gap without forcing user data entry.
2. **Port Deterministic Logic**: Translate the `supabase/functions` logic into a `lib/eva/metrics/deterministic-scorer.js` module, mapping the 3 GUI dimensions to the 6 CLI metrics.
3. **Implement Stage 3 Analysis Step**: Add `analysisSteps` to Stage 3 template that:
   - Calls MarketAssumptions service.
   - Runs Deterministic Scorer.
   - Runs AI Scorer (LLM).
   - Fuses scores.
   - Updates stage-03 artifact.
4. **Update Kill Gate Config**: Raise per-metric threshold in `stage-03.js` to 60 (metric) / 70 (overall).

### 9. Cross-Stage Impact

- **Stage 4 (Competitive Intel)**: Will now receive a structured list of competitors (from the MarketAssumptions generated in Stage 3), allowing it to simply "fetch details" rather than "discover competitors".
- **Stage 5 (Decision)**: Will receive a much higher fidelity signal -- Stage 3 scores will be backed by "simulated facts" (TAM/Pricing) rather than just LLM vibes.
