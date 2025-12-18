# SD-HARDENING-V1-001: User Stories Summary

**SD Title**: RLS Security Hardening (ehg repo)
**Priority**: CRITICAL
**Security Impact**: Fixes unauthorized access to chairman-only data
**Total Stories**: 6
**Story Points**: 19

---

## Security Context

**CRITICAL FINDING**: The `chairman_unified_decisions.sql` migration applies `USING(true)` for authenticated users, exposing sensitive executive decisions to ANY logged-in user.

**Specific Issues**:
1. `chairman_decisions` table: INSERT policy has `WITH CHECK (true)`
2. `venture_artifacts`: SELECT/MODIFY policies use `USING(true)`
3. `venture_stage_work`: All operations use `USING(true)`

**Migration to Fix**: `ehg/supabase/migrations/20251216000001_chairman_unified_decisions.sql`

---

## User Stories Overview

### Phase 1: Foundation (2 SP)

#### US-001: Create fn_is_chairman() database function
- **Priority**: Critical
- **Story Points**: 2
- **Purpose**: Reusable database function to identify chairman for RLS policies
- **Acceptance Criteria**: 5 scenarios (chairman TRUE, regular user FALSE, anonymous FALSE, service role TRUE, function created)
- **Key Deliverable**: `fn_is_chairman()` function with SECURITY DEFINER
- **Test Path**: `tests/integration/rls/US-001-fn-is-chairman.spec.ts`

**INVEST Validation**:
- **Independent**: Yes - Foundation function, no dependencies
- **Negotiable**: No - Critical security requirement
- **Valuable**: Yes - Enables all subsequent RLS hardening
- **Estimable**: Yes - 2 SP (database function)
- **Small**: Yes - Single function creation
- **Testable**: Yes - 4 test scenarios defined

---

### Phase 2: Chairman Table Hardening (3 SP)

#### US-002: Harden chairman_decisions RLS policies
- **Priority**: Critical
- **Story Points**: 3
- **Purpose**: Protect chairman-only decisions from unauthorized access
- **Acceptance Criteria**: 6 scenarios (chairman SELECT, regular user blocked, INSERT/UPDATE/DELETE policies)
- **Key Deliverable**: Replace `USING(true)` with `fn_is_chairman()` in all policies
- **Test Path**: `tests/e2e/rls/US-002-chairman-decisions-rls.spec.ts`
- **Depends On**: US-001

**INVEST Validation**:
- **Independent**: Depends on US-001 only
- **Negotiable**: No - Critical security fix
- **Valuable**: Yes - Protects sensitive executive decisions
- **Estimable**: Yes - 3 SP (RLS policy updates)
- **Small**: Yes - Single table hardening
- **Testable**: Yes - 6 test scenarios (SELECT, INSERT, UPDATE, DELETE, chairman, regular user)

---

### Phase 3: Venture Tables Hardening (9 SP)

#### US-003: Harden venture_decisions RLS policies
- **Priority**: Critical
- **Story Points**: 3
- **Purpose**: Scope venture decisions by ownership
- **Acceptance Criteria**: 6 scenarios (owner access, chairman access, cross-venture blocking)
- **Key Deliverable**: RLS policies with venture ownership check + chairman override
- **Test Path**: `tests/e2e/rls/US-003-venture-decisions-rls.spec.ts`
- **Depends On**: US-001

**INVEST Validation**:
- **Independent**: Depends on US-001 only (can run parallel to US-002)
- **Negotiable**: No - Critical for multi-user security
- **Valuable**: Yes - Prevents cross-venture data leakage
- **Estimable**: Yes - 3 SP (similar to US-002)
- **Small**: Yes - Single table hardening
- **Testable**: Yes - 6 test scenarios (ownership, chairman, cross-venture)

#### US-004: Scope venture_artifacts RLS policies
- **Priority**: High
- **Story Points**: 3
- **Purpose**: Scope venture artifacts (PRDs, schemas) by ownership
- **Acceptance Criteria**: 5 scenarios (owner access, chairman access, INSERT/UPDATE/DELETE)
- **Key Deliverable**: RLS policies with venture ownership check
- **Test Path**: `tests/e2e/rls/US-004-venture-artifacts-rls.spec.ts`
- **Depends On**: US-001

