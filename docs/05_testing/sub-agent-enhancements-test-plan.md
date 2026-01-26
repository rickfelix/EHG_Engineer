# Sub-Agent Enhancements Testing Plan

## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, testing, e2e

**Phases 1-3 Implementation**
**Created:** 2025-10-17
**Status:** Testing in Progress

---

## Overview

Testing comprehensive sub-agent improvements including:
- ✅ Phase 1: 6 mandatory sub-agents (VALIDATION, SECURITY, DOCMON, STORIES, TESTING, GITHUB)
- ✅ Phase 2: New API & DEPENDENCY sub-agents
- ✅ Phase 3: Smart COST agent infrastructure detection

---

## Test Environment

**Prerequisites:**
- ✅ Database migrations applied (20251017_add_api_subagent.sql, 20251017_add_dependency_subagent.sql)
- ✅ Node modules installed
- ✅ Supabase connection configured
- ✅ Test SD available in database

**Test Data Requirements:**
- SD with API keywords (for API agent testing)
- SD with dependency keywords (for DEPENDENCY agent testing)
- SD with infrastructure keywords (for smart COST testing)
- SD with UI/database keywords (for mandatory agent testing)

---

## Test Suite 1: Mandatory Sub-Agent Enforcement

### Test 1.1: VALIDATION Always Required at LEAD_PRE_APPROVAL
**Objective:** Verify VALIDATION sub-agent always executes during LEAD_PRE_APPROVAL phase

**Test Steps:**
```bash
# Create test SD without "duplicate" or "validation" keywords
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-VALIDATION-001',
      title: 'Simple Feature Implementation',
      scope: 'Add a new button to the dashboard',
      status: 'draft',
      priority: 50
    })
    .select()
    .single();

  console.log('Test SD created:', data?.id);
})();
"

# Run orchestrator for LEAD_PRE_APPROVAL
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-TEST-VALIDATION-001
```

**Expected Result:**
- ✅ VALIDATION agent should be in "required" list
- ✅ Reason: "Always required for this phase"
- ✅ VALIDATION executes regardless of keywords

---

### Test 1.2: SECURITY Always Required at LEAD_PRE_APPROVAL
**Objective:** Verify SECURITY sub-agent always executes during LEAD_PRE_APPROVAL

**Test Steps:**
```bash
# Use same SD from Test 1.1 (no security keywords)
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-TEST-VALIDATION-001
```

**Expected Result:**
- ✅ SECURITY agent should be in "required" list
- ✅ Reason: "Always required for this phase"
- ✅ Executes even without "auth" or "security" keywords

---

### Test 1.3: DOCMON Always Required at PLAN_VERIFY
**Objective:** Verify DOCMON sub-agent always executes during PLAN_VERIFY

**Test Steps:**
```bash
# Update SD to EXEC phase
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  await supabase
    .from('strategic_directives_v2')
    .update({ status: 'exec' })
    .eq('id', 'SD-TEST-VALIDATION-001');

  console.log('SD updated to EXEC phase');
})();
"

# Run orchestrator for PLAN_VERIFY
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-VALIDATION-001
```

**Expected Result:**
- ✅ DOCMON agent should be in "required" list
- ✅ Reason: "Always required for this phase"
- ✅ Documentation generation enforced before handoff

---

### Test 1.4: STORIES Always Required at PLAN_VERIFY
**Objective:** Verify STORIES sub-agent always executes during PLAN_VERIFY

**Test Steps:**
```bash
# Run orchestrator for PLAN_VERIFY (same SD)
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-VALIDATION-001
```

**Expected Result:**
- ✅ STORIES agent should be in "required" list
- ✅ Reason: "Always required for this phase"
- ✅ User story context verification enforced

---

## Test Suite 2: API Sub-Agent

### Test 2.1: API Agent Triggers on API Keywords
**Objective:** Verify API agent triggers when REST/GraphQL keywords detected

