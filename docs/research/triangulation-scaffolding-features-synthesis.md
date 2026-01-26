# Triangulation Synthesis: Scaffolding Feature Decisions


## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: api, unit, feature, sd

**Date**: 2026-01-04
**Topics**: Legal Infrastructure, Marketing Distribution, Trademark Guidance
**Sources**: Google/Gemini, OpenAI/ChatGPT, Anthropic/Claude

---

## Executive Summary

This synthesis consolidates triangulated research from three AI providers on three strategic questions facing EHG's venture factory. The unanimous consensus across all nine research documents supports a **"Buy/Partner, Don't Build"** strategy for all three capabilities.

### Verdicts at a Glance

| Topic | Google/Gemini | OpenAI/ChatGPT | Anthropic/Claude | **Consensus** |
|-------|---------------|----------------|------------------|---------------|
| **Legal Infrastructure** | SKIP (Partner) | SKIP (Curate) | SKIP (Buy perks) | **SKIP - Use existing tools** |
| **Marketing Distribution** | Option E (Hybrid) | Option C (Tools) | Option E (Hybrid) | **Third-party tools + review queue** |
| **Trademark Guidance** | Option E→C+D phased | Option B+D+E layered | Option A+E hybrid | **Education + Referral, no custom build** |

---

## Topic 1: Legal Infrastructure (Document Generator)

### The Question
Should EHG build a legal document generator for portfolio companies, or skip/buy existing solutions?

### Triangulated Findings

**All three providers unanimously recommend SKIP building.**

| Provider | Verdict | Key Rationale |
|----------|---------|---------------|
| **Google/Gemini** | SKIP - Hybrid Outsourcing | "Build is 15x more expensive"; UPL/liability risk; maintenance burden catastrophic for solo operator |
| **OpenAI/ChatGPT** | SKIP - Be facilitator | "Problem already served reasonably well"; EHG's constraints make this distracting and risky |
| **Anthropic/Claude** | SKIP - Buy perks | "The math doesn't work"; DoNotPay precedent ($193K FTC penalty); asymmetric risk |

### Convergent Insights

1. **Economics are definitively against building**:
   - Build cost: $15,000-60,000+ over 3 years
   - Buy cost: $3,600-4,000 for 20 ventures over 3 years
   - Ratio: Building costs 10-15x more

2. **Liability is existential**:
   - DoNotPay case: FTC levied $193,000 penalty for AI legal claims
   - UPL (Unauthorized Practice of Law) risk in multiple jurisdictions
   - LegalZoom survived only through careful "scrivener" positioning

3. **Industry pattern is clear**:
   - Y Combinator: Partners with Clerky, provides standard docs (SAFE)
   - Techstars: Perks model, no in-house generator
   - Antler: Law firm partnerships per jurisdiction
   - No major accelerator builds custom legal tools

4. **Multi-jurisdiction complexity**:
   - US (CCPA): Opt-out consent model
   - EU (GDPR): Opt-in consent model
   - Different requirements for Australia, UK
   - Termly/Iubenda already handle all this

### Recommended Action

**For EHG Internal Properties**:
- Purchase GetTerms Business Lifetime ($249) - covers all EHG web properties

**For Portfolio Companies**:
- Offer Termly Pro+ annual licenses ($180/year) as standard portfolio perk
- Maintain curated resource list (Common Paper for contracts, YC SAFE for fundraising)
- Negotiate bulk discounts as portfolio grows

**Estimated Annual Cost**: ~$3,600 for 20 ventures
**Build Alternative Cost**: ~$57,000+ over 3 years

---

## Topic 2: Marketing Distribution

### The Question
What's the best approach for distributing AI-generated marketing content across social platforms for a solo operator managing multiple ventures?

### Triangulated Findings

**All three providers rank Options C/E highest, Option D (Computer Use) lowest.**

| Provider | #1 Rank | #2 Rank | Worst | Key Insight |
|----------|---------|---------|-------|-------------|
| **Google/Gemini** | Option E (Hybrid) | Option C (Third-party) | Option D | "Headless" architecture: Airtable + Make + Ayrshare |
| **OpenAI/ChatGPT** | Option C (Third-party) | Option E (Hybrid) | Option D | Phased rollout: Manual → Buffer → Enterprise |
| **Anthropic/Claude** | Option E (Hybrid) | Option C (Third-party) | Option D | "3am rule" - what happens when it breaks? |

### Option Rankings Consensus

