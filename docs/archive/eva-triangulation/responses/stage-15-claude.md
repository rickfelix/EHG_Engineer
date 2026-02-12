# Stage 15 "Resource Planning" -- Claude Response

> Independent response to the Stage 15 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Resource generation from architecture | N/A (GUI is user stories) | None (all user-provided) | **5 Critical** | Without AI generation, users must manually determine team from architecture. The analysisStep is essential. | CLOSE | The LLM has layers with technologies, entity complexity, and sales model -- it can propose team composition. |
| Architecture → team mapping | N/A | None (no cross-stage) | **5 Critical** | Team doesn't reflect actual technology needs. React frontend with no frontend developer. PostgreSQL data layer with no DBA. | CLOSE | Each technology choice in Stage 14 implies specific skill requirements. |
| Phase-based staffing | N/A | Flat team (no phases) | **4 High** | Burn rate is constant across all phases. In reality, Foundation needs 3 people, Scale needs 15. Stage 16 financials are inaccurate without phase staffing. | CLOSE | Challenge: At BLUEPRINT, phase boundaries are fuzzy. But even rough phase-based headcount (Phase 1: 3, Phase 2: 8) dramatically improves Stage 16 projections. |
| Budget ceiling validation | N/A | None (no cost constraint) | **4 High** | A team plan costing $200K/mo for a venture with $50K LTV is incoherent. No validation catches this. | ADD | Stage 5 unit economics + Stage 11 GTM budget provide the ceiling. |
| Sales model → team composition | N/A | None | **3 Medium** | Self-serve venture planning enterprise sales team. Enterprise venture planning no sales engineers. | ADD | The sales model IS the team structure filter. |
| Skill gap severity enum | N/A | Free text | **2 Low** | Free text is flexible but can't be aggregated or compared. | ADAPT | Challenge: An enum (critical/high/medium/low) is cleaner for Stage 16 risk assessment, but free text works. |
| Hiring plan alignment to phases | N/A | Free text timeline | **3 Medium** | Hiring plan says "Q2" but roadmap Phase 2 starts in Q1. Misalignment. | ADAPT | Link hiring to Stage 13 phases, not arbitrary timelines. |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 5**: Unit economics (total budget context -- CAC × volume = marketing spend ceiling)
- **Stage 11**: GTM budget (total_monthly_budget, channel budgets -- non-engineering spend context)
- **Stage 12**: Sales model (self-serve → engineering-heavy; enterprise → sales-heavy)
- **Stage 12**: Customer journey touchpoint_types (automated → engineers; manual → sales/support)
- **Stage 13**: Product roadmap phases (Foundation/Growth/Scale) with milestones and priorities
- **Stage 13**: Typed deliverables (feature/infrastructure/integration/content → different skills)
- **Stage 14**: Architecture layers with technologies (React → frontend dev, Node.js → backend dev, PostgreSQL → DBA)
- **Stage 14**: data_entities[] with complexity (low/med/high → backend sizing signal)
- **Stage 14**: Security profile (compliance_targets → security engineer need)
- **Stage 14**: Additional layers (mobile → mobile dev, ML → ML engineer)

**Process (single LLM call)**:
1. **Technology → role mapping**: For each architecture layer technology, identify required role(s) and skill(s).
2. **Complexity → headcount**: data_entities complexity and component count drive backend team size.
3. **Sales model → non-engineering roles**: Enterprise → solutions engineers, SDRs. Self-serve → growth/product.
4. **Phase → staffing curve**: Map team to Stage 13 phases. Foundation = core team. Growth = expanded. Scale = full.
5. **Cost estimation**: Apply market rate ranges per role.
6. **Skill gap identification**: Compare required skills against "reasonable founding team" assumptions.
7. **Budget coherence**: Compare total team cost against Stage 5/11 economics.

**Output**: Complete Stage 15 data (team_members by phase, skill_gaps, hiring_plan aligned to phases, cost breakdown, budget_coherence)

### 3. Architecture → Team Mapping

**Each architecture layer technology implies roles:**

| Stage 14 Layer | Technology Example | Required Role | Skills |
|---------------|-------------------|---------------|--------|
| frontend | React, Next.js | Frontend Engineer | React, TypeScript, CSS |
| backend | Node.js, Python | Backend Engineer | Node.js/Python, API design |
| data | PostgreSQL, Redis | Backend/DBA | SQL, data modeling, caching |
| infra | AWS, Docker, K8s | DevOps/SRE | Cloud, CI/CD, containers |
| mobile (additional) | React Native, Swift | Mobile Engineer | Mobile dev, native APIs |
| security (cross-cutting) | SSO, SOC2 | Security Engineer | Auth systems, compliance |

**data_entities complexity → backend sizing**:
- Low complexity, < 10 entities: 1 backend engineer
- Medium complexity, 10-30 entities: 2 backend engineers
- High complexity, > 30 entities: 3+ backend engineers

The analysisStep should generate team_members from architecture, not require users to manually derive it.

