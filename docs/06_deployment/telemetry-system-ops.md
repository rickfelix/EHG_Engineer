---
category: deployment
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [deployment, auto-generated]
---
# Workflow Telemetry System - Operations Guide


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Deployment](#deployment)
  - [Initial Setup (One-Time)](#initial-setup-one-time)
  - [Environment Variables](#environment-variables)
- [Monitoring](#monitoring)
  - [Health Checks](#health-checks)
  - [Alerting](#alerting)
- [Troubleshooting](#troubleshooting)
  - [Issue: Analysis Not Running Automatically](#issue-analysis-not-running-automatically)
  - [Issue: Analysis Failing with Errors](#issue-analysis-failing-with-errors)
  - [Issue: No Bottlenecks Detected (But Performance Feels Slow)](#issue-no-bottlenecks-detected-but-performance-feels-slow)
  - [Issue: Too Many Improvement Items Created (Spam)](#issue-too-many-improvement-items-created-spam)
- [Maintenance](#maintenance)
  - [Weekly Tasks](#weekly-tasks)
  - [Monthly Tasks](#monthly-tasks)
- [Performance Tuning](#performance-tuning)
  - [Database Indexes](#database-indexes)
  - [Query Optimization](#query-optimization)
- [Security](#security)
  - [RLS Policies](#rls-policies)
  - [API Key Rotation](#api-key-rotation)
- [Disaster Recovery](#disaster-recovery)
  - [Backup](#backup)
  - [Restore](#restore)
  - [Runbook: Complete System Failure](#runbook-complete-system-failure)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Deployment
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.6 (EXEC Sub-Agent)
- **Last Updated**: 2026-02-09
- **Tags**: telemetry, operations, monitoring, troubleshooting, deployment
- **Related SD**: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001

## Overview

This operational guide covers deployment, monitoring, troubleshooting, and maintenance of the Workflow Telemetry System.

**Target Audience**: DevOps engineers, SREs, system administrators

**Prerequisites**:
- Access to Supabase database (SUPABASE_SERVICE_ROLE_KEY)
- Node.js 18+ installed
- Familiarity with LEO Protocol architecture

## Deployment

### Initial Setup (One-Time)

**1. Apply Database Migrations**

```bash
# Migration 1: Trace log table
psql $DATABASE_URL < database/migrations/20260209_workflow_trace_log.sql

# Migration 2: Thresholds configuration
psql $DATABASE_URL < database/migrations/20260209_telemetry_thresholds.sql

# Migration 3: Analysis runs tracking
psql $DATABASE_URL < database/migrations/20260209_telemetry_analysis_runs.sql
```

**Verification**:
```sql
-- Check tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('workflow_trace_log', 'telemetry_thresholds', 'telemetry_analysis_runs');

-- Should return 3 rows
```

**2. Configure Baseline Thresholds**

```sql
-- Insert default thresholds for phases
INSERT INTO telemetry_thresholds (dimension_type, dimension_key, baseline_p50_ms, multiplier, is_active)
VALUES
  ('phase', 'LEAD', 30000, 2.0, true),
  ('phase', 'PLAN', 60000, 2.0, true),
  ('phase', 'EXEC', 45000, 2.0, true);

-- Insert default thresholds for common gates
INSERT INTO telemetry_thresholds (dimension_type, dimension_key, baseline_p50_ms, multiplier, is_active)
VALUES
  ('gate', 'GATE_PRD_REQUIRED', 5000, 3.0, true),
  ('gate', 'GATE_DESIGN_REVIEW', 8000, 2.5, true),
  ('gate', 'GATE_TEST_COVERAGE', 10000, 2.0, true);

-- Insert default thresholds for sub-agents
INSERT INTO telemetry_thresholds (dimension_type, dimension_key, baseline_p50_ms, multiplier, is_active)
VALUES
  ('subagent', 'DESIGN', 120000, 1.5, true),
  ('subagent', 'RCA', 90000, 1.5, true),
  ('subagent', 'TESTING', 100000, 1.5, true);

-- Verify
SELECT dimension_type, COUNT(*) as count
FROM telemetry_thresholds
WHERE is_active = true
GROUP BY dimension_type;
```

**3. Install Session Start Hook**

```bash
# Hook is already installed via .claude/hooks/session-start/
# Verify it exists:
ls -la .claude/hooks/session-start/telemetry-auto-trigger.cjs

# Should show file with execute permissions
```

**4. Test Manual Analysis**

```bash
# Run dry-run analysis
node scripts/telemetry/analyze-bottlenecks.js --dry-run

# Expected output:
# ════════════════════════════════════════════════════════════
#  WORKFLOW BOTTLENECK ANALYSIS (DRY RUN)
# ════════════════════════════════════════════════════════════
# Run ID: <uuid>
# Traces scanned: <count>
# Dimensions evaluated: <count>
# ...
```

### Environment Variables

**Required**:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Optional**:
```bash
# Telemetry configuration (defaults shown)
TELEMETRY_ANALYSIS_WINDOW_DAYS=7    # How many days of traces to analyze
TELEMETRY_STALENESS_THRESHOLD_DAYS=7 # Trigger analysis if last run older than this
TELEMETRY_MAX_ITEMS_PER_DIMENSION=3  # Rate limit improvement item creation
```

## Monitoring

### Health Checks

**1. Check Last Analysis Run**

```bash
# Quick status
node -e "
require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('telemetry_analysis_runs')
  .select('status,triggered_at,finished_at,reason_code,findings_count')
  .order('triggered_at',{ascending:false})
  .limit(1)
  .single()
  .then(({data})=>console.log(JSON.stringify(data,null,2)))
"
```

**Expected Output** (healthy):
```json
{
  "status": "SUCCEEDED",
  "triggered_at": "2026-02-09T10:30:00Z",
  "finished_at": "2026-02-09T10:30:02Z",
  "reason_code": "COMPLETED",
  "findings_count": 3
}
```

**2. Check Trace Collection Rate**

```sql
-- Traces collected in last 24 hours
SELECT COUNT(*) as trace_count,
       COUNT(DISTINCT workflow_execution_id) as handoff_count,
       AVG(duration_ms) as avg_duration_ms
FROM workflow_trace_log
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**Expected**: 200-500 traces/day (depends on activity level)

**3. Check Active Thresholds**

```sql
SELECT dimension_type, COUNT(*) as active_count
FROM telemetry_thresholds
WHERE is_active = true
GROUP BY dimension_type;
```

**Expected Output**:
```
dimension_type | active_count
---------------|-------------
phase          | 3
gate           | 15
subagent       | 8
sd_type        | 12
gate+sd_type   | 45
```

### Alerting

**Critical Alerts** (should trigger immediate investigation):

1. **Analysis failing repeatedly**:
   ```sql
   SELECT COUNT(*) as failed_runs
   FROM telemetry_analysis_runs
   WHERE status = 'FAILED'
     AND triggered_at > NOW() - INTERVAL '24 hours';
   ```
   **Threshold**: ≥3 failed runs in 24 hours

2. **Analysis stuck in RUNNING**:
   ```sql
   SELECT run_id, triggered_at, EXTRACT(EPOCH FROM (NOW() - triggered_at)) as seconds_elapsed
   FROM telemetry_analysis_runs
   WHERE status = 'RUNNING'
     AND triggered_at < NOW() - INTERVAL '10 minutes';
   ```
   **Threshold**: Any run stuck >10 minutes

3. **No traces collected**:
   ```sql
   SELECT COUNT(*) as recent_traces
   FROM workflow_trace_log
   WHERE created_at > NOW() - INTERVAL '6 hours';
   ```
   **Threshold**: 0 traces in 6 hours (if system is active)

**Warning Alerts** (investigate within 24 hours):

1. **Analysis staleness**:
   ```sql
   SELECT MAX(finished_at) as last_success,
          EXTRACT(EPOCH FROM (NOW() - MAX(finished_at))) / 86400 as days_ago
   FROM telemetry_analysis_runs
   WHERE status = 'SUCCEEDED';
   ```
   **Threshold**: >7 days since last successful run

2. **High bottleneck rate**:
   ```sql
   SELECT COUNT(*) as bottleneck_count
   FROM continuous_improvements
   WHERE source = 'TELEMETRY_BOTTLENECK'
     AND created_at > NOW() - INTERVAL '24 hours';
   ```
   **Threshold**: >20 improvements created in 24 hours

## Troubleshooting

### Issue: Analysis Not Running Automatically

**Symptoms**:
- Last analysis run is >7 days old
- No `QUEUED` runs in `telemetry_analysis_runs` table

**Diagnosis**:
```bash
# Check hook exists and is executable
ls -la .claude/hooks/session-start/telemetry-auto-trigger.cjs

# Check hook logs (if available)
grep "telemetry-auto-trigger" ~/.claude/logs/hooks.log

# Manually trigger staleness check
node -e "
const {checkStaleness,enqueueAnalysis}=require('./lib/telemetry/auto-trigger.js');
const {createClient}=require('@supabase/supabase-js');
require('dotenv').config();
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
checkStaleness(supabase).then(result=>console.log(JSON.stringify(result,null,2)));
"
```

**Resolution**:
1. If hook missing: Reinstall from git
   ```bash
   git checkout .claude/hooks/session-start/telemetry-auto-trigger.cjs
   chmod +x .claude/hooks/session-start/telemetry-auto-trigger.cjs
   ```

2. If staleness check returns `isStale: true` but no analysis queued:
   ```bash
   # Manually enqueue
   node -e "
   const {enqueueAnalysis}=require('./lib/telemetry/auto-trigger.js');
   const {createClient}=require('@supabase/supabase-js');
   require('dotenv').config();
   const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
   enqueueAnalysis(supabase).then(result=>console.log(JSON.stringify(result,null,2)));
   "
   ```

### Issue: Analysis Failing with Errors

**Symptoms**:
- `telemetry_analysis_runs.status = 'FAILED'`
- `error_detail` field contains error message

**Diagnosis**:
```sql
SELECT run_id, triggered_at, error_detail, output_ref
FROM telemetry_analysis_runs
WHERE status = 'FAILED'
ORDER BY triggered_at DESC
LIMIT 5;
```

**Common Errors**:

1. **"Insufficient data"**:
   - **Cause**: <100 traces in analysis window
   - **Resolution**: Wait for more traces to accumulate (normal if system recently deployed)

2. **"Database connection timeout"**:
   - **Cause**: Database unreachable or overloaded
   - **Resolution**: Check database health, retry analysis

3. **"Threshold not found"**:
   - **Cause**: Missing threshold configuration for dimension
   - **Resolution**: Add missing threshold:
     ```sql
     INSERT INTO telemetry_thresholds (dimension_type, dimension_key, baseline_p50_ms, multiplier)
     VALUES ('gate', 'MISSING_GATE_NAME', 10000, 2.0);
     ```

### Issue: No Bottlenecks Detected (But Performance Feels Slow)

**Symptoms**:
- Analysis runs successfully (`status = 'SUCCEEDED'`)
- `findings_count = 0`
- Users report slow performance

**Diagnosis**:
```sql
-- Check if thresholds are too lenient
SELECT dimension_type, dimension_key, baseline_p50_ms, multiplier,
       (baseline_p50_ms * multiplier) as alert_threshold_ms
FROM telemetry_thresholds
WHERE is_active = true
ORDER BY alert_threshold_ms DESC;
```

**Resolution**:
1. **Lower multipliers** (more sensitive):
   ```sql
   UPDATE telemetry_thresholds
   SET multiplier = 1.5  -- Was 2.0
   WHERE dimension_type = 'phase';
   ```

2. **Adjust baselines** (reflect reality):
   ```sql
   -- First, calculate actual P50 from traces
   SELECT span_type, span_name, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as actual_p50_ms
   FROM workflow_trace_log
   WHERE created_at > NOW() - INTERVAL '7 days'
     AND span_type = 'phase'
   GROUP BY span_type, span_name;

   -- Update baseline to match reality
   UPDATE telemetry_thresholds
   SET baseline_p50_ms = <actual_p50_from_query>
   WHERE dimension_type = 'phase' AND dimension_key = 'EXEC';
   ```

3. **Add missing dimensions**:
   ```bash
   # Run analysis with --verbose to see all dimensions
   node scripts/telemetry/analyze-bottlenecks.js --dry-run --verbose
   ```

### Issue: Too Many Improvement Items Created (Spam)

**Symptoms**:
- `continuous_improvements` table flooded with bottleneck items
- Same dimension appears repeatedly

**Diagnosis**:
```sql
-- Check bottleneck item creation rate
SELECT source_detail->>'dimension_type' as dimension_type,
       source_detail->>'dimension_key' as dimension_key,
       COUNT(*) as item_count
FROM continuous_improvements
WHERE source = 'TELEMETRY_BOTTLENECK'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY source_detail->>'dimension_type', source_detail->>'dimension_key'
ORDER BY item_count DESC;
```

**Resolution**:
1. **Verify rate limiting is active**:
   ```javascript
   // In lib/telemetry/bottleneck-analyzer.js
   const MAX_ITEMS_PER_DIMENSION = 3; // Should be 3
   ```

2. **Increase multipliers** (less sensitive):
   ```sql
   UPDATE telemetry_thresholds
   SET multiplier = 3.0  -- Was 2.0
   WHERE dimension_key = 'NOISY_DIMENSION';
   ```

3. **Temporarily disable noisy dimension**:
   ```sql
   UPDATE telemetry_thresholds
   SET is_active = false
   WHERE dimension_key = 'NOISY_DIMENSION';
   ```

## Maintenance

### Weekly Tasks

**1. Review Bottleneck Trends**

```sql
-- Bottlenecks detected in last 7 days
SELECT output_ref->'bottlenecks'->0->>'dimension_type' as top_dimension_type,
       output_ref->'bottlenecks'->0->>'dimension_key' as top_dimension_key,
       output_ref->'bottlenecks'->0->>'ratio' as ratio,
       finished_at
FROM telemetry_analysis_runs
WHERE status = 'SUCCEEDED'
  AND finished_at > NOW() - INTERVAL '7 days'
  AND (output_ref->'bottlenecks'->0) IS NOT NULL
ORDER BY finished_at DESC;
```

**2. Adjust Thresholds Based on Reality**

```sql
-- Compare baselines to actual P50
WITH actual_p50 AS (
  SELECT span_type as dimension_type,
         span_name as dimension_key,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as actual_p50_ms
  FROM workflow_trace_log
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY span_type, span_name
)
SELECT t.dimension_type, t.dimension_key,
       t.baseline_p50_ms as configured_baseline,
       a.actual_p50_ms,
       ROUND((a.actual_p50_ms - t.baseline_p50_ms) / t.baseline_p50_ms::numeric * 100, 2) as variance_pct
FROM telemetry_thresholds t
JOIN actual_p50 a ON t.dimension_type = a.dimension_type AND t.dimension_key = a.dimension_key
WHERE t.is_active = true
  AND ABS(a.actual_p50_ms - t.baseline_p50_ms) > t.baseline_p50_ms * 0.2  -- >20% variance
ORDER BY variance_pct DESC;
```

**Action**: Update baselines where variance is >20%

### Monthly Tasks

**1. Archive Old Traces**

```sql
-- Traces older than 90 days (archive to cold storage or delete)
SELECT COUNT(*) as old_traces
FROM workflow_trace_log
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete old traces (if storage is a concern)
DELETE FROM workflow_trace_log
WHERE created_at < NOW() - INTERVAL '90 days';
```

**2. Review Improvement Item Outcomes**

```sql
-- Check if bottleneck improvements were effective
SELECT source_detail->>'dimension_key' as dimension,
       COUNT(*) as item_count,
       AVG((attributes->>'resolved')::boolean::int) as resolution_rate
FROM continuous_improvements
WHERE source = 'TELEMETRY_BOTTLENECK'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY source_detail->>'dimension_key';
```

## Performance Tuning

### Database Indexes

**Verify Indexes Exist**:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'workflow_trace_log'
  AND schemaname = 'public';
```

**Expected Indexes**:
- `idx_workflow_trace_log_created_at` (for time-range queries)
- `idx_workflow_trace_log_execution_time` (for execution grouping)
- `idx_workflow_trace_log_span_type_name` (for dimension queries)
- `idx_workflow_trace_log_trace_id` (for trace reconstruction)

**Add Missing Index** (if needed):
```sql
CREATE INDEX IF NOT EXISTS idx_workflow_trace_log_phase_duration
ON workflow_trace_log (phase, duration_ms DESC)
WHERE phase IS NOT NULL;
```

### Query Optimization

**Slow Query**: Percentile calculation on large datasets

**Before** (slow):
```sql
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50
FROM workflow_trace_log
WHERE created_at > NOW() - INTERVAL '7 days';
```

**After** (fast with index):
```sql
-- Pre-filter with indexed column
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50
FROM workflow_trace_log
WHERE created_at > NOW() - INTERVAL '7 days'
  AND span_type = 'phase'  -- Uses idx_workflow_trace_log_span_type_name
  AND span_name = 'EXEC';
```

## Security

### RLS Policies

**Verify Service Role Access**:
```sql
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'workflow_trace_log';
```

**Expected Policy**:
- `service_role_all_workflow_trace_log`: Allows service_role full access

### API Key Rotation

When rotating `SUPABASE_SERVICE_ROLE_KEY`:

1. Generate new key in Supabase Dashboard
2. Update `.env` file with new key
3. Restart services:
   ```bash
   node scripts/cross-platform-run.js leo-stack restart
   ```
4. Verify telemetry collection continues:
   ```sql
   SELECT COUNT(*) FROM workflow_trace_log WHERE created_at > NOW() - INTERVAL '5 minutes';
   ```

## Disaster Recovery

### Backup

**Critical Tables**:
- `telemetry_thresholds` (configuration)
- `telemetry_analysis_runs` (historical runs)
- `workflow_trace_log` (can be regenerated, but useful for forensics)

**Backup Command**:
```bash
pg_dump -t telemetry_thresholds -t telemetry_analysis_runs $DATABASE_URL > telemetry_backup_$(date +%Y%m%d).sql
```

### Restore

```bash
psql $DATABASE_URL < telemetry_backup_20260209.sql
```

### Runbook: Complete System Failure

**If telemetry system stops working entirely**:

1. **Check database connectivity**:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

2. **Verify tables exist**:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename LIKE 'telemetry%' OR tablename LIKE 'workflow_trace%';
   ```

3. **Re-apply migrations** (if tables missing):
   ```bash
   psql $DATABASE_URL < database/migrations/20260209_workflow_trace_log.sql
   psql $DATABASE_URL < database/migrations/20260209_telemetry_thresholds.sql
   psql $DATABASE_URL < database/migrations/20260209_telemetry_analysis_runs.sql
   ```

4. **Restore thresholds from backup**:
   ```bash
   psql $DATABASE_URL < telemetry_backup_latest.sql
   ```

5. **Manually trigger first analysis**:
   ```bash
   node scripts/telemetry/analyze-bottlenecks.js
   ```

6. **Verify hook is active**:
   ```bash
   ls -la .claude/hooks/session-start/telemetry-auto-trigger.cjs
   ```

## Related Documentation

- [Workflow Telemetry System Architecture](../01_architecture/workflow-telemetry-system.md)
- [Telemetry API Reference](../reference/telemetry-api.md)
- [LEO Protocol Hooks](../reference/hooks-system.md)

## Version History

- **v1.0.0** (2026-02-09): Initial operations guide
  - Deployment instructions
  - Monitoring and alerting guidelines
  - Troubleshooting runbook
  - Performance tuning recommendations
  - Disaster recovery procedures
