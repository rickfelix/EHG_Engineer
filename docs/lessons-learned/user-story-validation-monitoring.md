# User Story Auto-Validation Monitoring Checklist


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, schema, rls, feature

**Created**: 2025-10-16
**Related SD**: SD-TEST-MOCK-001
**Prevention Mechanism**: auto-validate-user-stories-on-exec-complete.js
**Integration Point**: unified-handoff-system.js (lines 604-619)

---

## Purpose

Monitor the next 3 Strategic Directives to verify the auto-validation prevention mechanism works correctly and prevents the PLAN_verification blocking issue discovered in SD-TEST-MOCK-001.

---

## Root Cause Review

**Issue**: User stories created during PLAN phase were never validated after EXEC completion, blocking PLAN_verification at 0% progress.

**Prevention**: Auto-validation script integrated into unified-handoff-system.js, triggered during EXEC→PLAN handoff when all deliverables are complete.

---

## Monitoring Schedule

Track the next 3 SDs that complete EXEC phase (any type: feature, bug fix, documentation, infrastructure).

### SD #1: _________________

- [ ] **EXEC→PLAN handoff triggered**
  - Date/Time: __________
  - SD ID: __________

- [ ] **Auto-validation triggered**
  - Console output shows: `🔍 Auto-validating user stories...`
  - Location: unified-handoff-system.js line 606

- [ ] **Validation result**
  - ✅ Success: `✅ User stories validated: X stories`
  - ⚠️  Warning: `⚠️  User story validation: [message]`
  - ❌ Error: `Error: [error message]`

- [ ] **User stories validated count**
  - Expected: _____ stories
  - Actual: _____ stories
  - Match: Yes / No

- [ ] **PLAN_verification progress**
  - Before validation: _____%
  - After validation: _____%
  - Unblocked: Yes / No

- [ ] **Overall handoff success**
  - Handoff approved: Yes / No
  - Can complete SD: Yes / No
  - Issues encountered: __________

**Notes**:
```


```

---

### SD #2: _________________

- [ ] **EXEC→PLAN handoff triggered**
  - Date/Time: __________
  - SD ID: __________

- [ ] **Auto-validation triggered**
  - Console output shows: `🔍 Auto-validating user stories...`

- [ ] **Validation result**
  - ✅ Success: `✅ User stories validated: X stories`
  - ⚠️  Warning: `⚠️  User story validation: [message]`
  - ❌ Error: `Error: [error message]`

- [ ] **User stories validated count**
  - Expected: _____ stories
  - Actual: _____ stories
  - Match: Yes / No

- [ ] **PLAN_verification progress**
  - Before validation: _____%
  - After validation: _____%
  - Unblocked: Yes / No

- [ ] **Overall handoff success**
  - Handoff approved: Yes / No
  - Can complete SD: Yes / No
  - Issues encountered: __________

**Notes**:
```


```

---

### SD #3: _________________

- [ ] **EXEC→PLAN handoff triggered**
  - Date/Time: __________
  - SD ID: __________

- [ ] **Auto-validation triggered**
  - Console output shows: `🔍 Auto-validating user stories...`

- [ ] **Validation result**
  - ✅ Success: `✅ User stories validated: X stories`
  - ⚠️  Warning: `⚠️  User story validation: [message]`
  - ❌ Error: `Error: [error message]`

- [ ] **User stories validated count**
  - Expected: _____ stories
  - Actual: _____ stories
  - Match: Yes / No

- [ ] **PLAN_verification progress**
  - Before validation: _____%
  - After validation: _____%
  - Unblocked: Yes / No

- [ ] **Overall handoff success**
  - Handoff approved: Yes / No
  - Can complete SD: Yes / No
  - Issues encountered: __________

**Notes**:
```


```

---

## Success Criteria

The prevention mechanism is considered **SUCCESSFUL** if:

