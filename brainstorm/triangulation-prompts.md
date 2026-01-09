# EHG Triangulation Prompts for OpenAI & Antigravity

**Purpose**: Challenge five foundational infrastructure decisions for EHG using multi-AI triangulation.

**Instructions for External AIs**:
- You have full access to the EHG codebase
- Cite specific files, line numbers, and code snippets as evidence
- Challenge assumptions ruthlessly—these decisions are foundational
- Identify blind spots, contradictions, and implementation gaps
- Propose alternatives where the current thinking may be flawed
- Be adversarial, not confirmatory

---

# TOPIC 1: Venture Prototyping (Genesis System)

## Context

EHG has built **Genesis**, a text-to-simulation pipeline that generates **actual deployable applications** from a venture idea before committing to the formal 25-stage workflow.

### What Genesis Does:
```
Text Seed → PRD Generation → Simulated Schema + Repo → Vercel Preview URL → Evaluate → Ratify → Stage 1 Venture
```

### Key Components:
1. **Text-to-PRD (Dreamcatcher)**: Parses seed text, generates PRD artifacts
2. **PRD-to-Code (Mason)**: Creates schema, RLS policies, customized scaffold from 49 patterns
3. **Deployment**: Vercel preview with "SIMULATION" watermark, 90-day TTL
4. **Ratification**: `/ratify` command → creates venture at Stage 1, or incineration if rejected

### Infrastructure Scale:
- **8,482 lines of code** across two codebases (EHG_Engineer + EHG App)
- **49 scaffold patterns** in database (component, hook, service, page, layout, api_route, database_table, rls_policy, migration)
- GitHub repo creation, Vercel deployments, TTL cleanup, incineration sequences

### Key Files to Reference:
```
# EHG_Engineer (Infrastructure)
lib/genesis/branch-lifecycle.js       # Simulation session CRUD, incineration (562 LOC)
lib/genesis/pattern-library.js        # Query scaffold_patterns table (157 LOC)
lib/genesis/pattern-assembler.js      # Slot-based template composition (236 LOC)
lib/genesis/quality-gates.js          # TypeScript, ESLint, Build gates (370 LOC)
lib/genesis/vercel-deploy.js          # CLI-based Vercel deployment (325 LOC)
lib/genesis/mock-mode-injector.js     # Inject mock mode into code (351 LOC)
lib/genesis/watermark-middleware.js   # Visual "SIMULATION" watermark (213 LOC)
lib/genesis/ttl-cleanup.js            # TTL expiration and cleanup (312 LOC)
lib/genesis/README.md                 # Module documentation

# EHG App (Orchestration)
lib/genesis/ScaffoldEngine.js         # Pattern selection → assembly → gates (288 LOC)
lib/genesis/mock-mode-verifier.js     # Post-deployment verification (369 LOC)
lib/genesis/repo-creator.js           # GitHub repo creation (439 LOC)
scripts/genesis/genesis-pipeline.js   # End-to-end orchestrator (398 LOC)
scripts/genesis/pattern-selector.js   # PRD → pattern matching (238 LOC)
scripts/genesis/soul-extractor.js     # Requirement extraction (419 LOC)
scripts/genesis/seed-patterns.js      # Pattern library definitions (1,324 LOC)

# Documentation
docs/architecture/GENESIS_IMPLEMENTATION_GUIDE.md
docs/vision/GENESIS_SPRINT_ROADMAP.md
docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md
docs/vision/GENESIS_VIRTUAL_BUNKER_ADDENDUM.md

# Database
scaffold_patterns                     # 49 code generation patterns
simulation_sessions                   # Simulation lifecycle tracking
genesis_deployments                   # Vercel deployment tracking
```

## The Challenge

The Chairman wants to **challenge whether Genesis (text-to-simulation code generation) is necessary at all**.

### Questions to Answer:

**1. ROI Analysis: Code Generation vs. PRD-Only**
- **Does generating actual code/preview URLs provide meaningfully better kill/go decisions than PRD-only evaluation?**
- Search for evidence: Has a venture been killed because of what was seen in simulation that wouldn't have been caught in PRD review?
- What's the incremental value of a preview URL over a detailed PRD?
- Calculate: 8,482 LOC infrastructure cost vs. decision quality improvement