**INVEST Validation**:
- **Independent**: Depends on US-001 only (can run parallel to US-002, US-003)
- **Negotiable**: Yes - Could defer if artifacts not in production yet
- **Valuable**: Yes - Protects sensitive PRD and schema data
- **Estimable**: Yes - 3 SP (same pattern as US-003)
- **Small**: Yes - Single table hardening
- **Testable**: Yes - 5 test scenarios

#### US-005: Scope venture_stage_work RLS policies
- **Priority**: High
- **Story Points**: 3
- **Purpose**: Scope venture stage work (LEAD/PLAN/EXEC tasks) by ownership
- **Acceptance Criteria**: 5 scenarios (owner access, chairman access, INSERT/UPDATE/DELETE)
- **Key Deliverable**: RLS policies with venture ownership check
- **Test Path**: `tests/e2e/rls/US-005-venture-stage-work-rls.spec.ts`
- **Depends On**: US-001

**INVEST Validation**:
- **Independent**: Depends on US-001 only (can run parallel to US-002, US-003, US-004)
- **Negotiable**: Yes - Could defer if stage work not in production yet
- **Valuable**: Yes - Protects workflow and task data
- **Estimable**: Yes - 3 SP (same pattern as US-003, US-004)
- **Small**: Yes - Single table hardening
- **Testable**: Yes - 5 test scenarios

---

### Phase 4: Validation (5 SP)

#### US-006: Create RLS regression test suite
- **Priority**: High
- **Story Points**: 5
- **Purpose**: Automated validation to prevent future RLS regressions
- **Acceptance Criteria**: 7 scenarios (all tables, fn_is_chairman(), positive/negative cases, cleanup)
- **Key Deliverable**: Comprehensive E2E test suite for all RLS policies
- **Test Path**: `tests/e2e/rls/US-006-rls-regression-suite.spec.ts`
- **Depends On**: US-001, US-002, US-003, US-004, US-005

**INVEST Validation**:
- **Independent**: Depends on all other stories (runs after hardening complete)
- **Negotiable**: Partially - Could start with subset of tables
- **Valuable**: Yes - Prevents future regressions, catches accidental USING(true)
- **Estimable**: Yes - 5 SP (comprehensive test suite)
- **Small**: No - Covers 5 tables + function, but manageable in one sprint
- **Testable**: Yes - Self-testing (validates the validators)

---

## Functional Requirements Mapping

| FR | Requirement | User Story | Priority |
|----|-------------|------------|----------|
| FR-1 | Create fn_is_chairman() function | US-001 | Critical |
| FR-2 | Harden chairman_decisions RLS | US-002 | Critical |
| FR-3 | Harden venture_decisions RLS | US-003 | Critical |
| FR-4 | Scope venture_artifacts RLS | US-004 | High |
| FR-5 | Scope venture_stage_work RLS | US-005 | High |
| FR-6 | Create RLS regression tests | US-006 | High |

---

## Implementation Order

```
Phase 1 (Foundation):
  ├─ US-001: fn_is_chairman() [2 SP] ← START HERE

Phase 2 (Chairman Tables):
  ├─ US-002: chairman_decisions RLS [3 SP]

Phase 3 (Venture Tables - Can run parallel):
  ├─ US-003: venture_decisions RLS [3 SP]
  ├─ US-004: venture_artifacts RLS [3 SP]
  └─ US-005: venture_stage_work RLS [3 SP]

Phase 4 (Validation):
  └─ US-006: RLS regression test suite [5 SP] ← FINAL VALIDATION
```

**Total Story Points**: 19
**Estimated Effort**: 1.5-2 sprints (assuming 10-12 SP per sprint)

---

## Testing Strategy

### Test Coverage

| Story | Test Type | Priority | Coverage |
|-------|-----------|----------|----------|
| US-001 | Integration | P0 | fn_is_chairman() behavior (chairman, regular user, anonymous, service role) |
| US-002 | E2E | P0 | chairman_decisions RLS (SELECT, INSERT, UPDATE, DELETE, chairman vs regular) |
| US-003 | E2E | P0 | venture_decisions RLS (ownership scoping, chairman override, cross-venture blocking) |
| US-004 | E2E | P0 | venture_artifacts RLS (ownership scoping, chairman override) |
| US-005 | E2E | P0 | venture_stage_work RLS (ownership scoping, chairman override) |
| US-006 | E2E | P0 | Regression suite (all tables, all policies, positive/negative cases) |

### Test Users

