# SCAFFOLDING REMEDIATION PLAN

**Created:** 2026-01-04
**Status:** Chairman Input Phase
**Source:** Comprehensive Scaffolding Audit

---

## OVERVIEW

This plan addresses all scaffolding gaps identified in the EHG capability audit. It consists of:
- **1 Orchestrator SD** for bundled cleanup/documentation tasks
- **7 Complex SDs** for major implementations (each with research component)

---

## ORCHESTRATOR SD: SD-SCAFFOLDING-CLEANUP-001

**Title:** Platform Scaffolding Cleanup & Documentation
**Type:** Orchestrator (bundles related quick-fix items)
**Effort:** 2-3 days total

### Child SDs:

| ID | Task | Effort | Deliverable |
|----|------|--------|-------------|
| SD-CLEANUP-PRD-001 | Create missing PRDs for 6 "completed" SDs | 4-6 hrs | 6 PRD documents |
| SD-CLEANUP-GDPR-001 | Document GDPR implementation (compliance risk) | 2-3 hrs | GDPR user guide |
| SD-CLEANUP-PATTERN-001 | Document Pattern Scorer service | 1-2 hrs | API documentation |
| SD-CLEANUP-VISION-001 | Label Exit Pipeline specs as "VISION ONLY" | 1 hr | Updated file headers |
| SD-CLEANUP-API-001 | Verify Marketing API implementation status | 1-2 hrs | Status report |
| SD-CLEANUP-TBD-001 | Audit and clean 375+ TBD markers in SOPs | 3-4 hrs | Updated SOPs |

### Chairman Input:
- **Priority:** P0 - Immediate
- **Approach:** Do this before any feature work
- **Notes:** GDPR compliance risk is real

---

## COMPLEX SD #1: SD-CONTENT-FORGE-IMPL-001

**Title:** Content Forge API Implementation
**Effort:** 6 weeks
**Current State:** DB schema exists, E2E tests exist, API endpoints missing

### What needs to be built:
- POST /api/v2/content-forge/generate (LLM integration)
- GET /api/v2/content-forge/list
- POST /api/v2/content-forge/compliance-check
- GET /api/v2/brand-genome/:id

### Research Component:
- LLM provider selection (OpenAI vs Anthropic vs open-source)
- Content compliance scoring algorithms
- Competitor analysis (Jasper, Copy.ai, Writer)

### Chairman Input:
- **Priority:** P1 - After Content Forge
- **Venture Potential:** Internal tool (supports EHG ventures)
- **Approach:** Build after Content Forge APIs complete
- **Notes:** Scheduler enables content distribution, ROI validates spend
- **LLM Provider:** OpenAI + Google Gemini (multi-provider)

---

## COMPLEX SD #2: SD-MARKETING-AUTOMATION-001

**Title:** Marketing Automation Services (Scheduler + ROI)
**Effort:** 4 weeks
**Current State:** E2E tests exist, API endpoints missing

### What needs to be built:
- Scheduler: 7 endpoints (posts CRUD, ledger, validate-utm, preview-url)
- ROI Dashboard: 5 endpoints (funnel, ventures, channels, anomalies)

### Research Component:
- Scheduling patterns (cron vs queue-based vs event-driven)
- ROI calculation methodologies
- UTM tracking best practices

### Chairman Input:
- **Priority:** P1 - After Content Forge
- **Venture Potential:** Internal tool (supports EHG ventures)
- **Approach:** Natural next step after Content Forge APIs
- **Notes:** Scheduler enables content distribution, ROI validates marketing spend
- **Third-Party APIs:** TRIANGULATION RESEARCH for social platform integrations (Buffer vs direct APIs vs LinkedIn-first)
- **Third-Party APIs:** TRIANGULATION RESEARCH for analytics APIs (GA4 vs Mixpanel vs internal-only)

---

## COMPLEX SD #3: SD-NAMING-ENGINE-001

