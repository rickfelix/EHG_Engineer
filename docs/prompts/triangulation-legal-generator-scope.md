# Triangulation Research: Legal Document Generator Scope


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: unit, sd, validation, infrastructure

## Unified Prompt for OpenAI and AntiGravity (Gemini)

**Date**: 2026-01-04
**SD**: SD-LEGAL-GENERATOR-001
**Purpose**: Determine if legal document generation is EHG's problem to solve
**Method**: Independent AI analysis, then triangulation synthesis

---

## Context

EHG is a venture factory that creates and launches digital ventures. Every venture needs legal documents:
- Terms of Service
- Privacy Policy
- Cookie Policy
- Data Processing Agreement (for B2B)

**Current State**: Ventures currently use:
- Generic templates from the internet
- Lawyer-generated documents (expensive, slow)
- Services like Clerky, Termly, or Stripe Atlas templates

**The Question**: Should EHG build a Legal Document Generator, or is this not our problem to solve?

**Key Constraints**:
- Solo operator (cannot maintain complex legal infrastructure)
- Liability concerns (bad legal docs = lawsuits)
- Multiple jurisdictions (US, UK, EU, AU ventures)
- Cost sensitivity (ventures are bootstrapped)

---

## The Core Question

**Is legal document generation a problem EHG should solve, or should we outsource this to existing solutions?**

Sub-questions:
1. Is this a real pain point for founders?
2. Can we add unique value beyond existing solutions?
3. Is the liability risk worth the user benefit?
4. What's the minimum viable approach?

---

## Options to Evaluate

### Option A: Skip Entirely
**Description**: Don't build anything. Ventures use Clerky, Termly, lawyers, or templates.

| Aspect | Details |
|--------|---------|
| Build effort | Zero |
| Liability | Zero |
| User experience | Status quo (adequate) |
| Differentiation | None |
| Cost to ventures | $0-500 depending on path |

**Message to users**: "For legal documents, we recommend: [Clerky for incorporation docs, Termly for policies, or consult an attorney]"

### Option B: Curated Template Library
**Description**: Provide links to vetted, high-quality templates (not generated, just curated)

