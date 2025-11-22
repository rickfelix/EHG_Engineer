# Stage 4 Competitive Intelligence: Practical Prompt Library

## Design Philosophy
- **Specific over generic**: Each prompt has a clear objective
- **Evidence-based**: Always require sources and quotes
- **Actionable**: Focus on insights we can act on
- **Efficient**: Optimize for token usage without sacrificing quality

---

## 1. RESEARCH AGENT PROMPTS

### 1.1 Competitor Discovery Prompt
```python
COMPETITOR_DISCOVERY = """
Analyze {competitor_url} to extract competitive intelligence.

Required Information:
1. Company Overview
   - Official company name
   - Primary product/service description (2-3 sentences)
   - Founded year and headquarters location (if available)

2. Product Features (find at least 10)
   - List specific features mentioned on their website
   - Note which features are highlighted as "key" or "unique"
   - Include both free and paid tier features

3. Pricing Structure
   - All pricing tiers and their costs
   - Billing periods (monthly/annual)
   - Any special offers or discounts
   - Free trial or freemium details

4. Target Market Indicators
   - Company size they target (startup/SMB/enterprise)
   - Industries they focus on
   - Geographic focus (if any)
   - Key use cases they promote

5. Technology Indicators
   - Any mentioned tech stack (look in jobs, about, blog)
   - Integrations they support
   - API availability
   - Mobile app availability

For each finding, note the specific URL where you found it.
If information is not available, explicitly state "Not found on website".

Output as structured JSON.
"""
```

### 1.2 Review Mining Prompt
```python
REVIEW_ANALYSIS = """
Analyze customer reviews for {competitor_name} from these sources:
- G2 Crowd
- Capterra
- TrustPilot
- App stores (if applicable)

Extract:
1. Overall ratings distribution (5-star, 4-star, etc.)
2. Top 5 things customers love (with frequency)
3. Top 5 complaints (with frequency)
4. Recent trend: improving, stable, or declining (last 6 months)

For complaints, categorize as:
- Feature gaps (missing functionality)
- Quality issues (bugs, performance)
- Service issues (support, onboarding)
- Pricing concerns
- Other

Include 2-3 actual review quotes for each major point.
Focus on reviews from the last 12 months.
"""
```

### 1.3 Social Proof & Market Presence
```python
MARKET_PRESENCE = """
Assess {competitor_name}'s market presence:

1. Social Proof Metrics
   - Customer logos displayed (list notable ones)
   - Case studies count and industries
   - Testimonials (count and type of companies)
   - Number of users/customers claimed

2. Marketing Presence
   - Blog posting frequency
   - Social media activity (LinkedIn, Twitter)
   - Webinar/event frequency
   - Content marketing topics (top 3 themes)

3. Growth Indicators
   - Recent funding (amount, investors, date)
   - Recent product launches
   - New market expansions
   - Partnership announcements

4. Market Share Estimates
   - Industry reports mentioning them
   - Comparison sites ranking
   - Estimated revenue (from Crunchbase, Owler, etc.)

Rate their market momentum: Declining / Stable / Growing / Rapid Growth
Justify your rating with 3 specific observations.
"""
```

---

## 2. ANALYSIS AGENT PROMPTS

### 2.1 Feature Gap Analysis
```python
FEATURE_GAP_ANALYSIS = """
Given the competitor analysis data for {competitors_list}, identify market gaps:

1. Universal Features (everyone has them)
   - List features that 80%+ of competitors offer
   - Mark which ones customers actually value (based on reviews)
   - Identify any that could be eliminated (low value, high complexity)

2. Differentiation Opportunities
   - Features only 1-2 competitors have that get positive reviews
   - Features customers request but no one offers yet
   - Features that exist but are poorly implemented everywhere

3. Underserved Segments
   - Customer types complaining about lack of options
   - Use cases that current solutions handle poorly
   - Price points that are unaddressed

For each gap, provide:
- Description of the opportunity
- Evidence (quotes from reviews or missing features)
- Difficulty to implement (Easy/Medium/Hard)
- Potential impact (Low/Medium/High)

Rank top 5 opportunities by (Impact × 1/Difficulty).
"""
```

