# Enhanced QA Engineering Director v2.0


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, e2e, migration

## Overview

Intelligent testing automation based on SD-RECONNECT-009 retrospective learnings. Saves **3-4 hours per SD** through automated pre-flight checks, smart test execution, and elimination of manual steps.

## Key Improvements Over v1.0

| Improvement | Time Saved | Impact |
|-------------|------------|--------|
| Pre-test build validation | 2-3 hours | Catches build failures before testing |
| Database migration verification | 1-2 hours | Prevents wrong database state debugging |
| Component integration checking | 30-60 min | Detects "built but not integrated" gaps |
| Smart test tier selection | 8-10 hours | Prevents 100+ unnecessary manual tests |
| Test infrastructure discovery | 30-60 min | Recommends reuse of existing helpers |
| Cross-SD dependency detection | 10-15 min | Identifies conflicts with in-progress SDs |
| Automated migration execution | 5-8 min | Eliminates manual Supabase Dashboard steps |

**Total**: **3-4 hours saved per SD**

## Architecture

### 7 Intelligence Modules

#### 1. Build Validator (`build-validator.js`)

**Purpose**: Validate build before executing tests

**Process**:
1. Run `npm run build` in target app
2. Parse build errors if any
3. Categorize errors (TypeScript, missing imports, syntax)
4. Generate fix recommendations

**Output**:
```javascript
{
  verdict: 'PASS' | 'BLOCKED',
  errors_count: number,
  errors: [{ file, line, message, category }],
  recommendations: [{ action, priority, details }],
  time_saved: '2-3 hours'
}
```

**When to skip**: Only if recent successful build confirmed (<5 minutes ago)

---

#### 2. Migration Verifier (`migration-verifier.js`)

**Purpose**: Check if database migrations are applied before testing

**Process**:
1. Find migration files for SD (by SD ID in filename)
2. Query database to check if tables exist
3. Identify pending migrations
4. Provide execution instructions

**Output**:
```javascript
{
  verdict: 'PASS' | 'BLOCKED' | 'NO_MIGRATIONS',
  pending_migrations: ['file1.sql', 'file2.sql'],
  applied_migrations: ['file3.sql'],
  instructions: {
    automated: 'Run migration executor',
    manual_cli: 'cd ... && supabase db push',
    manual_dashboard: 'Copy SQL to Supabase Dashboard'
  }
}
```

**Blocking**: Yes - testing with wrong database state causes false failures

---

#### 3. Integration Checker (`integration-checker.js`)

**Purpose**: Verify components are actually imported and used

**Process**:
1. Find new components (created in last 24 hours)
2. Search codebase for import statements
3. Count imports (excluding self-import)
4. Flag components with 0 imports

**Output**:
```javascript
{
  verdict: 'PASS' | 'WARNING',
  components_checked: number,
  integrations_found: number,
  warnings: [{
    component: 'HelpTooltip',
    issue: 'Component built but not integrated (0 imports)',
    recommendation: 'Verify PRD - may be unused'
  }]
}
```

**SD-RECONNECT-009 Example**: HelpTooltip built but 0 imports → Warning caught

---

#### 4. Test Tier Selector (`test-tier-selector.js`)

**Purpose**: Smart test tier selection based on SD type

**Test Tiers**:

| Tier | Name | Required | Count | Time Budget | When |
|------|------|----------|-------|-------------|------|
| 1 | Smoke Tests | ALWAYS | 3-5 | <60s | Every SD |
| 2 | E2E Tests | Conditional | 10-20 | <5min | UI features only |
| 3 | Manual Testing | Rare | 5-10 items | <30min | Complex logic |

**Process**:
1. Analyze SD category and scope
2. Check for UI keywords (component, dashboard, form, modal)
3. Check for user flow keywords (navigation, workflow, journey)
4. Check for complex logic keywords (algorithm, calculation, scoring)
5. Select appropriate tiers

**Output**:
```javascript
{
  recommended_tiers: [
    { name: 'Smoke Tests', required: true, count: '3-5', time_budget: '<60s' },
    { name: 'E2E Tests', required: true, count: '10-20', time_budget: '<5min' }
  ],
  primary_tier: { name: 'Smoke Tests', ... },
  total_estimated_time_display: '5m 60s',
  rationale: 'UI feature detected - E2E tests validate user flows'
}
```

**Key Learning**: Tier 1 (Smoke) is SUFFICIENT for LEAD approval. Don't create 100+ manual test checklists unless truly needed.

---

#### 5. Infrastructure Discovery (`infrastructure-discovery.js`)

**Purpose**: Discover existing test infrastructure and recommend reuse

