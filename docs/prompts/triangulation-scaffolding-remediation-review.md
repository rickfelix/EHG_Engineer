# Triangulation Research: Scaffolding Remediation Strategic Directives


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, testing, e2e

## Unified Prompt for OpenAI and AntiGravity (Gemini)

**Date**: 2026-01-04
**Purpose**: Validate and enhance Scaffolding Remediation Strategic Directives
**Method**: Independent AI review, then triangulation synthesis

---

## What is Triangulation?

**Triangulation** is the EHG methodology of obtaining independent perspectives on the same issue from three distinct AI models:

| Model | Provider | Role |
|-------|----------|------|
| **Claude Code** | Anthropic (Opus 4.5) | Primary guide, codebase-aware, synthesis lead |
| **ChatGPT** | OpenAI (GPT-4/o1) | Independent analysis, alternative perspective |
| **AntiGravity** | Google (Gemini) | Independent analysis, third perspective |

Each model receives the **same prompt** and analyzes **independently**. Results are then compared to identify:
- **Consensus**: Where all 3 agree (high confidence)
- **Divergence**: Where models disagree (needs investigation)
- **Unique insights**: Ideas only one model surfaced

---

## Context

EHG has conducted a comprehensive scaffolding audit of the codebase and identified significant gaps between "what appears to exist" (database schemas, SOPs, E2E tests) and "what actually works" (implemented business logic, API endpoints, execution engines).

Based on this audit, 8 Strategic Directives have been proposed to remediate these gaps. The Chairman has provided initial input on priority, venture potential, and third-party tooling requirements.

**Your task**: Review these SDs and provide:
1. Validation of the proposed structure and priorities
2. Missing considerations or risks
3. Alternative approaches worth considering
4. Sequencing and dependency feedback
5. Effort estimate reality checks

---

## Audit Findings Summary

### What Was Found
| Area | Finding |
|------|---------|
| **Genesis Pipeline** | Stages 1-10 working, Stages 11-25 are SOPs only (no execution engines) |
| **Sub-Agents** | 17 production-ready, 10 unknown/minimal status |
| **API Endpoints** | 81% implemented, 20+ missing (Content Forge, Scheduler, ROI) |
| **Database Tables** | Content, Legal, GDPR tables exist but have 0 code references |
| **SOPs** | 50% have 0% implementation, 375+ TBD markers |
| **E2E Tests** | Tests written for APIs that don't exist yet |

### The Core Problem
The codebase has extensive "scaffolding" - schemas, tests, SOPs, validation rules - that gives the appearance of functionality, but the actual business logic and API implementations are missing.

---

## Proposed Strategic Directives

### SD 1: SD-SCAFFOLDING-CLEANUP-001 (P0 - Immediate)
**Title**: Platform Scaffolding Cleanup & Documentation
**Type**: Orchestrator (bundles 6 quick-fix child SDs)
**Effort**: 2-3 days total

**Rationale**: GDPR compliance risk is real - documentation gaps create legal exposure

**Child SDs**:
| ID | Task | Effort |
|----|------|--------|
| SD-CLEANUP-PRD-001 | Create missing PRDs for 6 "completed" SDs | 4-6 hrs |
| SD-CLEANUP-GDPR-001 | Document GDPR implementation (compliance risk) | 2-3 hrs |
| SD-CLEANUP-PATTERN-001 | Document Pattern Scorer service | 1-2 hrs |
| SD-CLEANUP-VISION-001 | Label Exit Pipeline specs as "VISION ONLY" | 1 hr |
| SD-CLEANUP-API-001 | Verify Marketing API implementation status | 1-2 hrs |
| SD-CLEANUP-TBD-001 | Audit and clean 375+ TBD markers in SOPs | 3-4 hrs |

---

### SD 2: SD-SUBAGENT-COMPLETION-001 (P0 - Critical Foundation)
**Title**: Sub-Agent Completion & Deprecation Audit
**Type**: Infrastructure
**Effort**: 2 weeks

**Rationale**: Sub-agents are building blocks - unclear status creates technical debt. Blocks Genesis Phase 3.

**Sub-Agents to Audit**:
| Sub-Agent | Status | Decision Needed |
|-----------|--------|-----------------|
| monitoring.js | Partial | Complete or merge with security? |
| crm.js | Partial | Complete or defer? |
| uat.js | Unknown | Required for Stage 21? |
| retro.js | Unknown | Required for retrospectives? |
| regression.js | Unknown | Required for testing? |
| quickfix.js | Unknown | Keep or deprecate? |
| docmon.js | Unknown | Keep or deprecate? |
| dependency.js | Unknown | Keep or deprecate? |
| performance.js | Unknown | Complete or merge? |
| github-enhanced.js | Unknown | Merge with github.js? |

---

### SD 3: SD-CONTENT-FORGE-IMPL-001 (P1)
**Title**: Content Forge API Implementation
**Type**: Feature (Complex)
**Effort**: 6 weeks
**Venture Potential**: EHG internal tool only (not a venture)

**Current State**: DB schema exists, E2E tests exist, API endpoints missing

