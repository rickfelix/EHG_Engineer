# Brainstorm: EHG as Venture Factory + Shared Service Platform Architecture

## Metadata
- **Date**: 2026-03-09
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ClarityStats, BrandForge AI, LocalizeAI (all active)
- **Related Brainstorm**: "Genesis — Public Venture Factory Offering" (2026-03-09)

---

## Problem Statement

EHG has two roles that are currently not architecturally separated: (1) a venture factory that creates and manages 15+ ventures, each with their own repo, and (2) a shared service platform providing AI-powered business operations (marketing, branding, customer service) that all ventures consume. The current EHG_Engineer orchestration system (LEO Protocol) manages engineering work for EHG itself, but has no mechanism for cross-repo service delivery to ventures, no service contract boundaries, and no exit strategy for selling individual ventures.

## Discovery Summary

### Operating Model
- **One-person venture studio**: Rick owns all ventures. EHG is the internal operating system, not a product for external founders.
- **AI-powered services**: Marketing, branding, and customer service are autonomous AI agents, not human-managed service desks.
- **Full integration**: Services need to push code, deploy assets, and modify configs in venture repos — not just return data.
- **Scale**: 15+ ventures targeted within 12 months. Current state: 3 ventures registered in DB (ClarityStats, BrandForge AI, LocalizeAI) but not yet in the application registry or consuming services.

### Architecture Constraints
- **Flexible infrastructure**: No hard mandate on Supabase-only or specific stack. Open to exploring options.
- **Exit capability required**: Ventures must be sellable. A buyer should be able to detach from EHG services or continue them as a paid vendor relationship.
- **Greenfield**: No ventures currently consume shared services. This is designing the factory before building on it.

### Key Architectural Decision: Two-Layer Separation

The central insight from this brainstorm: **separate the Service Layer from the Integration Layer**.

```
┌─────────────────────────────────────────────────┐
│  SERVICE LAYER (substitutable at exit)           │
│  Clean API contracts, versioned, documented      │
│  "Generate Q1 campaign for this brand profile"   │
│  → Returns: structured artifacts (copy, images,  │
│    landing page specs, tracking config)           │
│                                                   │
│  EXIT: Replace with HubSpot, Jasper, etc.        │
├─────────────────────────────────────────────────┤
│  INTEGRATION LAYER (EHG-internal, disposable)    │
│  Takes artifacts → pushes to venture repo        │
│  Creates PRs, deploys assets, modifies configs   │
│  THIS is the "full integration" part             │
│                                                   │
│  EXIT: Buyer replaces with their own CI/CD       │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
              Venture Repo (theirs to keep)
```

- **Service Layer** = the exit boundary. Clean API contracts that could be replaced by third-party alternatives or continued as a paid vendor relationship.
- **Integration Layer** = EHG-internal convenience. Disposable at exit. Handles the "full integration" (code push, asset deploy, config modify) while under EHG ownership.

### Exit Strategy: Design for Vendor Contract

Three exit models exist (clean break, transition period, ongoing vendor). **Design for the vendor contract model** because it naturally supports all three:
- If service contracts are clean enough to charge for, they're clean enough to replace.
- A buyer can continue using EHG services (vendor), transition away (6-12mo), or replace immediately (clean break).

## Analysis

### Arguments For
- **Compounding intelligence**: Cross-venture learning creates a data flywheel no single-venture competitor can match
- **Marginal cost collapse**: Each new venture gets cheaper to launch as services mature
- **LEO backbone exists**: LEO's phases/gates/handoffs are 80% of the orchestration machinery — extending to business ops is incremental
- **Full ownership = no coordination tax**: No external stakeholders, no API agreements to negotiate
- **Exit-ready by design**: Service contracts that are substitutable make the architecture inherently exit-friendly

### Arguments Against
- **Single operator at 15 ventures is a human bottleneck**: AI handles execution, but incidents, strategic pivots, and gate reviews still require Rick
- **Full repo integration is the hardest service model**: Business-data-only services would be 10x simpler
- **Blast radius scales linearly, recovery scales worse**: A shared service bug hitting 15 repos requires 15 manual fixes by one person
- **Context window economics**: Deep integration with each venture's codebase requires deep context per venture, which doesn't scale linearly in token cost or agent quality

### Tradeoff Matrix: Implementation Options

Three implementations of the two-layer pattern were evaluated:

| Dimension | Weight | A: API + GitHub Actions | B: API + Queue + Worker | C: API + LEO SDs |
|---|---|---|---|---|
| Complexity | 20% | 7 | 5 | 6 |
| Maintainability | 25% | 8 | 6 | 5 |
| Performance | 20% | 7 | 8 | 4 |
| Migration effort | 15% | 5 | 6 | 8 |
| Future flexibility | 20% | 9 | 7 | 4 |
| **Weighted Score** | | **7.45** | **6.35** | **5.15** |

**Recommendation: Option A (API + GitHub Actions)**

Critical weakness flags:
- Option C: Performance (4) and Future flexibility (4) below threshold. LEO was built for engineering orchestration, not high-frequency cross-repo service dispatch.

