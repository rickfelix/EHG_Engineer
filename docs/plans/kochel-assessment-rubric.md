# KOCHEL INTEGRATION ASSESSMENT RUBRIC

**Purpose**: Shared scoring framework for cross-validation between Claude (Anthropic) and Anti-Gravity (Gemini). Both AI systems will use this identical rubric to enable direct comparison of scores and findings.

**Version**: 1.0
**Date**: 2025-12-09

---

## SCORING SCALE (0-5)

| Score | Label | Definition |
|-------|-------|------------|
| **0** | Not Addressed / Broken | The dimension is either completely missing from the plan OR the approach is fundamentally flawed in a way that cannot be incrementally fixed. |
| **1** | Very Weak / High Risk | The dimension is acknowledged but the approach has critical gaps that would likely cause migration failure or data corruption. |
| **2** | Partial / Significant Gaps | Some aspects are addressed, but there are multiple important omissions or inconsistencies that need resolution before proceeding. |
| **3** | Adequate / Rough Edges | The approach is sound and would likely work, but there are minor gaps, ambiguities, or areas that need polish. Safe to proceed with awareness. |
| **4** | Strong / Minor Issues | The approach is well-designed with only minor issues that can be addressed during or after migration. High confidence in success. |
| **5** | Excellent / Production-Grade | The approach is comprehensive, coherent, and ready for production. No significant improvements needed. |

---

## SEVEN ASSESSMENT DIMENSIONS

### Dimension 1: Database-First Governance & Migrations

**What to evaluate**:
- Coherence: Do migrations form a logical sequence without conflicts?
- Reversibility: Are there rollback paths for schema changes?
- Normalization: Are SDs, PRDs, and governance objects stored in proper database tables (not filesystem)?
- No shadow schema: Does the code rely only on database-defined structures (no hardcoded schemas in TypeScript that diverge from DB)?

**Score 5 criteria**: Migrations are idempotent, have explicit rollback scripts, all governance objects normalized, clear foreign key relationships.

**Score 0 criteria**: Migrations would fail or corrupt data, governance relies on markdown files, schema spread across inconsistent locations.

---

### Dimension 2: LEO Protocol & Workflow Alignment

**What to evaluate**:
- 25-stage mapping: Does each stage correctly map to a phase (THE TRUTH, THE ENGINE, THE IDENTITY, THE BLUEPRINT, THE BUILD LOOP, LAUNCH & LEARN)?
- Role separation: Are EVA (advisor), LEAD (approver), PLAN (designer), EXEC (implementer) responsibilities clearly defined and not mixed?
- Quality gates: Are ≥85% pass rate gates defined at decision points (Stages 3, 5, 16)?
- SD requirements: Are sd_required stages (10+) correctly flagged?

**Score 5 criteria**: Perfect alignment with LEO protocol, clear quality gates, no role leakage.

**Score 0 criteria**: Stages incorrectly mapped, roles confused, no quality enforcement.

---

### Dimension 3: Artifact Vocabulary & `required_artifacts[]`

**What to evaluate**:
- Completeness: Are all 44 artifact types defined with clear purposes?
- Stage mapping: Does each stage's `required_artifacts[]` contain the correct artifact types?
- Metadata schemas: Do key artifacts (user_journey_map, route_map, epic_spec, etc.) have defined JSON schemas?
- Kochel integration: Are Vibe Planning Pyramid artifacts (L1, L2, L3) properly mapped to stages?

**Score 5 criteria**: All artifacts defined, schemas documented, stage mappings complete and consistent.

**Score 0 criteria**: Artifact types undefined, no stage mapping, schemas missing.

---

### Dimension 4: CrewAI / Sub-Agent Contracts

**What to evaluate**:
- Contract completeness: Are all 4+ CrewAI contracts (journey-map-generator-v1, route-map-suggester-v1, epic-planner-v1, build-planner-v1) fully specified?
- Input/Output schemas: Does each contract have request and response JSON schemas?
- Trigger logic: Is the hybrid trigger model (auto in LEAD/PLAN, manual in EXEC) clearly defined?
- Error handling: Are failure modes and retry logic addressed?

**Score 5 criteria**: All contracts have complete schemas, trigger logic defined, error handling specified.

**Score 0 criteria**: Contracts mentioned but not specified, no schemas, trigger logic unclear.

---

### Dimension 5: EHG vs EHG_Engineer Boundary Integrity

**What to evaluate**:
- Governance location: Are SDs, PRDs, protocol definitions, and backlog items in EHG_Engineer?
- Runtime location: Is venture lifecycle execution, UI components, and CrewAI invocation in EHG?
- No cross-contamination: Does the plan avoid putting runtime logic in governance repo or vice versa?
- Clear ownership labels: Are [EHG_Engineering], [Shared Services], [Venture App] labels consistently applied?