**Endpoints to Implement**:
| Endpoint | Complexity |
|----------|------------|
| POST /api/v2/content-forge/generate | High (LLM integration) |
| GET /api/v2/content-forge/list | Low |
| POST /api/v2/content-forge/compliance-check | Medium |
| GET /api/v2/brand-genome/:id | Low |

**Third-Party Decision**: OpenAI + Google Gemini for LLM (decided)

**Research Component**:
- Content compliance scoring algorithms
- Competitor analysis (Jasper, Copy.ai, Writer)

---

### SD 4: SD-MARKETING-AUTOMATION-001 (P1 - After Content Forge)
**Title**: Marketing Automation Services (Scheduler + ROI)
**Type**: Feature (Complex)
**Effort**: 4 weeks
**Dependencies**: SD-CONTENT-FORGE-IMPL-001

**Current State**: E2E tests exist, API endpoints missing

**Endpoints to Implement**:
| Service | Endpoints |
|---------|-----------|
| Scheduler | POST/GET/PATCH/DELETE posts, ledger, validate-utm, preview-url (7) |
| ROI Dashboard | funnel, ventures, channels, anomalies, acknowledge (5) |

**Third-Party Decisions Needed** (Triangulation Research):
- Social platform APIs (Buffer vs direct APIs vs LinkedIn-first)
- Analytics APIs (GA4 vs Mixpanel vs internal-only)

---

### SD 5: SD-NAMING-ENGINE-001 (P1)
**Title**: Venture Naming Generation Engine
**Type**: Feature (Complex)
**Effort**: 4 weeks
**Venture Potential**: Evaluate later (NameForge candidate)

**Current State**: Validation schema exists, no generation logic

**Components to Build**:
| Component | Priority |
|-----------|----------|
| Name Generator (LLM-powered) | P0 |
| Domain Checker (real-time availability) | P0 |
| Trademark Scanner (USPTO collision) | P1 |
| Name Scorer (phonetic + memorability) | P1 |

**Third-Party Decisions Needed** (Triangulation Research):
- Domain availability API (GoDaddy vs Namecheap vs WHOIS vs Domainr)
- Trademark search API (USPTO vs TrademarkNow vs Corsearch)

---

### SD 6: SD-FINANCIAL-ENGINE-001 (P1 - HIGH VENTURE POTENTIAL)
**Title**: Financial Modeling Engine (Real Forecasting)
**Type**: Feature (Complex)
**Effort**: 4 weeks
**Venture Potential**: HIGH - Core of ModelBuilder venture ($1B+ TAM)

**Current State**: Sub-agent exists, produces template artifacts only

**Components to Build**:
| Component | Current → Target |
|-----------|------------------|
| P&L Projections | Template → Calculated |
| Break-even Analysis | Static → Dynamic |
| Scenario Modeling | None → Base/Optimistic/Pessimistic |
| Industry Benchmarks | Hardcoded → External data |

**Third-Party Decisions Needed** (Triangulation Research):
- Benchmark data sources (PitchBook vs Crunchbase vs public data vs SaaS reports)

---

### SD 7: SD-LEGAL-GENERATOR-001 (Research First)
**Title**: Legal Document Generator
**Type**: Feature (Complex)
**Effort**: 4 weeks (TBD after research)
**Venture Potential**: TBD after research

**Current State**: Schema exists, no generation logic

**Documents to Generate**:
- Terms of Service
- Privacy Policy
- Data Processing Agreement
- Cookie Policy

**Third-Party Decisions Needed** (Triangulation Research):
- Template sourcing (LLM-generated vs licensed vs attorney partnership)
- Jurisdiction requirements (US, UK, EU, AU)
- Liability implications

**Chairman Note**: "Legal is risky to automate - need to validate approach before committing"

---

### SD 8: SD-GENESIS-STAGES-001 (P2 - Deferred)
**Title**: Genesis Pipeline Stages 11-25 Implementation
**Type**: Infrastructure (Complex)
**Effort**: 8 weeks (phased)
**Dependencies**: SD-NAMING-ENGINE-001, SD-SUBAGENT-COMPLETION-001

**Current State**: SOPs exist, no execution engines

**Phases**:
| Phase | Stages | Focus | Effort |
|-------|--------|-------|--------|
| 1 | 11-12 | Naming & Brand Foundation | 2 weeks |
| 2 | 13-16 | Kochel Firewall (Decision Gates) | 3 weeks |
| 3 | 17-20 | Build Loop (MVP, Integration, Security) | 2 weeks |
| 4 | 21-25 | Launch & Learn (QA, Deploy, Analytics) | 1 week |

**Chairman Decision**: "Wait for dependencies - Stages 1-10 are working, current ventures don't need 11-25 yet"

---

## Dependency Graph

