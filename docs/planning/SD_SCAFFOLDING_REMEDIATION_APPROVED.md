# SCAFFOLDING REMEDIATION - STRATEGIC DIRECTIVES


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, testing, e2e

**Created:** 2026-01-04
**Status:** Chairman Approved - Pending Triangulation
**Source:** Comprehensive Scaffolding Audit + Chairman Q&A Session

---

## EXECUTIVE SUMMARY

This document captures all Strategic Directives proposed to remediate scaffolding gaps identified in the EHG capability audit. The Chairman has provided input on priority, venture potential, and third-party tooling for each SD.

### Key Findings from Audit
- **Genesis Pipeline:** Stages 1-10 working, Stages 11-25 are SOPs only (no execution engines)
- **Sub-Agents:** 17 production-ready, 10 unknown/minimal status
- **API Endpoints:** 81% implemented, 20+ missing (Content Forge, Scheduler, ROI)
- **Database Tables:** Content, Legal, GDPR tables exist but have 0 code references
- **SOPs:** 50% have 0% implementation, 375+ TBD markers

---

## STRATEGIC DIRECTIVES SUMMARY

| SD | Title | Priority | Venture Potential | Third-Party Tooling |
|----|-------|----------|-------------------|---------------------|
| SD-SCAFFOLDING-CLEANUP-001 | Platform Cleanup & Documentation | **P0** | N/A | None |
| SD-SUBAGENT-COMPLETION-001 | Sub-Agent Completion Audit | **P0** | N/A | None |
| SD-CONTENT-FORGE-IMPL-001 | Content Forge API | P1 | EHG Only | OpenAI + Gemini |
| SD-MARKETING-AUTOMATION-001 | Scheduler + ROI APIs | P1 | EHG Only | Triangulation needed |
| SD-NAMING-ENGINE-001 | Naming Generation Engine | P1 | Evaluate later | Triangulation needed |
| SD-FINANCIAL-ENGINE-001 | Financial Modeling Engine | **P1 - HIGH** | ModelBuilder ($1B+ TAM) | Triangulation needed |
| SD-LEGAL-GENERATOR-001 | Legal Document Generator | Research First | TBD | Triangulation needed |
| SD-GENESIS-STAGES-001 | Genesis Stages 11-25 | P2 | N/A | None |

---

## P0 - IMMEDIATE PRIORITY

### SD-SCAFFOLDING-CLEANUP-001: Platform Scaffolding Cleanup & Documentation

**Type:** Orchestrator (bundles 6 quick-fix child SDs)
**Effort:** 2-3 days total
**Rationale:** GDPR compliance risk is real - must address before feature work

#### Child SDs:
| ID | Task | Effort | Deliverable |
|----|------|--------|-------------|
| SD-CLEANUP-PRD-001 | Create missing PRDs for 6 "completed" SDs | 4-6 hrs | 6 PRD documents |
| SD-CLEANUP-GDPR-001 | Document GDPR implementation (compliance risk) | 2-3 hrs | GDPR user guide |
| SD-CLEANUP-PATTERN-001 | Document Pattern Scorer service | 1-2 hrs | API documentation |
| SD-CLEANUP-VISION-001 | Label Exit Pipeline specs as "VISION ONLY" | 1 hr | Updated file headers |
| SD-CLEANUP-API-001 | Verify Marketing API implementation status | 1-2 hrs | Status report |
| SD-CLEANUP-TBD-001 | Audit and clean 375+ TBD markers in SOPs | 3-4 hrs | Updated SOPs |

**Chairman Decision:**
- Priority: P0 - Immediate
- Approach: Do this before any feature work
- Notes: GDPR compliance risk is real

---

### SD-SUBAGENT-COMPLETION-001: Sub-Agent Completion & Deprecation Audit

**Type:** Infrastructure
**Effort:** 2 weeks
**Rationale:** Sub-agents are building blocks - unclear status creates technical debt

#### Sub-Agents to Audit:
| Sub-Agent | Current Status | Decision Needed |
|-----------|----------------|-----------------|
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