**Test Steps:**
```bash
# Create API-focused SD
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-API-001',
      title: 'Create REST API endpoints for user management',
      scope: 'Implement RESTful API with GET, POST, PUT, DELETE endpoints. Add OpenAPI documentation.',
      status: 'draft',
      priority: 70
    })
    .select()
    .single();

  console.log('API test SD created:', data?.id);
})();
"

# Run context-aware selector
node -e "
const { selectSubAgents } = require('./lib/context-aware-sub-agent-selector.js');

const sd = {
  id: 'SD-TEST-API-001',
  title: 'Create REST API endpoints for user management',
  scope: 'Implement RESTful API with GET, POST, PUT, DELETE endpoints. Add OpenAPI documentation.',
  description: ''
};

const result = selectSubAgents(sd, { confidenceThreshold: 0.4 });
console.log('Selected agents:', result.recommended.map(r => r.code).join(', '));
console.log('API agent included:', result.recommended.some(r => r.code === 'API'));
"
```

**Expected Result:**
- ✅ API agent should be in recommended list
- ✅ Confidence score >= 60%
- ✅ Matched keywords: API, REST, endpoint, OpenAPI

---

### Test 2.2: API Agent Execution
**Objective:** Verify API agent can execute and generate report

**Test Steps:**
```bash
# Execute API agent directly
node scripts/execute-subagent.js --code API --sd-id SD-TEST-API-001
```

**Expected Result:**
- ✅ API agent scans for API files in src/api, src/routes, src/controllers
- ✅ Generates design/performance/security/documentation scores
- ✅ Returns PASS/CONDITIONAL_PASS/FAIL verdict
- ✅ Provides recommendations for improvements

---

## Test Suite 3: DEPENDENCY Sub-Agent

### Test 3.1: DEPENDENCY Agent Triggers on Package Keywords
**Objective:** Verify DEPENDENCY agent triggers when npm/vulnerability keywords detected

**Test Steps:**
```bash
# Create dependency-focused SD
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-DEPENDENCY-001',
      title: 'Upgrade npm packages to fix CVE vulnerabilities',
      scope: 'Update outdated dependencies and patch security vulnerabilities. Run npm audit and update to latest versions.',
      status: 'draft',
      priority: 80
    })
    .select()
    .single();

  console.log('Dependency test SD created:', data?.id);
})();
"

# Run context-aware selector
node -e "
const { selectSubAgents } = require('./lib/context-aware-sub-agent-selector.js');

const sd = {
  id: 'SD-TEST-DEPENDENCY-001',
  title: 'Upgrade npm packages to fix CVE vulnerabilities',
  scope: 'Update outdated dependencies and patch security vulnerabilities. Run npm audit and update to latest versions.',
  description: ''
};

const result = selectSubAgents(sd, { confidenceThreshold: 0.4 });
console.log('Selected agents:', result.recommended.map(r => r.code).join(', '));
console.log('DEPENDENCY agent included:', result.recommended.some(r => r.code === 'DEPENDENCY'));
"
```

**Expected Result:**
- ✅ DEPENDENCY agent should be in recommended list
- ✅ Confidence score >= 70%
- ✅ Matched keywords: npm, CVE, vulnerability, dependencies, outdated

---

### Test 3.2: DEPENDENCY Agent npm Audit Integration
**Objective:** Verify DEPENDENCY agent runs npm audit and detects vulnerabilities

**Test Steps:**
```bash
# Execute DEPENDENCY agent directly
node scripts/execute-subagent.js --code DEPENDENCY --sd-id SD-TEST-DEPENDENCY-001
```

**Expected Result:**
- ✅ Finds package.json files
- ✅ Runs npm audit --json
- ✅ Parses vulnerability counts (critical, high, medium, low)
- ✅ Calculates security/maintenance/compatibility/performance scores
- ✅ Blocks on critical CVEs (verdict = FAIL)
- ✅ Provides recommendations for outdated packages

---

## Test Suite 4: Smart COST Agent