**2. Simulation Fidelity Assessment**
- **How representative are Genesis simulations of final products?**
- The patterns are scaffolds—they don't contain business logic
- If simulation ≠ production, does it actually reduce risk or create false confidence?
- Search for: "Regeneration Parity" concerns in PRD reviews (docs/reviews/GENESIS_PRD_REVIEW_REPORT.md)

**3. Pattern Library Limitations**
- **Do 49 scaffold patterns cover enough venture types?**
- Search the `scaffold_patterns` table: What pattern types exist?
- What percentage of ventures would require custom code outside these patterns?
- Is there a "golden hammer" problem (everything becomes a Next.js app)?

**4. Alternative Approaches**
- **What are the alternatives to full code generation?**
  - AI-generated mockups/wireframes (no actual code)
  - Detailed PRD with architecture diagrams
  - Figma prototypes
  - Paper prototyping / storyboards
- How do these compare in cost, speed, and decision quality?
- Could EHG get 80% of the value at 20% of the infrastructure cost?

**5. Implementation Status Check**
- **What parts of Genesis are actually WORKS vs. PLANNED/STUBBED?**
- Search for: Entry points (CLI, API, UI)
- Check: Does the full pipeline work end-to-end today?
- Check: Has any venture actually been created via Genesis ratification?
- Classify each component: WORKS | DISCONNECTED | STUBBED | PLANNED | MISSING

**6. Capability Compounding Assessment**
- **Does Genesis produce reusable capabilities (per EHG doctrine)?**
- The 49 patterns are reusable—but is pattern reuse happening?
- Does each simulation improve the pattern library, or is it static?
- Is Genesis itself a "capability" or just a one-time evaluation tool?

**7. Future-Proofing at 100× Intelligence Density**
- **At 100× intelligence density (per Topic 4), does Genesis become more or less valuable?**
- Could AI generate better simulations without scaffolding?
- Does the pattern-based approach become obsolete when AI can generate novel architectures?
- Or does Genesis become more valuable as the gatekeeper for AI-generated ventures?

**8. Cost-Benefit by Venture Type**
- **Should Genesis be optional based on venture complexity?**
- High-complexity ventures: Simulation might reveal hidden issues
- Simple ventures: Simulation might be overkill
- Is there a tier system for when to use Genesis?

**9. Redundancy with Stage 1-3 Validation**
- Stage 1: Draft Idea & Chairman Review
- Stage 2: AI Multi-Model Critique
- Stage 3: Market Validation & RAT (with tier cap kill gate)
- **Does Genesis simulation add value on top of these existing gates?**
- Or is Genesis redundant with the early-stage validation already built into the workflow?

### Evidence Requirements
For every claim, provide:
- File path where you found evidence
- Line number(s)
- 3-5 line code snippet
- Classification: WORKS | DISCONNECTED | STUBBED | PLANNED | MISSING

### Output Format
```markdown
## Genesis Necessity Verdict

### Recommendation: [KEEP AS-IS / KEEP WITH MODIFICATIONS / MAKE OPTIONAL / ELIMINATE]

### Implementation Status:
| Component | Status | Evidence |
|-----------|--------|----------|
| Text-to-PRD | [Status] | [file:line] |
| PRD-to-Schema | [Status] | [file:line] |
| PRD-to-Repo | [Status] | [file:line] |
| Vercel Deploy | [Status] | [file:line] |
| Ratification | [Status] | [file:line] |
| End-to-End Pipeline | [Status] | [file:line] |

### ROI Assessment:
- Infrastructure cost: 8,482 LOC
- Estimated development time: [X person-weeks]
- Decision quality improvement: [Assessment]
- Break-even point: [X ventures evaluated]

### Key Findings:
1. [Finding with evidence]
2. [Finding with evidence]
3. [Finding with evidence]

### If MODIFY/MAKE OPTIONAL, Proposed Changes:
- [Change 1]
- [Change 2]

### Alternatives Considered:
| Alternative | Pros | Cons | Recommendation |
|-------------|------|------|----------------|
| PRD-only | [Pros] | [Cons] | [Rec] |
| AI mockups | [Pros] | [Cons] | [Rec] |
| Figma prototypes | [Pros] | [Cons] | [Rec] |

### Risks of Current Design:
- [Risk 1]
- [Risk 2]

### Risks of Elimination:
- [Risk 1]
- [Risk 2]
```

