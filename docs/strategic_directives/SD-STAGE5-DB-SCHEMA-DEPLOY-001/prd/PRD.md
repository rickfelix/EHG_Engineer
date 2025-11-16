# PRD: Deploy Stage 5 Database Schema & Verification

**SD**: SD-STAGE5-DB-SCHEMA-DEPLOY-001
**UUID**: 8be347b7-b3ea-411e-acac-87f42a3ee0b4
**Status**: Draft (LEAD phase)
**Priority**: Critical
**Target Database**: EHG (liapbndqlqxdcgpwntbv)
**Repository**: /mnt/c/_EHG/ehg/

---

## Problem Statement

Stage 5 code review identified **CRITICAL infrastructure gap**: Production code at `/mnt/c/_EHG/ehg/src/services/recursionEngine.ts` and `/mnt/c/_EHG/ehg/src/components/ventures/Stage5ROIValidator.tsx` attempts to INSERT and SELECT from database tables that **do not exist**, causing runtime "relation does not exist" errors.

**Blocking Impact**:
- E2E tests cannot run: `tests/e2e/recursion-workflows.spec.ts`
- Stage 5 recursion tracking non-functional
- CrewAI agent registry unavailable
- Production runtime errors

## Objectives

1. **Deploy Missing Tables**: Deploy 4 tables (recursion_events, crewai_agents, crewai_crews, crewai_tasks) to EHG application database
2. **Configure RLS**: Ensure Row Level Security policies are properly configured for all tables
3. **Create Indexes**: Deploy performance indexes per migration specifications
4. **Runtime Validation**: Verify production code can successfully INSERT records
5. **E2E Verification**: Execute E2E tests to confirm end-to-end functionality
6. **Documentation**: Document baseline state and post-deployment verification results

## Technical Scope

### Missing Tables

| Table | Migration File | Status |
|-------|---------------|---------|
| **recursion_events** | `/mnt/c/_EHG/ehg/supabase/migrations/20251103131938_create_recursion_events_table.sql` | ✅ Located |
| **crewai_agents** | TBD (database agent will locate) | ⚠️ Pending |
| **crewai_crews** | TBD (database agent will locate) | ⚠️ Pending |
| **crewai_tasks** | TBD (database agent will locate) | ⚠️ Pending |

### Required Columns (Minimum)

**recursion_events**:
- id (PRIMARY KEY)
- venture_id (FK to ventures)
- from_stage (integer)
- to_stage (integer)
- trigger_type (text)
- created_by (text)
- created_at (timestamp)

**crewai_agents**:
- id (PRIMARY KEY)
- name (text)
- role (text)
- agent_type (text)
- status (text)
- created_at (timestamp)

**crewai_crews** and **crewai_tasks**: Schema TBD (database agent will determine)

### RLS Requirements

Each table must have:
- ✅ RLS enabled
- ✅ SELECT policy for authenticated users
- ✅ INSERT policy for authenticated users (or appropriate role)
- ✅ UPDATE/DELETE policies as needed

### Index Requirements

- ✅ Primary key indexes
- ✅ Foreign key indexes (e.g., recursion_events.venture_id)
- ✅ Performance indexes on frequently queried columns

## Acceptance Criteria

### AC1: Tables Exist
```sql
SELECT
  to_regclass('public.recursion_events') IS NOT NULL AS recursion_events_exists,
  to_regclass('public.crewai_agents') IS NOT NULL AS crewai_agents_exists,
  to_regclass('public.crewai_crews') IS NOT NULL AS crewai_crews_exists,
  to_regclass('public.crewai_tasks') IS NOT NULL AS crewai_tasks_exists;
-- Expected: All return TRUE
```

### AC2: Minimal Columns Present
```sql
-- recursion_events columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'recursion_events'
AND column_name IN ('id','venture_id','from_stage','to_stage','trigger_type','created_by');
-- Expected: 6 rows

-- crewai_agents columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'crewai_agents'
AND column_name IN ('id','name','role','agent_type','status','created_at');
-- Expected: 6 rows
```

### AC3: RLS Policies Present
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('recursion_events','crewai_agents','crewai_crews','crewai_tasks')
ORDER BY tablename, policyname;
-- Expected: At least 1 policy per table (4+ total)
```

### AC4: Indexes Created
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('recursion_events','crewai_agents')
ORDER BY tablename, indexname;
-- Expected: At least primary key indexes + foreign key indexes
```

### AC5: Runtime Verification
```bash
# Test INSERT operation (via application code or psql)
cd /mnt/c/_EHG/ehg
npx playwright test tests/e2e/recursion-workflows.spec.ts --reporter=line
# Expected: 20/20 scenarios pass (or at least no "relation does not exist" errors)
```

