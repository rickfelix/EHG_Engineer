# Triangulation Research: Venture Selection Blind Spots

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, unit, migration, sd

## Unified Prompt for All Three AIs (OpenAI, Gemini, Claude Code)

**Created**: 2026-01-01
**Method**: All three AIs answer the same questions independently, then results are triangulated
**Origin**: Blind spots identified during venture selection framework triangulation

---

## Context (Provide to All AIs)

We are building a **software holding company (EHG)** that creates and operates multiple software ventures simultaneously. We've already designed:

- **Pattern Library**: 45 reusable development patterns (components, hooks, services, database patterns)
- **Venture Selection Framework**: Configurable scoring based on feedback speed, pattern match, market demand
- **Chairman Settings**: Risk tolerance, pattern threshold, time-to-revenue limits
- **Glide Path**: Phase progression from "Vending Machines" (1-6 mo) → "Micro-SaaS" (6-12 mo) → "Platform Bets" (12+ mo)
- **Research Arm**: Pipeline to identify and score opportunities continuously

### The Oracle's Warning (Critical Context)

> "The math works, but the Psychology is the bottleneck."

| Ventures | Timeline | Critical Need |
|----------|----------|---------------|
| 1 | Start | Fun, manageable |
| 4 | May | Unified Customer Support Dashboard |
| 16 | Sept | Automated CFO Agent (billing/taxes for 16 Stripe accounts) |
| 32 | Nov | You are no longer the Architect. You are the CEO of a Holding Company |

**Key Insight**: Managing 32 ventures is a nightmare without EVA (Enterprise Virtual Assistant) — the Operating System for the holding company.

### Current Gap

During our venture selection research, we identified **6 blind spots** that none of the three AIs (OpenAI, Gemini, Claude Code) addressed. This research aims to fill those gaps.

---

## The 6 Blind Spots

| # | Blind Spot | Core Question |
|---|------------|---------------|
| 1 | Multi-venture portfolio management | How to balance 5-10+ concurrent ventures without burning out? |
| 2 | Pattern deprecation | When and how to retire outdated patterns? |
| 3 | Failure learning | How to capture lessons from failed ventures into patterns? |
| 4 | Team/skill requirements | What if we lack skills for certain ventures? |
| 5 | Legal/compliance patterns | GDPR, SOC2, terms of service templates |
| 6 | Pricing patterns | How to determine pricing for new ventures? |

---

## Research Questions (All AIs Answer All Questions)

### Section 1: Multi-Venture Portfolio Management

**Context**: At 4 ventures you need support dashboards. At 16 you need automated CFO. At 32 you're a CEO, not an architect.

**Q1.1**: What does a "Venture Portfolio Operating System" look like? Design the architecture for EVA (Enterprise Virtual Assistant) that manages 10-32 concurrent ventures. Include:
- Dashboard requirements (what metrics matter?)
- Automation requirements (what must be automated vs human?)
- Decision routing (what decisions need human input vs can be delegated to AI?)
- Alert/escalation system (when does the Chairman get pulled in?)

**Q1.2**: How do successful holding companies (Berkshire, Constellation Software, Tiny, etc.) manage portfolio companies? What lessons apply to a solo operator with AI assistance?

**Q1.3**: What is the "Management Cliff" - the point where adding ventures becomes net negative? How do you identify when you're approaching it? What are the warning signs?

**Q1.4**: Design a "Venture Lifecycle State Machine" showing states a venture can be in:
- Active development
- Maintenance mode
- Growth mode
- Sunset/deprecation
- Acquired/sold
- Killed

What triggers transitions between states? Who/what makes those decisions?

**Q1.5**: At what point do you need to hire humans vs rely on AI agents? What roles are AI-compatible vs human-required?

---

### Section 2: Pattern Deprecation

**Context**: As the pattern library grows, some patterns become outdated (React class components → hooks, REST → GraphQL, etc.).

**Q2.1**: How do you detect when a pattern is outdated? What signals indicate a pattern should be deprecated?
- Usage frequency dropping
- Better alternatives exist
- Maintenance burden increasing
- Technology shift (e.g., new framework version)

**Q2.2**: Design a "Pattern Lifecycle" with states:
- Draft → Active → Deprecated → Archived

What triggers each transition? What's the deprecation process?

**Q2.3**: How do you handle ventures using deprecated patterns? Options:
- Force migration
- Maintain legacy support
- Fork pattern for legacy ventures
- Something else?

**Q2.4**: What's the "Pattern Maintenance Budget" - how much effort should go into maintaining vs creating patterns? Suggest a ratio.

---

### Section 3: Failure Learning

**Context**: Failed ventures contain valuable lessons. How do we systematically capture them?

**Q3.1**: Design a "Venture Post-Mortem" template that captures:
- What was the hypothesis?
- What signals indicated failure?
- At what stage did we kill it?
- What patterns were used?
- What patterns were missing?
- What would we do differently?
- What new patterns should we create?