**Title:** Venture Naming Generation Engine
**Effort:** 4 weeks
**Current State:** Validation schema exists, no generation logic

### What needs to be built:
- Name Generator (LLM-powered)
- Domain Checker (real-time availability)
- Trademark Scanner (USPTO collision detection)
- Name Scorer (phonetic + memorability)

### Research Component:
- Domain availability APIs (GoDaddy, Namecheap, WHOIS)
- Trademark search APIs (USPTO, WIPO)
- Naming algorithms and scoring criteria

### Chairman Input:
- **Priority:** P1 - Build for EHG First
- **Venture Potential:** Evaluate later (NameForge candidate)
- **Approach:** Required for Genesis Stage 11 - build for internal use first
- **Notes:** Domain checking + trademark scanning are hard differentiators if productized
- **Third-Party APIs:** RESEARCH NEEDED for domain availability API (GoDaddy vs Namecheap vs WHOIS vs Domainr)
- **Third-Party APIs:** RESEARCH NEEDED for trademark search API (USPTO vs TrademarkNow vs Corsearch)

---

## COMPLEX SD #4: SD-GENESIS-STAGES-001

**Title:** Genesis Pipeline Stages 11-25 Implementation
**Effort:** 8 weeks (phased)
**Current State:** SOPs exist, no execution engines

### What needs to be built:
- Phase 1 (2 weeks): Stages 11-12 (Naming & Brand)
- Phase 2 (3 weeks): Stages 13-16 (Kochel Firewall)
- Phase 3 (2 weeks): Stages 17-20 (Build Loop)
- Phase 4 (1 week): Stages 21-25 (Launch & Learn)

### Research Component:
- Audit each stage SOP vs actual requirements
- Identify CRITICAL PATH vs OPTIONAL stages
- Competitor research (Y Combinator, Antler workflows)

### Chairman Input:
- **Priority:** P2 - Wait for Dependencies
- **Phasing:** Sequential after Naming Engine and Sub-Agent Completion
- **Approach:** Don't start partial work - queue after dependencies finish
- **Notes:** Stages 1-10 are working, current ventures don't need 11-25 yet

---

## COMPLEX SD #5: SD-FINANCIAL-ENGINE-001

**Title:** Financial Modeling Engine (Real Forecasting)
**Effort:** 4 weeks
**Current State:** Sub-agent exists, produces template artifacts only

### What needs to be built:
- P&L Projections (calculated from inputs)
- Break-even Analysis (dynamic)
- Scenario Modeling (base/optimistic/pessimistic)
- Industry Benchmarks (external data integration)

### Research Component:
- Financial modeling approaches (DCF, comparables)
- Data sources for industry benchmarks
- Confidence intervals methodology

### Chairman Input:
- **Priority:** P1 - High Venture Potential
- **Venture Potential:** HIGH - Core of ModelBuilder venture ($1B+ TAM)
- **Approach:** Build with productization in mind from day one
- **Notes:** Real financial modeling with industry benchmarks + scenario analysis = hard differentiator
- **Third-Party APIs:** TRIANGULATION RESEARCH for benchmark data (PitchBook vs Crunchbase vs public data vs SaaS reports)

---

## COMPLEX SD #6: SD-LEGAL-GENERATOR-001

**Title:** Legal Document Generator
**Effort:** 4 weeks
**Current State:** Schema exists, no generation logic

### What needs to be built:
- Terms of Service generator
- Privacy Policy generator
- Data Processing Agreement generator
- Cookie Policy generator

### Research Component:
- Legal template providers (Clerky, Stripe Atlas patterns)
- Jurisdiction requirements (US, UK, EU, AU)
- Liability and disclaimer requirements

### Chairman Input:
- **Priority:** Research First
- **Venture Potential:** TBD after research
- **Approach:** Understand jurisdiction requirements and liability implications before committing
- **Notes:** Legal is risky to automate - need to validate approach with Clerky/Stripe Atlas patterns
- **Third-Party APIs:** TRIANGULATION RESEARCH for template sourcing (LLM-generated vs licensed vs attorney partnership)

