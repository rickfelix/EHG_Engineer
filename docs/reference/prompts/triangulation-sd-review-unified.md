# Triangulation Research: Strategic Directive Review

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, testing, e2e

## Unified Prompt for OpenAI and AntiGravity (Gemini)

**Date**: 2026-01-01
**Purpose**: Ground-truth validation and enhancement of Strategic Directives
**Method**: Independent AI review with codebase access, then triangulation

---

## Context

EHG has created 3 parent Strategic Directives (SDs) based on triangulation research. Each parent SD contains embedded child and grandchild SDs that will be extracted and executed through the LEO Protocol (LEAD→PLAN→EXEC workflow).

**Your task**: Review these SDs against the **actual codebase** and provide:
1. User stories for each child/grandchild SD
2. PRD details that should be incorporated
3. Reality checks on assumptions
4. Missing considerations

**Critical instruction**: Base ALL findings on the ground truth of the current codebase. Explore the actual files, database schema, and existing implementations. We need **reality**, not assumptions.

---

## Codebases to Explore

1. **EHG_Engineer** (current directory): LEO Protocol infrastructure, scripts, services
   - `src/services/` - Core services
   - `scripts/` - Automation and utilities
   - `database/` - Schema and migrations

2. **ehg** (sibling directory `../ehg/`): Main application
   - `src/components/` - UI components
   - `src/pages/api/` - API routes
   - `scripts/genesis/` - Genesis pipeline scripts
   - `src/components/ventures/workflow/` - Venture workflow orchestrator

3. **Database**: Supabase with tables including:
   - `strategic_directives_v2` - SD storage
   - `product_requirements_v2` - PRD storage
   - `scaffold_patterns` - Pattern library (~45 patterns)

---

## Strategic Directives to Review

### SD 1: SD-GENESIS-COMPLETE-001
**Title**: Genesis Completion - Simulation-Based Venture Development System

**Strategic Intent**: Enable rapid venture prototyping through a complete, operational Genesis simulation system.

**Current State** (from prior triangulation): ~45-50% complete. Architecture is sound, building blocks exist, but not connected into working end-to-end flow.

**Key Issues Identified**:
- `generatePRD()` in `ehg/scripts/genesis/genesis-pipeline.js` returns hardcoded template (not LLM-generated)
- PRDs created without parent SDs (orphan PRDs violate data model)
- Stage 16/17 scripts exist (`soul-extractor.js`, `production-generator.js`) but aren't wired to `CompleteWorkflowOrchestrator.tsx`
- No UI for simulation creation (CLI only)

**Child SDs** (7 total):
1. **SD-GENESIS-RESEARCH-001**: Answer 11 architecture questions, create TDD
2. **SD-GENESIS-DATAMODEL-001**: Fix PRD→SD relationship, add simulation support
3. **SD-GENESIS-PRD-001**: Replace stubbed PRD generation with LLM integration
4. **SD-GENESIS-STAGE16-17-001**: Wire soul-extractor and production-generator to orchestrator
5. **SD-GENESIS-UI-001**: Simulation creation wizard UI
6. **SD-GENESIS-UI-002**: Results review and ratification UI
7. **SD-GENESIS-E2E-001**: End-to-end testing suite

---

### SD 2: SD-VENTURE-SELECTION-001
**Title**: Configurable Venture Selection Framework with Chairman Settings

**Strategic Intent**: Enable systematic, data-driven venture selection that maximizes learning speed through incremental progress models.

**Key Concepts**:
- "Vending machine" model: Revenue from transaction #1 (not power-law)
- Pattern library maturity determines build feasibility
- Configurable Chairman Settings for risk tolerance and portfolio balance
- Glide path: Vending Machines → Micro-SaaS → Platform Bets

