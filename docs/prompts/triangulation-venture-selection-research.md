# Triangulation Research: Venture Selection Framework


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, unit, migration

**Created**: 2026-01-01
**Purpose**: Multi-AI research for configurable venture selection strategy
**Method**: Ground-truth triangulation (OpenAI + Gemini + Claude Code)

---

## Research Context

We are building a configurable venture selection framework for EHG (Enterprise Holding Group). The goal is to:

1. **Leverage existing patterns** while introducing new ones with each venture
2. **Prioritize ventures with incremental feedback** over power-law ventures
3. **Configure risk tolerance** that adjusts over time (Chairman Settings)
4. **Identify clone-able apps** from Replit/Lovable success stories
5. **Extract opportunities** from research papers

---

## Current Pattern Library (Ground Truth)

**Total: 45 patterns across 9 categories**

```
COMPONENT (17):
- DataTable, FormField, Modal, Card, LoadingSpinner
- search_with_filters, form_with_validation, loading_skeleton
- file_upload, data_visualization, notification_system
- error_boundary, empty_state, confirmation_dialog
- pagination, breadcrumb_navigation, stats_card

PAGE (8):
- ListPage, DetailPage, full_dashboard_page, crud_table_with_modal
- auth_flow_complete, settings_page, profile_page, landing_page

API_ROUTE (3): RestApiHandler, AuthMiddleware, api_endpoint
HOOK (3): useDebounce, useLocalStorage, useFetch
LAYOUT (3): DashboardLayout, AuthLayout, navigation_sidebar
SERVICE (3): CRUDService, AuthService, CacheService
DATABASE_TABLE (2): BasicTable, UserOwnedTable
RLS_POLICY (3): PublicReadPolicy, OwnRowsPolicy, rls_policy_template
MIGRATION (3): AddColumn, CreateJoinTable, database_table_migration
```

---

## OpenAI Research Prompt

```
# Research Request: Venture Selection Framework - Part 1

## Context
I'm building a configurable venture selection framework for a software holding company. We have:
- 45 development patterns (React components, hooks, services, database patterns)
- CrewAI research crews for venture analysis
- A 25-stage venture development workflow

## Research Topics

### Topic 1: Incremental Progress Business Models
Research the "vending machine experiment" concept and similar strategies. I'm looking for:
- Business models with linear (not power-law) growth curves
- Ventures where you see revenue/feedback from day one
- Anti-patterns: businesses where you need to be top 0.001% to succeed (e.g., blogging, YouTube)
- Frameworks for measuring incremental progress in businesses
- Academic or practitioner literature on this concept

Key insight: A vending machine generates revenue from transaction #1, unlike a blog that needs millions of readers.

### Topic 2: Pattern-Based Venture Selection
Given our existing patterns (React components, CRUD services, auth, data visualization), what types of applications are "close" to our capabilities?

Categories to explore:
- Internal tools / Admin dashboards (we have: DataTable, FormField, Modal, CRUD patterns)
- SaaS applications (we have: auth patterns, user-owned tables, RLS policies)
- Data visualization apps (we have: data_visualization, stats_card, pagination)
- Content management (we have: file_upload, form_with_validation)

For each category:
1. How many new patterns would we need to add?
2. What's the pattern "distance" from our current library?
3. What new patterns would this unlock for future ventures?

### Topic 3: Venture Selection Configurability
Design a configurable venture selection framework with adjustable parameters:
- Risk tolerance (0-100%)
- Pattern maturity threshold (what % of patterns must already exist?)
- Feedback speed requirement (how quickly must we see results?)
- Growth curve preference (linear vs exponential preference)
- Capital requirements threshold
- Time to first revenue threshold

How would a "Chairman Settings" configuration panel work?

## Output Format
For each topic:
1. Key findings with citations/sources
2. Actionable recommendations
3. Specific examples or case studies
4. Risk assessment
```

---

## Gemini Research Prompt

```
# Research Request: Venture Selection Framework - Part 2

## Context
I'm building a configurable venture selection framework. I have existing development patterns and want to identify opportunities to clone or improve upon successful applications.

## Research Topics

### Topic 1: Replit Success Stories
Research applications built with Replit that became successful:
- What types of apps succeeded? (SaaS, tools, games, utilities)
- What made them successful?
- What was their time to first revenue?
- Can they be cloned with improvements?
- What patterns do they use that we could add to our library?

Look for:
- Replit community showcases
- Apps featured in Replit documentation
- Indie hacker success stories involving Replit
- Apps that started on Replit and scaled

### Topic 2: Lovable Success Stories
Research applications built with Lovable (formerly GPT-Engineer) that became successful:
- Same questions as Replit above
- What are the most common types of apps built?
- Which ones generated revenue quickly?
- What improvements could be made?

### Topic 3: Clone Opportunity Framework
Create a framework for evaluating "clone" opportunities:
- How to identify apps worth cloning
- How to differentiate (improvement vectors)
- Legal/ethical considerations
- Market validation approaches
- Pattern extraction methodology

### Topic 4: Research Paper Opportunities
What recent research papers (2024-2025) could be commercialized?
- AI/ML papers with immediate application
- Developer tools research
- Productivity/automation research
- Papers that mention "prototype" or "proof of concept" that could become products

## Output Format
For each topic:
1. Specific examples with links/references
2. Pattern analysis (what patterns would we need?)
3. Revenue model assessment
4. Clone difficulty rating (Easy/Medium/Hard)
5. Improvement opportunities
```

---

## Claude Code Research Tasks

### Task 1: Pattern Library Maturity Analysis
Analyze current 45 patterns and assess:
- Which pattern categories are mature vs. immature?
- What "unlocks" are needed for common app types?
- Pattern coverage gaps

### Task 2: Venture-Pattern Mapping
Map common app types to required patterns:
- Admin dashboard: X patterns exist, Y needed
- SaaS app: X patterns exist, Y needed
- Marketplace: X patterns exist, Y needed
- Analytics tool: X patterns exist, Y needed

### Task 3: Incremental Progress Scoring Model
Design a scoring model for ventures based on:
- Feedback speed (1-10)
- Pattern distance (0-100%)
- Growth curve type (linear/exponential/power-law)
- Capital requirements (low/medium/high)
- Time to first revenue (days)

---

## Triangulation Questions

After all three AIs respond, triangulate on:

1. **Consensus on best clone opportunities** - What apps do all three recommend?
2. **Disagreements on pattern maturity** - Where do assessments differ?
3. **Framework recommendations** - What venture selection parameters are most important?
4. **Missing patterns** - What patterns are universally recommended to add?
5. **Risk assessments** - Where do risk perceptions differ?

---

## Expected Outputs

1. **Venture Selection Rubric** - Configurable scoring framework
2. **Pattern Maturity Map** - Current state + unlocks needed
3. **Clone Opportunity List** - Prioritized list of apps to clone
4. **Chairman Settings Spec** - Configuration parameters for venture selection
5. **Strategic Directives** - SDs to implement the framework