**Score 5 criteria**: Perfect boundary separation, clear ownership, no contamination.

**Score 0 criteria**: Boundaries confused, governance and runtime mixed, unclear ownership.

---

### Dimension 6: Migration Phase A Readiness

**What to evaluate**:
- Concrete deliverables: What can actually be executed today (not just planned)?
- Migration files: Do the SQL files exist and are they syntactically valid?
- Rollback plan: Is there a documented way to reverse Phase A if issues arise?
- Observability: Are logging, telemetry, or validation queries defined for migration verification?
- Dependencies: Are all prerequisite tables/functions in place?

**Score 5 criteria**: Migration files complete, rollback scripts exist, verification queries defined.

**Score 0 criteria**: No concrete migrations, just conceptual plan, no rollback consideration.

---

### Dimension 7: Risk Profile & Missing Dependencies

**What to evaluate**:
- Risk identification: Are the top 3-5 risks explicitly called out?
- Mitigation strategies: Does each risk have a mitigation or contingency?
- Dependency mapping: Are upstream dependencies (tables, functions, existing data) identified?
- Downstream impacts: Are consumers of the new schema identified?
- Blocking conditions: Are there any circular dependencies or unresolved prerequisites?

**Score 5 criteria**: Comprehensive risk register, mitigations defined, dependency map complete.

**Score 0 criteria**: No risks identified, no dependency analysis, blind spots likely.

---

## OVERALL VERDICT CATEGORIES

Based on the 7 dimension scores, assign one overall verdict:

| Verdict | Criteria |
|---------|----------|
| **Ready for Migration Phase A** | Average score ≥4.0, no dimension below 3 |
| **Ready with minor gaps** | Average score ≥3.5, no dimension below 2 |
| **Moderate risk - design refinement needed** | Average score ≥2.5, or any dimension at 1 |
| **High risk - significant design gaps** | Average score <2.5, or multiple dimensions at 1 |
| **Critical - fundamentally broken** | Any dimension at 0, or average score <1.5 |

---

## USAGE INSTRUCTIONS

1. **Anti-Gravity (Gemini)**: Use this rubric to score the Kochel Integration plan independently.
2. **Claude (Anthropic)**: Will use this same rubric for a separate assessment.
3. **Comparison**: Chairman will compare both assessments side-by-side using identical dimensions and scale.

**Independence is critical**: Each AI should assess based solely on the source files, not on knowledge of the other AI's assessment.

---

## SCORING TEMPLATE

```
DIMENSION                                          | SCORE | NOTES
---------------------------------------------------|-------|------------------
1. Database-First Governance & Migrations          |  ?/5  |
2. LEO Protocol & Workflow Alignment               |  ?/5  |
3. Artifact Vocabulary & required_artifacts[]      |  ?/5  |
4. CrewAI / Sub-Agent Contracts                    |  ?/5  |
5. EHG vs EHG_Engineer Boundary Integrity          |  ?/5  |
6. Migration Phase A Readiness                     |  ?/5  |
7. Risk Profile & Missing Dependencies             |  ?/5  |
---------------------------------------------------|-------|------------------
AVERAGE                                            |  ?/5  |
OVERALL VERDICT                                    |       |
```

---

## ASSESSMENT REPORT STRUCTURE

Produce a **structured written report** with the following sections:

### (A) EXECUTIVE SUMMARY
- One paragraph (3-5 sentences) on overall readiness and risk level for Kochel Integration
- A single **headline verdict** using one of these categories:
  - "Ready for Migration Phase A" (green light)
  - "Ready with minor gaps" (proceed with caution)
  - "Moderate risk - design refinement needed" (pause and fix)
  - "High risk - significant design gaps" (do not proceed)
  - "Critical - fundamentally broken" (major rework required)

### (B) READINESS SCORES
For each of the 7 dimensions:
1. **Score**: 0-5 (see rubric above)
2. **Justification**: 2-4 bullet points explaining why you chose that score

### (C) DETAILED FINDINGS BY DIMENSION
For each of the 7 dimensions, provide:
- **Strengths**: What the plan does well
- **Gaps / Issues**: What's missing, unclear, or problematic
- **Concrete Recommendations**: Specific changes to files, tables, or contracts (be precise with file paths and SQL changes where possible)

### (D) OVERALL RECOMMENDATION
Answer these questions directly:
1. **Is Kochel Integration safe to proceed to Migration Phase A?** (Yes/No/Conditional)
2. **If not fully ready, what are the 3 most important fixes to make first?**
3. **Estimated effort to address gaps** (hours/days, not detailed timeline)