**Chairman Decision:**
- Priority: P0 - Critical Foundation
- Approach: Audit NOW, decide keep/deprecate/merge for each sub-agent
- Notes: Blocks Genesis Phase 3

---

## P1 - HIGH PRIORITY

### SD-CONTENT-FORGE-IMPL-001: Content Forge API Implementation

**Type:** Feature (Complex)
**Effort:** 6 weeks
**Current State:** DB schema exists, E2E tests exist, API endpoints missing

#### Endpoints to Implement:
| Endpoint | Priority | Complexity |
|----------|----------|------------|
| POST /api/v2/content-forge/generate | P0 | High (LLM integration) |
| GET /api/v2/content-forge/list | P0 | Low |
| POST /api/v2/content-forge/compliance-check | P1 | Medium |
| GET /api/v2/brand-genome/:id | P0 | Low |

#### Research Component:
- LLM provider selection (OpenAI vs Anthropic vs open-source)
- Content compliance scoring algorithms
- Competitor analysis (Jasper, Copy.ai, Writer)

**Chairman Decision:**
- Priority: P1 - After Content Forge
- Venture Potential: Internal tool (supports EHG ventures)
- LLM Provider: **OpenAI + Google Gemini** (DECIDED)

---

### SD-MARKETING-AUTOMATION-001: Marketing Automation Services

**Type:** Feature (Complex)
**Effort:** 4 weeks
**Current State:** E2E tests exist, API endpoints missing
**Dependencies:** Content Forge (partial)

#### Endpoints to Implement:
| Service | Endpoints | Count |
|---------|-----------|-------|
| Scheduler | POST/GET/PATCH/DELETE posts, ledger, validate-utm, preview-url | 7 |
| ROI Dashboard | funnel, ventures, channels, anomalies, acknowledge | 5 |

#### Research Component:
- Scheduling patterns (cron vs queue-based vs event-driven)
- ROI calculation methodologies
- UTM tracking best practices

**Chairman Decision:**
- Priority: P1 - After Content Forge
- Venture Potential: Internal tool (supports EHG ventures)
- Third-Party APIs: **TRIANGULATION RESEARCH**
  - Social platform integrations (Buffer vs direct APIs vs LinkedIn-first)
  - Analytics APIs (GA4 vs Mixpanel vs internal-only)

---

### SD-NAMING-ENGINE-001: Venture Naming Generation Engine

**Type:** Feature (Complex)
**Effort:** 4 weeks
**Current State:** Validation schema exists, no generation logic

#### Components to Build:
| Component | Description | Priority |
|-----------|-------------|----------|
| Name Generator | LLM-powered name suggestions | P0 |
| Domain Checker | Real-time .com/.io/.co availability | P0 |
| Trademark Scanner | Basic USPTO collision detection | P1 |
| Name Scorer | Phonetic + memorability scoring | P1 |

#### Research Component:
- Domain availability APIs (GoDaddy, Namecheap, WHOIS)
- Trademark search APIs (USPTO, WIPO)
- Naming algorithms and scoring criteria

**Chairman Decision:**
- Priority: P1 - Build for EHG First
- Venture Potential: Evaluate later (NameForge candidate)
- Approach: Required for Genesis Stage 11
- Third-Party APIs: **TRIANGULATION RESEARCH**
  - Domain availability API (GoDaddy vs Namecheap vs WHOIS vs Domainr)
  - Trademark search API (USPTO vs TrademarkNow vs Corsearch)

---

### SD-FINANCIAL-ENGINE-001: Financial Modeling Engine (Real Forecasting)

**Type:** Feature (Complex)
**Effort:** 4 weeks
**Current State:** Sub-agent exists, produces template artifacts only
**Venture Potential:** HIGH - Core of ModelBuilder venture ($1B+ TAM)

#### Components to Build:
| Component | Current State | Target State |
|-----------|---------------|--------------|
| P&L Projections | Template artifacts | Calculated from inputs |
| Break-even Analysis | Static | Dynamic based on unit economics |
| Scenario Modeling | None | Base/Optimistic/Pessimistic |
| Industry Benchmarks | Hardcoded | External data integration |

#### Research Component:
- Financial modeling approaches (DCF, comparables)
- Data sources for industry benchmarks
- Confidence intervals methodology