### Selected Architecture: API + GitHub Actions

End-to-end flow for "Generate Q1 Campaign for ClarityStats":

1. **TRIGGER** (manual or scheduled): `POST /services/marketing/campaign { venture: "claritystats", quarter: "Q1" }`
2. **SERVICE LAYER** (in EHG, substitutable): Marketing service loads brand profile, AI generates artifacts (copy, images, landing page specs), returns structured JSON, logs to `service_invocations` audit table.
3. **INTEGRATION LAYER** (disposable at exit): EHG posts webhook to ClarityStats repo. GitHub Action receives artifacts, writes files, creates feature branch, opens PR.
4. **REVIEW**: Rick reviews PR, merges.

Exit scenario: Buyer replaces Step 2 with HubSpot/Jasper API, replaces Step 3 with their own CI/CD. Steps 1 and 4 stay the same.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Cross-venture blast radius — a bad deployment cascades across all 15 repos simultaneously. (2) Context window economics — 37K tokens just for LEO protocol; orchestrating 15 ventures doesn't scale linearly. (3) Dependency versioning hell — shared services create implicit coupling across all venture repos.
- **Assumptions at Risk**: (1) AI agents can reliably push code to production repos at scale. (2) One person can operate 15 ventures even with AI. (3) Shared services reduce rather than multiply coordination cost.
- **Worst Case**: Shared service pushes breaking change to all 15 venture repos overnight. Recovery requires manual intervention in 15 codebases by one person.

### Visionary
- **Opportunities**: (1) Compounding intelligence layer — every venture's data improves every other venture's services. (2) Zero-marginal-cost venture launch — new ventures become configuration events. (3) Service-as-product extraction — each internal service is a latent SaaS product.
- **Synergies**: LEO extension to business ops creates unified command surface. Cross-venture telemetry reveals patterns no single venture could.
- **Upside Scenario**: AI-native Berkshire Hathaway — a holding company where shared intelligence makes each venture disproportionately stronger. The factory itself becomes the most valuable asset.

### Pragmatist
- **Feasibility**: 6/10 — core infrastructure exists, hard part is cross-repo wiring at scale
- **Resource Requirements**: 3-4 months to first venture consuming a service end-to-end. $500-2K/month API costs at scale. Supabase Pro ($25/mo) needed within 6-8 months.
- **Constraints**: (1) Chairman bottleneck — 15 ventures x 25 stages = 375 potential gate reviews. (2) Cross-repo agent access has no existing mechanism. (3) Shared Supabase schema coupling — one bad migration affects all ventures.
- **Recommended Path**: Build one working pipeline (ClarityStats + branding service), then extract the platform pattern. Do not build a "platform" first.

### Synthesis
- **Consensus Points**: Cross-repo agent access is the hardest unsolved problem. Start with one venture and extract. Service contracts must be clean.
- **Tension Points**: Visionary's "zero-marginal-cost" vs Challenger's "coordination cost multiplies" — resolved by clean service contracts (Visionary wins if contracts are clean). Visionary's "service-as-product" vs Pragmatist's "don't build a platform first" — resolved by design-for-extraction, build-for-one.
- **Composite Risk**: Medium-High — compelling vision but single-operator constraint at 15+ ventures is the central risk.

## Edge Cases

| Edge Case | Frequency | Handling Strategy |
|---|---|---|
| GHA fails mid-artifact-apply | Common | Retry with exponential backoff; alert after 3 failures |
| AI service generates bad artifacts | Common | Quality gate in service layer before webhook dispatch |
| Concurrent service calls for same venture | Rare | Queue at webhook level; GHA concurrency group per venture |
| Venture repo has merge conflicts with service PR | Common | Service PRs target dedicated branches; conflicts flagged for review |
| Service API changes (breaking) | Rare | Semantic versioning; GHA workflow pinned to service version |
| Exit prep: buyer wants to detach | Rare | Exit runbook per service: document third-party alternatives + GHA replacement |

## Open Questions

1. **Service registry data model**: What does the `ehg_services` table look like? What's the schema for service contracts, versions, consumer manifests?
2. **Venture onboarding automation**: How does a new venture register, get its GHA workflows installed, and bind to services?
3. **Quality gates for AI-generated artifacts**: What validation runs before artifacts are pushed to venture repos? Per-service or universal?
4. **LEO integration**: Does LEO need to know about service invocations, or are they orthogonal to engineering SDs?
5. **Brand profile / venture profile schema**: What data does each venture need to store for services to generate personalized outputs?
6. **Cost metering**: Even internally, should service invocations be metered (to enable vendor pricing model at exit)?

## Suggested Next Steps

1. **Create vision document** — Formalize the two-layer architecture and exit strategy
2. **Create architecture plan** — Detail the API Gateway, GitHub Actions integration, and service registry schema
3. **First SD**: Register ClarityStats in application registry, create its repo, build one service (branding) end-to-end
4. **Service contract template**: Define the standard interface all shared services must implement
