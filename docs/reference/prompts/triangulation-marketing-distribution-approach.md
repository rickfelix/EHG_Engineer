# Triangulation Research: Marketing Content Distribution Approach


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: api, sd, infrastructure, automation

## Unified Prompt for OpenAI and AntiGravity (Gemini)

**Date**: 2026-01-04
**SD**: SD-MARKETING-AUTOMATION-001
**Purpose**: Determine optimal approach for distributing marketing content to social platforms
**Method**: Independent AI analysis, then triangulation synthesis

---

## Context

EHG is a venture factory operated by a solo Chairman with AI assistance. We are building a Content Forge that generates marketing content (landing pages, emails, social posts) for ventures.

The next step is **distribution** - getting that content onto social platforms (LinkedIn, X/Twitter, Facebook, Instagram).

**Key Constraint**: Solo operator. Cannot maintain complex integrations or handle API breakages at 3am.

**Current State**:
- Content Forge will generate content with Brand Genome integration
- No distribution infrastructure exists yet
- Chairman currently manually posts to social platforms

---

## The Question

**What is the best approach for a solo operator to distribute AI-generated marketing content to social platforms?**

---

## Options to Evaluate

### Option A: Manual Copy/Paste
**Description**: Content Forge generates content → Chairman manually copies to each platform

| Aspect | Details |
|--------|---------|
| Effort to build | Near zero |
| Maintenance | Zero |
| User experience | Poor (tedious) |
| Reliability | 100% (human does it) |
| Cost | Chairman's time |

### Option B: Direct Platform APIs
**Description**: Integrate directly with LinkedIn, X, Facebook, Instagram APIs

| Aspect | Details |
|--------|---------|
| Effort to build | High (4+ weeks) |
| Maintenance | High (API changes, auth token refresh, rate limits) |
| User experience | Excellent (one-click post) |
| Reliability | Variable (APIs break, get deprecated) |
| Cost | Dev time + potential API costs |

### Option C: Third-Party Tool API (Buffer, Hootsuite, etc.)
**Description**: Integrate with Buffer/Hootsuite API - they handle platform complexity

| Aspect | Details |
|--------|---------|
| Effort to build | Medium (1-2 weeks) |
| Maintenance | Low (they maintain platform integrations) |
| User experience | Good (post via their dashboard or API) |
| Reliability | High (it's their core business) |
| Cost | $15-100/month per venture |

### Option D: Computer Use Automation (Claude/Playwright)
**Description**: Use Claude's computer use or Playwright MCP to automate the copy/paste

| Aspect | Details |
|--------|---------|
| Effort to build | Medium (2-3 weeks) |
| Maintenance | Medium (UI changes break automation) |
| User experience | Good (automated but visible) |
| Reliability | Medium (fragile to UI changes) |
| Cost | Compute time for automation |

### Option E: Hybrid (Generate + Review Queue + Manual Post)
**Description**: Build review queue with formatted content, Chairman clicks "Copy" and pastes

| Aspect | Details |
|--------|---------|
| Effort to build | Low (1 week) |
| Maintenance | Low |
| User experience | Acceptable (streamlined manual) |
| Reliability | High |
| Cost | Minimal Chairman time |

---

## Evaluation Criteria

Please evaluate each option against:

1. **Solo Operator Fit**: Can one person manage this without it becoming a burden?
2. **Time to Value**: How quickly can we start distributing content?
3. **Maintenance Burden**: What breaks and how often?
4. **Scalability**: Works for 1 venture? 5 ventures? 20 ventures?
5. **Cost Structure**: Fixed vs variable costs, hidden costs?
6. **Platform Coverage**: Which platforms can we reach?
7. **Compliance Risk**: Platform ToS violations, account bans?
8. **Future Flexibility**: Can we change approaches later?

---

## Specific Questions

1. **Which third-party tools have the most reliable APIs?** (Buffer, Hootsuite, Later, Sprout Social, etc.)

2. **What is the realistic maintenance burden of direct platform APIs?**
   - How often do LinkedIn/X/Facebook APIs break or change?
   - What's the auth token refresh burden?

3. **Is computer use automation mature enough for production?**
   - Claude computer use reliability?
   - Playwright MCP for social platforms?

4. **What do other solo operators / small teams actually use?**
   - Real-world patterns, not theoretical best practices

5. **Platform-specific considerations:**
   - LinkedIn: API restrictions for company pages vs personal?
   - X/Twitter: API pricing changes impact?
   - Facebook/Instagram: Meta API complexity?

---

## Your Analysis Tasks

### Task 1: Option Ranking
Rank the 5 options from best to worst for a solo operator managing 5-10 ventures.

### Task 2: Hidden Costs & Risks
For each option, identify hidden costs or risks not immediately obvious.

### Task 3: Recommended Approach
Provide a specific recommendation with:
- Phase 1: What to do NOW (next 2 weeks)
- Phase 2: What to add at 5 ventures
- Phase 3: What to consider at 20+ ventures

### Task 4: Platform Priority
Which platforms should we prioritize first and why?
- LinkedIn (B2B focus)
- X/Twitter (tech audience)
- Facebook (broad reach)
- Instagram (visual products)
- Other?

### Task 5: Tool Recommendations
If recommending Option C (third-party tool), which specific tool and why?

---

## Output Format

```markdown
# Marketing Distribution Approach Analysis

## Option Ranking (Best to Worst)
1. [Option] - [One-line reasoning]
2. ...

## Hidden Costs & Risks
### Option A
- Risk 1
- Risk 2

[Repeat for each option]

## Recommended Approach

### Phase 1 (Now - 2 weeks)
[Specific recommendation]

### Phase 2 (5 ventures)
[What to add]

### Phase 3 (20+ ventures)
[Long-term approach]

## Platform Priority
1. [Platform] - [Why first]
2. ...

## Tool Recommendation
[If applicable - specific tool with reasoning]

## Key Insight
[One paragraph summary of most important finding]
```

---

## Ground Rules

1. **Prioritize solo operator reality** - one person, limited time, no DevOps team
2. **Consider venture factory context** - this scales across multiple ventures
3. **Be specific** - name actual tools, cite actual API limitations
4. **Think maintenance** - what happens 6 months from now?

---

*Please provide your independent analysis. Your response will be triangulated with another AI's review.*
