# Technical Debt: Handoff System Backend-Only SD Support

**ID**: TD-HANDOFF-BACKEND-ONLY-001
**Created**: 2025-11-08
**Priority**: Medium
**Impact**: Process efficiency (manual workarounds required for 20-30% of SDs)
**Related SD**: SD-STAGE4-AGENT-PROGRESS-001 (triggered this issue)

---

## Problem Statement

The unified handoff system (`scripts/unified-handoff-system.js`) is designed for full-stack features with UI components and requires:
- E2E tests (TESTING sub-agent)
- GitHub PRs (GITHUB sub-agent)
- Documentation checks (DOCMON sub-agent)

**Backend-only infrastructure SDs** legitimately don't have:
- ✅ Unit tests only (no UI to E2E test)
- ✅ Same-repo service additions (no PR needed)
- ✅ SQL schema documentation (inline comments)

This causes handoff blocking for valid, completed work.

---

## Current Workaround

Manual phase transition via direct database UPDATE:
```sql
UPDATE strategic_directives_v2
SET current_phase = 'PLAN',
    updated_at = NOW()
WHERE id = '<sd_id>';
```

**Documentation required**:
- Create retrospective markdown file
- Document exception in retrospective
- Track TD item for future fix

---

## Root Cause

**Location**: `scripts/unified-handoff-system.js`

Sub-agent validation logic assumes all SDs have:
1. UI components → E2E tests
2. Cross-repo changes → GitHub PRs
3. User-facing features → Documentation

**Missing**: SD classification system to differentiate:
- Full-stack features (UI + backend)
- Backend infrastructure (services, DB, APIs)
- Database migrations (schema only)
- Configuration/tooling changes

---

## Proposed Solution

### Phase 1: Add SD Classification (2-4 hours)

**Database Schema Change**:
```sql
ALTER TABLE strategic_directives_v2
ADD COLUMN sd_category VARCHAR(50) DEFAULT 'full-stack'
  CHECK (sd_category IN ('full-stack', 'backend-only', 'database-migration', 'config-tooling'));

CREATE INDEX idx_strategic_directives_category
ON strategic_directives_v2(sd_category);
```

**Validation Rule Matrix**:
| SD Category | TESTING Sub-Agent | GITHUB Sub-Agent | DOCMON Sub-Agent |
|-------------|-------------------|------------------|------------------|
| full-stack | E2E tests required | PR required | UI docs required |
| backend-only | Unit tests only | Optional | Inline SQL/TS docs |
| database-migration | Schema validation | Optional | Migration comments |
| config-tooling | Integration tests | Optional | Config docs |

---

### Phase 2: Update Handoff Validation Logic (2 hours)

**File**: `scripts/unified-handoff-system.js`

```javascript
async function getRequiredSubAgents(sd) {
  const { sd_category } = sd;

  const subAgentRules = {
    'full-stack': ['TESTING', 'GITHUB', 'DOCMON', 'DATABASE'],
    'backend-only': ['DATABASE', 'DOCMON'], // Unit tests, inline docs only
    'database-migration': ['DATABASE'], // Schema validation only
    'config-tooling': ['GITHUB'] // PR for config changes only
  };

  return subAgentRules[sd_category] || subAgentRules['full-stack'];
}
```

---

### Phase 3: Backfill Existing SDs (1 hour)

```sql
-- Identify backend-only SDs
UPDATE strategic_directives_v2
SET sd_category = 'backend-only'
WHERE id IN (
  'SD-STAGE4-AGENT-PROGRESS-001',
  'SD-DATABASE-SCHEMA-UPDATE-001',
  -- ... other backend-only SDs
);

-- Identify database migrations
UPDATE strategic_directives_v2
SET sd_category = 'database-migration'
WHERE id LIKE '%MIGRATION%' OR id LIKE '%SCHEMA%';
```

---

## Acceptance Criteria

### AC1: SD Category Field
- [ ] `sd_category` column added to `strategic_directives_v2` table
- [ ] CHECK constraint validates allowed values
- [ ] Index created for query performance
- [ ] Migration script tested in staging

### AC2: Handoff Validation Updated
- [ ] `getRequiredSubAgents()` function implemented
- [ ] Sub-agent selection based on SD category
- [ ] Backend-only SDs skip TESTING (E2E) sub-agent
- [ ] Backend-only SDs skip GITHUB sub-agent
- [ ] Validation passes for backend-only work

### AC3: Backward Compatibility
- [ ] Existing SDs default to 'full-stack' category
- [ ] No breaking changes to current handoff flow
- [ ] Manual override still available if needed

### AC4: Testing
- [ ] Unit tests for `getRequiredSubAgents()`
- [ ] Integration test: backend-only SD handoff
- [ ] Integration test: full-stack SD handoff (unchanged)
- [ ] Test coverage ≥ 85%

---

## Estimated Effort

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| Phase 1: Database Schema | 2-4 hours | Low | Low |
| Phase 2: Validation Logic | 2 hours | Medium | Low |
| Phase 3: Backfill | 1 hour | Low | Low |
| **Total** | **5-7 hours** | **Low-Medium** | **Low** |

---

## Impact if Not Fixed

- **Manual workarounds required**: 20-30% of SDs (backend infrastructure)
- **Process overhead**: 10-15 minutes per backend SD (manual phase transition)
- **Documentation burden**: Retrospective must explain exception
- **False negatives**: Sub-agents block valid, completed work
- **Team confusion**: "Why is my backend work failing validation?"

---

## Related Issues

1. **TD-VITEST-CONFIG-FIX-001** (High priority)
   - Test files in `src/services/__tests__/` but Vitest expects `tests/unit/`
   - Blocks automated test execution
   - Affects all services in `/mnt/c/_EHG/ehg/src/services/`

2. **SD-STAGE4-AGENT-PROGRESS-001** (Triggered this TD)
   - Backend-only SD that completed successfully
   - Handoff blocked by TESTING/GITHUB/DOCMON sub-agents
   - Required manual phase transition

---

## Recommendation

**Priority**: Medium (affects 20-30% of SDs, but workaround exists)

**Suggested Timeline**:
- **Week 1**: Create new SD `SD-HANDOFF-BACKEND-CLASSIFICATION-001`
- **Week 2**: Implement Phase 1 (database schema)
- **Week 3**: Implement Phase 2 (validation logic)
- **Week 4**: Backfill existing SDs (Phase 3)

**Quick Win**: Start classifying new SDs during LEAD phase submission

---

## References

- Retrospective: `docs/retrospectives/SD-STAGE4-AGENT-PROGRESS-001-retrospective.md`
- Handoff system: `scripts/unified-handoff-system.js:400-500`
- Database schema: `database/schema/strategic_directives_v2.sql`

---

**Created By**: Claude Code (AI Assistant)
**Reviewed By**: [Pending Review]
**Status**: OPEN
**Next Action**: Create SD `SD-HANDOFF-BACKEND-CLASSIFICATION-001` for implementation