| Aspect | Details |
|--------|---------|
| Build effort | Low (1 week) |
| Liability | Minimal (we don't generate, just link) |
| User experience | Helpful |
| Differentiation | Weak |
| Cost to ventures | Free templates |

**What we provide**: "Here are the best free templates we've found for each document type: [links to YC, Stripe Atlas, Common Paper, etc.]"

### Option C: Template Fill-In (No Generation)
**Description**: Build wizard that fills in venture-specific details into attorney-reviewed templates

| Aspect | Details |
|--------|---------|
| Build effort | Medium (3-4 weeks) |
| Liability | Moderate (templates are fixed, but we fill them) |
| User experience | Good |
| Differentiation | Moderate |
| Cost to ventures | Free |

**How it works**: "Enter your company name, address, data practices → Get filled-in ToS/Privacy Policy based on [Law Firm]'s templates"

### Option D: LLM-Assisted Generation
**Description**: Use LLM to generate legal documents based on venture context

| Aspect | Details |
|--------|---------|
| Build effort | High (6+ weeks) |
| Liability | HIGH (LLM hallucinations in legal docs = lawsuits) |
| User experience | Excellent (customized) |
| Differentiation | Strong (if it works) |
| Cost to ventures | Free |

**Risk**: "LLM generates clause that doesn't hold up in court → Venture gets sued → Venture sues EHG"

### Option E: Partner/Integrate with Legal Service
**Description**: White-label or integrate with existing legal document service

| Aspect | Details |
|--------|---------|
| Build effort | Medium (2-3 weeks for integration) |
| Liability | Shifted to partner |
| User experience | Good |
| Differentiation | Moderate |
| Cost to ventures | Partner's pricing ($10-50/month) |

**Candidates**: Termly, Iubenda, TermsFeed, GetTerms

### Option F: Attorney Network + Templated Packages
**Description**: Partner with attorneys to offer discounted "startup packages"

| Aspect | Details |
|--------|---------|
| Build effort | Low (partnership development) |
| Liability | Zero (attorneys handle it) |
| User experience | Best quality |
| Differentiation | Strong (vetted attorneys) |
| Cost to ventures | $500-2000 per package |

**Value prop**: "Get lawyer-reviewed docs at startup-friendly prices through our attorney network"

---

## Evaluation Criteria

Please evaluate each option against:

1. **Is This Our Problem?**: Should a venture factory solve legal docs, or is this table stakes founders handle themselves?
2. **Liability Exposure**: What's the realistic legal risk to EHG?
3. **User Value**: How much do founders actually care about this?
4. **Build vs Buy Economics**: Cost to build vs cost to outsource
5. **Jurisdiction Complexity**: How hard is multi-jurisdiction (US/UK/EU/AU)?
6. **Maintenance Burden**: Laws change. Who updates the templates?
7. **Competitive Landscape**: What do other venture builders / accelerators do?

---

## Specific Questions

1. **Do founders actually struggle with legal docs?**
   - Or is this a "nice to have" vs "hair on fire" problem?
   - What do YC, Techstars, Antler companies do?

2. **What's the realistic liability exposure?**
   - Has anyone been sued over template legal docs?
   - What disclaimers are effective?

3. **Jurisdiction complexity reality check:**
   - How different are US vs UK vs EU privacy policies?
   - Is "one template with toggles" viable?
   - Or do we need jurisdiction-specific versions?

4. **What do existing solutions cost?**
   - Termly, Iubenda, TermsFeed pricing
   - Lawyer costs for startup doc packages
   - Clerky, Stripe Atlas included docs

5. **LLM legal generation - anyone doing this successfully?**
   - DoNotPay legal bot controversies
   - Any successful examples?
   - What went wrong when it went wrong?

---

## Your Analysis Tasks

### Task 1: Problem Validation
Is legal document generation a real pain point for founders, or a perceived problem that founders actually solve easily on their own?

### Task 2: Build vs Buy Analysis
Calculate the economics:
- Cost to build Option C or D
- Cost to use Option A or E for 20 ventures
- Break-even point

### Task 3: Liability Reality Check
What's the actual lawsuit risk? Consider:
- Size of EHG (solo operator)
- Nature of documents (standard policies, not contracts)
- Disclaimer effectiveness
- Insurance availability

### Task 4: Competitor/Peer Analysis
What do similar organizations do?
- Y Combinator (for their companies)
- Antler, Techstars
- Other venture studios
- No-code/startup tools (Bubble, Webflow, etc.)

### Task 5: Recommendation
What should EHG do?

Format:
- **Verdict**: BUILD / BUY / SKIP
- **If BUILD**: Which option (B, C, or D)?
- **If BUY**: Which service?
- **If SKIP**: What do we tell founders?

---

## Output Format

```markdown
# Legal Document Generator Analysis

## Problem Validation
[Is this actually a problem founders need solved?]

## Build vs Buy Economics

| Approach | Build Cost | Per-Venture Cost | 20-Venture Total |
|----------|------------|------------------|------------------|
| Option A (Skip) | $0 | $X | $Y |
| Option C (Fill-in) | $X | $0 | $X |
| Option E (Partner) | $X | $Y/mo | $Z |

## Liability Reality Check
[Actual risk assessment]

## Competitor/Peer Analysis

| Organization | Approach | Notes |
|--------------|----------|-------|
| Y Combinator | ... | ... |

## Recommendation

**Verdict**: [BUILD / BUY / SKIP]

**Reasoning**: [Why]

**If BUILD**:
- Option: [B/C/D]
- Scope: [What specifically]
- Timeline: [When]

**If BUY**:
- Service: [Which one]
- Cost: [Expected]
- Integration: [How deep]

**If SKIP**:
- Message to founders: [What we tell them]
- Resources to provide: [Links, referrals]

## Key Insight
[One paragraph summary of most important finding]
```

---

## Ground Rules

1. **Challenge the premise** - maybe this isn't our problem
2. **Consider opportunity cost** - what else could we build with that time?
3. **Think about trust** - legal docs affect venture credibility
4. **Be realistic about liability** - solo operator context

---

*Please provide your independent analysis. Your response will be triangulated with another AI's review.*
