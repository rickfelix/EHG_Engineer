# Challenger Analysis: Mental Models Repository for EHG Ventures

**Date**: 2026-03-06
**Domain**: Venture (Operations post-Stage 25 extension)
**Perspective**: Devil's Advocate — Finding blind spots, conflicting assumptions, risk of feature bloat
**Analysis Scope**: 40+ mental models system, AI auto-suggestion, outcome tracking, effectiveness ranking

---

## Executive Summary

The mental models repository is **solving for optionality in a system that may already have solved the real problem differently**. EHG already has unnamed mental models built into Stage 0 synthesis (chairman constraints, archetype detection, moat design, narrative risk). The proposal adds explicit naming, outcome tracking, and auto-suggestion. This risks **replacing emergent judgment with formalized rules-laundering**, and the effectiveness tracking mechanism has a **fundamental measurement problem**: confounding variables will bury signal.

**Verdict**: Not ready to commit. Requires deeper diagnostic work first.

---

## BLIND SPOT 1: The Chairman's Mental Models Are Already Running — Just Unnamed

### The Problem We're Not Seeing

EHG's Stage 0 synthesis already uses mental models:

| Component | What It Actually Represents | Source |
|-----------|----------------------------|--------|
| **Chairman Constraints** | Embodied heuristics (narrow specialization, data-first, moat-first, full automation) | Implicit decision rules, not coded |
| **Archetype Recognition** | Pattern matching against venture stereotypes | LLM inference over venture briefs |
| **Moat Architecture** | Competitive positioning theory | Component weights and prompt engineering |
| **Narrative Risk** | Attention economy + storytelling credibility | New (2026-02), advisory signal |
| **Time Horizon** | Positioning within market window | Component-level heuristic |

These are mental models. They're running. They're shaping go/no-go decisions.

**The blind spot**: The proposal treats "mental models" as a *new* capability ("add 40+ models"), when the real question is: **What is the mapping between existing synthesis components and the mental models we want to surface?**

### Why This Matters

If 12-15 mental models are already embedded in Stage 0, then:

1. **Adding 40 new models doesn't increase capability** — it fragments the decision logic. Synthesis becomes a garden of fragmented signals.
2. **Outcome tracking becomes noise** — We'd be tracking effectiveness of components that are already interdependent. A venture succeeds because moat + narrative + archetype aligned, not because any single model was right.
3. **Auto-suggestion becomes self-fulfilling** — If the system learned that "founder passion model + serial entrepreneur archetype + niche market" correlates with success, it will suggest those models more often, creating confounding bias.

### The Real Work (If We Proceed)

Before building a 40-model library, the prerequisite is:
1. **Inventory existing models** in synthesis components (map to named frameworks: Jobs to be Done, TAM/SAM/SOM, Lean Canvas, etc.)
2. **Name the implicit heuristics** in chairman constraints (these ARE mental models)
3. **Clarify which models overlap** (narrative risk + attention economy + viral analysis all touch narrative/attention)
4. **Then decide**: Are we surfacing unnamed models, or adding genuinely new ones?

---

## BLIND SPOT 2: Market Assumptions Are Baked Into Entry Paths, Not Models

### The Problem

The proposal suggests mental models will catch market blind spots and competitive risks. But EHG's real market understanding comes from:

1. **Entry Paths** (discovery, competitor teardown, chairman direct) — These shape the initial venture framing
2. **Path analysis components** (Research, Brand Genome, Competitive Intelligence) — These feed the venture brief
3. **Stage 4 (Competitive Intel)** — Formal competitive analysis in the lifecycle

**Models only run on the brief you've built.** If the entry path anchors on wrong assumptions (founder overconfidence, competitor misdiagnosis, TAM inflation), models applied to that brief will inherit the bias.

### The Risk: Models as Confirmation Machinery

Venture ABC enters via chairman-direct with a handwavy problem statement. The synthesis runs 40 models. Models find signals (because models are prompt-engineered to find signals). Chairman gets beautiful output. Venture gets funded. Venture dies because the market problem was misframed before any model touched it.