**Child SDs** (5 total):
1. **SD-VS-CHAIRMAN-SETTINGS-001**: Database + UI for configurable parameters
2. **SD-VS-SCORING-RUBRIC-001**: Automated scoring engine with configurable weights
3. **SD-VS-PATTERN-UNLOCK-001**: Add 4 critical patterns (StripeService, RBACMiddleware, useCRUD, BackgroundJob)
4. **SD-VS-RESEARCH-ARM-001**: Opportunity intake → scoring → presentation pipeline
5. **SD-VS-GLIDE-PATH-001**: Portfolio phase and maturity visualization

**Existing Infrastructure** to leverage:
- Venture Research Crew (CrewAI)
- Venture Quick Validation Crew (CrewAI)
- `scaffold_patterns` table (~45 patterns)
- Admin dashboard

---

### SD 3: SD-BLIND-SPOTS-001
**Title**: Blind Spots Research Orchestrator

**Strategic Intent**: Build infrastructure to scale EHG from 1 to 32+ concurrent ventures.

**Oracle's Warning**: "The math works, but the Psychology is the bottleneck."
- Management cliff at 8-12 ventures without EVA
- With EVA: 32+ ventures manageable

**Child SDs** (6 total, 17 grandchildren):

#### Child 1: SD-BLIND-SPOT-EVA-001 - EVA Operating System (Priority 1)
**Purpose**: Build EVA as the "Operating System" for managing 10-32 concurrent ventures

**Grandchildren**:
- SD-EVA-ARCHITECTURE-001: Core data model, event bus, decision router
- SD-EVA-DASHBOARD-001: Chairman view with health grid (32 tiles, Green/Yellow/Red)
- SD-EVA-ALERTING-001: P0/P1/P2 alerting with escalation
- SD-EVA-AUTOMATION-001: Auto-fix rules with guardrails

**Key Concepts**:
- Traffic Light Health Grid: Green (ignore), Yellow (watch), Red (intervene)
- Decision Classes: A (auto), B (approve), C (human)
- Management by Exception: Only surface deviations

#### Child 2: SD-BLIND-SPOT-LEGAL-001 - Legal/Compliance Foundation (Priority 2)
**Purpose**: Establish legal structure and reusable compliance patterns

**Grandchildren**:
- SD-LEGAL-STRUCTURE-001: Delaware Series LLC formation
- SD-LEGAL-TEMPLATES-001: Master ToS, Privacy Policy, DPA templates
- SD-COMPLIANCE-GDPR-001: Cookie consent, data deletion, export patterns

#### Child 3: SD-BLIND-SPOT-PRICING-001 - Pricing Pattern Library (Priority 3)
**Purpose**: Create reusable pricing patterns compatible with vending machine model

**Grandchildren**:
- SD-PRICING-PATTERNS-001: 4 core patterns (Flat, Tiered, Trial, Usage-Based)
- SD-PRICING-FRAMEWORK-001: Decision algorithm and wizard
- SD-PRICING-TESTING-001: A/B testing infrastructure

#### Child 4: SD-BLIND-SPOT-FAILURE-001 - Failure Learning System (Priority 4)
**Purpose**: Systematically capture and apply lessons from failed ventures

**Grandchildren**:
- SD-FAILURE-POSTMORTEM-001: Post-mortem template with EVA auto-draft
- SD-FAILURE-PATTERNS-001: Anti-pattern library (10 initial)
- SD-FAILURE-FEEDBACK-001: Kill → Post-mortem → Pattern update loop

**Depends on**: SD-BLIND-SPOT-EVA-001 (for auto-draft capability)

#### Child 5: SD-BLIND-SPOT-SKILLS-001 - Skills Inventory System (Priority 5)
**Purpose**: Track capabilities and guide skill acquisition decisions

**Grandchildren**:
- SD-SKILLS-INVENTORY-001: Capability ledger with evidence
- SD-SKILLS-FRAMEWORK-001: Build/Buy/Partner/Avoid decision tree

#### Child 6: SD-BLIND-SPOT-DEPRECATION-001 - Pattern Deprecation System (Priority 6)
**Purpose**: Manage pattern lifecycle and detect deprecation candidates