**Discovers**:
- Auth helpers (`tests/fixtures/auth.ts`)
- Test helpers (`tests/helpers/`)
- Fixtures (`tests/fixtures/`)
- Test configs (Playwright, Vitest)
- E2E patterns (`tests/e2e/*.spec.ts`)

**Output**:
```javascript
{
  infrastructure: {
    auth_helpers: [{ name: 'auth.ts', path: 'tests/fixtures/auth.ts' }],
    test_helpers: [...],
    fixtures: [...],
    e2e_patterns: [...]
  },
  recommendations: [
    {
      type: 'REUSE',
      priority: 'CRITICAL',
      category: 'Authentication',
      message: '✅ Use existing authenticateUser() from tests/fixtures/auth.ts',
      anti_pattern: '❌ DO NOT write custom auth logic'
    }
  ]
}
```

**Key Learning**: Reusing `authenticateUser()` saves 30-60 minutes vs recreating auth logic

---

#### 6. Dependency Checker (`dependency-checker.js`)

**Purpose**: Check for cross-SD dependencies to prevent build conflicts

**Process**:
1. Query in-progress SDs from database
2. Analyze imports in current SD code
3. Match imports to other SD slugs/titles
4. Assess risk (high if SD <50% complete, medium otherwise)

**Output**:
```javascript
{
  verdict: 'NO_CONFLICTS' | 'WARNING',
  conflicts: [{
    import_path: '@/lib/financial/monte-carlo',
    conflicting_sd: 'SD-RECONNECT-008',
    conflicting_sd_title: 'Financial Analytics',
    progress: 40,
    status: 'in_progress',
    risk: 'high'
  }],
  recommendations: [{
    action: 'Create stub file or wait for SD completion',
    sd: 'SD-RECONNECT-008',
    priority: 'high'
  }]
}
```

**SD-RECONNECT-009 Example**: Dependency on `monte-carlo.ts` from SD-008 caused build failure → Create stub file

---

#### 7. Migration Executor (`migration-executor.js`)

**Purpose**: Automatically execute pending database migrations

**Process**:
1. Link to Supabase project (`supabase link --project-ref`)
2. Apply migrations (`supabase db push`)
3. Parse output for applied migrations
4. Validate migration files before execution

**Safety Features**:
- Pre-execution validation (no cross-schema FKs)
- Auto-confirm prompts
- Fallback to manual instructions

**Output**:
```javascript
{
  verdict: 'SUCCESS' | 'FAILED',
  applied_migrations: ['20251004_create_table.sql'],
  applied_count: 1,
  time_saved: '5-8 minutes',
  fallback_instructions: { manual_cli, manual_dashboard }
}
```

**When it fails**: Provides manual fallback instructions

---

## 5-Phase Execution Workflow

### Phase 1: Pre-flight Checks

**Modules**:
1. Build Validator
2. Migration Verifier → Migration Executor (if pending)
3. Cross-SD Dependency Checker
4. Integration Checker (if UI SD)

**Blockers**:
- Build failure → BLOCKED (fix build first)
- Pending migrations → BLOCKED (auto-apply or manual apply)

**Warnings**:
- Cross-SD dependencies → Continue with warnings
- Component integration gaps → Continue with warnings

---

### Phase 2: Smart Test Planning

**Modules**:
1. Test Tier Selector
2. Infrastructure Discovery

**Output**:
- Recommended test tiers
- Estimated time budget
- Infrastructure reuse recommendations

**No blockers** - planning phase is informational

---

### Phase 3: Test Execution

**Executes**:
- Tier 1 (Smoke): Always execute (3-5 tests, <60s)
- Tier 2 (E2E): Execute if UI SD (10-20 tests, <5min)
- Tier 3 (Manual): Generate checklist if complex logic (5-10 items)

**Verdict**:
- All tests pass → Contribute to PASS verdict
- Smoke pass, E2E fail → CONDITIONAL_PASS
- Smoke fail → FAIL

---

### Phase 4: Evidence Collection

**Collects**:
- Screenshots (for UI changes)
- Test logs
- Coverage reports
- Test execution summaries

**Format**: JSONB stored in `sub_agent_execution_results` table

---

### Phase 5: Verdict & Handoff

**Aggregates**:
- All phase results
- Blockers, warnings, and recommendations
- Time saved estimates

**Calculates**:
- Final verdict (PASS / CONDITIONAL_PASS / FAIL / BLOCKED)
- Confidence score (0-100%)

**Stores**: Results in `sub_agent_execution_results` table

---

## Verdict Calculation

| Scenario | Verdict | Confidence | Action |
|----------|---------|------------|--------|
| Build pass + Smoke pass + E2E pass | PASS | 95% | Approve for LEAD |
| Build pass + Smoke pass + E2E fail | CONDITIONAL_PASS | 75% | LEAD review |
| Build pass + Smoke fail | FAIL | 0% | Fix tests |
| Build fail | BLOCKED | 0% | Fix build |
| Migrations pending | BLOCKED | 0% | Apply migrations |