**Models are not an alternative to hard triage work in entry paths.** They're post-hoc analysis of an already-constrained hypothesis space.

The proposal does not address: **How do models catch entry-path anchoring bias?**

---

## BLIND SPOT 3: Outcome Tracking Has a Fundamental Measurement Problem

### The Setup

The proposal includes:

> Track model predictions against venture outcomes to rank effectiveness... After each venture passes a kill gate (or fails one), retrospectively evaluate: "Did the macro model signals hold?"

This is reasonable-sounding. It's also unmeasurable.

### Why It Fails

**Confounding variables outnumber signal paths.**

Example: The "economic cycle model" predicts "unfavorable credit environment headwind." The venture fails 18 months later. Did the model predict correctly? Or did:

- Founder team was weak (team, not cycle)
- Product-market fit never achieved (execution, not macro)
- Competitive pressure from VC-funded incumbent (competition, not cycle)
- Customer acquisition cost rose but revenue-per-customer was healthy (unit economics, not macro)

You'd need to:
1. Run the same venture through 40 models in a counterfactual state (the model output without the headwind signal) — impossible
2. Control for all other variables — requires randomized A/B testing of ventures, or detailed post-mortems
3. Define "signal hit" operationally — "model said headwind, environment was headwind" is too loose. Did the headwind matter? By how much?

**EHG will correlate macro models with venture outcomes and call it effectiveness data.** It will be confounded noise dressed as signal. And the Chairman will trust it because it's quantified.

This is the exact pattern that kills venture studios: rigorous-seeming process metrics masking weak causal reasoning.

---

## ASSUMPTION 1 AT RISK: "Mental Models Will Improve Decision Quality"

### The Assumption

> Models become a shared reasoning layer callable by any EHG system with a macro question (kill gates, portfolio reviews, brainstorms). By venture #10, eight named models calibrated against prior outcomes. Chairman makes better go/no-go decisions.

### Why It Could Be Wrong

1. **More information ≠ Better decisions.** Cognitive load increases. The Chairman has to weigh 40 model outputs plus the 12 synthesis components plus financial forecasting. At some point, pattern-matching gets harder, not easier. This is the "oracle collapse" problem — too much signal becomes noise.

2. **Models constrain thinking instead of expanding it.** Once models are codified and scored, they become decision *rules*. The Chairman stops thinking independently and starts matching venture facts to model criteria. The models become a filter that blocks novel ideas that don't fit the template.

3. **Confidence goes up, accuracy may go down.** Models feel rigorous. The Chairman becomes more confident in go/no-go calls. But if the underlying model correlations are confounded (see Blind Spot 3), confidence is misplaced. The studio may start killing ventures faster and moving faster toward failure.

### Evidence From Elsewhere