### 2.2 Competitive Moat Assessment
```python
MOAT_ANALYSIS = """
For {competitor_name}, evaluate their competitive advantages:

1. Identify Their Moat Type
   □ Network Effects: Value increases with more users
   □ Switching Costs: Hard/expensive for customers to leave
   □ Brand: Strong reputation/trust in market
   □ Scale: Cost advantages from size
   □ IP/Technology: Patents or unique tech
   □ Data: Proprietary datasets others lack
   □ Regulatory: Licenses/certifications as barriers

2. Moat Strength Assessment
   For each moat identified:
   - How long would it take to replicate? (months/years)
   - How much would it cost? (rough estimate)
   - Is it getting stronger or weaker over time?

3. Vulnerability Analysis
   - Where is their moat weakest?
   - What changes could disrupt it?
   - How could we compete without copying?

4. Recommended Strategy
   Choose one:
   - Direct competition (if moat is weak)
   - Flanking (attack different segment)
   - Disruption (change the rules)
   - Partnership (if moat too strong)

Justify with specific evidence and reasoning.
"""
```

### 2.3 Positioning Opportunity Analysis
```python
POSITIONING_ANALYSIS = """
Based on competitor analysis, identify the optimal market position:

1. Current Market Map
   Create a 2x2 matrix using the most important dimensions:
   - Price (Low/High) vs Features (Simple/Complex)
   - Or: Speed vs Accuracy
   - Or: Self-Service vs Full-Service
   - Or: Specialized vs General

   Place each competitor on this map.

2. Open Positions
   - Which quadrants are empty or weak?
   - Why might these positions be unoccupied?
   - Would customers value this position?

3. Positioning Statement
   Complete: "Unlike [competitors], we are the only [category] that [unique value prop] for [target customer] who [need/want].

4. Validation
   - What evidence suggests this position would resonate?
   - What are the risks of this positioning?
   - How defensible is this position?

Provide 3 alternative positioning options ranked by attractiveness.
"""
```

---

## 3. SYNTHESIS AGENT PROMPTS

### 3.1 Executive Summary Generation
```python
EXECUTIVE_SUMMARY = """
Create a concise competitive intelligence summary:

COMPETITIVE LANDSCAPE SUMMARY
Company: {our_company}
Industry: {industry}
Analysis Date: {date}

1. Market Overview (2-3 sentences)
   - Total competitors analyzed: X
   - Market maturity: Nascent/Growing/Mature/Declining
   - Key trend observed

2. Top 3 Competitors
   For each:
   - Name, strength (what they do best)
   - Weakness (main vulnerability)
   - Threat level: Low/Medium/High

3. Strategic Opportunities (Top 3)
   For each:
   - Opportunity description (1 sentence)
   - Why it's valuable (1 sentence)
   - Implementation difficulty: Easy/Medium/Hard

4. Recommended Actions (Top 3)
   Specific, actionable steps we should take immediately.

5. Risks to Monitor
   - Biggest competitive threat
   - Market shift to watch

Keep entire summary under 500 words.
Make it scannable with bullet points.
"""
```

### 3.2 Deep Dive Report Structure
```python
DETAILED_REPORT = """
Structure a comprehensive competitive analysis report:

# COMPETITIVE INTELLIGENCE REPORT: {industry}

## 1. Executive Summary
[Use EXECUTIVE_SUMMARY prompt output]

## 2. Competitor Profiles
For each major competitor:
### {Competitor Name}
- **Overview**: [2 sentences]
- **Strengths**: [Top 3 with evidence]
- **Weaknesses**: [Top 3 with evidence]
- **Recent Momentum**: [Growing/Stable/Declining + why]
- **How to Compete**: [Specific strategy]

## 3. Feature Comparison Matrix
| Feature | Us | Comp A | Comp B | Comp C |
|---------|-------|---------|---------|----------|
[Auto-generate from data]

## 4. Market Opportunities
### Opportunity 1: {Name}
- **Description**: [What is it]
- **Evidence**: [Why we believe it exists]
- **Size**: [Rough estimate]
- **Our Advantage**: [Why we could win]
- **Implementation**: [High-level approach]

## 5. Strategic Recommendations
1. **Immediate** (Next 30 days)
2. **Short-term** (Next quarter)
3. **Long-term** (Next year)

## 6. Appendix
- Data sources
- Methodology notes
- Confidence levels
"""
```

---

## 4. SPECIALIZED PROMPTS