### Test 4.1: COST Agent Triggers on Infrastructure Keywords
**Objective:** Verify COST agent auto-triggers when infrastructure keywords detected

**Test Steps:**
```bash
# Create infrastructure-focused SD
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-COST-001',
      title: 'Scale database infrastructure to handle 10K concurrent users',
      scope: 'Add database migration for sharding, implement Redis cache, deploy load balancer',
      status: 'exec',
      priority: 90
    })
    .select()
    .single();

  console.log('Infrastructure test SD created:', data?.id);
})();
"

# Run orchestrator for PLAN_VERIFY (where COST smart logic runs)
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-COST-001
```

**Expected Result:**
- ✅ COST agent should be in "required" list
- ✅ Reason: "Infrastructure changes detected (database migration, Redis, load balancer) - cost analysis required"
- ✅ Shows matched keywords in reason

---

### Test 4.2: COST Agent Does NOT Trigger on Non-Infrastructure SD
**Objective:** Verify COST agent does not trigger for simple feature changes

**Test Steps:**
```bash
# Create simple UI SD (no infrastructure)
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-COST-002',
      title: 'Update button styling on dashboard',
      scope: 'Change button colors from blue to green. Update CSS classes.',
      status: 'exec',
      priority: 30
    })
    .select()
    .single();

  console.log('Simple UI SD created:', data?.id);
})();
"

# Run orchestrator for PLAN_VERIFY
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-COST-002
```

**Expected Result:**
- ✅ COST agent should NOT be in "required" list
- ✅ No infrastructure keywords matched
- ✅ COST agent skipped (saves unnecessary execution time)

---

## Test Suite 5: Database Migrations

### Test 5.1: Apply API Sub-Agent Migration
**Objective:** Verify API sub-agent database schema is created correctly

**Test Steps:**
```bash
# Apply migration
psql -h localhost -U postgres -d ehg_engineer -f database/migrations/20251017_add_api_subagent.sql

# Verify
psql -h localhost -U postgres -d ehg_engineer -c "
  SELECT code, name, priority, active
  FROM leo_sub_agents
  WHERE code = 'API';
"
```

**Expected Result:**
- ✅ API sub-agent row exists in leo_sub_agents table
- ✅ code = 'API', priority = 75, active = true
- ✅ 17+ triggers in leo_sub_agent_triggers table

---

### Test 5.2: Apply DEPENDENCY Sub-Agent Migration
**Objective:** Verify DEPENDENCY sub-agent database schema is created correctly

**Test Steps:**
```bash
# Apply migration
psql -h localhost -U postgres -d ehg_engineer -f database/migrations/20251017_add_dependency_subagent.sql

# Verify
psql -h localhost -U postgres -d ehg_engineer -c "
  SELECT code, name, priority, active
  FROM leo_sub_agents
  WHERE code = 'DEPENDENCY';
"
```

**Expected Result:**
- ✅ DEPENDENCY sub-agent row exists in leo_sub_agents table
- ✅ code = 'DEPENDENCY', priority = 70, active = true
- ✅ 21+ triggers in leo_sub_agent_triggers table

---

## Test Suite 6: End-to-End Orchestration

### Test 6.1: Full LEAD_PRE_APPROVAL Orchestration
**Objective:** Verify all mandatory agents execute at LEAD_PRE_APPROVAL

**Test Steps:**
```bash
# Create comprehensive SD
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-E2E-001',
      title: 'Implement user authentication with JWT',
      scope: 'Add login/logout endpoints, JWT token generation, RLS policies, user roles table',
      status: 'draft',
      priority: 85
    })
    .select()
    .single();

  console.log('E2E test SD created:', data?.id);
})();
"

# Run full orchestration
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-TEST-E2E-001
```

**Expected Result:**
- ✅ RISK agent executes (always required)
- ✅ VALIDATION agent executes (always required)
- ✅ SECURITY agent executes (always required)
- ✅ DATABASE agent executes (keyword-triggered: RLS, table)
- ✅ DESIGN agent executes if UI keywords present
- ✅ All results stored in sub_agent_execution_results table
- ✅ Aggregate verdict calculated (PASS/CONDITIONAL_PASS/FAIL)

