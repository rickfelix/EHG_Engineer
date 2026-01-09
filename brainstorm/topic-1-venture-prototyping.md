# Brainstorm Topic 1: Venture Prototyping (Genesis System)

## The Challenge
**Question**: Do we really need the Genesis text-to-simulation pipeline that generates actual preview applications before deciding whether a venture should proceed?

## Context: What Genesis Actually Does

### Genesis = Text-to-Simulation Pipeline
Genesis is an **actual code generation system** that creates deployable applications from a text description, allowing evaluation before committing to the formal 25-stage workflow.

### The Flow:
```
Text Seed → PRD Generation → Simulated Schema + Repo → Vercel Preview URL → Evaluate → Ratify → Stage 1 Venture
```

### Key Components:

**1. Text-to-PRD (Dreamcatcher Phase)**
- Venture Seed Parser: Raw text → structured intake
- PRD Template Engine: Stage 1-2 artifact generation
- Problem/Solution Extraction: NLP extraction from seed text
- Requirements Generator: Functional requirements from seed

**2. PRD-to-Code (Mason Phase)**
- Schema Generator: PRD → SQL tables with relationships
- RLS Policy Generator: Auto-generate security policies
- Repo Customizer: Template + PRD → customized scaffold
- 49 scaffold patterns: component, hook, service, page, layout, api_route, database_table, rls_policy, migration

**3. Deployment (Ephemeral)**
- Vercel preview deployment
- "SIMULATION" watermark overlay
- 90-day TTL (time-to-live)
- Incineration for rejected simulations

**4. Ratification**
- `/ratify` command: "Will you do the work?" approval
- If ratified → Creates actual venture at Stage 1
- If rejected → Incineration (cleanup)

### Infrastructure Scale:
- **8,482 lines of code** across two codebases
- **49 scaffold patterns** in database
- Spans EHG_Engineer (infrastructure) and EHG App (orchestration)

---

## Key Files:

### EHG_Engineer (Infrastructure):
```
lib/genesis/branch-lifecycle.js     # Simulation session CRUD, incineration
lib/genesis/pattern-library.js      # Query scaffold_patterns table
lib/genesis/pattern-assembler.js    # Slot-based template composition
lib/genesis/quality-gates.js        # TypeScript, ESLint, Build gates
lib/genesis/vercel-deploy.js        # Deployment to Vercel
lib/genesis/mock-mode-injector.js   # Inject mock mode into generated code
lib/genesis/watermark-middleware.js # Visual "SIMULATION" watermark
lib/genesis/ttl-cleanup.js          # TTL expiration and garbage collection
```

### EHG App (Orchestration):
```
lib/genesis/ScaffoldEngine.js       # Pattern selection → assembly → gates
lib/genesis/mock-mode-verifier.js   # Post-deployment mock mode verification
lib/genesis/repo-creator.js         # GitHub repo creation
scripts/genesis/genesis-pipeline.js # End-to-end orchestrator
scripts/genesis/pattern-selector.js # PRD → pattern matching
scripts/genesis/soul-extractor.js   # Requirement extraction
```

### Database:
```
scaffold_patterns      # 49 code generation patterns
simulation_sessions    # Simulation lifecycle tracking
soul_extractions       # Stage 16 requirement extraction
genesis_deployments    # Vercel deployment tracking
```

---

## Arguments FOR Genesis (Current Justification)

### 1. "See Before You Commit"
- Chairman can see a working preview before investing in 25-stage workflow
- Reduces false starts by revealing technical complexity early

### 2. Kill-Fast with Evidence
- Seeing a buggy/ugly simulation is better than imagining a perfect product
- Provides concrete basis for kill decisions

### 3. Validation of Technical Feasibility
- Scaffold patterns prove the tech stack works
- Schema generation validates data model assumptions

### 4. Time-to-Truth Acceleration
- Faster than manually building MVPs
- Automated quality gates catch issues early

### 5. Compounding Infrastructure
- 49 patterns are reusable across all ventures
- Each simulation improves the pattern library

---

## Questions to Challenge