---

## COMPLEX SD #7: SD-SUBAGENT-COMPLETION-001

**Title:** Sub-Agent Completion & Deprecation Audit
**Effort:** 2 weeks
**Current State:** 17 production-ready, 10 unknown/minimal

### What needs to be decided:
| Sub-Agent | Decision Needed |
|-----------|-----------------|
| monitoring.js | Complete or merge with security? |
| crm.js | Complete or defer? |
| uat.js | Required for Stage 21? |
| retro.js | Required for retrospectives? |
| regression.js | Required for testing? |
| quickfix.js | Keep or deprecate? |
| docmon.js | Keep or deprecate? |
| dependency.js | Keep or deprecate? |
| performance.js | Complete or merge? |
| github-enhanced.js | Merge with github.js? |

### Chairman Input:
- **Priority:** P0 - Critical Foundation
- **Approach:** Audit NOW, decide keep/deprecate/merge for each sub-agent
- **Notes:** Sub-agents are building blocks - unclear status creates technical debt. Blocks Genesis Phase 3.

---

## DEPENDENCY GRAPH

```
SD-SCAFFOLDING-CLEANUP-001 (Orchestrator)
├── No dependencies - can start immediately

SD-CONTENT-FORGE-IMPL-001
├── Depends on: Nothing
└── Blocks: SD-MARKETING-AUTOMATION-001 (partial)

SD-MARKETING-AUTOMATION-001
├── Depends on: SD-CONTENT-FORGE-IMPL-001

SD-NAMING-ENGINE-001
├── Depends on: Nothing
└── Blocks: SD-GENESIS-STAGES-001 Phase 1

SD-GENESIS-STAGES-001
├── Depends on: SD-NAMING-ENGINE-001, SD-SUBAGENT-COMPLETION-001

SD-FINANCIAL-ENGINE-001
├── Depends on: Nothing (standalone)

SD-LEGAL-GENERATOR-001
├── Depends on: Nothing (standalone)

SD-SUBAGENT-COMPLETION-001
├── Depends on: Nothing
└── Blocks: SD-GENESIS-STAGES-001 Phase 3
```

---

## TRIANGULATION RESEARCH

After Chairman input, each complex SD will be triangulated:
- **OpenAI (ChatGPT)**: Market validation, competitive analysis
- **Antigravity (Gemini)**: Technical feasibility, architecture patterns
- **Claude**: Synthesis and recommendations

---

## CHAIRMAN DECISIONS LOG

| SD | Decision | Rationale | Date |
|----|----------|-----------|------|
| SD-SCAFFOLDING-CLEANUP-001 | P0 - Immediate | GDPR compliance risk is real | 2026-01-04 |
| SD-CONTENT-FORGE-IMPL-001 | Build for EHG Only | Internal tool, not a venture | 2026-01-04 |
| SD-MARKETING-AUTOMATION-001 | P1 - After Content Forge | Scheduler enables distribution, ROI validates spend | 2026-01-04 |
| SD-NAMING-ENGINE-001 | P1 - Build for EHG First | Genesis Stage 11 requirement, evaluate venture later | 2026-01-04 |
| SD-GENESIS-STAGES-001 | P2 - Wait for Dependencies | Stages 1-10 working, queue after Naming + Sub-Agent | 2026-01-04 |
| SD-FINANCIAL-ENGINE-001 | P1 - High Venture Potential | Core of ModelBuilder venture, build with productization in mind | 2026-01-04 |
| SD-LEGAL-GENERATOR-001 | Research First | Jurisdiction requirements and liability implications | 2026-01-04 |
| SD-SUBAGENT-COMPLETION-001 | P0 - Critical Foundation | Blocks Genesis Phase 3, audit now | 2026-01-04 |

