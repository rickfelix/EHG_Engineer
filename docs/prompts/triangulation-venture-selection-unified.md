# Triangulation Research: Venture Selection Framework
## Unified Prompt for All Three AIs (OpenAI, Gemini, Claude Code)

**Created**: 2026-01-01
**Method**: All three AIs answer the same questions independently, then results are triangulated

---

## Context (Provide to All AIs)

We are building a **configurable venture selection framework** for EHG (Enterprise Holding Group), a software holding company that creates and operates multiple software ventures.

### Current Assets

**Pattern Library (45 development patterns):**
```
COMPONENT (17): DataTable, FormField, Modal, Card, LoadingSpinner,
  search_with_filters, form_with_validation, loading_skeleton,
  file_upload, data_visualization, notification_system, error_boundary,
  empty_state, confirmation_dialog, pagination, breadcrumb_navigation, stats_card

PAGE (8): ListPage, DetailPage, full_dashboard_page, crud_table_with_modal,
  auth_flow_complete, settings_page, profile_page, landing_page

API_ROUTE (3): RestApiHandler, AuthMiddleware, api_endpoint
HOOK (3): useDebounce, useLocalStorage, useFetch
LAYOUT (3): DashboardLayout, AuthLayout, navigation_sidebar
SERVICE (3): CRUDService, AuthService, CacheService
DATABASE_TABLE (2): BasicTable, UserOwnedTable
RLS_POLICY (3): PublicReadPolicy, OwnRowsPolicy, rls_policy_template
MIGRATION (3): AddColumn, CreateJoinTable, database_table_migration
```

**Research Infrastructure:**
- CrewAI-based "Venture Research Crew" for market intelligence
- CrewAI-based "Venture Quick Validation Crew" for rapid validation
- 25-stage venture development workflow with kill gates

**Tech Stack:** React, TypeScript, Supabase, Tailwind CSS, Next.js

---

## Research Questions (All AIs Answer All Questions)

### Section 1: Incremental Progress Business Models

**Q1.1**: Explain the "vending machine experiment" concept in business. What is the core principle of businesses that generate revenue from transaction #1 vs. businesses that require massive scale before any return?

**Q1.2**: Provide 5-10 examples of "incremental progress" business models in software/SaaS that share these characteristics:
- Revenue or measurable feedback from the first customer
- Linear (not power-law) growth curves
- Avoids "winner-take-all" market dynamics
- Low barrier to first revenue

**Q1.3**: What frameworks or metrics exist for measuring "feedback speed" and "growth linearity" in a business? How would you score a venture opportunity on these dimensions?

**Q1.4**: What are the anti-patterns? Give examples of businesses that require being in the top 0.001% to succeed (like blogging, YouTube, mobile apps in crowded categories).

---

### Section 2: Pattern Library Maturity & Clone-able Applications

**Q2.1**: Given our 45 patterns listed above, assess the pattern library maturity:
- Which categories are mature (ready to build apps)?
- Which categories have gaps?
- What's missing that would unlock new app types?

**Q2.2**: What types of applications can we build TODAY with 70%+ pattern coverage?
- List 5-10 app types
- For each, estimate the "pattern distance" (% of patterns we'd need to add)
- Rank by effort to complete

**Q2.3**: What patterns should we prioritize adding to unlock the most valuable app categories? Suggest 5-10 "unlock patterns" that would expand our capabilities significantly.

**Q2.4**: How should we think about "pattern debt" vs "pattern investment"? When does adding a new pattern for a venture make strategic sense vs. being a distraction?

---

### Section 3: Clone Opportunities (Replit, Lovable, Indie Hackers)

**Q3.1**: What successful applications have been built with Replit or Lovable (formerly GPT-Engineer) that could be cloned or improved?
- List 5-10 specific examples with what they do
- Estimate their revenue/traction if known
- Assess clone difficulty

**Q3.2**: What patterns do successful indie hacker projects typically use? Are there common "building blocks" across profitable small software businesses?

**Q3.3**: Create a "clone opportunity evaluation framework":
- How do you identify apps worth cloning?
- What improvement vectors exist (better UX, different market, feature gaps)?
- Legal/ethical considerations
- How to validate before building?

**Q3.4**: What recent (2024-2025) research papers or technical innovations could be commercialized as products? Identify 3-5 opportunities.

---

### Section 4: Configurable Venture Selection Framework

**Q4.1**: Design a "Chairman Settings" configuration for venture selection with adjustable parameters. What parameters matter most? Suggest defaults and ranges for:
- Risk tolerance
- Pattern maturity threshold
- Feedback speed requirement
- Growth curve preference
- Capital requirements
- Time to first revenue
- Any other parameters you recommend

**Q4.2**: How should venture selection change over time? If pattern library matures, should we take on more ambitious projects? Design a "glide path" model.

**Q4.3**: How do we balance:
- Ventures that leverage existing patterns (efficiency) vs.
- Ventures that introduce new patterns (capability building)?

**Q4.4**: Propose a scoring rubric for evaluating venture opportunities. What dimensions matter? How are they weighted?

---

### Section 5: Research Arm Strategy

**Q5.1**: How should a "research arm" be structured to continuously identify venture opportunities?
- What sources should it monitor?
- How often should it generate recommendations?
- What format should recommendations take?

**Q5.2**: How do we combine signals from:
- Academic research papers
- Successful indie hacker projects
- Replit/Lovable showcases
- Market trends
- Pattern library gaps

Into a unified opportunity score?

**Q5.3**: What would an "opportunity pipeline" look like that feeds the Chairman for venture selection decisions?

---

## Output Format

For each section, provide:
1. **Direct answers** to each question
2. **Specific examples** with names, links, or references where applicable
3. **Confidence level** (High/Medium/Low) for each answer
4. **Caveats or uncertainties**
5. **Recommendations** for further research if needed

---

## Triangulation Instructions (For Claude Code After Receiving All Responses)

After receiving responses from all three AIs, analyze:

1. **Consensus**: Where do all three agree?
2. **Disagreements**: Where do opinions differ? Which is most credible?
3. **Unique Insights**: What did only one AI identify?
4. **Blind Spots**: What did none of them address?
5. **Synthesis**: Create a unified recommendation combining the best of all three

---

## How to Use This Prompt

### For OpenAI (ChatGPT/GPT-4):
Copy everything from "## Context" through "## Output Format" and paste into ChatGPT.

### For Gemini (Google):
Copy everything from "## Context" through "## Output Format" and paste into Gemini.

### For Claude Code:
I will answer these questions based on codebase analysis plus web research.

### After All Three Respond:
Bring all responses back to Claude Code for triangulation synthesis.