---

# TOPIC 2: Compounding Capabilities Strategy

## Context

EHG wants to adopt an **explicit "capability compounding" strategy** inspired by Elon Musk's approach (Tesla manufacturing → SpaceX → Neuralink → etc.).

### The Proposed Strategy:
- EHG should be a "Capability Accretion Engine," not just a venture studio
- Every venture must answer: "What reusable capability does this add to the ecosystem?"
- Each venture produces:
  - Primary Output: The product
  - Secondary Output: A reusable internal capability
- EVA becomes the "Capability Router" that tracks provenance and injects capabilities
- A venture that doesn't add a reusable capability is "strategically weak—even if profitable"

### Examples of EHG-Native Capabilities:
- Validation logic
- Market intelligence extraction
- Pricing elasticity modeling
- Autonomous QA
- Agent orchestration

## The Challenge

This strategy sounds compelling but may have **serious implementation and philosophical problems**.

### Questions to Answer:

**1. Definition Problem**
- **What precisely distinguishes a "capability" from a "feature" or "tool"?**
- Search the codebase: Is there any existing definition of "capability"?
- How would you draw the line between:
  - A capability (reusable primitive)
  - A feature (one-time implementation)
  - A tool (utility function)
- Without a precise definition, how can this strategy be enforced?

**2. Measurement Problem**
- The strategy requires measuring "ecosystem lift" and "capability ROI"
- **How would you actually measure these?**
- Proposed metrics: Reuse frequency, decision latency reduction, token-per-decision collapse
- Are these measurable with current infrastructure?
- What database tables/schemas would be needed?

**3. Enforcement Problem**
- The strategy proposes: "A venture that doesn't add capability is strategically weak"
- **Should such ventures be rejected?** What's the enforcement mechanism?
- Search the codebase: Is there any existing "venture admission gate"?
- How do you prevent this rule from becoming bureaucratic overhead?

**4. Retroactive Application Problem**
- For existing/past ventures, how do you identify capabilities they produced?
- **Is capability extraction always possible after the fact?**
- What if a venture's value was purely in revenue, not capability?

**5. Capability Conflicts**
- What if two ventures produce competing capabilities for the same function?
- **Who decides which capability becomes canonical?**
- How do you deprecate/retire losing capabilities?

**6. Over-Engineering Risk**
- The Musk comparison may be flawed:
  - Musk's companies share physical manufacturing constraints
  - EHG's software ventures may be more independent
- **Is capability sharing always beneficial, or can it create unwanted coupling?**
- What's the cost of premature abstraction?

**7. EVA Capability Router**
- EVA is proposed to "inject capabilities automatically"
- **Search the codebase: What is EVA's current architecture?**
- Is EVA designed to handle capability routing?
- What would need to change?

### Evidence Requirements
For every claim, provide:
- File path where you found evidence
- Line number(s)
- 3-5 line code snippet
- Assessment of implementation feasibility

### Output Format
```markdown
## Capability Compounding Strategy Verdict

### Recommendation: [ADOPT AS-IS / ADOPT WITH MODIFICATIONS / REJECT / DEFER]

### Critical Issues Found:
1. [Issue with evidence]
2. [Issue with evidence]

### Implementation Feasibility:
- Definition clarity: [HIGH / MEDIUM / LOW]
- Measurement capability: [HIGH / MEDIUM / LOW]
- Enforcement mechanism: [HIGH / MEDIUM / LOW]
- EVA readiness: [HIGH / MEDIUM / LOW]

### Proposed Modifications:
- [Modification 1]
- [Modification 2]

### Alternative Approaches:
- [Alternative 1]
- [Alternative 2]
```

---

# TOPIC 3: Venture Evaluation Matrix (Four-Plane Model)

## Context

A new **Venture Evaluation Matrix** has been proposed to replace metaphorical thinking (trees, stars) with a cybernetic control system.

### The Four Planes:

