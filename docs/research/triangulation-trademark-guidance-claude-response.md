# Triangulation Response: Anthropic (Claude)

**Date**: 2026-01-04
**Topic**: Trademark Guidance for Naming Engine
**Model**: Anthropic Claude

---

# Trademark liability for SaaS naming tools: A conservative path forward

**The safest approach is also the most practical.** After examining the competitive landscape and legal precedents, the evidence points toward a hybrid model: educational warnings combined with affiliate partnerships to existing trademark services. Building custom USPTO integration carries technical debt disproportionate to user value, while offering nothing creates a product gap competitors exploit.

The key insight from competitor analysis: **no naming tool has been sued for trademark issues**—but several have been sued for unauthorized practice of law (UPL) claims when they crossed from "information" to "advice." The line is clearer than it appears: show data, never interpret it.

---

## The competitive reality check

### What existing tools actually do

**Namelix** (brandmark.io): Pure name generation with domain checking. No trademark features whatsoever. Their terms explicitly disclaim: "You are solely responsible for ensuring that your use of names does not infringe on any trademarks." They've operated since 2018 without trademark-related legal issues.

**Squadhelp**: Offers "Trademark Research" as a premium add-on ($99-$199). Crucially, they don't perform the research themselves—they partner with trademark attorneys who conduct proper clearance searches. Revenue model is affiliate/referral fees.

**Looka** (formerly Logojoy): Shows a "Check trademark availability" button that links directly to USPTO's TESS search. No interpretation, no analysis, no liability. Simple and effective.

**Brandroot**: Sells pre-made names with "Trademark Clearance Included"—but read the fine print: they've pre-cleared the names they're selling, not offering clearance as a service. Completely different liability profile.

**Novanym**: Similar to Brandroot. Pre-cleared inventory model avoids the per-search liability question entirely.

### What this tells us

The market has naturally segmented into three approaches:

1. **Avoid entirely** (Namelix, Looka): Link to USPTO, disclaim responsibility
2. **Outsource to professionals** (Squadhelp): Affiliate model with trademark attorneys
3. **Pre-clear inventory** (Brandroot, Novanym): Different business model entirely

Nobody is running their own trademark analysis engine because the liability/value ratio is terrible. The USPTO's own search is free and the interpretation requires legal expertise.

---

## Legal liability: What actually matters

### The UPL line is about interpretation, not data

The distinction that matters legally:

**Safe (information)**: "Here are USPTO records matching 'APEX' in Class 42"
**Unsafe (advice)**: "Your proposed name 'APEX TECH' is unlikely to conflict with existing marks"

The second statement applies legal judgment to specific facts—that's what lawyers do. Courts have consistently held that software providing legal conclusions (not just data) constitutes unauthorized practice of law.

**Key precedent**: LegalZoom has faced multiple UPL lawsuits and survived by carefully maintaining the "we provide forms and information, not advice" position. They've paid settlements and modified practices when they crossed the line.

### The negligent misrepresentation trap

More dangerous than UPL for a SaaS tool: if you provide a "trademark check" that misses an obvious conflict, and the user relies on it, you've potentially created a negligent misrepresentation claim. The user's damages (rebranding costs, legal fees, settlements) become your problem.

This is why **no major naming tool offers definitive trademark clearance**. The false negative problem is unsolvable without human expertise:

- Phonetic equivalents (LYFT vs LIFT)
- Translation equivalents (NOVA vs STAR in astronomy contexts)
- Visual similarity in logos
- Goods/services overlap analysis
- Common law (unregistered) marks

An automated system will miss these. A missed conflict could cost a startup $50K+ in rebranding. That's a lawsuit waiting to happen.

---

## Option-by-option analysis

### Option A: No trademark feature

**Liability**: Zero
**User value**: Low (but not zero—domain checking has value)
**Implementation**: Already done

**Verdict**: Viable baseline. Namelix proves this works commercially. But it's a differentiation opportunity left on the table.

### Option B: Basic USPTO search integration

**Liability**: Moderate-to-high depending on presentation
**User value**: Moderate (saves a click to USPTO)
**Implementation**: Medium complexity

The technical reality of USPTO integration in 2025-2026:

- TESS (Trademark Electronic Search System) has no official API
- The "TSDR" API only retrieves known marks by serial number—it can't search
- Bulk data downloads exist but require significant processing infrastructure
- Third-party APIs (Trademarkia, etc.) have unclear terms for commercial reuse

If you build this, you're either scraping (fragile, potentially TOS-violating) or licensing data (expensive, ongoing cost).

**Verdict**: The juice isn't worth the squeeze. High effort, moderate liability, moderate value.

### Option C: Third-party trademark API integration

**Liability**: Low (liability shifts to provider)
**User value**: High (professional-grade data)
**Implementation**: Low complexity

Providers like Corsearch, TrademarkNow, and Trademarkia offer APIs. Costs vary ($0.10-$1.00 per search typically).