**Chairman Decision:**
- Priority: **P1 - High Venture Potential**
- Venture Potential: HIGH - Core of ModelBuilder venture ($1B+ TAM)
- Approach: Build with productization in mind from day one
- Third-Party APIs: **TRIANGULATION RESEARCH**
  - Benchmark data (PitchBook vs Crunchbase vs public data vs SaaS reports)

---

## RESEARCH FIRST

### SD-LEGAL-GENERATOR-001: Legal Document Generator

**Type:** Feature (Complex)
**Effort:** 4 weeks
**Current State:** Schema exists, no generation logic

#### Documents to Generate:
| Document | Complexity | Variables |
|----------|------------|-----------|
| Terms of Service | Medium | Business type, jurisdiction, user types |
| Privacy Policy | High | Data collected, GDPR/CCPA compliance |
| Data Processing Agreement | High | Sub-processors, data locations |
| Cookie Policy | Low | Cookie types, consent mechanism |

#### Research Component:
- Legal template providers (Clerky, Stripe Atlas patterns)
- Jurisdiction requirements (US, UK, EU, AU)
- Liability and disclaimer requirements

**Chairman Decision:**
- Priority: Research First
- Venture Potential: TBD after research
- Approach: Understand jurisdiction requirements and liability implications
- Third-Party APIs: **TRIANGULATION RESEARCH**
  - Template sourcing (LLM-generated vs licensed vs attorney partnership)
  - Jurisdiction compliance requirements

---

## P2 - DEFERRED

### SD-GENESIS-STAGES-001: Genesis Pipeline Stages 11-25

**Type:** Infrastructure (Complex)
**Effort:** 8 weeks (phased)
**Current State:** SOPs exist, no execution engines
**Dependencies:** SD-NAMING-ENGINE-001, SD-SUBAGENT-COMPLETION-001

#### Phases:
| Phase | Stages | Focus | Effort |
|-------|--------|-------|--------|
| Phase 1 | 11-12 | Naming & Brand Foundation | 2 weeks |
| Phase 2 | 13-16 | Kochel Firewall (Decision Gates) | 3 weeks |
| Phase 3 | 17-20 | Build Loop (MVP, Integration, Security) | 2 weeks |
| Phase 4 | 21-25 | Launch & Learn (QA, Deploy, Analytics) | 1 week |

**Chairman Decision:**
- Priority: P2 - Wait for Dependencies
- Phasing: Sequential after Naming Engine and Sub-Agent Completion
- Approach: Don't start partial work - queue after dependencies finish
- Notes: Stages 1-10 are working, current ventures don't need 11-25 yet

---

## DEPENDENCY GRAPH

```
SD-SCAFFOLDING-CLEANUP-001 (P0)
├── No dependencies - START IMMEDIATELY
└── Blocks: Nothing

SD-SUBAGENT-COMPLETION-001 (P0)
├── No dependencies - START IMMEDIATELY
└── Blocks: SD-GENESIS-STAGES-001 Phase 3

SD-CONTENT-FORGE-IMPL-001 (P1)
├── Depends on: Nothing
└── Blocks: SD-MARKETING-AUTOMATION-001

SD-MARKETING-AUTOMATION-001 (P1)
├── Depends on: SD-CONTENT-FORGE-IMPL-001
└── Blocks: Nothing

SD-NAMING-ENGINE-001 (P1)
├── Depends on: Nothing
└── Blocks: SD-GENESIS-STAGES-001 Phase 1

SD-FINANCIAL-ENGINE-001 (P1 - HIGH VENTURE)
├── Depends on: Nothing (standalone)
└── Blocks: Nothing

SD-LEGAL-GENERATOR-001 (Research First)
├── Depends on: Triangulation research
└── Blocks: Nothing

SD-GENESIS-STAGES-001 (P2)
├── Depends on: SD-NAMING-ENGINE-001, SD-SUBAGENT-COMPLETION-001
└── Blocks: Nothing
```

---

## EXECUTION ORDER (RECOMMENDED)