**PLANE 1 — Capability Graph Impact** (Score 0-25)
- New Capability Node (0-5)
- Capability Reuse Potential (0-5)
- Graph Centrality Gain (0-5)
- Maturity Lift (0-5)
- Extraction Clarity (0-5)
- **Hard Rule: If Plane 1 < 10, reject unless exception granted**

**PLANE 2 — External Vector Alignment** (Score -10 to +25)
- Market Demand Gradient
- Technology Cost Curve
- Regulatory Trajectory
- Competitive Density
- Timing Window
- **Hard Rule: Strong headwinds require explicit mitigation**

**PLANE 3 — Control & Constraint Exposure** (Pass/Block/Escalate)
- Spend Risk
- Legal/Regulatory Risk
- Brand Risk
- Security/Data Risk
- Autonomy Risk
- **Hard Rule: Any HIGH = escalation required; Missing kill-switch = automatic block**

**PLANE 4 — Exploration vs Exploitation Position** (Dial)
- Pure Exploration ↔ Pure Exploitation
- **Hard Rule: Exploratory ventures without expiry dates are invalid**

### Decision Logic:
1. Constraint Check (Plane 3 Block → Reject)
2. Capability Test (Plane 1 < 10 → Reject)
3. Strategic Viability (Plane 2 negative → Require rationale)
4. Dial Consistency (Metrics must match position)

### UI Spec:
- "One page to decide. Many views to understand."
- Aircraft cockpit aesthetic, not analytics dashboard
- Decision Card shows all four planes simultaneously

## The Challenge

This framework is complex and may have **scoring problems, implementation gaps, and usability issues**.

### Questions to Answer:

**1. Scoring Validity**
- **Are the scoring ranges appropriate?**
  - Plane 1: 0-25 with threshold at 10 (40%)
  - Plane 2: -10 to +25 (asymmetric)
- Why these specific numbers? What's the calibration basis?
- Could a venture score 11 on Plane 1 but still be bad?

**2. Threshold Arbitrariness**
- **Why is Plane 1 < 10 the rejection threshold?**
- Is there evidence that 10 is the right cutoff?
- What happens at the boundary (9 vs 10)?
- Should thresholds be dynamic based on portfolio state?

**3. Plane Independence**
- The model assumes four "orthogonal planes"
- **Are they actually independent?**
- Example: A venture with high Plane 2 (strong vectors) might naturally score higher on Plane 1 (capability potential)
- Does this correlation break the model?

**4. Aggregation Problem**
- The decision logic is sequential (Plane 3 → Plane 1 → Plane 2 → Plane 4)
- **Why not a weighted aggregate score?**
- What's lost by not combining scores?
- Could a venture pass all gates but still be a bad investment?

**5. Constraint Gate Granularity**
- Plane 3 uses Low/Medium/High for five risk areas
- **Is three-level granularity sufficient?**
- What's the difference between "Medium" and "High"?
- Who makes the classification?

**6. Exploration Dial Enforcement**
- Exploratory ventures require expiry dates
- **What happens when a venture expires?**
- Is it automatically killed? Reviewed? Extended?
- Search the codebase: Is there any expiry enforcement logic?

**7. EVA Confidence Score**
- The UI shows "Confidence: 0.81"
- **What's the algorithm that produces this number?**
- Is 0.81 meaningful, or is it theater?
- What inputs produce what confidence levels?

**8. Implementation Reality Check**
- **Search the codebase for any existing implementation of:**
  - Four-plane scoring
  - Capability graph calculation
  - Vector alignment scoring
  - Constraint gate logic
- Is this WORKS, DISCONNECTED, STUBBED, PLANNED, or MISSING?

**9. Comparison to Existing Systems**
- Search the codebase for existing venture evaluation logic
- **Does this matrix replace something, or is it additive?**
- What's the migration path from current state?

### Evidence Requirements
For every claim, provide:
- File path where you found evidence
- Line number(s)
- 3-5 line code snippet
- Implementation status assessment