### 1. ROI of Code Generation vs. PRD-Only
- Is generating actual code worth the infrastructure cost?
- Could equally good kill/go decisions be made from PRDs alone?
- What decisions have been changed by seeing a simulation vs. reading a PRD?

### 2. Simulation Fidelity Problem
- How representative is a scaffolded simulation of the final product?
- If simulation ≠ production, does it actually reduce risk?
- The "Regeneration Parity" problem: simulation details may be lost when generating production code

### 3. Pattern Library Limitations
- 49 patterns cover common cases—what about novel ventures?
- Does pattern-based generation bias toward conventional architectures?
- Is there a "golden hammer" problem (everything looks like a Next.js app)?

### 4. Infrastructure Overhead
- 8,482 LOC is significant maintenance burden
- TTL cleanup, incineration, GitHub orgs, Vercel projects
- Is this complexity justified by the value delivered?

### 5. Alternative Approaches
- Could rapid wireframing/Figma prototypes serve the same purpose?
- Could AI-generated mockups (no actual code) be sufficient?
- Could the PRD generation alone (without code) provide enough clarity?

### 6. Stage 3 Kill Gate Redundancy
- Stage 3 (Market Validation & RAT) already has a "Tier 0 cap" kill gate
- Does Genesis simulation add value on top of this existing gate?
- Or is it redundant with Stage 1-3 validation?

### 7. Cost-Benefit for Different Venture Types
- High-complexity ventures: Simulation might reveal hidden issues
- Simple ventures: Simulation might be overkill
- Should Genesis be optional based on venture complexity?

---

## Evidence Locations

| What | File Path |
|------|-----------|
| Genesis Implementation Guide | `docs/architecture/GENESIS_IMPLEMENTATION_GUIDE.md` |
| Genesis Sprint Roadmap | `docs/vision/GENESIS_SPRINT_ROADMAP.md` |
| Scaffold Patterns Table | `docs/reference/schema/engineer/tables/scaffold_patterns.md` |
| Branch Lifecycle Code | `lib/genesis/branch-lifecycle.js` |
| Pattern Library Code | `lib/genesis/pattern-library.js` |
| Genesis README | `lib/genesis/README.md` |
| Simulation Chamber Architecture | `docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md` |
| Genesis Virtual Bunker Addendum | `docs/vision/GENESIS_VIRTUAL_BUNKER_ADDENDUM.md` |

---

## Triangulation Questions for External AIs

### Core Necessity Questions:

1. **Value Assessment**: Does generating actual code/preview URLs provide meaningfully better kill/go decisions than PRD-only evaluation? What evidence exists?

2. **Alternative Analysis**: What are the alternatives to full code generation for venture validation? (Wireframes, AI mockups, detailed specs, etc.) How do they compare?

3. **ROI Calculation**: Given 8,482 LOC of infrastructure, what's the break-even point? How many ventures need to be evaluated via Genesis to justify the investment?

### Implementation Questions:

4. **Pattern Coverage**: Do 49 scaffold patterns cover enough venture types? What percentage of ventures would require custom code outside these patterns?

5. **Simulation Fidelity**: How representative are Genesis simulations of final products? What's lost in the translation?

6. **Regeneration Parity Risk**: When a simulation is ratified and production code is generated fresh, what details are lost? Is this acceptable?

### Strategic Questions:

7. **Selective Application**: Should Genesis be optional? Which venture types benefit most/least from simulation?

8. **Capability Compounding**: Does Genesis produce reusable capabilities (per Topic 2's doctrine), or is it just a one-time evaluation tool?

9. **Future-Proofing**: At 100× intelligence density (per Topic 4), does Genesis become more or less valuable? Could AI generate better simulations without scaffolding?

---

## User's Core Concern
> "I want to challenge the need for this quick prototyping and make sure that I understand it and make sure that I understand how it works throughout the 25-Stage Venture Workflow. I really want to just challenge whether or not we really need it."

The goal is to determine if Genesis (text-to-simulation code generation) is **essential infrastructure** or **over-engineering**.

---

*Topic 1 of 5 for Ground-Truth Triangulation Protocol*
*Created: 2026-01-08*
*Updated: 2026-01-08 (corrected to focus on Genesis system, not Stage 0)*