**Grandchildren**:
- SD-PATTERN-LIFECYCLE-001: State machine (Draft→Active→Deprecated→Archived)
- SD-PATTERN-METRICS-001: Usage tracking and health scoring

---

## Your Review Tasks

### Task 1: Codebase Ground-Truth Validation

For each parent SD and its children, explore the codebase and answer:

1. **What already exists?** List actual files, components, tables, services that are relevant
2. **What's the real completion percentage?** Based on actual code, not assumptions
3. **What assumptions in the SD are incorrect?** Flag anything that doesn't match reality
4. **What dependencies are missing?** Real technical dependencies not listed
5. **What's harder than described?** Implementation complexity reality check

### Task 2: User Stories for Each Child/Grandchild SD

For each child and grandchild SD, provide 3-5 user stories in this format:

```
As a [role], I want to [action], so that [benefit].

Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
```

Focus on:
- **Chairman** (solo operator managing portfolio)
- **EVA** (automated system taking actions)
- **Developer** (implementing patterns/features)
- **Venture** (as an entity in the system)

### Task 3: PRD Details to Incorporate

For each child SD, provide:

1. **Technical Requirements** (what must be built)
2. **Data Model Changes** (tables, columns, relationships)
3. **API Endpoints** (routes, methods, payloads)
4. **UI Components** (screens, interactions)
5. **Integration Points** (what connects to what)
6. **Edge Cases** (what could go wrong)
7. **Success Metrics** (how to measure completion)

### Task 4: Missing Considerations

What did we miss? Consider:
- Security implications
- Performance at scale (32 ventures)
- Migration paths for existing data
- Backward compatibility
- Testing strategies
- Operational concerns (monitoring, alerting)
- User experience flows

### Task 5: Priority and Sequencing Feedback

Review the proposed execution order and dependencies:
- Is the priority ranking correct?
- Are dependencies properly identified?
- Should anything be parallelized?
- Are there hidden dependencies we missed?

---

## Output Format

Structure your response as:

```markdown
# SD Review: [SD-ID]

## Ground-Truth Validation
### What Exists
- [file/component]: [description]

### Real Completion: X%
[Explanation]

### Incorrect Assumptions
1. [Assumption] → [Reality]

### Missing Dependencies
1. [Dependency]

### Complexity Reality Check
1. [Item]: [Why it's harder]

## User Stories

### [Child SD-ID]: [Title]

**Story 1**: As a [role]...

[Continue for each child/grandchild]

## PRD Details

### [Child SD-ID]: [Title]

**Technical Requirements**:
- ...

**Data Model**:
- ...

[Continue sections]

## Missing Considerations
1. ...

## Priority/Sequencing Feedback
- ...
```

---

## Ground Rules

1. **Explore before answering**: Actually read the code files before making claims
2. **Be specific**: Reference actual file paths, line numbers, table names
3. **Flag unknowns**: If you can't find something, say so explicitly
4. **Prioritize actionable feedback**: We need to implement this, not discuss theory
5. **Think like a solo operator**: EHG is one person managing 32 ventures with AI assistance

---

## Key Files to Explore

**Genesis Pipeline**:
- `ehg/scripts/genesis/genesis-pipeline.js` (look at generatePRD function ~line 190)
- `ehg/scripts/genesis/soul-extractor.js`
- `ehg/scripts/genesis/production-generator.js`
- `ehg/src/components/ventures/workflow/CompleteWorkflowOrchestrator.tsx`
- `ehg/src/pages/api/genesis/ratify.ts`

**Pattern Library**:
- `ehg/scripts/genesis/seed-patterns.js`
- Query `scaffold_patterns` table for current patterns

**Strategic Directives**:
- `EHG_Engineer/database/schema/` for SD schema
- Query `strategic_directives_v2` for current SDs

**Existing UI**:
- `ehg/src/components/admin/` for admin dashboard
- `ehg/src/components/ventures/` for venture management

---

*Please provide your independent analysis. Your response will be triangulated with another AI's review to identify consensus and disagreements.*