1. **Chairman** (Rick): Should have full access to all tables
2. **User1**: Regular user, owns Venture V1
3. **User2**: Regular user, owns Venture V2
4. **Anonymous**: Unauthenticated user, should be blocked everywhere

### Expected Test Results

- **Chairman**: SELECT returns all rows across all tables
- **User1**: SELECT returns only V1 data, blocked from V2 data
- **User2**: SELECT returns only V2 data, blocked from V1 data
- **Anonymous**: All operations blocked (zero rows, RLS violations)

---

## Security Impact

### Before Hardening

```sql
-- VULNERABLE: Any authenticated user can access chairman decisions
CREATE POLICY "chairman_decisions_select_policy"
  ON chairman_decisions
  FOR SELECT
  USING (true); -- ❌ CRITICAL VULNERABILITY
```

### After Hardening

```sql
-- SECURE: Only chairman can access chairman decisions
CREATE POLICY "chairman_decisions_select_policy"
  ON chairman_decisions
  FOR SELECT
  USING (fn_is_chairman()); -- ✅ SECURE
```

### Threat Model

**Threat**: Malicious authenticated user queries chairman_decisions table
**Before**: Returns all sensitive executive decisions
**After**: Returns zero rows (RLS blocks access)

**Threat**: Regular user attempts to view other users' venture data
**Before**: `USING(true)` allows access to all venture data
**After**: Venture ownership check blocks cross-venture access

---

## Acceptance Criteria Summary

**Total Acceptance Criteria**: 28 scenarios

| Story | AC Count | Focus |
|-------|----------|-------|
| US-001 | 5 | Function behavior (chairman, regular, anonymous, service role, creation) |
| US-002 | 6 | Chairman table access (SELECT, INSERT, UPDATE, DELETE, chairman vs regular) |
| US-003 | 6 | Venture ownership scoping (owner, chairman, cross-venture blocking) |
| US-004 | 5 | Artifact access scoping (owner, chairman, INSERT/UPDATE/DELETE) |
| US-005 | 5 | Stage work scoping (owner, chairman, INSERT/UPDATE/DELETE) |
| US-006 | 7 | Regression validation (all tables, positive/negative, cleanup) |

---

## Definition of Done Checklist

For each user story to be considered DONE:

- [ ] Migration file created and applied to local database
- [ ] RLS policies updated (USING(true) replaced with proper scoping)
- [ ] E2E tests written and passing
- [ ] Documentation updated (comments, schema docs)
- [ ] Code review approved
- [ ] Security validation confirmed (tested with chairman and regular users)
- [ ] No RLS policy violations in logs
- [ ] Test data cleanup verified

---

## Risk Assessment

### High Risk Items

1. **US-001 Function Creation**
   - **Risk**: Function does not correctly identify chairman
   - **Mitigation**: Extensive testing with multiple user contexts
   - **Fallback**: Service role can still bypass RLS for admin operations

2. **US-002 Chairman Decisions**
   - **Risk**: Chairman locked out of their own data
   - **Mitigation**: Test chairman access before regular user blocking
   - **Fallback**: Service role migration script to restore access

3. **US-003/004/005 Venture Tables**
   - **Risk**: Performance degradation with subqueries in RLS policies
   - **Mitigation**: Index on `ventures.user_id`, EXPLAIN ANALYZE queries
   - **Fallback**: Denormalize user_id to venture tables if needed

### Medium Risk Items

1. **US-006 Test Suite**
   - **Risk**: Test false positives (tests pass but RLS broken)
   - **Mitigation**: Manual validation with Supabase SQL editor
   - **Fallback**: Additional security audit before production

---

## Success Metrics

1. **Security**: Zero unauthorized access to chairman_decisions (validated via tests)
2. **Performance**: RLS policy evaluation <10ms per query
3. **Coverage**: 100% of chairman/venture tables have proper RLS
4. **Testing**: All 28 acceptance criteria validated via E2E tests
5. **Regression**: RLS test suite runs on every PR, catches future vulnerabilities

---

## Related Documentation

- **Schema**: `database/schema/engineer/tables/chairman_decisions.md`
- **Migration**: `supabase/migrations/20251216000001_chairman_unified_decisions.sql`
- **RLS Patterns**: `docs/reference/database-agent-patterns.md`
- **Testing Guide**: `docs/reference/qa-director-guide.md`

---

**Generated**: 2025-12-17
**Status**: Ready for EXEC phase
**Next Step**: Begin implementation with US-001 (fn_is_chairman function)
