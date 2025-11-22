# SD-STAGE5-DB-SCHEMA-DEPLOY-001: Deploy Stage 5 Database Schema

**Status**: Draft (LEAD phase)
**Priority**: Critical
**Category**: Database Infrastructure
**Created**: 2025-11-08
**UUID**: 8be347b7-b3ea-411e-acac-87f42a3ee0b4

## Executive Summary

Stage 5 code review identified **CRITICAL infrastructure gap**: Production code references 4 database tables that do not exist in the EHG application database (liapbndqlqxdcgpwntbv), causing runtime "relation does not exist" errors.

**Blocking Code**:
- `/mnt/c/_EHG/ehg/src/services/recursionEngine.ts:268-272` - INSERT into `recursion_events`
- `/mnt/c/_EHG/ehg/src/components/ventures/Stage5ROIValidator.tsx:95-99` - Query `recursion_events`
- E2E tests: `/mnt/c/_EHG/ehg/tests/e2e/recursion-workflows.spec.ts` - Cannot execute

## Missing Tables

1. **recursion_events** - Stage recursion tracking
2. **crewai_agents** - Agent registry
3. **crewai_crews** - Crew composition
4. **crewai_tasks** - Task definitions

## Migration Status

| Table | Migration File | Status |
|-------|---------------|---------|
| recursion_events | `/mnt/c/_EHG/ehg/supabase/migrations/20251103131938_create_recursion_events_table.sql` | ✅ Located |
| crewai_* | TBD (database agent will locate) | ⚠️ Pending |

## Objectives

1. Deploy all 4 missing tables to EHG database
2. Verify RLS policies configured
3. Verify performance indexes created
4. Validate runtime INSERT operations work
5. Execute E2E tests successfully (20/20 scenarios)
6. Document baseline and post-deployment state

## Next Steps

1. **LEAD**: Invoke database agent for schema deployment
2. **Database Agent**: Locate migration files, deploy tables, verify RLS
3. **LEAD**: Execute verification queries and E2E tests
4. **LEAD**: Approve SD for completion

## Links

- **Stage 5 Review**: `/docs/workflow/stage_reviews/stage-05/04_decision_record.md`
- **Database**: EHG (liapbndqlqxdcgpwntbv)
- **Repository**: `/mnt/c/_EHG/ehg/`