- ✅ Auto-validation triggers automatically in all 3 SDs
- ✅ User stories are validated when deliverables complete
- ✅ PLAN_verification progress is unblocked (0% → 15%)
- ✅ No manual intervention required
- ✅ No PLAN_verification blocking issues occur

The prevention mechanism **NEEDS REFINEMENT** if:

- ❌ Auto-validation fails to trigger
- ❌ Validation returns errors
- ❌ User stories remain 'pending' despite auto-validation
- ❌ Manual fixes required for any SD
- ❌ PLAN_verification remains blocked

---

## Verification Commands

Use these commands during monitoring:

**Check user story validation status**:
```sql
SELECT id, title, validation_status, updated_at
FROM user_stories
WHERE sd_id = '<SD-ID>'
ORDER BY created_at;
```

**Check deliverable completion**:
```sql
SELECT deliverable_name, completion_status, created_at
FROM sd_scope_deliverables
WHERE sd_id = '<SD-ID>'
ORDER BY created_at;
```

**Check progress breakdown**:
```sql
SELECT * FROM get_progress_breakdown('<SD-ID>');
```

**Check handoff execution logs**:
```sql
SELECT id, handoff_type, status, validation_details
FROM leo_handoff_executions
WHERE sd_id = '<SD-ID>'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Edge Cases to Monitor

### Case 1: SD with no user stories
- **Expected**: Auto-validation returns `{ validated: true, count: 0, message: 'No user stories' }`
- **PLAN_verification**: Should not block (no validation requirement if no stories)

### Case 2: User stories already validated
- **Expected**: Auto-validation returns `{ validated: true, count: X, message: 'Already validated' }`
- **PLAN_verification**: Should proceed normally

### Case 3: Deliverables incomplete
- **Expected**: Auto-validation returns `{ validated: false, message: 'Deliverables incomplete' }`
- **PLAN_verification**: Should block until deliverables complete (expected behavior)

### Case 4: Database error during validation
- **Expected**: Auto-validation returns `{ validated: false, error: '[error message]' }`
- **Action**: Investigate database connectivity/permissions
- **Fallback**: Manual validation may be required

---

## Remediation Plan (If Prevention Fails)

If auto-validation fails for any of the 3 SDs:

1. **Immediate Fix**:
   ```javascript
   node scripts/auto-validate-user-stories-on-exec-complete.js <SD-ID>
   ```

2. **Investigation**:
   - Check unified-handoff-system.js logs for error messages
   - Verify auto-validation function is being called
   - Check user_stories table for validation_status values
   - Review deliverables completion status

3. **Root Cause Analysis**:
   - Was auto-validation triggered? (check console logs)
   - Did it return an error? (check error message)
   - Database schema changes? (check user_stories table)
   - RLS policy blocking? (check Supabase logs)

4. **Fix and Retry**:
   - Apply immediate fix above
   - Update prevention mechanism if needed
   - Document new edge case
   - Retry EXEC→PLAN handoff

---

## Completion Status

**Monitoring Start Date**: __________
**Monitoring End Date**: __________
**Total SDs Monitored**: 0 / 3

**Overall Result**:
- [ ] Prevention mechanism successful (all 3 SDs passed)
- [ ] Prevention mechanism needs refinement (issues found)
- [ ] Monitoring incomplete (< 3 SDs tested)

**Recommendations**:
```



```

---

## Next Actions

After completing monitoring of 3 SDs:

- [ ] Review all monitoring results
- [ ] Document any edge cases discovered
- [ ] Update auto-validation script if needed
- [ ] Update this checklist with lessons learned
- [ ] Mark prevention mechanism as **PRODUCTION-READY** or **NEEDS-REFINEMENT**
- [ ] Archive this monitoring document to `docs/lessons-learned/archive/`

---

**Monitoring Owner**: LEO Protocol Team
**Review Frequency**: After each SD completion (until 3 SDs monitored)
**Status**: ACTIVE - Monitoring in progress

---

**End of Monitoring Checklist**