| Option | Average Rank | Recommendation |
|--------|--------------|----------------|
| **E: Hybrid (Generate + Queue + Review)** | 1.3 | Best for quality control |
| **C: Third-Party Tools (Buffer/Late)** | 1.7 | Best for scaling |
| **A: Manual Copy/Paste** | 3.0 | Only for Phase 1 |
| **B: Direct Platform APIs** | 4.0 | Too much maintenance |
| **D: Computer Use Automation** | 5.0 | Unanimously rejected |

### Convergent Insights

1. **Option D (Computer Use/Playwright) is unanimously rejected**:
   - Claude: 23% LinkedIn account restriction rate within 90 days
   - Gemini: "Detection Arms Race" - behavioral biometrics detect bots
   - OpenAI: "Novel but fragile; prone to breaking on UI changes"
   - All note explicit ToS violations on all platforms

2. **Direct Platform APIs (Option B) have hidden costs**:
   - X/Twitter: $200/month minimum for Basic tier
   - LinkedIn: Tokens expire every 60 days; personal profiles restricted
   - Meta: Weeks-to-months approval process
   - Maintenance: 5-10 hours/month debugging across platforms

3. **Third-party tools absorb complexity**:
   - Late/Publer: $33-66/month for 50-100 profiles
   - Buffer: ~$5/month per channel, proven reliability
   - These tools handle API changes, token refresh, rate limits

4. **Platform priority for B2B ventures**:
   - #1: LinkedIn (40% of B2B marketers rate as best lead source)
   - #2: X/Twitter (tech community, real-time engagement)
   - #3: Facebook (legitimacy, baseline presence)
   - #4: Instagram (only if consumer-facing ventures)

### Recommended Action

**Phase 1 (Now - 2 weeks): 1-3 ventures**
- Manual posting with simple review queue (Notion/Trello)
- Use native scheduling (Meta Business Suite for FB/IG)
- Cost: $0
- Goal: Establish baseline workflow

**Phase 2 (Month 2-6): 5-10 ventures**
- Implement Late Accelerate ($33/month) or Buffer
- Connect all venture profiles
- Weekly batch scheduling: 2-3 hours for all ventures
- Cost: $33-50/month

**Phase 3 (Month 6+): 20+ ventures**
- Expand to Late 100+ profiles (~$66/month)
- Or SocialPilot Ultimate ($170/month) if UI preference
- Consider custom Airtable + Make integration
- Cost: $66-170/month

**Key Principle**: "The 3am rule" - choose architecture where platform-level failures are someone else's problem.

---

## Topic 3: Trademark Guidance

### The Question
How should EHG's naming engine provide trademark guidance without incurring legal liability?

### Triangulated Findings

**All three providers recommend education + referral, not custom search.**

| Provider | MVP Recommendation | V1 Recommendation | Key Warning |
|----------|-------------------|-------------------|-------------|
| **Google/Gemini** | Option E (Education) | Option C+D (Partner + Referral) | "Certainty is a liability" |
| **OpenAI/ChatGPT** | Option E + link to USPTO | Option B+D+E (Search + Referral + Education) | Never say "Safe" or "Clear" |
| **Anthropic/Claude** | Option A+E (Skip + Educate) | Option D (Referral) | No competitor has been sued for TM issues |

### Option Analysis Consensus

| Option | Liability | User Value | Recommendation |
|--------|-----------|------------|----------------|
| **A: No Feature** | None | Low | Viable but leaves gap |
| **B: Custom USPTO Search** | HIGH | Medium | Avoid - "Builder's Trap" |
| **C: Partner API** | Low | High | Good for premium tier |
| **D: Attorney Referral** | None | High | Best risk/reward ratio |
| **E: Education Only** | None | Medium | Essential foundation |

### Convergent Insights

1. **Building custom search is the "Builder's Trap"**:
   - USPTO has no public search API (only TSDR retrieval)
   - Bulk data ingestion: Terabytes of XML, daily updates
   - Phonetic matching is complex (Lyft vs Lift, Nuvo vs Nuveau)
   - Data is 24-48 hours behind - critical gap

2. **The "False Confidence" trap**:
   - Exact-match fallacy misses phonetic equivalents
   - Users treat "No matches found" as "Safe to use"
   - Creates negligent misrepresentation liability
   - All providers: NEVER give a "Green Light"