---

## Usage

### Command Line

```bash
# Basic usage
node scripts/qa-engineering-director-enhanced.js <SD-ID>

# With options
node scripts/qa-engineering-director-enhanced.js SD-RECONNECT-011 \
  --target-app ehg \
  --skip-build \
  --no-auto-migrations
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--target-app` | 'ehg' or 'EHG_Engineer' | 'ehg' |
| `--skip-build` | Skip build validation | false |
| `--skip-migrations` | Skip migration checks | false |
| `--no-auto-migrations` | Don't auto-execute migrations | false |
| `--force-manual` | Execute manual tests even if not required | false |

### Programmatic

```javascript
import { executeQADirector } from './scripts/qa-engineering-director-enhanced.js';

const results = await executeQADirector('SD-XXX', {
  targetApp: 'ehg',
  skipBuild: false,
  autoExecuteMigrations: true
});

console.log(`Verdict: ${results.verdict}`);
console.log(`Confidence: ${results.confidence}%`);
console.log(`Time Saved: ${results.time_saved}`);
```

---

## Database Integration

### Table: `sub_agent_execution_results`

Stores comprehensive execution results:

```sql
CREATE TABLE sub_agent_execution_results (
    id UUID PRIMARY KEY,
    sub_agent_id VARCHAR(50),
    sd_id VARCHAR(50),
    verdict VARCHAR(20),
    confidence INTEGER,
    pre_flight_checks JSONB,
    test_execution JSONB,
    evidence JSONB,
    recommendations JSONB,
    time_saved VARCHAR(50),
    created_at TIMESTAMP
);
```

**Indexes**:
- `sd_id` - Query results by SD
- `sub_agent_id` - Query by sub-agent
- `verdict` - Filter by verdict
- GIN on `recommendations` - Search recommendations

---

## Retrospective Source

Based on **SD-RECONNECT-009** retrospective (ID: `39cc380d-2d4d-46aa-8493-11829e2ac852`):

### Issues Addressed

1. **Database migration not applied** → Migration Verifier + Executor
2. **Cross-SD dependency caused build failure** → Dependency Checker
3. **HelpTooltip built but not integrated** → Integration Checker
4. **100+ manual test checklist created but not executed** → Test Tier Selector

### Key Learnings Applied

| Learning | Module | Impact |
|----------|--------|--------|
| Build validation saves 2-3 hours | Build Validator | Pre-execution check |
| Migration automation is critical | Migration Executor | Automated application |
| Component integration gaps | Integration Checker | Verification during EXEC |
| SIMPLICITY FIRST in testing | Test Tier Selector | Prevent over-testing |

---

## Future Enhancements

### Planned for v2.1

- [ ] Screenshot automation (Playwright)
- [ ] Coverage threshold enforcement
- [ ] Test result aggregation from multiple runs
- [ ] Historical trend analysis (pass rate over time)

### Planned for v3.0

- [ ] AI-powered test generation
- [ ] Automated fix suggestions for failing tests
- [ ] Integration with CI/CD pipelines
- [ ] Real-time test execution monitoring

---

## Troubleshooting

### Build validation fails with "command not found"

**Cause**: `npm run build` not available in target app

**Fix**: Ensure target app has build script in `package.json`

---

### Migration execution fails with "permission denied"

**Cause**: Supabase CLI not authenticated or linked

**Fix**: Run `supabase login` and `supabase link --project-ref <REF>`

---

### Integration checker reports false positives

**Cause**: Component imported via dynamic imports or barrel files

**Fix**: Update grep pattern in `integration-checker.js` to include dynamic imports

---

### Test tier selector chooses wrong tier

**Cause**: SD scope doesn't contain clear keywords

**Fix**: Update `isUIFeature()` or `hasComplexLogic()` functions with additional keywords

---

## Contributing

### Adding New Modules

1. Create module in `scripts/modules/qa/`
2. Export main function with standard interface
3. Update main orchestrator to import and use module
4. Add tests in `tests/sub-agents/qa-engineering-director-v2.test.js`
5. Update documentation

### Standard Module Interface

```javascript
export async function moduleName(sd_id, targetApp = 'ehg') {
  return {
    verdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'WARNING',
    // ... module-specific fields
    metadata: { version, timestamp }
  };
}
```

---

## License

Part of EHG_Engineer LEO Protocol system.

---

## Support

For issues or questions:
1. Check this documentation
2. Review retrospective learnings: `database/retrospectives/`
3. Check sub-agent execution results: `sub_agent_execution_results` table
4. Contact LEAD agent for strategic decisions
