# Triangulation Prompt: EHG Venture Factory + Shared Service Platform Architecture

## Context

We are designing the architecture for **EHG**, a one-person venture studio that operates as both:
1. **A venture factory** — creates and manages 15+ software ventures, each with its own Git repo
2. **A shared service platform** — provides AI-powered business operations (marketing, branding, customer service) that all ventures consume

### Key Facts
- One person (Rick) owns and operates all ventures
- All shared services are **AI-powered automation** (no human service desks)
- Services need **full integration** with venture repos — push code, deploy assets, modify configs, create PRs
- 3 ventures currently registered (ClarityStats, BrandForge AI, LocalizeAI), targeting 15+ within 12 months
- Current stack: Supabase (backend), React+Vite (frontend), Node.js (tooling), LEO Protocol (engineering orchestration)
- **Greenfield** — no ventures currently consume shared services; designing the architecture before building
- **Exit requirement** — individual ventures must be sellable. A buyer should be able to detach from EHG services or continue them as a paid vendor relationship.

---

## Proposed Architecture: Two-Layer Separation

The core architectural decision is to separate the **Service Layer** from the **Integration Layer**:

```
┌─────────────────────────────────────────────────┐
│  SERVICE LAYER (substitutable at exit)           │
│  Clean API contracts, versioned, documented      │
│  Example: "Generate Q1 campaign for brand X"     │
│  → Returns: structured artifacts (copy, images,  │
│    landing page specs, tracking config)           │
│                                                   │
│  EXIT: Replace with HubSpot, Jasper, etc.        │
├─────────────────────────────────────────────────┤
│  INTEGRATION LAYER (EHG-internal, disposable)    │
│  Takes artifacts → pushes to venture repo        │
│  Creates PRs, deploys assets, modifies configs   │
│  Implemented via GitHub Actions in venture repos  │
│                                                   │
│  EXIT: Buyer replaces with their own CI/CD       │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
              Venture Repo (theirs to keep)
```

### Selected Implementation: API + GitHub Actions

End-to-end flow for "Generate Q1 Campaign for ClarityStats":
1. **TRIGGER**: `POST /services/marketing/campaign { venture: "claritystats", quarter: "Q1" }`
2. **SERVICE LAYER**: Marketing service loads brand profile from DB, AI generates structured artifacts (copy, images, landing page specs), returns JSON, logs to audit table
3. **INTEGRATION LAYER**: EHG posts webhook to ClarityStats repo → GitHub Action receives artifacts, writes files, creates feature branch, opens PR
4. **REVIEW**: Rick reviews PR, merges

### Exit Scenario
- Buyer replaces Step 2 with HubSpot/Jasper API (service layer is substitutable)
- Buyer replaces Step 3 with their own CI/CD (integration layer is disposable)
- Steps 1 and 4 remain unchanged

### Three alternative implementations were evaluated:

| Dimension | Weight | A: API + GitHub Actions | B: API + Queue + Worker | C: API + LEO SDs |
|---|---|---|---|---|
| Complexity | 20% | 7 | 5 | 6 |
| Maintainability | 25% | 8 | 6 | 5 |
| Performance | 20% | 7 | 8 | 4 |
| Migration effort | 15% | 5 | 6 | 8 |
| Future flexibility | 20% | 9 | 7 | 4 |
| **Weighted Score** | | **7.45** | **6.35** | **5.15** |

---

## Claims to Validate

Please evaluate each claim independently. For each, provide:
- **Agreement level**: Strongly Agree / Agree / Neutral / Disagree / Strongly Disagree
- **Reasoning**: 2-3 sentences explaining your position
- **Alternative perspective**: What would you recommend differently, if anything?
- **Risk rating**: Low / Medium / High

### Claim 1: API + GitHub Actions is the optimal integration pattern
For AI-powered shared services (marketing, branding, customer service) that push code/assets to 15+ venture repos, API + GitHub Actions is the best implementation of the two-layer pattern.

### Claim 2: Two-layer separation cleanly enables venture exits
Separating service contracts (substitutable APIs) from integration mechanism (disposable GitHub Actions) allows selling individual ventures without architectural rework.

### Claim 3: One person can operate 15+ AI-automated ventures
With AI-powered shared services and this architecture, a single operator can manage 15+ ventures without becoming a fatal bottleneck.

### Claim 4: Vendor-contract exit model naturally supports all exit types
Designing for the "buyer continues paying EHG for services" model automatically makes clean-break and transition-period exits possible too.

### Claim 5: Services should return structured artifacts, not push code directly
The service layer should produce artifacts (JSON with copy, images, specs) and the integration layer should handle repo operations — rather than services directly writing to repos.

---

## Open Questions (Seeking Your Perspective)

1. **Is API + GitHub Actions the right pattern at this scale?** Or would something like Temporal workflows, event-driven architecture (EventBridge/NATS), or a dedicated orchestration platform (Prefect, Dagster) be more appropriate for coordinating AI service outputs across 15+ repos?

2. **How do real venture studios handle shared services across portfolio companies?** Are there established patterns from Idealab, Rocket Internet, eFounders, or similar venture studios? Do they centralize operations or let portfolio companies operate independently?

3. **What are the failure modes of AI agents generating artifacts that get auto-applied to production repos?** How should quality gates work? What happens when AI generates subtly wrong marketing copy, off-brand images, or broken landing page code? How do you catch these before they reach production?

4. **Is the "substitutable service contract" exit strategy realistic?** When acquirers buy a venture, do they typically want zero platform dependencies? Or is there precedent for maintaining vendor relationships with the former parent company? Does the vendor model affect valuation?

5. **What's missing from this architecture?** What obvious concerns or design patterns are we not considering? What would an experienced platform architect add?

6. **Multi-tenancy concerns**: Each service maintains state per venture (brand profiles, campaign history, customer interaction logs). What's the right isolation model — shared schema with tenant ID, separate schemas, or separate Supabase projects?

7. **Cost economics**: AI service invocations (LLM calls for marketing copy, image generation, customer service) scale with number of ventures × frequency of use. At 15+ ventures, what's a realistic monthly cost envelope, and does this architecture have cost optimization opportunities?

---

## Evaluation Criteria

Score the overall architecture (0-10) across these dimensions:

| Dimension | Description |
|---|---|
| **Correctness** | Does the architecture solve the stated problem (shared services + exit capability)? |
| **Completeness** | Are there major gaps in the design that need addressing before building? |
| **Scalability** | Will this work at 15+ ventures? What about 50+? |
| **Exit Readiness** | How cleanly can a venture be separated from EHG with this architecture? |
| **Operational Simplicity** | Can one person realistically operate this? |
| **Resilience** | How does the system handle failures (bad AI output, GHA failures, service outages)? |

Provide an overall composite score and identify the single biggest risk.

---

## Output Format

Please structure your response as:

1. **Claim-by-Claim Assessment** (table with agreement level, reasoning, risk)
2. **Open Question Responses** (numbered, 3-5 sentences each)
3. **Dimension Scores** (table with score and brief justification)
4. **Overall Assessment** (composite score, biggest risk, top recommendation)
5. **What You Would Do Differently** (if you were designing this from scratch)
