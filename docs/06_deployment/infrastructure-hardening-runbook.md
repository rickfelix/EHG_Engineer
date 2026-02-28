---
category: deployment
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [deployment, auto-generated]
---
# Infrastructure Hardening Operations Runbook


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Deployment Checklist](#deployment-checklist)
  - [Pre-Deployment](#pre-deployment)
  - [Deployment Steps](#deployment-steps)
  - [Post-Deployment](#post-deployment)
- [Database Migration](#database-migration)
  - [Migration Details](#migration-details)
  - [Why Manual Execution?](#why-manual-execution)
  - [Rollback Procedure](#rollback-procedure)
- [Feature Flags & Rollback](#feature-flags-rollback)
  - [Atomic Transitions](#atomic-transitions)
  - [Parallel Sub-Agent Execution](#parallel-sub-agent-execution)
  - [SD-Type Thresholds](#sd-type-thresholds)
- [Monitoring & Health Checks](#monitoring-health-checks)
  - [Key Metrics](#key-metrics)
  - [Health Check Queries](#health-check-queries)
  - [Alerting Thresholds](#alerting-thresholds)
- [Troubleshooting](#troubleshooting)
  - [Issue: Atomic Transition Not Working](#issue-atomic-transition-not-working)
  - [Issue: Parallel Execution Slower Than Expected](#issue-parallel-execution-slower-than-expected)
  - [Issue: Idempotency Keys Causing Stale Results](#issue-idempotency-keys-causing-stale-results)
  - [Issue: Gate Result Validation Warnings](#issue-gate-result-validation-warnings)
  - [Issue: SD-Type Threshold Blocking Valid Handoffs](#issue-sd-type-threshold-blocking-valid-handoffs)
- [Performance Tuning](#performance-tuning)
  - [Atomic Transition Performance](#atomic-transition-performance)
  - [Parallel Orchestration Performance](#parallel-orchestration-performance)
  - [Idempotency Cache Hit Rate](#idempotency-cache-hit-rate)
  - [Gate Validation Performance](#gate-validation-performance)
- [Emergency Contacts](#emergency-contacts)
- [Cross-References](#cross-references)
- [Version History](#version-history)

## Metadata
- **Category**: Deployment
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-30
- **Tags**: operations, runbook, infrastructure, deployment, hardening

## Overview

Operational procedures for deploying and maintaining infrastructure hardening improvements from SD-LEO-INFRA-HARDENING-001.

## Table of Contents

1. [Deployment Checklist](#deployment-checklist)
2. [Database Migration](#database-migration)
3. [Feature Flags & Rollback](#feature-flags--rollback)
4. [Monitoring & Health Checks](#monitoring--health-checks)
5. [Troubleshooting](#troubleshooting)
6. [Performance Tuning](#performance-tuning)

---

## Deployment Checklist

### Pre-Deployment

- [ ] **PR Merged**: Verify PR #684 merged to main
- [ ] **CI/CD Passing**: All tests pass in GitHub Actions
- [ ] **Database Backup**: Create snapshot before migration
- [ ] **Maintenance Window**: Schedule low-traffic window (if needed)
- [ ] **Rollback Plan**: Document rollback procedure
- [ ] **Team Notification**: Alert team of deployment

### Deployment Steps

#### Step 1: Database Migration

**CRITICAL**: This step requires manual execution in Supabase Dashboard.

1. **Navigate to Supabase Dashboard**
   - Project: `dedlbzhpgkmetvhbkyzq`
   - Go to: SQL Editor

2. **Execute Migration**
   - Open file: `database/migrations/20260130_atomic_handoff_transitions.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click "Run"

3. **Verify Migration**
   ```sql
   -- Check function exists
   SELECT proname
   FROM pg_proc
   WHERE proname = 'fn_atomic_exec_to_plan_transition';

   -- Check table exists
   SELECT table_name
   FROM information_schema.tables
   WHERE table_name = 'sd_transition_audit';

   -- Check initial record count
   SELECT COUNT(*) FROM sd_transition_audit;
   ```

**Expected Results**:
- Function: `fn_atomic_exec_to_plan_transition` exists
- Table: `sd_transition_audit` exists with 0 rows
- No errors during execution

#### Step 2: Code Deployment

```bash
# Pull latest from main
git checkout main
git pull origin main

# Restart services
npm run leo-stack:restart

# Verify services started
npm run leo-stack:status
```

#### Step 3: Smoke Test

```bash
# Run smoke tests
npm run test:smoke

# Expected: All tests pass
```

#### Step 4: Integration Test

**Test Atomic Transitions**:
```bash
# Create test SD
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Insert test SD
  const { data } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-ATOMIC-001',
      title: 'Test Atomic Transition',
      current_phase: 'EXEC_IMPLEMENTATION'
    })
    .select()
    .single();
  console.log('Test SD created:', data.id);
})();
"

# Run handoff to test atomic transition
node scripts/handoff.js execute EXEC-TO-PLAN SD-TEST-ATOMIC-001

# Check transition audit
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase
    .from('sd_transition_audit')
    .select('*')
    .eq('sd_id', 'SD-TEST-ATOMIC-001')
    .single();
  console.log('Audit record:', JSON.stringify(data, null, 2));
})();
"

# Cleanup test SD
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  await supabase.from('strategic_directives_v2').delete().eq('id', 'SD-TEST-ATOMIC-001');
  console.log('Test SD deleted');
})();
"
```

**Expected Results**:
- Atomic transition succeeds
- Audit record created in `sd_transition_audit`
- No errors in logs

### Post-Deployment

- [ ] **Monitor Logs**: Watch for errors in first hour
- [ ] **Check Metrics**: Verify handoff success rate
- [ ] **Update Status**: Mark SD as deployed
- [ ] **Document Issues**: Log any unexpected behavior

---

## Database Migration

### Migration Details

**File**: `database/migrations/20260130_atomic_handoff_transitions.sql`

**Creates**:
- Table: `sd_transition_audit`
- Function: `fn_atomic_exec_to_plan_transition`

**Size**: ~268 lines

**Estimated Execution Time**: <5 seconds

### Why Manual Execution?

The migration creates a PostgreSQL function which requires DDL (Data Definition Language) privileges. The Supabase service role key has DML (Data Manipulation Language) privileges but not DDL.

### Rollback Procedure

If migration causes issues:

```sql
-- Drop function
DROP FUNCTION IF EXISTS fn_atomic_exec_to_plan_transition(TEXT, TEXT, TEXT, TEXT);

-- Drop table (WARNING: Deletes audit trail)
DROP TABLE IF EXISTS sd_transition_audit;
```

**Note**: After rollback, atomic transitions will automatically fall back to legacy mode.

---

## Feature Flags & Rollback

### Atomic Transitions

**Automatic Fallback**: The system automatically detects if the atomic transition function is unavailable and falls back to legacy sequential mode.

**No feature flag needed** - graceful degradation is built-in.

**Check Current Mode**:
```javascript
// In any handoff executor
const atomicAvailable = await isAtomicTransitionAvailable(supabase);
console.log(`Atomic mode: ${atomicAvailable ? 'ACTIVE' : 'FALLBACK'}`);
```

### Parallel Sub-Agent Execution

**Always enabled** - no feature flag.

**To disable** (emergency only):
```javascript
// In scripts/modules/phase-subagent-orchestrator/index.js
// Comment out parallel execution block and revert to sequential:

// EMERGENCY ROLLBACK: Sequential execution
for (const subAgent of requiredSubAgents) {
  const result = await executeSubAgent(subAgent, sdId, options);
  results.push(result);
}
```

### SD-Type Thresholds

**Adjust Thresholds**:
```javascript
// In scripts/modules/sd-type-checker.js
export const THRESHOLD_PROFILES = {
  security: { gateThreshold: 90 },      // Adjust as needed
  feature: { gateThreshold: 85 },
  infrastructure: { gateThreshold: 80 },
  // ...
};
```

**Disable Enforcement** (emergency only):
```javascript
// In scripts/modules/handoff/validation/ValidationOrchestrator.js
// Comment out SD-type threshold enforcement block (lines 188-208)
```

---

## Monitoring & Health Checks

### Key Metrics

| Metric | Query | Expected Value |
|--------|-------|----------------|
| Atomic Transition Success Rate | `SELECT COUNT(*) FROM sd_transition_audit WHERE status = 'completed'` | >95% |
| Average Handoff Duration | `SELECT AVG(execution_time_ms) FROM sd_phase_handoffs WHERE from_phase = 'EXEC_IMPLEMENTATION'` | <30s |
| Parallel Orchestration Speed | `SELECT AVG(execution_time) FROM sub_agent_execution_results WHERE metadata->>'orchestrated' = 'true'` | <15s |
| Idempotent Hit Rate | `SELECT COUNT(*) FROM sub_agent_execution_results WHERE metadata->>'idempotent_hit' = 'true'` | Varies |

### Health Check Queries

**Check Atomic Transition Function**:
```sql
SELECT
  proname,
  prorettype::regtype,
  prosrc
FROM pg_proc
WHERE proname = 'fn_atomic_exec_to_plan_transition';
```

**Check Recent Transitions**:
```sql
SELECT
  sd_id,
  transition_type,
  status,
  created_at
FROM sd_transition_audit
ORDER BY created_at DESC
LIMIT 10;
```

**Check Failed Transitions**:
```sql
SELECT
  sd_id,
  transition_type,
  error_message,
  created_at
FROM sd_transition_audit
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

**Check Idempotency Hits**:
```sql
SELECT
  sub_agent_code,
  COUNT(*) as duplicate_attempts
FROM sub_agent_execution_results
WHERE metadata->>'idempotent_hit' = 'true'
GROUP BY sub_agent_code
ORDER BY duplicate_attempts DESC;
```

### Alerting Thresholds

| Condition | Action |
|-----------|--------|
| Atomic transition failure rate >5% | Investigate database connection |
| Handoff duration >60s | Check sub-agent performance |
| Idempotent hit rate >50% | Check for retry loops |
| Gate result validation failures >10% | Review gate implementations |

---

## Troubleshooting

### Issue: Atomic Transition Not Working

**Symptoms**: Handoffs fall back to legacy mode, log shows "Atomic RPC not available"

**Diagnosis**:
```bash
# Check function exists
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { error } = await supabase.rpc('fn_atomic_exec_to_plan_transition', {
    p_sd_id: 'TEST',
    p_prd_id: null,
    p_session_id: 'test',
    p_request_id: 'test'
  });
  if (error) console.log('Error:', error.message);
  else console.log('Function exists');
})();
"
```

**Resolution**:
1. Verify migration was executed in Supabase Dashboard
2. Check function exists in database
3. Verify service role key has correct permissions
4. If persistent, system will gracefully fall back to legacy mode

### Issue: Parallel Execution Slower Than Expected

**Symptoms**: Orchestration time not reduced by 60-70%

**Diagnosis**:
```bash
# Check how many agents are independent
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase
    .from('leo_sub_agents')
    .select('code, depends_on');
  const independent = data.filter(a => !a.depends_on || a.depends_on.length === 0);
  console.log('Independent agents:', independent.length, '/', data.length);
  console.log('Parallelization potential:', Math.round(independent.length / data.length * 100), '%');
})();
"
```

**Resolution**:
- If most agents have dependencies, parallelization benefit is limited
- Review sub-agent dependencies - remove unnecessary dependencies
- Monitor CPU/memory during parallel execution

### Issue: Idempotency Keys Causing Stale Results

**Symptoms**: Sub-agent returns old cached result instead of re-executing

**Diagnosis**:
```bash
# Check idempotency key age
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(10);
  data.forEach(r => {
    const age = Date.now() - new Date(r.created_at).getTime();
    console.log(r.sub_agent_code, 'age:', Math.round(age / 60000), 'min');
  });
})();
"
```

**Resolution**:
- Idempotency keys expire after 1 hour (by design)
- Wait 1 hour for key to expire naturally
- Or force re-run with `skipIdempotency: true` option:
  ```javascript
  await storeSubAgentResult(supabase, sdId, result, { skipIdempotency: true });
  ```

### Issue: Gate Result Validation Warnings

**Symptoms**: Log shows "Gate X result normalized with Y fix(es)"

**Diagnosis**: Review gate implementation

**Resolution**:
- Auto-fix handles most cases automatically
- If persistent warnings, update gate to return correct schema:
  ```javascript
  return {
    passed: true,  // Not 'pass'
    score: 100,
    maxScore: 100,
    issues: [],
    warnings: []
  };
  ```

### Issue: SD-Type Threshold Blocking Valid Handoffs

**Symptoms**: Gate score 82% but infrastructure SD requires 80%

**Diagnosis**:
```bash
# Check actual score vs threshold
grep "SD-Type Threshold" <handoff-log-file>
```

**Resolution**:
- Review gate scores - which gates are underperforming?
- Adjust threshold if too strict for SD type
- Fix failing gates to improve score

---

## Performance Tuning

### Atomic Transition Performance

**Baseline**: <100ms per transition

**Optimization**:
- Advisory lock is very fast (microseconds)
- Transaction overhead minimal
- If slow, check database connection latency

**Monitoring**:
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as avg_duration_ms
FROM sd_transition_audit
WHERE status = 'completed'
AND created_at > NOW() - INTERVAL '1 day';
```

### Parallel Orchestration Performance

**Baseline**: 60-70% time reduction for 3+ independent agents

**Optimization**:
```javascript
// Increase concurrency limit (default: unlimited)
const concurrencyLimit = 5; // Adjust based on system capacity

const parallelResults = await pLimit(concurrencyLimit)(
  independentAgents.map(async (subAgent) => {
    return executeSubAgent(subAgent, sdId, options);
  })
);
```

**Monitoring**:
```sql
SELECT
  COUNT(*) as total_executions,
  AVG(execution_time) as avg_time_sec
FROM sub_agent_execution_results
WHERE metadata->>'orchestrated' = 'true'
AND created_at > NOW() - INTERVAL '1 day';
```

### Idempotency Cache Hit Rate

**Target**: <10% hit rate (most executions should be new)

**High hit rate indicates**: Retry loops or duplicate orchestrations

**Monitoring**:
```sql
SELECT
  COUNT(*) FILTER (WHERE metadata->>'idempotent_hit' = 'true') * 100.0 / COUNT(*) as hit_rate_pct
FROM sub_agent_execution_results
WHERE created_at > NOW() - INTERVAL '1 day';
```

### Gate Validation Performance

**Baseline**: <5s for 26 gates

**Optimization**:
- Schema validation is very fast (~1ms per gate)
- Slow gates indicate validator logic issues
- Use `validateGates` for sequential, `validateGatesAll` for batch

**Monitoring**:
```sql
SELECT
  from_phase,
  to_phase,
  AVG(execution_time_ms) as avg_validation_ms
FROM sd_phase_handoffs
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY from_phase, to_phase
ORDER BY avg_validation_ms DESC;
```

---

## Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| Database Admin | [Contact] | Migration issues, rollback |
| Platform Lead | [Contact] | Performance degradation |
| On-Call Engineer | [Contact] | After-hours issues |

---

## Cross-References

- **Technical Patterns**: [../reference/infrastructure-hardening-patterns.md](../reference/infrastructure-hardening-patterns.md)
- **Database Patterns**: [../reference/database-agent-patterns.md](../reference/database-agent-patterns.md)
- **LEO Operations**: [leo-5-operations.md](./leo-5-operations.md)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial operations runbook from SD-LEO-INFRA-HARDENING-001 |