### Output Format
```markdown
## Venture Evaluation Matrix Verdict

### Recommendation: [IMPLEMENT AS-IS / IMPLEMENT WITH MODIFICATIONS / REDESIGN / REJECT]

### Scoring Analysis:
- Plane 1 threshold validity: [Assessment]
- Plane 2 asymmetry justification: [Assessment]
- Plane 3 granularity: [Assessment]
- Plane 4 enforcement clarity: [Assessment]

### Implementation Status:
- Four-plane scoring: [WORKS / DISCONNECTED / STUBBED / PLANNED / MISSING]
- Capability graph: [Status]
- Vector alignment: [Status]
- Constraint gates: [Status]
- EVA confidence: [Status]

### Critical Design Flaws:
1. [Flaw with evidence]
2. [Flaw with evidence]

### Proposed Modifications:
- [Modification 1]
- [Modification 2]

### Alternative Evaluation Frameworks:
- [Alternative 1]
- [Alternative 2]
```

---

# TOPIC 4: 100x Intelligence Density Impact

## Context

Elon Musk claimed that **intelligence density per gigabyte can be improved by two orders of magnitude (100×)**. EHG is analyzing how this would impact:
- Architecture
- Business model
- Competitive landscape
- Venture selection

### Proposed Architectural Changes:
1. Agents become **stateful executives** (not stateless workers)
2. **Governance > Orchestration** (runaway autonomy becomes the danger)
3. **Memory architecture becomes first-class** (compressed knowledge graphs)
4. Capabilities must be **decoupled from ventures**
5. EVA evolves from **orchestrator → capability router**

### Proposed Business Model Shift:
- "Your product is not software. Your product is accumulated epistemic leverage."
- Token cost stops being a moat; cognition quality becomes the moat
- The real moat: cross-venture learning speed

### Proposed Venture Selection Shift:
- Less attractive: Pure execution arbitrage, "AI does X" wrappers
- More attractive: Decision-heavy domains, long-horizon systems, memory-owning systems

## The Challenge

This analysis may be **premature, technically inaccurate, or strategically misguided**.

### Questions to Answer:

**1. Timeline Validity**
- **When does 100× density arrive?** 2026? 2028? 2030?
- Is this claim technically grounded, or aspirational?
- Search for: What's the current trajectory of model efficiency improvements?
- Should EHG prepare now, or is this premature optimization?

**2. Technical Accuracy**
- **What does "intelligence density per gigabyte" actually mean?**
- Is this about model size? Inference cost? Capability per parameter?
- Is the 100× claim about training, inference, or both?
- Are there credible sources for this trajectory?

**3. Stateful Agents Feasibility**
- The proposal suggests agents should "persist across stages" and "accumulate internal models"
- **Search the codebase: What is the current agent architecture?**
- Is stateful agent memory implemented?
- What would need to change to support long-lived cognitive entities?

**4. Memory Compression Architecture**
- The proposal suggests "memory distillation layers" and "agent compression jobs"
- **Search the codebase: What memory systems exist today?**
- Is there any knowledge graph infrastructure?
- What's the gap between current state and proposed state?

**5. Governance Sufficiency**
- The proposal claims governance becomes more important, not less
- **Search the codebase: What governance mechanisms exist?**
- Are there: Authority matrices? Escalation budgets? Kill-switches?
- Is the current governance designed for "100× smarter agents"?

**6. Competitive Analysis**
- The proposal claims most competitors will "over-automate" and "chase speed"
- **Is this accurate?** Who are EHG's actual competitors?
- Are they making the same or different bets?

**7. Venture Selection Criteria**
- The proposal suggests favoring "decision-heavy, error-intolerant domains"
- **Does the current venture pipeline align with this?**
- Search the codebase: What ventures are in progress?
- Would they score well under the new criteria?

**8. "Accumulated Epistemic Leverage" as Product**
- This is a compelling phrase, but **is it operationalizable?**
- How would you sell "epistemic leverage"?
- What's the pricing model?
- Who is the customer?

**9. Missing Questions**
The analysis proposed three "missing questions":
- How do we measure capability lift?
- How do capabilities decay or become dangerous?
- When should a venture exist only as a capability forge?

**Are there other critical questions being missed?**

### Evidence Requirements
For every claim, provide:
- File path where you found evidence
- Line number(s)
- 3-5 line code snippet
- Gap assessment between current state and proposed state

