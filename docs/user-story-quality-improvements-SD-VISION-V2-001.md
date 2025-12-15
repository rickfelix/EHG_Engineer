# User Story Quality Improvements - SD-VISION-V2-001

**Date**: 2025-12-14
**SD**: SD-VISION-V2-001 (Vision Architecture v2 - EVA Integration)
**Issue**: PLAN-TO-EXEC handoff quality gate failing (67% average score, threshold 70%)

## Problem Analysis

8 user stories were failing quality gates with scores between 47-68%:

| Story | Original Score | Issues |
|-------|---------------|--------|
| US-002 | 60% | benefit_articulation (4%), story_independence_implementability (5%) |
| US-004 | 63% | given_when_then_format (4%), story_independence_implementability (5%) |
| US-005 | 62% | given_when_then_format (3%), story_independence_implementability (5%) |
| US-006 | 47% | given_when_then_format (1%), benefit_articulation (4%) |
| US-009 | 68% | story_independence_implementability (6%), benefit_articulation (7%) |
| US-010 | 62% | given_when_then_format (5%), story_independence_implementability (5%) |
| US-011 | 68% | story_independence_implementability (6%), benefit_articulation (7%) |
| US-012 | 68% | given_when_then_format (5%), story_independence_implementability (5%) |

## Root Causes

1. **Weak Benefit Articulation**: User benefits were too short (48-80 chars) and didn't explain WHY the feature matters
   - Example: "so that distributed agents do not duplicate work" (48 chars)
   - Needed: Specific value proposition explaining business impact

2. **Missing Given-When-Then Format**: Acceptance criteria lacked proper BDD format
   - Many had only 2 acceptance criteria
   - Criteria were not structured as "Given [context], When [action], Then [result]"

3. **Insufficient Implementation Context**: Stories lacked details for independent implementation
   - Missing database schema details
   - No reference to migration files or patterns
   - Unclear integration points

## Improvements Applied

### 1. Enhanced User Benefits (259-315 chars each)

**Before** (US-012):
```
so that distributed agents do not duplicate work (48 chars)
```

**After** (US-012):
```
Prevents duplicate work and race conditions in distributed multi-agent system by
implementing atomic task claiming with time-based leases, ensuring exactly-once
task execution even when multiple EVA agent instances are running concurrently
across different processes or servers. (278 chars)
```

### 2. Comprehensive Acceptance Criteria (4 per story, Given-When-Then format)

**Before** (US-006):
- 2 acceptance criteria
- No Given-When-Then format

**After** (US-006):
1. Given the Venture Stage Management migration runs, When completed, Then venture_stages table exists with all 25 stages pre-seeded with columns: id (1-25), stage_name, stage_number, description, typical_duration_days, gate_criteria (JSONB array of checkpoint requirements)
2. Given venture_stages exists, When the migration finishes, Then stage_gates table is created with columns: id, venture_id (FK), stage_id (FK), gate_status (pending/passed/failed), assessed_at, assessor_id (FK to users), assessment_notes (text), criteria_results (JSONB)
3. Given both tables exist, When a venture attempts stage transition, Then database function check_stage_gate_passed(venture_id, current_stage_id) returns boolean TRUE only if all gate criteria for that stage have gate_status="passed" in stage_gates table
4. Given stage gate data exists, When querying venture progress, Then join ventures + venture_stages + stage_gates shows current stage, gate pass/fail status, and blockers preventing advancement to next stage

### 3. Rich Implementation Context (JSONB objects)

Each story now includes:
- **migration_file**: Specific file path and naming convention
- **schema_design**: Table structure and purpose
- **indexes**: Performance optimization guidance
- **rls_policies**: Row-level security requirements
- **testing**: How to verify implementation
- **integration_points**: Dependencies and connections

Example (US-002):
```json
{
  "migration_file": "Create database/migrations/002_core_tables.sql with CREATE TABLE statements. Follow naming conventions: snake_case, singular table names avoided, use created_at/updated_at timestamps.",
  "schema_design": "portfolios: Primary entity for grouping ventures. ventures: Core business entity with JSONB for flexible metrics. crewai_crews: Registry of AI agent teams with capability metadata.",
  "indexes": "Add indexes: portfolios(owner_id), ventures(portfolio_id, stage_id, status), crewai_crews(crew_name, crew_type). Use GIN index for JSONB columns if querying nested fields.",
  "rls_policies": "Enable RLS on all tables. Create policies: portfolios (owner can CRUD), ventures (portfolio owner can CRUD), crewai_crews (admin only can write, all can read).",
  "rollback": "Create corresponding down migration: 003_rollback_core_tables.sql with DROP TABLE statements in reverse dependency order."
}
```

## Changes Summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Avg Benefit Length | 65 chars | 278 chars | +327% |
| Avg AC Count | 2.25 | 4 | +78% |
| Given-When-Then Format | Inconsistent | 100% compliant | ✅ |
| Implementation Context | Minimal | Rich JSONB | ✅ |

## Expected Score Improvements

Based on quality gate criteria:

1. **benefit_articulation**: Should improve from 4-7% to 15-20%
   - Minimum 15 chars: ✅ (all >250 chars)
   - Explains value: ✅ (all describe business impact)
   - Score boost: +10-15%

2. **given_when_then_format**: Should improve from 1-5% to 15-20%
   - All criteria use Given-When-Then: ✅
   - Specific and testable: ✅
   - Score boost: +10-15%

3. **story_independence_implementability**: Should improve from 5-6% to 15-20%
   - Rich implementation context: ✅
   - Database schema details: ✅
   - Integration points defined: ✅
   - Score boost: +10-15%

**Projected Average Score**: 75-85% (up from 67%)

## Next Steps

1. **Clear AI Cache**: Re-run quality gate with `AI_SKIP_CACHE=true` to force fresh assessment
2. **Re-validate Handoff**: Run `npm run handoff:validate SD-VISION-V2-001`
3. **Monitor Scores**: Verify all 8 stories now score ≥70%
4. **Proceed to EXEC**: If validation passes, handoff should be approved

## Tool Created

**Script**: `/mnt/c/_EHG/EHG_Engineer/scripts/fix-user-stories-quality.js`

This reusable script:
- Fetches low-scoring stories from database
- Applies INVEST criteria improvements
- Updates user_benefit, acceptance_criteria, implementation_context
- Provides before/after metrics
- Can be adapted for future SDs with quality issues

## Lessons Learned

1. **User Benefit Length Matters**: Quality gate strongly weights benefit length and specificity
2. **Given-When-Then is Mandatory**: BDD format essential for testability scoring
3. **Context Engineering Works**: Rich implementation_context dramatically improves independence score
4. **4 ACs Sweet Spot**: 4 acceptance criteria per story provides good coverage without bloat
5. **Database Stories Need Schema Details**: DBA-focused stories especially need table structures, indexes, RLS policies

## References

- Quality Gate: `/mnt/c/_EHG/EHG_Engineer/src/quality-gates/plan-to-exec-handoff.ts`
- Stories Agent Guide: Agent instructions (in context)
- INVEST Criteria: Industry standard for user story quality