### 4. Phase-Based Staffing Decision

**Add phase_ref to team_members. Stage 13 phases drive staffing curves.**

Current: flat team list (same team for entire venture).
Proposed: team_members grouped by phase.

```
Phase: "Foundation" (months 1-3)
  - 1 Fullstack Engineer (80%, $12K/mo)
  - 1 Backend Engineer (100%, $14K/mo)
  - 1 Designer (50%, $6K/mo)
  Total: 2.3 FTE, $32K/mo

Phase: "Growth" (months 4-6)
  - 2 Frontend Engineers (100%, $24K/mo)
  - 2 Backend Engineers (100%, $28K/mo)
  - 1 DevOps (100%, $15K/mo)
  Total: 5.0 FTE, $67K/mo
```

This makes Stage 16 financial projections dramatically more accurate -- burn rate changes by phase.

### 5. Budget Constraint Decision

**Add budget coherence warning (not hard block).**

The analysisStep should compare:
1. `total_monthly_cost` (from team) vs Stage 5 implied budget ceiling
2. Engineering vs non-engineering ratio vs Stage 12 sales model expectations
3. Total burn rate × timeline_months (Stage 13) vs available runway

If total_monthly_cost × 12 > available_funding_assumption, issue a coherence warning. Don't hard block -- the user may have funding information not captured in prior stages.

### 6. Skill Gap Enhancement

**Add severity enum. Keep mitigation as free text.**

Proposed severity values: `critical | high | medium | low`

| Severity | Definition |
|----------|-----------|
| critical | Cannot proceed with build without this skill. Must hire before Phase 1. |
| high | Significantly degrades quality. Hire within Phase 1. |
| medium | Can work around but adds risk. Hire by Phase 2. |
| low | Nice to have. Can upskill existing team. |

Critical and high skill gaps should map to hiring_plan entries.

### 7. Hiring Plan Alignment

**Link hiring_plan to Stage 13 phases.**

Current: timeline is free text ("Q2 2026").
Proposed: `phase_ref` references Stage 13 phases.

```javascript
hiring_plan: [{
  role: "Security Engineer",
  phase_ref: "Growth",  // Hire when Growth phase starts
  priority: "high",
  rationale: "SOC2 compliance required for enterprise tier",
}]
```

This ensures hiring timing aligns with roadmap phases rather than arbitrary dates.

### 8. Sales Model → Team Composition

**Map Stage 12 sales_model to team profile:**

| Sales Model | Engineering % | Sales/Marketing % | Key Non-Engineering Roles |
|-------------|:------------:|:-----------------:|--------------------------|
| self-serve | 70-80% | 20-30% | Growth marketer, content creator, product analyst |
| inside-sales | 50-60% | 40-50% | SDRs, inside sales reps, sales ops |
| enterprise | 40-50% | 50-60% | Account executives, solutions engineers, CSMs |
| hybrid | 55-65% | 35-45% | Mix of growth + inside sales |
| marketplace | 60-70% | 30-40% | Supply/demand ops, trust & safety, community |
| channel | 45-55% | 45-55% | Partner managers, channel sales, integrations |

The analysisStep uses these ratios as starting heuristics, adjusted by architecture complexity.

### 9. CLI Superiorities (preserve these)

- **Role + skills + allocation + cost**: Comprehensive team member definition. Allocation_pct is particularly useful for early-stage ventures where people wear multiple hats.
- **Skill gap analysis**: Explicit gap identification with severity and mitigation. Not common in venture planning tools.
- **Hiring plan**: Separates current team from future hires. Useful for phased growth.
- **Derived cost aggregation**: total_monthly_cost and avg_allocation give quick summary metrics.
- **MIN_TEAM_MEMBERS = 2**: Prevents single-person ventures (which lack the diversity for execution).
- **MIN_ROLES = 2**: Ensures at least two distinct capabilities.

### 10. Recommended Stage 15 Schema