### Output Format
```markdown
## 100× Intelligence Density Verdict

### Timeline Assessment:
- Likelihood of 100× by 2026: [%]
- Likelihood of 100× by 2028: [%]
- Recommended preparation timeline: [NOW / 2026 / 2028 / WAIT]

### Technical Accuracy:
- "Intelligence density" definition clarity: [HIGH / MEDIUM / LOW]
- Claim validity: [CREDIBLE / SPECULATIVE / UNFOUNDED]

### Architecture Readiness:
- Stateful agents: [Gap assessment]
- Memory compression: [Gap assessment]
- Governance for autonomy: [Gap assessment]
- Capability decoupling: [Gap assessment]

### Strategic Concerns:
1. [Concern with evidence]
2. [Concern with evidence]

### Recommended Actions:
- Immediate (now): [Action]
- Near-term (6 months): [Action]
- Medium-term (12-18 months): [Action]

### Questions Not Being Asked:
1. [Question]
2. [Question]
```

---

# TOPIC 5: EHG Vision (Complete Doctrine)

## Context

This is the **synthesis of all previous topics** into a unified EHG doctrine.

### Core Thesis:
> "EHG is a capability lattice implemented as a governed cognitive system. A machine for compounding decision power over time."

### Formal Doctrine (5 Rules):
1. Every venture must increase the global capability set of EHG
2. Capabilities are first-class assets, independent of ventures
3. EVA is responsible for routing, reusing, and evolving capabilities
4. Governance exists to prevent capability misuse, overreach, or decay
5. The Chairman optimizes for ecosystem lift, not venture P&L alone

### External Narrative Mask:
- Public identity: "A conservative, data-driven micro-holdco for software ventures"
- NOT: AI lab, venture studio, platform company, operating system
- The mask protects the mission

### Exit Criteria (Capability Saturation):
A venture is exit-eligible when 3+ of these are true:
1. Capability Harvest Complete
2. Capability Generalization Plateau
3. Declining Ecosystem Lift
4. Governance-to-Lift Imbalance
5. Attention Opportunity Cost
6. Misalignment With Future Roadmap
7. Market Fit for Strategic Owner

### UI/UX Split:
- External: Light, editorial, conservative, boring
- Internal: Dark, cockpit, precise, powerful

## The Challenge

This vision is **ambitious and may be internally contradictory, unrealistic, or strategically flawed**.

### Questions to Answer:

**1. Doctrine Coherence**
- **Are the 5 doctrine rules internally consistent?**
- Rule 1 says "every venture must increase capability"
- Rule 5 says "optimize for ecosystem lift, not P&L"
- What happens when capability and ecosystem lift conflict?
- Can a venture increase capability but decrease ecosystem lift?

**2. Capability-First vs. Customer-First**
- The doctrine prioritizes capability extraction over customer value
- **Is this a viable business strategy?**
- What if the best market opportunity doesn't produce reusable capabilities?
- Are you willing to pass on profitable ventures that don't compound?

**3. EVA's Expanded Role**
- EVA is now responsible for: routing, reusing, evolving, tracking provenance, injecting automatically
- **Search the codebase: What is EVA's current implementation?**
- Is EVA a single system or a collection of agents?
- What would need to change to support the expanded role?

**4. Narrative Mask Durability**
- The mask strategy assumes competitors won't figure out the real system
- **How long can this hold?**
- What happens when sophisticated competitors probe?
- At what point does the mask become a liability?

**5. Exit Criteria Operationalization**
- "Capability Saturation" is defined as 3+ criteria being true
- **How do you measure each criterion?**
  - "Capability Harvest Complete" - what's complete?
  - "Declining Ecosystem Lift" - what metric declines?
  - "Governance-to-Lift Imbalance" - how is this calculated?
- Search the codebase: Is there any exit scoring logic?

**6. Chairman Leverage at Scale**
- The vision positions the Chairman as "prefrontal cortex"
- **What happens when there are 50 ventures? 100 ventures?**
- How does Chairman attention scale?
- Is the model designed for single-digit or multi-digit ventures?

**7. External/Internal UI Split**
- External: Conservative, boring, text-only
- Internal: Cockpit, dense, dark
- **Is this split sustainable?**
- What if someone sees both and realizes the disconnect?
- Should there be a middle tier (e.g., for investors)?