The key advantage: their terms of service and professional liability insurance cover data accuracy. You're a pass-through, not the source.

**Verdict**: Good option if you can absorb or pass through the per-search cost. Works well as a premium feature.

### Option D: Attorney referral network

**Liability**: Minimal (referral only, no advice given)
**User value**: High (connects users to real expertise)
**Implementation**: Low complexity, but requires partnership development

This is Squadhelp's model. Benefits:

- Revenue opportunity (affiliate fees $50-200 per referral)
- High user value (actual trademark clearance)
- Clear liability boundary (attorney provides advice, not you)

The affiliate relationship with trademark filing services (LegalZoom, Trademark Engine, etc.) is straightforward and widely accepted.

**Verdict**: Best risk/reward ratio. Should be part of any trademark strategy.

### Option E: Educational content only

**Liability**: Zero
**User value**: Moderate
**Implementation**: Very low

Content approach:
- "What is trademark infringement?"
- "Why domain availability ≠ trademark availability"
- "When to hire a trademark attorney"
- Link to USPTO's free search

This positions EHG as helpful and trustworthy without taking on risk.

**Verdict**: Essential foundation regardless of other options chosen.

---

## Recommended approach: Conservative hybrid

### MVP (now)

1. **Educational modal** when names are generated:
   > "Domain availability doesn't guarantee trademark availability. Before investing in branding, consider a professional trademark search."

2. **Link to USPTO TESS** for self-service users

3. **Affiliate link to trademark filing service** (Trademark Engine, LegalZoom) for users who want professional help

**Cost**: Near zero
**Revenue potential**: Affiliate fees
**Liability**: Near zero

### V1 (if user demand warrants)

Add third-party trademark API integration as a **premium feature**:
- Show USPTO records matching the name
- Show similar phonetic matches (if API supports)
- **Never** interpret results—just display data
- Strong disclaimers: "This is informational only. Consult an attorney before proceeding."

**Cost**: Per-search API fees (build into premium pricing)
**Revenue potential**: Premium tier differentiation
**Liability**: Low (pass-through data only)

### What NOT to build

- Custom USPTO search engine (technical debt, liability)
- "Risk score" or "likelihood of conflict" features (UPL territory)
- "Safe to use" or "Clear" indicators (negligent misrepresentation)
- AI-powered trademark analysis (hallucination risk + liability)

---

## Specific implementation recommendations

### Disclaimer language that actually protects

Place this prominently, not buried in ToS:

> **TRADEMARK NOTICE**: This tool checks domain availability only. Domain availability does NOT indicate trademark availability. Before using any name for business purposes, you should:
> 1. Search the USPTO database at uspto.gov/trademarks
> 2. Consider hiring a trademark attorney for a comprehensive clearance search
> 3. Understand that unregistered "common law" trademarks may exist that don't appear in any database
>
> [Company name] does not provide legal advice and is not responsible for trademark conflicts.

### UI patterns that reduce liability

**Do**: "Check trademark availability →" (links to USPTO)
**Don't**: "Trademark status: Available" (implies you're providing clearance)

**Do**: "We found X USPTO records. View details →" (pure data)
**Don't**: "Low conflict risk" or "Likely available" (interpretation)

**Do**: "Get professional trademark search" (referral to attorney)
**Don't**: "Our analysis shows..." (implies expertise you don't have)

### Affiliate partnership options

Established programs with straightforward terms:

1. **LegalZoom** trademark filing: Commission on completed filings
2. **Trademark Engine**: Similar model, smaller company
3. **Trademark Factory**: Canadian focus, good for international users
4. **Local IP attorneys**: Direct referral fees (negotiate individually)

Expected affiliate revenue: $30-100 per converted referral

---

## Risk assessment matrix

| Approach | Liability Risk | User Value | Implementation Effort | Revenue Potential |
|----------|---------------|------------|----------------------|-------------------|
| A: Nothing | None | Low | None | None |
| B: Custom USPTO | High | Medium | High | Low |
| C: Third-party API | Low | High | Medium | Medium (premium) |
| D: Attorney referral | Minimal | High | Low | Medium (affiliate) |
| E: Education only | None | Medium | Very low | Low (trust building) |

**Recommended combination**: E + D for MVP, add C as premium feature if demand exists.

---

## The bottom line

The competitive landscape shows that successful naming tools have converged on similar strategies: avoid building custom trademark analysis, use education and referrals to address user needs, and maintain clear boundaries between "information" and "advice."

EHG should follow this proven pattern. The technical complexity and legal liability of custom trademark features far exceed their value. A simple combination of educational content, USPTO links, and attorney referral partnerships provides 90% of the user value at 10% of the risk.

The goal isn't to become a trademark clearance service—it's to help users understand they need one and connect them with professionals who can provide it.

---

*Response archived: 2026-01-04*
