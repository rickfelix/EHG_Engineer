# Strategic Directive Updates from Triangulation Research

**Date**: 2026-01-04
**Session**: Scaffolding Feature Decisions
**Research Source**: `docs/research/triangulation-scaffolding-features-synthesis.md`

---

## Executive Summary

Three Strategic Directives were updated based on AI-triangulated research from Google/Gemini, OpenAI/ChatGPT, and Anthropic/Claude. The research addressed three scaffolding features that required "Build vs Buy vs Skip" decisions.

| SD | Before | After | Verdict |
|----|--------|-------|---------|
| SD-LEGAL-GENERATOR-001 | draft (research pending) | **cancelled** | SKIP building |
| SD-MARKETING-AUTOMATION-001 | draft (approach TBD) | draft (scope refined) | Use third-party tools |
| SD-NAMING-ENGINE-001 | draft (no TM features) | draft (education + referral) | Add value without liability |

---

## SD-LEGAL-GENERATOR-001: Legal Document Generator

### Decision: CANCELLED

**Rationale**: Unanimous SKIP verdict from all three AI providers.

**Key Findings**:
- Build cost: $57,000+ over 3 years
- Buy cost: $3,600 for 20 ventures over 3 years
- **10-15x cost savings by NOT building**
- DoNotPay precedent: $193K FTC penalty for AI legal claims
- Industry pattern: YC, Techstars, Antler all use partners, none build custom

**Database Changes**:
```json
{
  "status": "cancelled",
  "metadata": {
    "cancelled_date": "2026-01-04T23:00:00.000Z",
    "original_status": "draft",
    "cancellation_reason": "Research concluded: SKIP building...",
    "research_verdict": "SKIP",
    "research_reference": "docs/research/triangulation-scaffolding-features-synthesis.md",
    "recommended_action": "Use GetTerms Business Lifetime ($249) for EHG properties; Termly Pro+ ($180/yr) as portfolio perk"
  }
}
```

---

## SD-MARKETING-AUTOMATION-001: Marketing Content Distribution

### Decision: PROCEED with refined scope

**Rationale**: Third-party tools (Late/Buffer) with human review queue.

**Key Findings**:
- Option D (Computer Use/Playwright): **REJECTED** - 23% LinkedIn ban rate, ToS violations
- Option B (Direct APIs): **REJECTED** - $200/mo X/Twitter, 60-day LinkedIn token expiry
- Option C/E (Third-party + Review): **APPROVED** - $33-66/month for 20+ ventures

**Updated Scope**:

**Phase 1 (MVP)**:
- Content review queue from Content Forge
- Manual posting with simple review queue (Notion/Trello)
- Native scheduling (Meta Business Suite for FB/IG)

**Phase 2 (5+ ventures)**:
- Implement Late Accelerate ($33/mo) or Buffer
- Connect all venture profiles
- Weekly batch scheduling workflow

**Phase 3 (20+ ventures)**:
- Expand to Late 100+ profiles (~$66/mo)
- Or SocialPilot Ultimate if UI preference

**Platform Priority**: LinkedIn > X/Twitter > Facebook > Instagram

**Database Changes**:
```json
{
  "metadata": {
    "research_completed": true,
    "research_verdict": "Option C/E hybrid - Third-party tools with review queue",
    "research_reference": "docs/research/triangulation-scaffolding-features-synthesis.md",
    "rejected_approaches": ["Computer Use Automation (Option D)", "Direct Platform APIs (Option B)"],
    "recommended_tools": ["Late (getlate.dev)", "Buffer", "Publer"],
    "estimated_cost": "$33-66/month for 20+ ventures"
  }
}
```

---

## SD-NAMING-ENGINE-001: Venture Naming Generation Engine

### Decision: ADD education + referral features

**Rationale**: Trademark guidance via education + referral adds value without liability.

**Key Findings**:
- No naming tool has been sued for trademark issues
- Several have been sued for UPL when crossing into "advice"
- "Certainty is a liability" - never say "Safe" or "Clear"
- Affiliate revenue opportunity: $50-100 per referral conversion

**Updated Scope**:

**Core Features** (unchanged):
- Name Generator (LLM-powered with constraints)
- Name Scorer (phonetic + memorability)
- Domain Checker (single provider API)

**Trademark Guidance** (NEW):
- Educational modal explaining trademark vs domain difference
- "Check Trademark Availability" button → external link to USPTO TESS
- Prominent disclaimer: "Domain availability ≠ Trademark availability"
- V1: Affiliate link to trademark filing service (LegalZoom, Trademark Engine)

**NEVER BUILD**:
- Custom USPTO search engine (no public API, terabytes of XML)
- Risk scoring or "likelihood of conflict" features (UPL liability)
- "Safe to use" or "Clear" indicators (negligent misrepresentation)
- AI-powered trademark analysis (hallucination risk)

**Database Changes**:
```json
{
  "metadata": {
    "research_completed": true,
    "research_verdict": "Education + Referral model for trademarks",
    "research_reference": "docs/research/triangulation-scaffolding-features-synthesis.md",
    "trademark_approach": "Option E (Education) + Option D (Referral)",
    "rejected_approaches": ["Custom USPTO Search (Option B)", "AI Trademark Analysis", "Risk Scoring"],
    "affiliate_opportunity": "LegalZoom, Trademark Engine - $50-100 per conversion"
  }
}
```

---

## Research Documents

All triangulation research is stored in `docs/research/`:

| Topic | Google | OpenAI | Claude | Synthesis |
|-------|--------|--------|--------|-----------|
| Legal Infrastructure | `triangulation-legal-infrastructure-google-response.md` | `triangulation-legal-infrastructure-openai-response.md` | `triangulation-legal-infrastructure-claude-response.md` | - |
| Marketing Distribution | `triangulation-marketing-distribution-gemini-response.md` | `triangulation-marketing-distribution-openai-response.md` | `triangulation-marketing-distribution-claude-response.md` | - |
| Trademark Guidance | `triangulation-trademark-guidance-google-response.md` | `triangulation-trademark-guidance-openai-response.md` | `triangulation-trademark-guidance-claude-response.md` | - |
| **Combined** | - | - | - | `triangulation-scaffolding-features-synthesis.md` |

---

## Meta-Insight

All nine research documents converged on a consistent principle:

> **For a solo-operated venture factory, the maintenance burden of custom-built infrastructure in non-core competencies is catastrophic.**

The pattern across all three topics:
- Legal Infrastructure: Regulatory changes require constant monitoring
- Marketing Distribution: Platform API changes require constant adaptation
- Trademark Guidance: USPTO data and legal standards require specialized expertise

**None of these are EHG's core competency. All have established, affordable third-party solutions.**

---

*Report generated: 2026-01-04*
*Session: Scaffolding Feature Decision Updates*