```javascript
const TEMPLATE = {
  id: 'stage-15',
  slug: 'resource-planning',
  title: 'Resource Planning',
  version: '2.0.0',
  schema: {
    // === Updated: team_members with phase_ref ===
    team_members: {
      type: 'array', minItems: 2,
      items: {
        role: { type: 'string', required: true },
        skills: { type: 'array', minItems: 1, required: true },
        allocation_pct: { type: 'number', min: 1, max: 100, required: true },
        cost_monthly: { type: 'number', min: 0 },
        phase_ref: { type: 'string' },  // NEW: which phase this person joins
      },
    },

    // === Updated: skill_gaps with severity enum ===
    skill_gaps: {
      type: 'array',
      items: {
        skill: { type: 'string', required: true },
        severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'], required: true },  // CHANGED from free text
        mitigation: { type: 'string', required: true },
        architecture_ref: { type: 'string' },  // NEW: which Stage 14 layer/tech requires this
      },
    },

    // === Updated: hiring_plan with phase_ref ===
    hiring_plan: {
      type: 'array',
      items: {
        role: { type: 'string', required: true },
        phase_ref: { type: 'string' },  // NEW: replaces free-text timeline
        priority: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] },  // CHANGED from free text
        rationale: { type: 'string' },  // NEW: why this hire
      },
    },

    // === Existing derived (enhanced) ===
    total_headcount: { type: 'number', derived: true },
    total_monthly_cost: { type: 'number', derived: true },
    unique_roles: { type: 'number', derived: true },
    avg_allocation: { type: 'number', derived: true },

    // === NEW: budget coherence ===
    budget_coherence: {
      type: 'object', derived: true,
      properties: {
        monthly_burn: { type: 'number' },
        annual_burn: { type: 'number' },
        warnings: { type: 'array' },  // Budget vs economics coherence warnings
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (priority-ordered)

1. **P0: Add `analysisStep` for team generation**. Single LLM call consuming Stages 12/13/14. Maps architecture technologies to roles, data complexity to headcount, sales model to team profile.

2. **P0: Wire architecture layers → team roles**. Stage 14 technology selections directly drive required skills and roles.

3. **P1: Add `phase_ref` to team_members and hiring_plan**. Enables phase-based staffing curves for Stage 16 financial projections.

4. **P1: Add sales_model → team composition mapping**. Stage 12 sales model determines engineering vs sales/marketing ratio.

5. **P1: Change severity and priority to enums**. severity: critical/high/medium/low. priority: critical/high/medium/low. Enables aggregation and comparison.

6. **P2: Add `budget_coherence` derived field**. Compare team cost against Stage 5/11 economics. Warnings only.

7. **P2: Add `architecture_ref` to skill_gaps**. Links gaps to specific Stage 14 technologies.

8. **P3: Do NOT add user story/epic breakdown**. That's BUILD LOOP (Stages 17+), not BLUEPRINT.
9. **P3: Do NOT add detailed salary benchmarks**. Cost_monthly is sufficient at BLUEPRINT.

### 12. Cross-Stage Impact

| Change | Stage 16 (Financial Projections) | Stage 17+ (BUILD LOOP) | Overall Pipeline |
|--------|--------------------------------|----------------------|-----------------|
| Phase-based staffing | Burn rate per phase → accurate runway projections | Team composition known before build starts | Investors see realistic cost curve, not flat estimate |
| Architecture → team mapping | Technology costs + team costs = total engineering cost | Build team matches architecture needs | No "we hired React devs but chose Vue" mismatch |
| Sales model → team ratio | Marketing vs engineering spend → complete P&L picture | Non-engineering roles planned | Sales vs product investment proportional to model |
| Budget coherence | Validates team cost against economics | Build starts with validated budget | Prevents ventures from planning teams they can't afford |

### 13. Dependency Conflicts (with Stages 1-14 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 14 → 15 (layers/technologies → roles) | **OK** | Stage 14 has explicit technology per layer. Direct input to role mapping. |
| Stage 14 → 15 (data_entities complexity → backend sizing) | **OK** | Schema-Lite entities with complexity ratings. Directly usable. |
| Stage 14 → 15 (security profile → security role) | **OK** | compliance_targets indicate security expertise need. |
| Stage 13 → 15 (phases → staffing curve) | **OK** | Phase names and date ranges available for phase_ref. |
| Stage 12 → 15 (sales_model → team ratio) | **OK** | Clean 6-value enum. Maps to team profiles. |
| Stage 5 → 15 (unit economics → budget ceiling) | **OK** | LTV, payback, margins available for budget coherence check. |

### 14. Contrarian Take

**Arguing AGAINST phase-based staffing:**

1. **Phased staffing is fiction at BLUEPRINT.** We're asking ventures to predict exactly when they'll hire and at what cost, months before building. In reality, team composition evolves organically based on what actually gets built. Phase 1 might take 6 months instead of 3, pushing all subsequent hires.

2. **Architecture → team mapping is too deterministic.** "React frontend → hire React developer" assumes technology choice = hiring decision. In practice, a fullstack engineer covers frontend + backend. A founding CTO covers architecture + backend + devops. The mapping creates artificial role fragmentation.

3. **Budget coherence may be counterproductive.** A warning saying "your team costs exceed your runway" could prematurely kill innovative ventures that plan to raise funding. Stage 5 economics don't account for investment rounds.

4. **What could go wrong**: Ventures create impressive-looking resource plans that are pure speculation. The phased team structure creates a false sense of planning precision. Founders spend time debating Q2 hires instead of focusing on the Q1 build.

**Counter-argument**: Without phase-based staffing, Stage 16 projects a flat burn rate that's wrong from month 1. Without architecture mapping, the team has skills that don't match the technology. Even approximate phase staffing is dramatically better than a flat team assumption.

**Verdict**: Keep phase-based staffing (essential for Stage 16) but treat it as "rough guidance" not "hiring commitment." The analysisStep should generate conservative estimates that the user can refine.