### 4.1 Pricing Intelligence
```python
PRICING_INTELLIGENCE = """
Analyze pricing strategies across competitors:

1. Pricing Models Identified
   - Subscription (monthly/annual)
   - Usage-based
   - Flat fee
   - Freemium
   - Enterprise/custom

2. Price Points Comparison
   Create a table:
   | Competitor | Starter | Professional | Enterprise |
   With actual prices or ranges

3. Value Metrics
   - What do they charge for? (seats, usage, features)
   - What's included in free tier?
   - Where are the upgrade triggers?

4. Pricing Psychology
   - Anchoring strategies observed
   - Discount patterns
   - Trial periods offered

5. Our Pricing Opportunity
   - Gap in the market (underserved price point)
   - Better value metric we could use
   - Psychological positioning opportunity

Recommend optimal pricing strategy with justification.
"""
```

### 4.2 Technology Stack Detection
```python
TECH_STACK_DETECTION = """
Identify technology choices of {competitor_name}:

Detection Methods:
1. Check job postings for mentioned technologies
2. Inspect website headers/meta tags
3. Look for technology partner badges
4. Check their engineering blog
5. Review their API documentation
6. Use BuiltWith or similar data

Categories to identify:
- Frontend framework
- Backend language/framework
- Database
- Cloud provider
- Key integrations
- Analytics tools
- Customer support tools

For each technology found:
- Confidence level (Confirmed/Likely/Possible)
- Source where identified
- Implications for their capabilities

Assess:
- Technical sophistication (Basic/Moderate/Advanced)
- Potential technical debt
- Scaling limitations
- Our technical advantages/disadvantages
"""
```

---

## 5. PROMPT OPTIMIZATION TIPS

### For GPT-5.1 Instant (Data Gathering)
```python
# Optimize for speed and cost
prompt_template = """
[SIMPLE CLEAR INSTRUCTION]
Required format: JSON
Required fields: [list]
Skip elaboration, just extract facts.
"""
```

### For GPT-5.1 Thinking (Analysis)
```python
# Optimize for reasoning depth
prompt_template = """
[CONTEXT SETTING]
Analyze step-by-step:
1. [First consideration]
2. [Second consideration]
Think about implications and connections.
Provide reasoning for each conclusion.
"""
```

### For Structured Output
```python
# Ensure Pydantic compatibility
prompt_template = """
Output MUST match this JSON structure:
{
  "field1": "string",
  "field2": ["array", "of", "strings"],
  "field3": {
    "nested": "object"
  }
}

No additional fields. No missing required fields.
"""
```

---

## 6. VALIDATION PROMPTS

### 6.1 Fact Checking
```python
FACT_CHECK = """
Review this competitive intelligence finding:
{finding}

Verify:
1. Is the source reliable?
2. Is the information current (within 12 months)?
3. Are the numbers/claims reasonable?
4. Any contradictions with other sources?

Confidence assessment:
- High: Multiple reliable sources confirm
- Medium: Single reliable source or multiple weak sources
- Low: Single weak source or conflicting information

Flag any concerns or discrepancies.
"""
```

### 6.2 Completeness Check
```python
COMPLETENESS_CHECK = """
Review this competitor analysis for {competitor_name}:
{analysis}

Check for missing critical information:
□ Pricing information
□ Key features list
□ Target market definition
□ Main value proposition
□ Competitive advantages
□ Notable customers/case studies
□ Recent updates/momentum

For any missing elements:
- Why might it be missing?
- Where could we find it?
- How critical is this gap?

Overall completeness score: __/10
Recommendations for follow-up research: [list]
"""
```

---

## Usage Guidelines

1. **Start Simple**: Use basic prompts first, add complexity only if needed
2. **Test with Real Data**: These prompts work best with actual competitor URLs
3. **Iterate Based on Results**: Refine prompts based on output quality
4. **Monitor Token Usage**: Track costs and optimize expensive prompts
5. **Version Control**: Keep track of which prompts work best for your industry

## Key Success Factors

- **Specificity beats complexity**: Clear, specific prompts > complex instructions
- **Examples improve quality**: Show the format you want
- **Evidence requirements**: Always ask for sources
- **Structured output**: Use JSON/tables for parseable results
- **Iterative refinement**: Start broad, then drill down