**Q3.2**: How do we turn failure lessons into actionable pattern improvements? Design a feedback loop:
- Failure detected → Analysis → Pattern update/creation → Library improvement

**Q3.3**: How do successful companies (Amazon, Stripe, etc.) capture lessons from failed projects? What practices can we adopt?

**Q3.4**: Should there be a "Failure Pattern Library" - common failure modes to avoid? What would be in it?
- Premature scaling
- Wrong market
- Over-engineering
- Under-validation
- etc.

---

### Section 4: Team/Skill Requirements

**Context**: What if a venture requires skills we don't have (e.g., mobile development, ML/AI, hardware integration)?

**Q4.1**: Design a "Skills Inventory" system that tracks:
- Current skills (what can we build today?)
- Skills in development (what are we learning?)
- Skills to acquire (what do we need?)
- Skills to outsource (what should we never build in-house?)

**Q4.2**: When should we:
- Learn a new skill (invest in capability)
- Hire/contract for a skill (buy capability)
- Partner for a skill (share capability)
- Avoid ventures requiring that skill (accept limitation)

Create a decision framework.

**Q4.3**: How do we assess "skill distance" for a venture opportunity? Similar to "pattern distance" but for human capabilities.

**Q4.4**: What skills are "must-have" for a solo operator with AI assistance running a software holding company? What's the minimum viable skill set?

---

### Section 5: Legal/Compliance Patterns

**Context**: As ventures scale, legal/compliance requirements increase. GDPR, SOC2, terms of service, privacy policies, etc.

**Q5.1**: What legal/compliance patterns should exist in our pattern library?
- Terms of Service template
- Privacy Policy template
- Cookie consent implementation
- GDPR data handling patterns
- SOC2 compliance patterns
- Payment processing compliance (PCI)
- Accessibility compliance (ADA/WCAG)

**Q5.2**: At what venture stage/revenue does each compliance requirement become mandatory vs optional?

| Requirement | Trigger Point |
|-------------|---------------|
| Privacy Policy | Day 1 |
| Terms of Service | Day 1 |
| GDPR | If EU users |
| SOC2 | Enterprise customers |
| PCI | If handling payments |

Fill in and expand this table.

**Q5.3**: How do you maintain legal templates across 10-32 ventures? Centralized vs per-venture? How do updates propagate?

**Q5.4**: What's the legal structure for a holding company with 32 software ventures?
- One LLC per venture?
- One parent holding company?
- Delaware C-Corp?
- Series LLC?

What are the trade-offs?

---

### Section 6: Pricing Patterns

**Context**: Each venture needs a pricing strategy. How do we systematically determine pricing?

**Q6.1**: What pricing patterns should exist in our library?
- Freemium
- Free trial → Paid
- Usage-based
- Per-seat
- Flat rate
- Tiered
- Pay-what-you-want
- One-time purchase
- etc.

For each, define: When to use, pros/cons, implementation complexity.

**Q6.2**: Design a "Pricing Decision Framework" that takes inputs:
- Target customer (SMB/Enterprise/Consumer)
- Value metric (what do customers pay for?)
- Competitive landscape
- Pattern match (what pricing patterns do we support?)

And outputs a recommended pricing structure.

**Q6.3**: How do you A/B test pricing for a new venture? What's the minimum viable pricing experiment?

**Q6.4**: How do you handle pricing changes as a venture scales? When do you raise prices? How do you grandfather existing customers?

**Q6.5**: What pricing patterns are most compatible with the "vending machine" / incremental progress model we're targeting?

---

## Output Format

For each section, provide:
1. **Direct answers** to each question
2. **Specific examples** with names, links, or references where applicable
3. **Templates/frameworks** that can be implemented
4. **Confidence level** (High/Medium/Low) for each answer
5. **Caveats or uncertainties**
6. **Recommendations** for which blind spots to address first

---

## Prioritization Question

After answering all sections, rank the 6 blind spots by:
1. **Urgency** - How soon will this become a problem?
2. **Impact** - How much does solving this improve operations?
3. **Effort** - How hard is it to solve?

Create a prioritization matrix and recommend which to address first.

---

## Triangulation Instructions (For Claude Code After Receiving All Responses)

After receiving responses from all three AIs, analyze:

1. **Consensus**: Where do all three agree?
2. **Disagreements**: Where do opinions differ? Which is most credible?
3. **Unique Insights**: What did only one AI identify?
4. **Gaps**: What did none of them address adequately?
5. **Synthesis**: Create unified recommendations for each blind spot
6. **SD Proposals**: Propose Strategic Directives to address each blind spot

---

## How to Use This Prompt

### For OpenAI (ChatGPT/GPT-4):
Copy everything from "## Context" through "## Prioritization Question" and paste into ChatGPT.

### For Gemini (Google):
Copy everything from "## Context" through "## Prioritization Question" and paste into Gemini.

### For Claude Code:
I will answer these questions based on codebase analysis plus web research.

### After All Three Respond:
Bring all responses back to Claude Code for triangulation synthesis and SD creation.
