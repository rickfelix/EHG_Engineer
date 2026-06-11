---
category: reference
status: draft
version: 1.0.0
author: Rick Felix
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Triangulation Research: Blind Spots


## Table of Contents

- [Metadata](#metadata)
- [Claude Code Independent Research Response](#claude-code-independent-research-response)
- [Section 1: Multi-Venture Portfolio Management](#section-1-multi-venture-portfolio-management)
  - [Q1.1: Venture Portfolio Operating System (EVA Architecture)](#q11-venture-portfolio-operating-system-eva-architecture)
  - [Q1.2: Lessons from Holding Companies](#q12-lessons-from-holding-companies)
  - [Q1.3: The Management Cliff](#q13-the-management-cliff)
  - [Q1.4: Venture Lifecycle State Machine](#q14-venture-lifecycle-state-machine)
  - [Q1.5: AI vs Human Roles](#q15-ai-vs-human-roles)
- [Section 2: Pattern Deprecation](#section-2-pattern-deprecation)
  - [Q2.1: Detecting Outdated Patterns](#q21-detecting-outdated-patterns)
  - [Q2.2: Pattern Lifecycle States](#q22-pattern-lifecycle-states)
  - [Q2.3: Handling Ventures Using Deprecated Patterns](#q23-handling-ventures-using-deprecated-patterns)
  - [Q2.4: Pattern Maintenance Budget](#q24-pattern-maintenance-budget)
- [Section 3: Failure Learning](#section-3-failure-learning)
  - [Q3.1: Venture Post-Mortem Template](#q31-venture-post-mortem-template)
- [Meta](#meta)
- [1. Hypothesis](#1-hypothesis)
  - [Original Thesis](#original-thesis)
  - [Target Customer](#target-customer)
  - [Value Proposition](#value-proposition)
- [2. Failure Signals](#2-failure-signals)
  - [Timeline to Kill Decision](#timeline-to-kill-decision)
- [3. Kill Decision](#3-kill-decision)
  - [Gate Failed](#gate-failed)
  - [Decision Maker](#decision-maker)
  - [Alternative Considered](#alternative-considered)
- [4. Pattern Analysis](#4-pattern-analysis)
  - [Patterns Used](#patterns-used)
  - [Patterns Missing](#patterns-missing)
  - [New Patterns to Create](#new-patterns-to-create)
- [5. Lessons Learned](#5-lessons-learned)
  - [What Would We Do Differently?](#what-would-we-do-differently)
  - [What Worked (Despite Failure)?](#what-worked-despite-failure)
  - [Systemic Issues Identified](#systemic-issues-identified)
- [6. Failure Category](#6-failure-category)
- [7. Artifacts Preserved](#7-artifacts-preserved)
  - [Q3.2: Failure → Pattern Improvement Feedback Loop](#q32-failure-pattern-improvement-feedback-loop)
  - [Q3.3: How Successful Companies Capture Failure Lessons](#q33-how-successful-companies-capture-failure-lessons)
  - [Q3.4: Failure Pattern Library](#q34-failure-pattern-library)
- [Section 4: Team/Skill Requirements](#section-4-teamskill-requirements)
  - [Q4.1: Skills Inventory System](#q41-skills-inventory-system)
- [Current Skills (Build Today)](#current-skills-build-today)
- [Skills In Development (Learning)](#skills-in-development-learning)
- [Skills to Acquire (Need)](#skills-to-acquire-need)
- [Skills to Outsource (Never In-House)](#skills-to-outsource-never-in-house)
  - [Q4.2: Learn/Hire/Partner/Avoid Decision Framework](#q42-learnhirepartneravoid-decision-framework)
  - [Q4.3: Skill Distance Metric](#q43-skill-distance-metric)
  - [Q4.4: Minimum Viable Skill Set for Solo AI-Assisted Operator](#q44-minimum-viable-skill-set-for-solo-ai-assisted-operator)
- [Section 5: Legal/Compliance Patterns](#section-5-legalcompliance-patterns)
  - [Q5.1: Legal/Compliance Pattern Library](#q51-legalcompliance-pattern-library)
  - [Q5.2: Compliance Trigger Points](#q52-compliance-trigger-points)
  - [Q5.3: Managing Legal Templates Across 10-32 Ventures](#q53-managing-legal-templates-across-10-32-ventures)
  - [Q5.4: Legal Structure for 32 Software Ventures](#q54-legal-structure-for-32-software-ventures)
- [Section 6: Pricing Patterns](#section-6-pricing-patterns)
  - [Q6.1: Pricing Pattern Library](#q61-pricing-pattern-library)
  - [Q6.2: Pricing Decision Framework](#q62-pricing-decision-framework)
  - [Q6.3: A/B Testing Pricing](#q63-ab-testing-pricing)
  - [Q6.4: Handling Pricing Changes at Scale](#q64-handling-pricing-changes-at-scale)
  - [Q6.5: Pricing Patterns for "Vending Machine" Model](#q65-pricing-patterns-for-vending-machine-model)
- [Prioritization Matrix](#prioritization-matrix)
- [Sources](#sources)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, testing, unit

## Claude Code Independent Research Response

**Date**: 2026-01-01
**Researcher**: Claude Code (Opus 4.5)
**Method**: Codebase analysis + Web research
**Confidence Assessment**: Per-answer

---

## Section 1: Multi-Venture Portfolio Management

### Q1.1: Venture Portfolio Operating System (EVA Architecture)

**Confidence**: High

#### Dashboard Requirements
| Metric Category | Specific Metrics | Update Frequency |
|-----------------|------------------|------------------|
| Financial | MRR, Churn Rate, LTV, CAC, Runway | Daily |
| Health | Uptime %, Error Rate, Support Tickets | Real-time |
| Growth | User Growth %, Conversion Rate, NPS | Weekly |
| Operations | Deployment Status, Tech Debt Score | Weekly |
| Risk | Security Alerts, Compliance Status | Real-time |

**Key Insight**: Constellation Software uses "meticulous benchmarking, using structured KPIs to compare performance across the entire portfolio" for 1000+ companies.

#### Automation Requirements
| Must Automate | Can Automate | Requires Human |
|---------------|--------------|----------------|
| Billing/invoicing | Customer onboarding | Kill decisions |
| Monitoring/alerting | Support ticket routing | Strategy pivots |
| Compliance reporting | Social media posting | Partnership agreements |
| Backup/disaster recovery | Lead qualification | Pricing major changes |
| Deployment pipelines | Email sequences | M&A decisions |
| Financial aggregation | Bug triage (first-level) | Brand positioning |

**Evidence**: Solo operators report "70-80% of agency operations can be automated using AI, scaling like a 10-person team" according to [AI Solo Operator research](https://aicompetence.org/ai-solo-operator-automate-business-workflow/).

#### Decision Routing Matrix
| Decision Type | Route To | Escalation Trigger |
|---------------|----------|-------------------|
| Support tickets < $100 impact | AI agent | Escalate if negative sentiment score > 0.8 |
| Feature requests | Product backlog (auto-prioritize) | > 10 requests for same feature |
| Bug reports | Auto-triage by severity | P0/P1 → immediate alert |
| Pricing inquiries | AI + templates | Enterprise > $10K → Chairman |
| Legal/compliance | Always human | Any legal threat |
| Partnership proposals | Filter + summary to Chairman | > $50K potential value |
| Investment decisions | Always Chairman | Any capital deployment |

#### Alert/Escalation System
**Traffic Light Model**:
- 🟢 **Green**: Normal operations, weekly digest only
- 🟡 **Yellow**: Attention needed within 24h (churn spike, revenue drop >10%, 3+ support escalations)
- 🔴 **Red**: Immediate intervention (outage, security breach, legal threat, cash flow crisis)

**Alert Fatigue Prevention**:
- Aggregate similar alerts into daily digest
- Use AI to summarize context before escalating
- Set minimum 4-hour cooldown between non-critical alerts
- Reserve push notifications for 🔴 RED only

### Q1.2: Lessons from Holding Companies

**Confidence**: High

| Company | Model | Key Lesson |
|---------|-------|------------|
| **Constellation Software** | 1000+ software companies, $105B market cap | Decentralized operations — each company runs autonomously. Rigorous KPI benchmarking. Empower founders to stay/run. |
| **Tiny** | 35+ internet businesses | Speed in acquisition (15-30 day close). "Management by abdication" — minimal interference. Keep staff and culture intact. |
| **Berkshire Hathaway** | 60+ subsidiaries | Capital allocation to HQ. Acquire, don't operate. Only intervene when fundamentals deteriorate. |

**Applicable Lessons for Solo Operator with AI**:
1. **Don't centralize operations** — let each venture run semi-autonomously
2. **Standardize metrics, not processes** — same KPIs, different execution
3. **Cash flows to HQ** — excess capital reallocated to new ventures
4. **Hire CEOs early** — Tiny learned "people who have already done it" vs high-potential newbies
5. **Avoid forced synergies** — Tiny "pays all companies for work at full rate; synergies make CEOs resentful"

**Reference**: [Andrew Wilkinson's Tiny Operating Manual](https://www.colinkeeley.com/blog/andrew-wilkinson-tiny-capital-operating-manual)

### Q1.3: The Management Cliff

**Confidence**: Medium (concept validated, specific numbers require calibration)

**Definition**: The point where adding ventures produces negative returns due to management overhead exceeding the value generated.

**Oracle's Warning Validated**:
| Ventures | Critical Milestone | Why |
|----------|-------------------|-----|
| 1 | None | Single focus, manageable |
| 4 | Unified Support Dashboard | Can't context-switch across 4 different support systems |
| 16 | Automated CFO | 16 Stripe accounts = tax nightmare, billing complexity |
| 32 | CEO Transformation | No longer architect; must delegate all execution |

**Warning Signs of Approaching the Cliff**:
1. **Response Time Creep**: Support/issue resolution taking >2x longer
2. **Quality Degradation**: More bugs slipping through, customer complaints rising
3. **Context-Switch Tax**: Spending >30% of day switching between ventures
4. **Decision Backlog**: Decisions queue growing faster than clearing
5. **Burnout Indicators**: Sleep disruption, resentment, social isolation
6. **Revenue Plateau**: Growth stalls despite more ventures

**Research Support**: "63% of business owners reported they've dealt with or are currently dealing with burnout" — [US Chamber of Commerce](https://www.uschamber.com/co/grow/thrive/entrepreneur-burnout-stress). Multiple responsibilities within limited time frames leads to overwhelm.

**Mitigation**: SOPs + delegation. "Developing standard operating procedures and building a competent team was described as a game-changer."

### Q1.4: Venture Lifecycle State Machine

**Confidence**: High

```
                    ┌─────────────────────────────────────────────────┐
                    │                    KILLED                        │
                    │  (Failed gates, no market, strategic exit)       │
                    └─────────────────────────────────────────────────┘
                                          ▲
                                          │ Kill decision
                    ┌─────────────────────┼─────────────────────────┐
                    │                     │                         │
                    ▼                     │                         │
    ┌──────────┐  Launch   ┌──────────┐  │  ┌──────────┐  ┌──────────┐
    │  GENESIS │─────────► │  ACTIVE  │──┴─►│  SUNSET  │─►│ ARCHIVED │
    │(Simulate)│           │(Building)│     │(Winding) │  │(Retired) │
    └──────────┘           └──────────┘     └──────────┘  └──────────┘
         │                      │ ▲               │
         │                      │ │               │
    Fail │               PMF    │ │ Return to     │ Migrate
    Gate │             Achieved │ │ Development   │ Users
         ▼                      ▼ │               ▼
    ┌──────────┐           ┌──────────┐     ┌──────────┐
    │ REJECTED │           │  GROWTH  │     │  SOLD    │
    │(No Launch)│          │(Scaling) │     │(Acquired)│
    └──────────┘           └──────────┘     └──────────┘
                                │
                           PMF Risk │
                                ▼
                           ┌──────────┐
                           │MAINTENANCE│
                           │(Sustain) │
                           └──────────┘
```

**State Definitions**:
| State | Entry Trigger | Exit Trigger | Key Activities |
|-------|---------------|--------------|----------------|
| GENESIS | Idea scored >70 | Pass/fail simulation gates | Pattern matching, PRD generation |
| ACTIVE | Simulation ratified | PMF achieved OR killed | Development, MVP launch, iteration |
| GROWTH | MRR >$1K, retention >70% | Growth stalls OR acquisition offer | Marketing, feature expansion, hiring |
| MAINTENANCE | Growth <5% for 3 mo | Growth resumes OR sunset decision | Bug fixes only, minimal investment |
| SUNSET | Strategic decision to wind down | All users migrated | Migration support, data export |
| ARCHIVED | All users migrated/churned | Never | Documentation preserved |
| KILLED | Failed gates OR strategic exit | Never | Post-mortem captured |
| SOLD | Acquisition completed | Never | Due diligence, transition |

**Decision Authority**:
- GENESIS → ACTIVE: Automated (gate pass) + Chairman approval
- ACTIVE → GROWTH: Automated (metrics threshold)
- → KILLED: Always Chairman (strategic decision)
- → SOLD: Always Chairman + legal

### Q1.5: AI vs Human Roles

**Confidence**: High

| Role | AI-Compatible | Human-Required | Hybrid |
|------|---------------|----------------|--------|
| Customer Support L1 | ✅ | | |
| Customer Support L2+ | | ✅ | |
| Code Development | | | ✅ (AI writes, human reviews) |
| Marketing Copy | ✅ | | |
| Brand Strategy | | ✅ | |
| Financial Reporting | ✅ | | |
| Financial Strategy | | ✅ | |
| Bug Triage | ✅ | | |
| Architecture Decisions | | ✅ | |
| Legal Review | | ✅ | |
| Hiring Decisions | | ✅ | |
| Sales (Enterprise) | | ✅ | |
| Sales (Self-serve) | ✅ | | |

**When to Hire Humans**:
- At 4 ventures: Part-time support help OR advanced AI agents
- At 8 ventures: Full-time operations/support person
- At 16 ventures: CFO/finance person (or CFO agent if mature)
- At 32 ventures: CEO must delegate ALL execution; needs 3-5 direct reports

**Evidence**: Solo founders using AI report "150-300% productivity gains" but still hit limits — [Medium article](https://aakashgupta.medium.com/how-solo-founders-are-building-1m-saas-businesses-using-only-ai-complete-playbook-3ab2f11fb6db).

---

## Section 2: Pattern Deprecation

### Q2.1: Detecting Outdated Patterns

**Confidence**: High

**Signals for Pattern Deprecation**:
| Signal | Detection Method | Threshold |
|--------|------------------|-----------|
| Usage frequency dropping | Analytics on pattern instantiation | <5 uses/quarter |
| Better alternatives exist | Community sentiment, framework releases | Successor announced |
| Maintenance burden increasing | Bug tickets per pattern | >3 bugs/quarter |
| Technology shift | Framework major version release | Breaking changes |
| Security vulnerabilities | CVE database, npm audit | Any HIGH/CRITICAL |
| Developer friction | Survey, support questions | NPS <30 for pattern |

**Google's Approach**: "Like many engineering activities, deprecation of a software system can be planned as those systems are first built" — [Google SWE Book](https://abseil.io/resources/swe-book/html/ch15.html).

### Q2.2: Pattern Lifecycle States

**Confidence**: High

```
┌──────────┐    Review    ┌──────────┐   12+ mo active   ┌──────────┐
│  DRAFT   │─────────────►│  ACTIVE  │──────────────────►│  MATURE  │
│(Proposed)│              │(Standard)│                   │(Stable)  │
└──────────┘              └──────────┘                   └──────────┘
     │                         │                              │
     │ Rejected                │ Better alternative           │ Superseded
     ▼                         ▼                              ▼
┌──────────┐              ┌──────────┐                   ┌──────────┐
│ REJECTED │              │  SOFT    │                   │SUPERSEDED│
│          │              │DEPRECATED│                   │(Use X)   │
└──────────┘              └──────────┘                   └──────────┘
                               │                              │
                               │ 6 months                     │ 12 months
                               ▼                              ▼
                          ┌──────────┐                   ┌──────────┐
                          │DEPRECATED│                   │ ARCHIVED │
                          │(Warning) │                   │(Removed) │
                          └──────────┘                   └──────────┘
                               │
                               │ 12 months
                               ▼
                          ┌──────────┐
                          │ ARCHIVED │
                          │(Removed) │
                          └──────────┘
```

**Transition Triggers**:
| Transition | Trigger | Process |
|------------|---------|---------|
| Draft → Active | Review passed, 2+ successful uses | PRD approval |
| Active → Mature | 12 months stable, no breaking changes | Automatic |
| Active → Soft Deprecated | Better alternative identified | Announcement, migration guide |
| Soft Deprecated → Deprecated | 6 months | Warning added to pattern usage |
| Deprecated → Archived | 12 months after deprecation | Pattern removed from library |
| Mature → Superseded | Major version replacement | Migration guide required |

**Key Insight from R/tidyverse lifecycle**: "Soft deprecated allows a package to change its interface to encourage developers to update before users are forced to change" — [lifecycle stages](https://lifecycle.r-lib.org/articles/stages.html).

### Q2.3: Handling Ventures Using Deprecated Patterns

**Confidence**: Medium

**Decision Matrix**:
| Venture State | Deprecated Pattern Impact | Recommended Action |
|---------------|---------------------------|-------------------|
| ACTIVE (building) | High | Force migration before launch |
| GROWTH | Medium | Scheduled migration within 6 months |
| MAINTENANCE | Low | Fork pattern, maintain separately |
| SUNSET | Low | Leave as-is, no migration |

**Options Ranked**:
1. **Force Migration** (ACTIVE ventures only) — prevents tech debt accumulation
2. **Scheduled Migration** (GROWTH ventures) — plan it, don't rush it
3. **Fork Pattern** (MAINTENANCE ventures) — creates "legacy" namespace
4. **Accept Technical Debt** (SUNSET ventures) — not worth investment

**Trade-off**: "Incrementality doesn't avoid the deprecation process, but breaks it into smaller, more manageable chunks" — Google SWE Book.

### Q2.4: Pattern Maintenance Budget

**Confidence**: Medium

**Recommended Ratio**: **70% New / 30% Maintenance**

| Phase | New Patterns | Maintenance | Rationale |
|-------|--------------|-------------|-----------|
| Bootstrap (0-10 patterns) | 90% | 10% | Building foundation |
| Growth (10-50 patterns) | 70% | 30% | Balance capability building |
| Mature (50-100 patterns) | 50% | 50% | Stability becomes critical |
| Scale (100+ patterns) | 30% | 70% | Focus on quality over quantity |

**Current State (45 patterns)**: In Growth phase, recommend 70/30 split.

---

## Section 3: Failure Learning

### Q3.1: Venture Post-Mortem Template

**Confidence**: High

```markdown
# Venture Post-Mortem: [VENTURE_NAME]

## Meta
- **Death Date**: YYYY-MM-DD
- **Lifespan**: X months
- **Stage at Death**: [GENESIS|ACTIVE|GROWTH|MAINTENANCE]
- **Total Investment**: $X
- **Peak MRR**: $X

## 1. Hypothesis
### Original Thesis
[What did we believe would make this succeed?]

### Target Customer
[Who were we building for?]

### Value Proposition
[What value did we promise?]

## 2. Failure Signals
| Signal | Date First Noticed | Severity | Response |
|--------|-------------------|----------|----------|
| [e.g., Churn spike] | YYYY-MM-DD | High | [What we did] |

### Timeline to Kill Decision
[How long from first signal to kill?]

## 3. Kill Decision
### Gate Failed
[Which quality gate failed?]

### Decision Maker
[Who made the call?]

### Alternative Considered
[Did we consider pivot vs kill?]

## 4. Pattern Analysis
### Patterns Used
| Pattern | Worked Well | Issues |
|---------|-------------|--------|
| [Pattern name] | [Yes/No] | [Description] |

### Patterns Missing
| Needed Pattern | Impact of Absence |
|----------------|-------------------|
| [Pattern name] | [How it hurt us] |

### New Patterns to Create
| Pattern Name | Why | Priority |
|--------------|-----|----------|
| [Name] | [Rationale] | [High/Medium/Low] |

## 5. Lessons Learned
### What Would We Do Differently?
1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]

### What Worked (Despite Failure)?
[Preserve what succeeded]

### Systemic Issues Identified
[Process/framework improvements needed]

## 6. Failure Category
[Select one primary category]
- [ ] No Product-Market Fit (42% of failures)
- [ ] Ran Out of Cash (29%)
- [ ] Wrong Team/Skills (23%)
- [ ] Competition (19%)
- [ ] Pricing/Cost Issues (18%)
- [ ] User Unfriendly Product (17%)
- [ ] Missing Business Model (17%)
- [ ] Poor Marketing (14%)
- [ ] Ignored Customers (14%)
- [ ] Wrong Timing (13%)

## 7. Artifacts Preserved
- [ ] Codebase archived
- [ ] Customer data deleted/exported
- [ ] Documentation archived
- [ ] Patterns extracted
```

**Source for categories**: [CB Insights Top 12 Reasons](https://www.cbinsights.com/research/report/startup-failure-reasons-top/).

### Q3.2: Failure → Pattern Improvement Feedback Loop

**Confidence**: High

```
┌─────────────────────────────────────────────────────────────────┐
│                    FAILURE FEEDBACK LOOP                         │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ 1. FAILURE      │  Venture killed or significantly pivoted
│    DETECTED     │  Trigger: Kill gate activated
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ 2. POST-MORTEM  │  Within 1 week of kill decision
│    CONDUCTED    │  Output: Completed post-mortem template
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ 3. PATTERN      │  Questions: Which patterns failed?
│    ANALYSIS     │  What was missing? What worked despite failure?
└─────────────────┘
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
┌─────────────────┐                       ┌─────────────────┐
│ 4a. EXISTING    │                       │ 4b. NEW PATTERN │
│ PATTERN UPDATE  │                       │    PROPOSAL     │
│ (bug/enhance)   │                       │                 │
└─────────────────┘                       └─────────────────┘
         │                                         │
         ▼                                         ▼
┌─────────────────┐                       ┌─────────────────┐
│ 5a. PATTERN     │                       │ 5b. DRAFT →     │
│ VERSION BUMP    │                       │    REVIEW       │
└─────────────────┘                       └─────────────────┘
         │                                         │
         └──────────────────┬──────────────────────┘
                           ▼
                  ┌─────────────────┐
                  │ 6. LIBRARY      │
                  │    UPDATED      │
                  └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ 7. FAILURE      │  Add to Anti-Pattern Library
                  │ PATTERN LOGGED  │  for future venture scoring
                  └─────────────────┘
```

### Q3.3: How Successful Companies Capture Failure Lessons

**Confidence**: High

| Company | Practice | Key Technique |
|---------|----------|---------------|
| **Amazon** | "Working Backwards" + Post-mortems | 6-page narratives, mandatory retrospectives |
| **Stripe** | Pre-mortems before launch | 🐅 Tiger/🐯 Paper Tiger/🐘 Elephant framework |
| **Google** | Blameless post-mortems | SRE-style incident review, focus on systems not people |
| **Pixar** | "Braintrust" meetings | Candid feedback loops during and after projects |

**Stripe's Pre-Mortem Framework** (highly recommended):
- **🐅 Tiger**: Clear threat that will hurt if not addressed
- **🐯 Paper Tiger**: Ostensible threat you're not personally worried about
- **🐘 Elephant**: The thing the team is not talking about

**Reference**: [Shreyas Doshi Pre-Mortem on Coda](https://coda.io/@shreyas/pre-mortems)

### Q3.4: Failure Pattern Library

**Confidence**: High

| Failure Pattern | Description | Detection Signal | Prevention |
|-----------------|-------------|------------------|------------|
| **PREMATURE_SCALING** | Scaling before PMF | Burn rate high, retention low | Enforce PMF gate before growth investment |
| **WRONG_MARKET** | Building for wrong audience | Low conversion, feedback mismatch | Validation interviews before build |
| **OVER_ENGINEERING** | Building too much, too early | Long dev cycles, feature bloat | MVP discipline, pattern reuse |
| **UNDER_VALIDATION** | Shipping without user feedback | Surprise churn, negative reviews | Mandatory user interviews per stage |
| **FOUNDER_BURNOUT** | Solo founder overwhelms | Response times increase, quality drops | Automation checkpoints, delegate triggers |
| **PRICING_MISMATCH** | Price too high or too low | Low conversion OR low LTV | A/B test pricing early |
| **TECH_DEBT_AVALANCHE** | Accumulating shortcuts | Bug rate spikes, dev velocity drops | Pattern adherence, code review |
| **COMPETITIVE_BLINDNESS** | Ignoring market moves | Sudden churn to competitor | Monthly competitive analysis |
| **CASH_CLIFF** | Running out of runway | <6 months runway without clear path | Monthly burn tracking, kill gate |
| **GHOST_CUSTOMERS** | Users who never engage | High signup, low activation | Onboarding optimization |

**Recommendation**: Score each new venture against this library. Flag if 3+ patterns match historical failures.

---

## Section 4: Team/Skill Requirements

### Q4.1: Skills Inventory System

**Confidence**: High

```markdown
# Skills Inventory

## Current Skills (Build Today)
| Skill | Proficiency | Pattern Coverage | Evidence |
|-------|-------------|------------------|----------|
| React/TypeScript | Expert | 17 components | Production apps |
| Supabase/PostgreSQL | Expert | RLS, migrations | EHG app |
| Tailwind CSS | Expert | Design system | EHG app |
| Next.js | Advanced | Pages, API routes | EHG app |
| Node.js | Advanced | Backend services | Scripts |
| Git/GitHub | Advanced | CI/CD workflows | Daily use |

## Skills In Development (Learning)
| Skill | Current Level | Target | Timeline | Method |
|-------|---------------|--------|----------|--------|
| AI/ML integration | Beginner | Intermediate | 3 mo | Claude API, course |
| Mobile (React Native) | None | Basic | 6 mo | Side project |

## Skills to Acquire (Need)
| Skill | Why Needed | Unlock Potential | Acquisition Method |
|-------|------------|------------------|-------------------|
| DevOps/Kubernetes | Scale beyond Vercel | Enterprise customers | Hire/partner |
| Native mobile | iOS/Android apps | New market segment | Partner |

## Skills to Outsource (Never In-House)
| Skill | Reason | Vendor Strategy |
|-------|--------|-----------------|
| Legal | Liability, complexity | Retain law firm |
| Accounting/Tax | Compliance critical | CPA firm |
| Penetration testing | Requires specialization | Annual contract |
| Enterprise sales | Different DNA | Commission-based |
```

### Q4.2: Learn/Hire/Partner/Avoid Decision Framework

**Confidence**: High

```
                    ┌─────────────────────────────────┐
                    │ Is this skill CORE to ventures? │
                    └─────────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               │ YES                         │ NO
               ▼                             ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │ Will it be needed   │       │ One-time or         │
    │ for 3+ ventures?    │       │ recurring need?     │
    └─────────────────────┘       └─────────────────────┘
               │                             │
    ┌──────────┴──────────┐       ┌─────────┴──────────┐
    │ YES                 │ NO    │ One-time  │Recurring│
    ▼                     ▼       ▼           ▼
┌───────────┐      ┌───────────┐  │     ┌───────────┐
│   LEARN   │      │   HIRE    │  │     │  PARTNER  │
│ (Invest)  │      │(Contract) │  │     │ (Ongoing) │
└───────────┘      └───────────┘  │     └───────────┘
                                  │
                           ┌──────┴──────┐
                           │  OUTSOURCE  │
                           │  (Project)  │
                           └─────────────┘

If skill required but:
- Learning curve >6 months AND
- Urgency high AND
- No venture can wait
                    ↓
              ┌───────────┐
              │   AVOID   │
              │(Skip idea)│
              └───────────┘
```

**Decision Matrix**:
| Factor | Learn | Hire | Partner | Avoid |
|--------|-------|------|---------|-------|
| Core to business? | ✅ | Maybe | No | No |
| Multiple ventures need it? | ✅ | ❌ | ❌ | ❌ |
| Learning time <3 months? | ✅ | ❌ | ❌ | ❌ |
| One-time need? | ❌ | ✅ | ❌ | ❌ |
| Recurring but non-core? | ❌ | ❌ | ✅ | ❌ |
| High urgency + long learning? | ❌ | ❌ | ❌ | ✅ |

### Q4.3: Skill Distance Metric

**Confidence**: Medium

**Formula**:
```
Skill Distance = Σ(Required Skills × Learning Difficulty) / Total Skills

Where Learning Difficulty:
- 1 = Already know well
- 2 = Minor extension of current skills
- 3 = New but related domain
- 4 = Entirely new domain
- 5 = Requires formal training/certification
```

**Example**:
| Venture Idea | Required Skills | Skill Distance |
|--------------|-----------------|----------------|
| Admin Dashboard | React, Supabase, Auth | 1.2 (all current) |
| Mobile App | React Native, Mobile UX | 3.0 (related but new) |
| ML-powered SaaS | Python, ML, Data pipelines | 4.2 (new domain) |
| Hardware IoT | Embedded, firmware, hardware | 5.0 (avoid unless critical) |

**Threshold**: Skill Distance >3.5 = Consider AVOID unless strategic.

### Q4.4: Minimum Viable Skill Set for Solo AI-Assisted Operator

**Confidence**: High

**Must-Have**:
1. **Full-stack web development** (React/Node or equivalent)
2. **Database design** (SQL, basic schema design)
3. **Cloud deployment** (Vercel/Netlify/basic AWS)
4. **Git workflow** (branching, PRs, basic CI/CD)
5. **Product thinking** (can write PRDs, prioritize features)
6. **Basic financial literacy** (unit economics, MRR, churn)
7. **AI tool proficiency** (prompt engineering, tool selection)
8. **Written communication** (docs, support, marketing copy)

**Nice-to-Have**:
- Design basics (can use Figma/Tailwind)
- SEO fundamentals
- Basic marketing (landing pages, email)
- Data analysis (SQL queries, spreadsheets)

**Delegate-From-Day-1**:
- Legal/compliance
- Tax/accounting
- Penetration testing
- Complex DevOps

---

## Section 5: Legal/Compliance Patterns

### Q5.1: Legal/Compliance Pattern Library

**Confidence**: High

| Pattern | Description | Complexity | Priority |
|---------|-------------|------------|----------|
| `TERMS_OF_SERVICE` | Standard ToS template | Low | P0 (Day 1) |
| `PRIVACY_POLICY` | Privacy policy template | Low | P0 (Day 1) |
| `COOKIE_CONSENT` | GDPR-compliant cookie banner | Medium | P1 (Pre-launch EU) |
| `GDPR_DATA_HANDLING` | Data subject rights, deletion | High | P1 (EU users) |
| `DATA_EXPORT` | User data export functionality | Medium | P2 (EU scale) |
| `SOC2_CONTROLS` | Security controls framework | High | P3 (Enterprise) |
| `PCI_COMPLIANCE` | Payment card security | High | P1 (Any payments) |
| `ACCESSIBILITY_WCAG` | WCAG 2.1 AA compliance | Medium | P2 (Scale) |
| `DATA_RETENTION` | Auto-delete old data | Medium | P2 (Scale) |
| `INCIDENT_RESPONSE` | Breach notification process | High | P2 (Scale) |

### Q5.2: Compliance Trigger Points

**Confidence**: High

| Requirement | Trigger Point | Consequence of Non-Compliance |
|-------------|---------------|-------------------------------|
| Privacy Policy | Day 1, any user data | App store rejection, legal risk |
| Terms of Service | Day 1, any user interaction | No legal protection |
| Cookie Consent | Any EU user | GDPR fine up to €20M or 4% revenue |
| GDPR (full) | EU users + processing data | Same as above |
| CCPA/CPRA | California users >$25M revenue | Fine up to $7,500/violation |
| PCI DSS | Handling card data directly | Cannot accept cards |
| SOC 2 | Enterprise customers (usually) | Lost deals, not legal |
| HIPAA | Any health data | Fine up to $1.5M/year |
| WCAG/ADA | US customers (increasingly) | Lawsuits, settlements |

**Expanded Trigger Table**:
| Revenue Tier | Users | Required Compliance |
|--------------|-------|---------------------|
| $0-10K MRR | <1K | Privacy, ToS |
| $10K-50K MRR | 1K-10K | + Cookie consent, basic GDPR |
| $50K-100K MRR | 10K+ | + Full GDPR, CCPA |
| $100K+ MRR | Enterprise | + SOC 2, consider ISO 27001 |

**Reference**: [SOC 2 for Startups Guide](https://www.ispartnersllc.com/blog/soc-2-for-startups/)

### Q5.3: Managing Legal Templates Across 10-32 Ventures

**Confidence**: Medium

**Recommended: Centralized with Venture-Specific Addenda**

```
┌─────────────────────────────────────────────────────┐
│              HOLDING COMPANY TEMPLATES               │
│  - Master Privacy Policy                            │
│  - Master Terms of Service                          │
│  - Cookie Consent Component                         │
│  - GDPR Data Subject Rights Process                 │
└─────────────────────────────────────────────────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │Venture A │ │Venture B │ │Venture C │
      │ Addendum │ │ Addendum │ │ Addendum │
      │- Product │ │- Product │ │- Product │
      │  specific│ │  specific│ │  specific│
      └──────────┘ └──────────┘ └──────────┘
```

**Update Propagation**:
1. **Template change** → triggers review across all ventures
2. **Automated diff** → identifies which ventures need updates
3. **Quarterly audit** → verify all ventures in compliance
4. **Version tracking** → each venture references template version

### Q5.4: Legal Structure for 32 Software Ventures

**Confidence**: Medium (consult attorney)

**Options Comparison**:
| Structure | Pros | Cons | Best For |
|-----------|------|------|----------|
| **Series LLC** | Single filing, liability separation, lower cost | Limited state recognition (14 states), bank/investor unfamiliarity | Homogeneous ventures, all in same state |
| **Holding Company + Subsidiary LLCs** | Maximum protection, clear separation, investor-friendly | Higher cost, more paperwork | Diverse ventures, seeking investment |
| **Single LLC (all ventures)** | Simplest, cheapest | No liability separation | Very early stage only |
| **Delaware C-Corp Holding** | Best for raising capital, stock options | More complexity, double taxation risk | Planning to raise VC |

**Recommendation for EHG at 32 Ventures**:
- **Delaware C-Corp** as holding company (HoldCo)
- **Series LLC** (in Texas or Delaware) for operational ventures
- **Separate LLC** only for high-risk or high-value ventures

**Caveat**: "A traditional LLC or holding company may be a better choice if you need bank financing (as some lenders prefer separate LLCs)" — [Series LLC Guide](https://www.legalgps.com/series-llc/series-llc-vs-holding-company-which-one-is-better).

---

## Section 6: Pricing Patterns

### Q6.1: Pricing Pattern Library

**Confidence**: High

| Pattern | When to Use | Pros | Cons | Complexity |
|---------|-------------|------|------|------------|
| **FREEMIUM** | Low marginal cost, viral potential, clear upgrade trigger | User acquisition, PMF validation | Low conversion (1-5%), support burden | Medium |
| **FREE_TRIAL** | Complex product needing experience, higher price point | Higher conversion than freemium | Time pressure may scare users | Low |
| **USAGE_BASED** | Value scales with consumption, unpredictable usage | Fair, scalable | Revenue volatility | High |
| **PER_SEAT** | Collaborative tools, value per user | Predictable, scales with customer | May limit adoption | Low |
| **FLAT_RATE** | Simple product, mass market | Easy to understand | Leaves money on table | Low |
| **TIERED** | Diverse customer segments | Captures more value | Complex to optimize | Medium |
| **PWYW** | Community products, early PMF validation | Data gathering, goodwill | Unpredictable revenue | Low |
| **ONE_TIME** | Lifetime tools, downloads | No churn risk | No recurring revenue | Low |

**Evidence**: "67% [of startups] eventually migrate to per-user or tiered models during Series A growth" — [SaaS Pricing Guide 2025](https://www.getmonetizely.com/blogs/complete-guide-to-saas-pricing-models-for-2025-2026).

### Q6.2: Pricing Decision Framework

**Confidence**: High

```
┌─────────────────────────────────────────────────────────────┐
│                  PRICING DECISION INPUTS                     │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────┐
│ Target Customer │
│ SMB/Enterprise/ │
│ Consumer        │
└─────────────────┘
     │
     ├── Consumer ────────────► Freemium or Flat Rate
     │
     ├── SMB ─────────────────► Tiered or Per-Seat
     │
     └── Enterprise ──────────► Per-Seat or Usage-Based + Contract
          │
          ▼
┌─────────────────┐
│  Value Metric   │
│ What do they    │
│ pay for?        │
└─────────────────┘
     │
     ├── Time saved ──────────► Flat Rate or Per-Seat
     │
     ├── Revenue generated ───► Usage-Based or Revenue Share
     │
     ├── Users served ────────► Per-Seat
     │
     └── Volume processed ────► Usage-Based
          │
          ▼
┌─────────────────┐
│  Competition    │
│  Landscape      │
└─────────────────┘
     │
     ├── No competition ──────► Premium pricing
     │
     ├── Many competitors ────► Competitive pricing + differentiation
     │
     └── Market leader ───────► Match or undercut (carefully)
          │
          ▼
┌─────────────────┐
│ Pattern Match   │
│ (Implementation │
│  complexity)    │
└─────────────────┘
     │
     ├── Have Stripe patterns ─► Any model
     │
     └── Need payment infra ───► Start with simplest (Flat/Tiered)
```

**Output Matrix**:
| Customer | Value Metric | Competition | Recommended Pattern |
|----------|--------------|-------------|---------------------|
| Consumer | Time saved | Crowded | Freemium → Flat Rate |
| Consumer | Volume | Some | Usage-Based (micro) |
| SMB | Revenue | Few | Tiered |
| SMB | Users | Many | Per-Seat (competitive) |
| Enterprise | Volume | Few | Usage-Based + Contract |
| Enterprise | Collaboration | Many | Per-Seat + Tiers |

### Q6.3: A/B Testing Pricing

**Confidence**: High

**Minimum Viable Pricing Experiment**:

1. **New Customers Only**: "75% of successful SaaS pricing tests follow this methodology" — Simon-Kucher & Partners

2. **Sample Size**:
   - 100+ conversions per variant for large effects (20%+)
   - 250-500 visitors per variation for statistical significance
   - Run 30-60 days minimum

3. **Test Design**:
```
Control: Current pricing
Variant A: +20% price, same features
Variant B: Same price, different packaging

Measure:
- Conversion rate
- Revenue per visitor (PRIMARY)
- Churn at 30/60/90 days
```

4. **Key Metric**: Measure REVENUE not just conversion. "Even though you may sell less at higher price points, total revenues may actually be higher" — [VWO](https://vwo.com/blog/ab-testing-price-testing/).

5. **Timing**: "Running tests for at least two full billing cycles is recommended to capture real customer lifetime value."

### Q6.4: Handling Pricing Changes at Scale

**Confidence**: High

| Strategy | When to Use | Implementation |
|----------|-------------|----------------|
| **Grandfather** | Long-term loyalists, low price increase | Lock old users at old price indefinitely |
| **Grace Period** | Moderate increase, fair treatment | 90-day notice, then new pricing |
| **Feature Gate** | Adding significant value | Old price for old features, new price for new |
| **Annual Lock** | Protecting annual subscribers | Honor contract term, new price at renewal |

**When to Raise Prices**:
- Clear value increase delivered
- Churn stable or improving
- Competitors charge more
- Feature expansion justifies it
- NOT when: churn is high, no new value, just need revenue

**Communication Template**:
```
Subject: Update to [Product] Pricing

We're updating pricing on [date] for new customers.

Why: [New features/value delivered]

Your account: [Specific impact - e.g., "No change" or "New price at next renewal"]

Questions: [Support link]
```

### Q6.5: Pricing Patterns for "Vending Machine" Model

**Confidence**: High

**Best Fit Patterns**:
| Pattern | Vending Machine Score | Why |
|---------|----------------------|-----|
| **Flat Rate** | ⭐⭐⭐⭐⭐ | Revenue from transaction #1, simple, predictable |
| **One-Time** | ⭐⭐⭐⭐⭐ | Immediate revenue, no ongoing complexity |
| **Tiered (simple)** | ⭐⭐⭐⭐ | Clear upgrade path, transaction #1 viable |
| **Free Trial** | ⭐⭐⭐⭐ | Conversion to paid is transaction #1 |
| **Usage-Based** | ⭐⭐⭐ | Revenue from first use, but volatile |
| **Freemium** | ⭐⭐ | Delays revenue, requires scale |
| **Per-Seat Enterprise** | ⭐ | Long sales cycles, delays feedback |

**Recommendation for EHG**: Start with **Flat Rate** or **Tiered (2-3 tiers)**. Avoid Freemium until venture has strong viral mechanics.

---

## Prioritization Matrix

| Blind Spot | Urgency | Impact | Effort | Score | Rank |
|------------|---------|--------|--------|-------|------|
| 1. Multi-Venture Management | 🔴 HIGH | 🔴 HIGH | 🟡 MEDIUM | 8.5 | **1** |
| 6. Pricing Patterns | 🔴 HIGH | 🟡 MEDIUM | 🟢 LOW | 7.5 | **2** |
| 3. Failure Learning | 🟡 MEDIUM | 🔴 HIGH | 🟢 LOW | 7.0 | **3** |
| 5. Legal/Compliance | 🟡 MEDIUM | 🔴 HIGH | 🟡 MEDIUM | 6.5 | **4** |
| 4. Team/Skill Requirements | 🟡 MEDIUM | 🟡 MEDIUM | 🟢 LOW | 5.5 | **5** |
| 2. Pattern Deprecation | 🟢 LOW | 🟡 MEDIUM | 🟡 MEDIUM | 4.0 | **6** |

**Scoring**:
- Urgency: How soon will this be a problem? (4=32 ventures, 16=4 ventures, 1=1 venture)
- Impact: How much does solving this improve operations?
- Effort: How hard to solve? (Inverted: Low effort = higher score)

**Recommendation Order**:
1. **Multi-Venture Management (EVA)** — Oracle's Warning is real, need this before hitting 4 ventures
2. **Pricing Patterns** — Impacts revenue from day 1, low effort
3. **Failure Learning** — Prevents repeated mistakes, enables pattern improvement
4. **Legal/Compliance** — Critical at scale, some baseline needed early
5. **Team/Skill Requirements** — Useful framework but less urgent
6. **Pattern Deprecation** — Only matters once library is larger

---

## Sources

- [Constellation Software Operations](https://www.csisoftware.com/our-companies)
- [Andrew Wilkinson/Tiny Operating Manual](https://www.colinkeeley.com/blog/andrew-wilkinson-tiny-capital-operating-manual)
- [Google SWE Book - Deprecation](https://abseil.io/resources/swe-book/html/ch15.html)
- [CB Insights - Why Startups Fail](https://www.cbinsights.com/research/report/startup-failure-reasons-top/)
- [Stripe Pre-Mortem Framework](https://coda.io/@shreyas/pre-mortems)
- [Series LLC Guide](https://www.legalgps.com/series-llc)
- [SaaS Pricing Models 2025](https://www.getmonetizely.com/blogs/complete-guide-to-saas-pricing-models-for-2025-2026)
- [SOC 2 for Startups](https://www.ispartnersllc.com/blog/soc-2-for-startups/)
- [VWO A/B Testing Pricing](https://vwo.com/blog/ab-testing-price-testing/)
- [Solo AI Operator Model](https://aakashgupta.medium.com/how-solo-founders-are-building-1m-saas-businesses-using-only-ai-complete-playbook-3ab2f11fb6db)