### AC6: Evidence Logged
- ✅ Baseline verification document created: `/docs/strategic_directives/SD-STAGE5-DB-SCHEMA-DEPLOY-001/prd/baseline-verification.md`
- ✅ Post-deployment verification document created: `/docs/strategic_directives/SD-STAGE5-DB-SCHEMA-DEPLOY-001/prd/deployment-verification.md`

### AC7: Governance Link
- ✅ Stage 5 review decision record updated to reference this SD
- ✅ Migration file paths documented in SD metadata

## Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| Migration file: recursion_events | Technical | ✅ Ready | Located at `/mnt/c/_EHG/ehg/supabase/migrations/20251103131938_create_recursion_events_table.sql` |
| Migration files: crewai_* | Technical | ⚠️ Pending | Database agent will locate or create |
| EHG database connection | Technical | ⚠️ Blocked | Connection error: "Tenant or user not found" |
| Database agent invocation | Process | ⚠️ Pending | Required to resolve connection and deploy schema |

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration files not found for CrewAI tables | High | Database agent will locate in `/mnt/c/_EHG/ehg/database/migrations/` or create new migrations |
| RLS policies block runtime operations | Medium | Database agent will design proper policies or document manual steps for Supabase dashboard execution |
| Database connection issues | High | Database agent will diagnose connection string, verify credentials, use established `createDatabaseClient` pattern |
| Existing data conflicts | Low | Baseline verification confirms tables do not exist (clean slate) |

## Blocked Items

**BLOCKER**: Database connection error encountered during baseline verification:
- Error: "Tenant or user not found" (FATAL: XX000)
- Connection string: `EHG_POOLER_URL` environment variable
- Database: EHG (liapbndqlqxdcgpwntbv)

**Resolution Path**:
1. Invoke database agent: `node lib/sub-agent-executor.js DATABASE 8be347b7-b3ea-411e-acac-87f42a3ee0b4`
2. Database agent will diagnose connection issue
3. Database agent will use established connection pattern from `scripts/lib/supabase-connection.js`
4. Database agent will locate/create migration files
5. Database agent will deploy tables with RLS and indexes
6. Re-run verification scripts

## Migration Approach

**Database-First Pattern** (per LEO Protocol):
1. ✅ STOP on database connection error (no trial-and-error)
2. ✅ Invoke database agent immediately
3. ⏳ Database agent diagnoses root cause
4. ⏳ Database agent provides proper connection pattern
5. ⏳ Database agent locates migration files
6. ⏳ Database agent deploys schema changes
7. ⏳ Database agent verifies RLS and indexes
8. ⏳ Run post-deployment verification

## Verification Scripts

**Baseline (pre-deployment)**:
- Script: `/mnt/c/_EHG/EHG_Engineer/scripts/verify-stage5-baseline.mjs`
- Status: ❌ Blocked by connection error
- Output: Will be saved to `/docs/strategic_directives/SD-STAGE5-DB-SCHEMA-DEPLOY-001/prd/baseline-verification.md`

**Deployment (post-deployment)**:
- Script: `/mnt/c/_EHG/EHG_Engineer/scripts/verify-stage5-deployment.mjs` (to be created by database agent)
- Output: Will be saved to `/docs/strategic_directives/SD-STAGE5-DB-SCHEMA-DEPLOY-001/prd/deployment-verification.md`

## Next Steps

1. **IMMEDIATE**: Invoke database agent to resolve connection error and deploy schema
   ```bash
   node lib/sub-agent-executor.js DATABASE 8be347b7-b3ea-411e-acac-87f42a3ee0b4
   ```

2. **Database Agent Tasks**:
   - Diagnose and resolve connection error
   - Locate all 4 migration files (or create if missing)
   - Deploy tables to EHG database
   - Configure RLS policies
   - Create performance indexes
   - Provide post-deployment verification script

3. **LEAD Verification**:
   - Run post-deployment verification script
   - Execute E2E tests
   - Approve SD for completion

---

**References**:
- Stage 5 Review: `/docs/workflow/stage_reviews/stage-05/04_decision_record.md`
- Blocking Code: `/mnt/c/_EHG/ehg/src/services/recursionEngine.ts:268-272`
- E2E Tests: `/mnt/c/_EHG/ehg/tests/e2e/recursion-workflows.spec.ts`
- Migration File: `/mnt/c/_EHG/ehg/supabase/migrations/20251103131938_create_recursion_events_table.sql`