### Track A: Foundation (P0)
1. SD-SCAFFOLDING-CLEANUP-001 (2-3 days)
2. SD-SUBAGENT-COMPLETION-001 (2 weeks)

### Track B: Features (P1)
1. SD-CONTENT-FORGE-IMPL-001 (6 weeks)
2. SD-MARKETING-AUTOMATION-001 (4 weeks) - after Content Forge
3. SD-NAMING-ENGINE-001 (4 weeks) - can parallel with Content Forge

### Track C: Venture Candidates (P1-HIGH)
1. SD-FINANCIAL-ENGINE-001 (4 weeks) - build with productization in mind

### Track D: Research First
1. SD-LEGAL-GENERATOR-001 - triangulation before committing

### Track E: Deferred (P2)
1. SD-GENESIS-STAGES-001 (8 weeks) - after Naming + Sub-Agent complete

---

## TRIANGULATION RESEARCH QUEUE

These topics require triangulation research (ChatGPT + Gemini + Claude) **as each SD is worked**:

| Topic | SD | Options to Evaluate |
|-------|-----|---------------------|
| Domain availability APIs | SD-NAMING-ENGINE-001 | GoDaddy vs Namecheap vs WHOIS vs Domainr |
| Trademark search APIs | SD-NAMING-ENGINE-001 | USPTO vs TrademarkNow vs Corsearch |
| Social platform APIs | SD-MARKETING-AUTOMATION-001 | Buffer vs direct APIs vs LinkedIn-first |
| Analytics APIs | SD-MARKETING-AUTOMATION-001 | GA4 vs Mixpanel vs internal-only |
| Financial benchmark data | SD-FINANCIAL-ENGINE-001 | PitchBook vs Crunchbase vs public data |
| Legal template sourcing | SD-LEGAL-GENERATOR-001 | LLM-generated vs licensed vs attorney |
| Legal jurisdiction | SD-LEGAL-GENERATOR-001 | US, UK, EU, AU compliance requirements |

---

## TOTAL EFFORT ESTIMATE

| Priority | SDs | Effort |
|----------|-----|--------|
| P0 (Foundation) | 2 | 2.5 weeks |
| P1 (Features) | 4 | 18 weeks |
| P2 (Deferred) | 1 | 8 weeks |
| Research | 1 | TBD |
| **Total** | 8 | ~28.5 weeks |

**Parallelization Opportunity:**
- Track A (P0) + Track B (P1 Content Forge) can run in parallel
- Track C (Financial Engine) can run in parallel with Track B
- **Realistic timeline with parallel tracks: 4-5 months**

---

## CHAIRMAN DECISIONS LOG

| SD | Decision | Rationale | Date |
|----|----------|-----------|------|
| SD-SCAFFOLDING-CLEANUP-001 | P0 - Immediate | GDPR compliance risk is real | 2026-01-04 |
| SD-CONTENT-FORGE-IMPL-001 | P1 - EHG Only | Internal tool, not a venture | 2026-01-04 |
| SD-MARKETING-AUTOMATION-001 | P1 - After Content Forge | Scheduler enables distribution | 2026-01-04 |
| SD-NAMING-ENGINE-001 | P1 - EHG First | Genesis Stage 11 requirement | 2026-01-04 |
| SD-GENESIS-STAGES-001 | P2 - Wait for Dependencies | Stages 1-10 working | 2026-01-04 |
| SD-FINANCIAL-ENGINE-001 | P1 - High Venture Potential | Core of ModelBuilder venture | 2026-01-04 |
| SD-LEGAL-GENERATOR-001 | Research First | Jurisdiction + liability | 2026-01-04 |
| SD-SUBAGENT-COMPLETION-001 | P0 - Critical Foundation | Blocks Genesis Phase 3 | 2026-01-04 |

---

## NEXT STEPS

1. **Triangulation** - Run this plan through OpenAI + Gemini for validation
2. **Align** - Incorporate triangulation feedback
3. **Database** - Add approved SDs to strategic_directives_v2 table
4. **Execute** - Begin with P0 SDs (Cleanup + Sub-Agent Audit)

---

*Document generated: 2026-01-04*
*Status: Pending Triangulation Validation*