**8. "Accumulated Epistemic Leverage" Paradox**
- The vision claims: "Your product is accumulated epistemic leverage"
- But externally, you present as: "A disciplined operator of small businesses"
- **These are radically different value propositions**
- Which one is true? Can both be true?

**9. Bootstrapped + Selective Exits Tension**
- EHG is bootstrapped (no external capital)
- But exits are "selective" based on capability saturation
- **What if capability saturation happens before profitability?**
- Can you afford to sell capability-saturated-but-unprofitable ventures?

**10. Implementation Gap Analysis**
- Search the codebase for evidence of:
  - Capability Ledger
  - Ecosystem Lift metrics
  - EVA capability routing
  - Governance wrapper for autonomy
  - Exit scoring logic
- **What's actually built vs. what's vision?**

### Evidence Requirements
For every claim, provide:
- File path where you found evidence
- Line number(s)
- 3-5 line code snippet
- Gap between vision and implementation

### Output Format
```markdown
## EHG Vision Verdict

### Doctrine Coherence:
- Internal consistency: [HIGH / MEDIUM / LOW]
- Contradictions found: [List]

### Strategic Viability:
- Capability-first strategy: [VIABLE / RISKY / FLAWED]
- Narrative mask durability: [STRONG / MODERATE / WEAK]
- Chairman scalability: [Scales to X ventures]

### Implementation Status:
| Component | Status | Gap |
|-----------|--------|-----|
| Capability Ledger | [Status] | [Gap] |
| Ecosystem Lift Metrics | [Status] | [Gap] |
| EVA Capability Routing | [Status] | [Gap] |
| Governance Wrapper | [Status] | [Gap] |
| Exit Scoring | [Status] | [Gap] |

### Critical Risks:
1. [Risk with evidence]
2. [Risk with evidence]
3. [Risk with evidence]

### Recommended Modifications:
1. [Modification]
2. [Modification]

### Questions the Vision Doesn't Answer:
1. [Question]
2. [Question]
3. [Question]
```

---

# CROSS-TOPIC ANALYSIS

After analyzing each topic individually, also consider:

## Interconnection Questions:

1. **Topic 1 + Topic 4**: If intelligence density increases 100×, does Stage 0 become unnecessary (validation is instant) or more necessary (faster mistakes need more gates)?

2. **Topic 2 + Topic 3**: The Venture Evaluation Matrix's Plane 1 measures capability impact. Is this scoring aligned with the Compounding Capabilities doctrine?

3. **Topic 3 + Topic 5**: The Matrix is the "decision tool," the Vision is the "why." Are they coherent? Could a venture pass the Matrix but violate the Vision?

4. **Topic 4 + Topic 5**: The 100× density analysis proposes "stateful agents." The Vision proposes "EVA as capability router." Are these the same system or different systems?

5. **All Topics**: What's the implementation priority order? Which topic must be built first?

## Meta-Analysis:

- **Where is the thinking strongest?** Which topic has the most rigorous foundation?
- **Where is the thinking weakest?** Which topic is most at risk of being wrong?
- **What's being avoided?** Are there uncomfortable questions not being asked?
- **What would make this fail?** What's the single biggest risk across all topics?

---

# FINAL INSTRUCTIONS

After completing all analyses, provide a **consolidated summary**:

```markdown
## EHG Triangulation Summary

### Topic Rankings (Most to Least Confident):
1. [Topic]: [Confidence %] - [One-line reason]
2. [Topic]: [Confidence %] - [One-line reason]
3. [Topic]: [Confidence %] - [One-line reason]
4. [Topic]: [Confidence %] - [One-line reason]
5. [Topic]: [Confidence %] - [One-line reason]

### Critical Decisions Required:
1. [Decision]
2. [Decision]
3. [Decision]

### Implementation Roadmap:
- Phase 1 (Immediate): [What to build first]
- Phase 2 (3-6 months): [What comes next]
- Phase 3 (6-12 months): [Longer-term items]

### Biggest Blind Spot:
[What the entire analysis might be missing]

### Final Recommendation:
[Overall assessment and path forward]
```

---

*Triangulation Prompts Generated: 2026-01-08*
*For use with: OpenAI and Antigravity (Gemini)*
*Protocol: Ground-Truth Triangulation*