---

### Test 6.2: Full PLAN_VERIFY Orchestration
**Objective:** Verify all verification agents execute at PLAN_VERIFY

**Test Steps:**
```bash
# Update SD to EXEC phase
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  await supabase
    .from('strategic_directives_v2')
    .update({ status: 'exec' })
    .eq('id', 'SD-TEST-E2E-001');

  console.log('SD updated to EXEC');
})();
"

# Run full orchestration
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-E2E-001
```

**Expected Result:**
- ✅ TESTING agent executes (always required)
- ✅ GITHUB agent executes (always required)
- ✅ DOCMON agent executes (always required)
- ✅ STORIES agent executes (always required)
- ✅ API agent executes (keyword-triggered: endpoints)
- ✅ DATABASE agent executes (keyword-triggered: table, RLS)
- ✅ SECURITY agent executes (keyword-triggered: JWT, auth)
- ✅ All results aggregated correctly

---

## Success Criteria

### Phase 1: Mandatory Sub-Agents
- [ ] VALIDATION always runs at LEAD_PRE_APPROVAL
- [ ] SECURITY always runs at LEAD_PRE_APPROVAL
- [ ] DOCMON always runs at PLAN_VERIFY
- [ ] STORIES always runs at PLAN_VERIFY
- [ ] TESTING always runs at PLAN_VERIFY
- [ ] GITHUB always runs at PLAN_VERIFY

### Phase 2: New Sub-Agents
- [ ] API agent triggers on API/REST/GraphQL keywords
- [ ] API agent generates comprehensive design/security/performance report
- [ ] DEPENDENCY agent triggers on npm/vulnerability keywords
- [ ] DEPENDENCY agent runs npm audit and detects CVEs
- [ ] Both agents integrated into context-aware selector

### Phase 3: Smart COST Agent
- [ ] COST agent triggers on infrastructure keywords
- [ ] COST agent does NOT trigger on non-infrastructure SDs
- [ ] Shows matched infrastructure keywords in reason

### Integration
- [ ] Database migrations apply without errors
- [ ] Orchestrator executes all required agents
- [ ] Results stored correctly in sub_agent_execution_results table
- [ ] Handoff system respects new mandatory agents

---

## Test Execution Log

**Date:** 2025-10-17
**Tester:** Claude
**Environment:** Development

| Test ID | Description | Status | Notes |
|---------|-------------|--------|-------|
| 1.1 | VALIDATION always required | ⏳ Pending | - |
| 1.2 | SECURITY always required | ⏳ Pending | - |
| 1.3 | DOCMON always required | ⏳ Pending | - |
| 1.4 | STORIES always required | ⏳ Pending | - |
| 2.1 | API triggers on keywords | ⏳ Pending | - |
| 2.2 | API execution | ⏳ Pending | - |
| 3.1 | DEPENDENCY triggers | ⏳ Pending | - |
| 3.2 | npm audit integration | ⏳ Pending | - |
| 4.1 | COST infrastructure detection | ⏳ Pending | - |
| 4.2 | COST no false positives | ⏳ Pending | - |
| 5.1 | API migration | ⏳ Pending | - |
| 5.2 | DEPENDENCY migration | ⏳ Pending | - |
| 6.1 | E2E LEAD_PRE_APPROVAL | ⏳ Pending | - |
| 6.2 | E2E PLAN_VERIFY | ⏳ Pending | - |

---

## Issues & Blockers

None yet - testing in progress.

---

## Next Steps

1. Execute Test Suite 1 (Mandatory agents)
2. Execute Test Suite 2 (API agent)
3. Execute Test Suite 3 (DEPENDENCY agent)
4. Execute Test Suite 4 (COST agent)
5. Apply database migrations (Test Suite 5)
6. Execute E2E tests (Test Suite 6)
7. Document results and blockers
8. Create issue tickets for any failures