3. **Competitors validate the approach**:
   - Namelix: No TM feature at all - avoids entirely
   - Looka: Links to USPTO, no in-tool results
   - Squadhelp: Partner with attorneys for clearance
   - No naming tool has been sued for trademark issues
   - Several have been sued for UPL when crossing into "advice"

4. **Attorney referral is revenue opportunity**:
   - LegalZoom affiliate: $50-150 per conversion
   - Direct attorney leads: $50-200 per qualified lead
   - Compliant models: Flat "marketing fee" or "per lead" (not % of legal fees)
   - ABA Model Rule 5.4 compliance required

### Recommended Action

**MVP (Immediate)**:
1. Educational modal when names are generated:
   > "Domain availability does NOT indicate trademark availability. Before investing in branding, search USPTO.gov and consider professional clearance."
2. "Check Trademark Availability" button → links to USPTO TESS
3. No in-tool results, no risk scoring

**V1 (Month 3+)**:
1. Add affiliate link to trademark filing service (LegalZoom, Trademark Engine)
2. "Professional Clearance Check" CTA: "Secure this brand for $99"
3. Establish attorney referral network for direct leads
4. Revenue: ~$50-100 per referral conversion

**What NOT to Build**:
- Custom USPTO search engine
- "Risk score" or "likelihood of conflict" features
- "Safe to use" or "Clear" indicators
- AI-powered trademark analysis

**Key Principle**: "Do not be the lawyer; be the bridge to the lawyer."

---

## Strategic Implications

### The "Solo Operator Constraint" Principle

All nine research documents converge on a meta-insight: **for a solo-operated venture factory, the maintenance burden of custom-built infrastructure in non-core competencies is catastrophic**.

The pattern across all three topics:
1. **Legal Infrastructure**: Regulatory changes require constant monitoring
2. **Marketing Distribution**: Platform API changes require constant adaptation
3. **Trademark Guidance**: USPTO data and legal standards require expertise

None of these are EHG's core competency. All have established, affordable third-party solutions.

### Build vs Buy Decision Framework

| If... | Then... |
|-------|---------|
| Problem is core to venture factory mission | Consider building |
| Established tools exist at <$500/month | Buy/Partner |
| Maintenance requires specialized expertise | Buy/Partner |
| Liability exposure exceeds value delivered | Skip or Buy |
| Solo operator must maintain indefinitely | Buy/Partner |

### Cost Summary

| Capability | Build Cost (3yr) | Buy Cost (3yr) | Savings |
|------------|------------------|----------------|---------|
| Legal Infrastructure | $57,000+ | ~$10,800 | 81% |
| Marketing Distribution | $50,000+* | ~$2,400 | 95% |
| Trademark Guidance | $30,000+** | ~$0*** | 100% |

*Direct API maintenance estimate
**Custom USPTO search build
***Affiliate model generates revenue

### Action Items

1. **Legal Infrastructure** (This Week)
   - [ ] Purchase GetTerms Business Lifetime ($249) for EHG properties
   - [ ] Create curated resource page (Termly, Common Paper, YC SAFE links)
   - [ ] Negotiate bulk Termly discount for portfolio use

2. **Marketing Distribution** (Next 2 Weeks)
   - [ ] Set up Late free tier for primary venture
   - [ ] Create Notion content calendar as review queue
   - [ ] Test end-to-end: Content Forge → Review → Schedule → Post

3. **Trademark Guidance** (This Month)
   - [ ] Add educational modal to naming engine
   - [ ] Add "Check USPTO" external link button
   - [ ] Research LegalZoom/Trademark Engine affiliate programs
   - [ ] Draft disclaimer language per templates in research

---

## Appendix: Source Documents

| Topic | Google/Gemini | OpenAI/ChatGPT | Anthropic/Claude |
|-------|---------------|----------------|------------------|
| Legal Infrastructure | `triangulation-legal-infrastructure-google-response.md` | `triangulation-legal-infrastructure-openai-response.md` | `triangulation-legal-infrastructure-claude-response.md` |
| Marketing Distribution | `triangulation-marketing-distribution-gemini-response.md` | `triangulation-marketing-distribution-openai-response.md` | `triangulation-marketing-distribution-claude-response.md` |
| Trademark Guidance | `triangulation-trademark-guidance-google-response.md` | `triangulation-trademark-guidance-openai-response.md` | `triangulation-trademark-guidance-claude-response.md` |

---

*Synthesis generated: 2026-01-04*
*Part of EHG Scaffolding Remediation Planning*