```
SD-SCAFFOLDING-CLEANUP-001 (P0)
├── No dependencies - START IMMEDIATELY

SD-SUBAGENT-COMPLETION-001 (P0)
├── No dependencies - START IMMEDIATELY
└── Blocks: SD-GENESIS-STAGES-001 Phase 3

SD-CONTENT-FORGE-IMPL-001 (P1)
├── Depends on: Nothing
└── Blocks: SD-MARKETING-AUTOMATION-001

SD-MARKETING-AUTOMATION-001 (P1)
├── Depends on: SD-CONTENT-FORGE-IMPL-001

SD-NAMING-ENGINE-001 (P1)
├── Depends on: Nothing
└── Blocks: SD-GENESIS-STAGES-001 Phase 1

SD-FINANCIAL-ENGINE-001 (P1 - HIGH VENTURE)
├── Depends on: Nothing (standalone)

SD-LEGAL-GENERATOR-001 (Research First)
├── Depends on: Triangulation research

SD-GENESIS-STAGES-001 (P2)
├── Depends on: SD-NAMING-ENGINE-001, SD-SUBAGENT-COMPLETION-001
```

---

## Execution Tracks (Proposed)

**Track A: Foundation (P0)** - 2.5 weeks
1. SD-SCAFFOLDING-CLEANUP-001
2. SD-SUBAGENT-COMPLETION-001

**Track B: Features (P1)** - 14 weeks sequential
1. SD-CONTENT-FORGE-IMPL-001 (6 weeks)
2. SD-MARKETING-AUTOMATION-001 (4 weeks)
3. SD-NAMING-ENGINE-001 (4 weeks) - can parallel with Content Forge

**Track C: Venture Candidates (P1-HIGH)** - 4 weeks parallel
1. SD-FINANCIAL-ENGINE-001

**Track D: Research First** - TBD
1. SD-LEGAL-GENERATOR-001

**Track E: Deferred (P2)** - 8 weeks after dependencies
1. SD-GENESIS-STAGES-001

---

## Your Review Tasks

### Task 1: Structure Validation

1. **Is the SD breakdown correct?** Are there items that should be combined or split further?
2. **Are the effort estimates realistic?** Flag any that seem too optimistic or pessimistic
3. **Is the prioritization sound?** Should any P1s be P0s or vice versa?
4. **Are there missing SDs?** Based on the audit findings, is anything being overlooked?

### Task 2: Risk Assessment

For each SD, identify:
1. **Technical risks** - What could go wrong technically?
2. **Dependency risks** - Are there hidden dependencies?
3. **Scope creep risks** - What could cause this to balloon?
4. **Third-party risks** - API changes, pricing, reliability concerns?

### Task 3: Alternative Approaches

For the key SDs, consider:
1. **Content Forge**: Build vs buy? Use existing tools like Copy.ai API?
2. **Naming Engine**: Build vs use Namelix API or similar?
3. **Financial Engine**: Build vs integrate with existing financial modeling tools?
4. **Legal Generator**: Build vs partner with legal service providers?

### Task 4: Sequencing Feedback

1. **Should any SDs run in parallel that aren't currently planned to?**
2. **Are there dependencies we've missed?**
3. **Is the "Research First" approach for Legal correct, or should it be deferred entirely?**
4. **Should Genesis Stages be broken into multiple smaller SDs instead of one large phased SD?**

### Task 5: Venture Potential Reality Check

The Chairman has identified SD-FINANCIAL-ENGINE-001 as having "high venture potential" (ModelBuilder, $1B+ TAM).

1. **Is this assessment accurate?** What's the competitive landscape?
2. **Are there other SDs with underestimated venture potential?**
3. **Should we build with productization in mind from day one, or prove internal value first?**

---

## Output Format

Please structure your response as:

```markdown
# Scaffolding Remediation SD Review

## Overall Assessment
[Summary of your overall view on the proposed plan]

## SD-by-SD Feedback

### SD-SCAFFOLDING-CLEANUP-001
**Priority Assessment**: [Agree/Disagree with P0]
**Effort Estimate**: [Realistic/Optimistic/Pessimistic]
**Risks**: [List]
**Recommendations**: [List]

[Repeat for each SD]

## Structural Recommendations
[Any changes to how SDs are organized]

## Missing Considerations
[Things the plan doesn't address]

## Alternative Approaches
[Build vs buy recommendations, different strategies]

## Sequencing Recommendations
[Changes to execution order or parallelization]

## Venture Potential Assessment
[Your view on which SDs have real productization potential]

## Top 3 Concerns
1. [Most important concern]
2. [Second concern]
3. [Third concern]

## Top 3 Strengths
1. [What's good about this plan]
2. [Second strength]
3. [Third strength]
```

---

## Ground Rules

1. **Be critical**: We need honest feedback, not validation
2. **Be specific**: Reference specific SDs, not vague concerns
3. **Prioritize actionable feedback**: We need to implement this, not discuss theory
4. **Consider solo operator context**: EHG is one person with AI assistance, not a team
5. **Think about sustainability**: Can this be maintained long-term?

---

## Key Context

- **EHG Operating Model**: Solo operator (Chairman) + AI assistance (EVA, sub-agents)
- **Venture Strategy**: "Vending machine" model - revenue from transaction #1, not power-law
- **Pattern Library**: ~45 patterns in scaffold_patterns table
- **Genesis Pipeline**: 25-stage venture creation process
- **LEO Protocol**: LEAD→PLAN→EXEC workflow for all development

---

*Please provide your independent analysis. Your response will be triangulated with another AI's review to identify consensus and disagreements.*
