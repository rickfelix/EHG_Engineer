# QA Engineering Director Usage Guide

**SD-TEST-001: Testing Strategic Directives**

## Overview

The QA Engineering Director (`qa-engineering-director-enhanced.js`) is an intelligent testing automation system with **7 intelligence modules** and a **5-phase workflow**. Use it to test any Strategic Directive comprehensively.

---

## Quick Start

### Test Any Strategic Directive

```bash
node scripts/qa-engineering-director-enhanced.js <SD-ID>
```

**Example**:
```bash
node scripts/qa-engineering-director-enhanced.js SD-RECONNECT-014
```

### With Options

```bash
node scripts/qa-engineering-director-enhanced.js SD-RECONNECT-014 \
  --skip-build \
  --no-auto-migrations \
  --target-app ehg
```

---

## 7 Intelligence Modules

### 1. Pre-test Build Validation
**Saves**: 2-3 hours
**What it does**: Validates build before testing, parses build errors, provides fix recommendations

### 2. Database Migration Verification
**Saves**: 1-2 hours
**What it does**: Checks if migrations are applied, identifies pending migrations, provides execution options

### 3. Component Integration Checking
**Saves**: 30-60 minutes
**What it does**: Verifies components are actually imported and used, detects "built but not integrated" gaps

### 4. Smart Test Tier Selection
**Saves**: 100+ unnecessary tests
**What it does**:
- **Tier 1 (Smoke)**: ALWAYS required (3-5 tests, <60s)
- **Tier 2 (E2E)**: Conditional for UI features (10-20 tests, <5min)
- **Tier 3 (Manual)**: Rare, for complex logic (5-10 items, <30min)

### 5. Test Infrastructure Discovery
**Saves**: 30-60 minutes
**What it does**: Discovers existing auth helpers, test fixtures, recommends reuse

### 6. Cross-SD Dependency Detection
**Saves**: 10-15 minutes
**What it does**: Identifies conflicts with in-progress SDs, analyzes import statements

### 7. Automated Migration Execution
**Saves**: 5-8 minutes
**What it does**: Uses `supabase link` + `supabase db push`, auto-applies pending migrations

**Total Time Savings**: 3-4 hours per SD

---

## 5-Phase Workflow

### Phase 1: Pre-flight Checks
- Build validation
- Database migration verification
- Cross-SD dependency check
- Component integration check (if UI SD)

### Phase 2: Smart Test Planning
- Test tier selection
- Infrastructure discovery

### Phase 3: Test Execution
- Execute recommended test tiers
- Smoke tests (always)
- E2E tests (conditional)
- Manual testing (rare)

### Phase 4: Evidence Collection
- Screenshots
- Logs
- Coverage reports
- Test execution summaries

### Phase 5: Verdict & Handoff
- Aggregate all results
- Calculate final verdict
- Generate recommendations
- Store in database

---

## Command Options

| Option | Default | Description |
|--------|---------|-------------|
| `--skip-build` | false | Skip build validation |
| `--skip-migrations` | false | Skip migration checks |
| `--no-auto-migrations` | false | Don't auto-execute migrations |
| `--force-manual` | false | Execute manual tests even if not required |
| `--target-app` | ehg | Target application (ehg or EHG_Engineer) |

---

## Success Criteria

### PASS Verdict
- ✅ Build successful (or skipped)
- ✅ All migrations applied
- ✅ Smoke tests pass (3-5 tests)
- ✅ E2E tests pass (if required)
- ✅ No critical integration gaps

### CONDITIONAL_PASS
- ⚠️ Smoke tests pass but E2E has minor issues
- ⚠️ Non-critical integration warnings

### BLOCKED
- ❌ Build fails
- ❌ Pending migrations not applied
- ❌ Critical dependency conflicts

---

## Results Storage

Results stored in `sub_agent_execution_results` table:
- Overall verdict and confidence score
- Phase results (pre-flight, planning, execution, evidence)
- Recommendations for EXEC agent
- Time saved estimates

---

## Examples

### Example 1: Test SD with Full Automation
```bash
node scripts/qa-engineering-director-enhanced.js SD-RECONNECT-014
```

Output:
```
═══════════════════════════════════════════════════════════
🎯 QA Engineering Director v2.0 - Starting for SD-RECONNECT-014
   Target App: ehg
═══════════════════════════════════════════════════════════

📋 PHASE 1: PRE-FLIGHT CHECKS
───────────────────────────────────────────────────────────
🔨 Running build validation...
   ✅ Build PASSED

🗄️ Verifying database migrations...
   ✅ All migrations applied

🔗 Checking cross-SD dependencies...
   ✅ No conflicts detected

🧩 Verifying component integration...
   ✅ All components integrated

📋 PHASE 2: SMART TEST PLANNING
───────────────────────────────────────────────────────────
🎯 Test Tier: TIER_1_SMOKE (3-5 tests)
   Reason: Standard smoke test tier

🔍 Infrastructure Discovery:
   ✅ Found authenticateUser() helper
   ✅ Found createTestVenture() fixture

...
```

### Example 2: Skip Build, Manual Migration
```bash
node scripts/qa-engineering-director-enhanced.js SD-SECURITY-002 \
  --skip-build \
  --no-auto-migrations
```

### Example 3: Test EHG_Engineer SD
```bash
node scripts/qa-engineering-director-enhanced.js SD-LEO-003 \
  --target-app EHG_Engineer
```

---

## Integration with SD Testing Status

After running QA Director, update `sd_testing_status` table:

```javascript
await supabase
  .from('sd_testing_status')
  .upsert({
    sd_id: 'SD-RECONNECT-014',
    tested: true,
    test_pass_rate: 95.5,
    test_count: 22,
    tests_passed: 21,
    tests_failed: 1,
    test_framework: 'playwright',
    testing_sub_agent_used: true,
    last_tested_at: new Date().toISOString()
  });
```

---

## Troubleshooting

### "Build FAILED - blocking test execution"
- Fix build errors first
- OR use `--skip-build` to test anyway (not recommended)

### "Pending migrations detected"
- Let QA Director auto-apply: don't use `--no-auto-migrations`
- OR apply manually via Supabase SQL Editor

### "Component built but not integrated (0 imports)"
- Add component to relevant parent component
- Update imports and usage
- Re-run QA Director

### "Cross-SD dependency conflict detected"
- Review conflicting SD
- Coordinate implementation order
- OR proceed with caution

---

## Best Practices

1. **Always run QA Director** before marking SD complete
2. **Review verdict carefully** - CONDITIONAL_PASS may need fixes
3. **Check recommendations** - May suggest improvements
4. **Update sd_testing_status** after successful test
5. **Use --skip-build sparingly** - Build validation saves time

---

## Related Scripts

- `query-untested-sds.js` - Find SDs needing testing
- `verify-sd-testing-status-migration.js` - Verify migration applied
- `test-with-auth.mjs` - Manual auth testing helper

---

**Created**: 2025-10-05
**SD**: SD-TEST-001
**Version**: QA Director v2.0