Large investment firms built "systematic" models to rank deals. They found that founder interviews and pattern-matching by experienced investors still beat models on deal quality (see Kahneman's research on expert overconfidence vs models, and follow-up work on how models can *reduce* forecast accuracy when they replace human judgment on novel cases).

---

## ASSUMPTION 2 AT RISK: "Effectiveness Ranking Will Identify Best Models"

### The Assumption

> System should track which models are applied and correlate with venture outcomes to rank effectiveness... EHG builds proprietary evidence about which frameworks are predictive in which domains.

### Why It Could Be Wrong

1. **Survivorship bias.** EHG only observes ventures that *proceed* past Stage 0. Any model that correctly kills a bad venture shows up as "effective kill prediction" only if that venture would have failed anyway. If the model is too conservative and kills ventures that would have succeeded, EHG will never know (counterfactual).

2. **Model salience bias.** If a model is used frequently (because the system auto-suggests it), it will show up in more outcome data, making it appear more effective. Frequently-used models correlate with venture outcomes not because they're predictive, but because they're applied to more ventures.

3. **Batch effects.** Models run in clusters (Stage 0, then post-Stage 25). Ventures in the same cluster will have correlated outcomes (macro environment, team cohort effects, etc.). A model that happens to run on a successful cohort will appear effective relative to models that ran on a weak cohort, even if the model itself added no signal.

### The Outcome

EHG ranks models by correlations that are statistically significant but causally hollow. The "top-ranked" models are often just the ones that ran on lucky batches or encountered fewer confounders. The studio invests more in those models, creating a local maximum (those models work best for us) that's actually just overfitting to noise.

---

## ASSUMPTION 3 AT RISK: "Auto-Suggestion Based on Stage/Context Will Work"

### The Assumption

> Models should be AI auto-suggested based on current venture stage/context... System suggests relevant models automatically at each stage.

### Why It Could Be Wrong

1. **Models are sticky once they're applied.** If a "competitive positioning model" suggests the venture is undifferentiated at Stage 4, that signal persists through Stages 5-25. The venture carries the label. Later models inherit the assumption. Models become path-dependent self-fulfilling prophecies.

2. **Context is ambiguous.** "Stage 3" (market validation) context could call for models in multiple families (economic cycle models, technology trajectory, competitive positioning). The auto-suggestion system has to *choose* which models to suggest. That choice is itself a model — a meta-model about which models matter. You've just added a layer of indirection.

3. **Auto-suggestion removes exploration.** If the system always suggests the same models for similar ventures, the Chairman stops exploring alternative model combinations. Over time, EHG converges on a rigid set of decision heuristics. Novel ventures (the ones with the highest upside) don't fit the template and get killed early.

---

## WORST CASE: The Sophisticated Rationalization Engine

### How It Plays Out

**Year 1**: Mental models repository launches with 15 models. Auto-suggestion engine runs. Models produce beautiful synthesis outputs. Chairman is impressed by the rigor and breadth.

**Year 2**: EHG has tracked 20 ventures through the system. The "outcome tracking" correlations show that 8 models are "highly predictive." The team invests in refining those 8 models. Auto-suggestion is tuned to recommend them more often. They appear even more effective (because they're applied to more ventures). Other models fade from use.

**Year 3**: EHG has converged on a canonical set of models. They're deeply tuned to the portfolio. New ventures are evaluated against these models. Ventures that don't fit the models are marked as risky and killed early. The portfolio becomes homogeneous (all ventures fit the model set). EHG moves faster, feels more decisive, ships ventures faster.

**Year 4**: The portfolio underperforms. EHG's ventures have stronger moats and tighter financials than they ever did, but they're also smaller, lower-upside, and more incremental. The "best" ventures (the 10x opportunities) don't fit the models and got killed in Stage 0 or Stage 3. The system became very good at picking safe, mediocre ventures. The Chairman's natural skepticism (which used to catch weird edge cases) got replaced by model-guided confidence.

The mental models repository, intended as a sensemaking aid, became a decision filter that trapped EHG in local optima.

---

## RISK PROFILE: Feature Bloat Potential

### How This Becomes Feature Bloat

1. **Scope creep is built-in.** The proposal starts with 29 models + 14 research-driven additions = 43 models. Phase 1 is 1 model. By Phase 7, all 43 are active. By Phase 9, the system is supposed to become a "product." At some point, someone argues: "We should add meta-models to arbitrate between conflicting models." Then counterweight models (Phase 5). Then model feedback loops. Then a UI for exploring model interactions.

2. **Effort-to-value ratio is unclear.** It takes real work to encode a mental model well (prompt engineering, validation, calibration against 3-5 ventures). The first few models have high effort-to-value. Model #30 is a part-time intern's project. Model #40 is "someone thought this might be useful." The system becomes a dumping ground for untested hypotheses.

3. **Maintenance burden explodes.** If models are encoded as prompts, every LLM model upgrade requires prompt re-tuning (GPT-4 → GPT-4.5 → Claude 4). If models are encoded as rules, they need domain expert review and calibration. Each model is a small system requiring ongoing care.

4. **No kill switch.** Once models are embedded in the synthesis engine and the Chairman is seeing their outputs, removing a model is political (Chairman has learned to trust it). Dead models accumulate.

---

## Structural Risks

| Risk | Likelihood | Impact | Mitigation Status |
|------|------------|--------|-------------------|
| **Confounded outcome tracking masks signal** | HIGH | CRITICAL | NOT ADDRESSED. Proposal includes outcome tracking without statistical rigor design. |
| **Models replace judgment instead of augmenting it** | MEDIUM-HIGH | CRITICAL | Depends on UI/presentation. No safeguards proposed. |
| **Auto-suggestion creates feedback loops and anchoring** | MEDIUM | HIGH | Not addressed. System design encourages repeated use of high-correlation models. |
| **Entry-path bias is upstream of models** | MEDIUM | MEDIUM | Acknowledged implicitly (discovery/research needed), but not addressed in proposal. |
| **Prompt drift as core IP** | LOW-MEDIUM | MEDIUM | Acknowledged as "open question," but no solution proposed. Models are source code, will be version-controlled. Risk is change without audit trail. |
| **Models conflict and contradict (Dalio vs Kurzweil)** | HIGH | MEDIUM | Design response proposed (surface contradictions as feature), but implementation unspecified. |
| **Over-optimization on synthetic test corpus** | MEDIUM | MEDIUM-HIGH | Phase 2 includes test corpus, but corpus is created by humans with implicit biases. |

---

## What's Missing From The Proposal

1. **Diagnostic work**: Inventory and name the mental models already running in Stage 0. Map to frameworks. This is prerequisite.

2. **Statistical rigor for outcome tracking**: Define causal inference approach before building tracking system. RCT design? Matched cohorts? Prospective vs retrospective? Confound control strategy?

3. **Safeguards against model capture**: How does the system prevent the Chairman from becoming a model-matching engine instead of a thinking strategist? What's the "red team" process?

4. **Entry-path improvement**: If market blind spots are the problem, improve entry-path triage first. Models can't fix upstream bias.

5. **Explicit sunset criteria**: When does a model get removed? By what metrics? Who decides?

6. **Counterfactual testing framework**: How do we ever know if a model actually improved outcomes, given confounding variables?

---

## Recommendation: The Diagnostic Phase

**Do not proceed to implementation.** Instead:

### Phase 0: Diagnosis (2-3 weeks)
1. **Inventory existing mental models** in synthesis (map chairman-constraints, archetypes, moat design to named frameworks)
2. **Run retrospective on Stage 0 decisions**: Which synthesis components most influenced go/no-go calls on the last 10 ventures?
3. **Document implicit decision rules**: What is the Chairman *actually* reasoning about when evaluating ventures?
4. **Assess confounding in outcome data**: Do success/failure outcomes correlate with venture size, founder background, timing, or model predictions? By how much?
5. **Sketch causal model**: If we add models, what causal paths do we expect to improve outcomes? What would falsify our hypothesis?

### If Phase 0 Suggests Proceeding:

Phase 1 becomes: **Surface and name 1-3 existing embedded models.** Don't invent new ones yet.

---

## Questions for the Team

1. **Why do we think Stage 0 is the bottleneck?** Is it really that synthesis models are missing, or is it that early ventures have bad entry-path hypotheses that no amount of modeling downstream can fix?

2. **What is the base rate of venture success post-Stage 0?** If it's already 70%+, models may not move the needle. If it's 30%, models are unlikely to be the fix (more likely entry-path and execution are the issue).

3. **What specific Stage 0 kill decisions do you regret?** (Ventures killed that should have proceeded, or vice versa.) Do you think a mental model would have changed those decisions? Which one?

4. **How does outcome tracking differ from what you're already doing?** EHG already tracks whether ventures succeed/fail. What new data would mental models add?

---

## Final Synthesis

The mental models repository is a **solution looking for a problem**. It's solving for "We should be more systematic and macro-aware about ventures" when the real problem may be:

- Stage 0 captures ventures with weak entry-path hypotheses (fix entry paths first)
- We're not learning from outcomes because we can't control for confounds (fix measurement first)
- The Chairman's judgment is being overridden by process (fix organizational culture, not add more process)

The proposal is intellectually compelling and carries medium execution risk. But it's **high strategic risk** because it creates the appearance of rigor without addressing the actual causal levers.

Proceed with extreme caution. Diagnose first.
