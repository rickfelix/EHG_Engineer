---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Agent Metrics Database Migration


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-22
- **Tags**: database, testing, migration, schema

## Quick Start

Apply the agent performance metrics schema to enable observability tracking:

```bash
npm run db:agent-metrics
```

## What This Does

Creates 3 tables in your EHG_Engineer database:
1. **agent_performance_metrics** - Core metrics storage (REQUIRED for observability)
2. **user_context_patterns** - Pattern learning (future use)
3. **interaction_history** - Interaction tracking (future use)
4. **learning_configurations** - Adaptive configs (future use)
5. **feedback_events** - User feedback (future use)

## Prerequisites

### 1. Environment Variable
Ensure `.env` contains:
```
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[password]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

### 2. Database Access
You need write access to the EHG_Engineer Supabase database.

## Migration Steps

### Option A: Using npm script (Recommended)
```bash
npm run db:agent-metrics
```

**Expected Output**:
```
🔨 Database SQL Executor
═══════════════════════════════════════════════════
📊 Target Database: EHG_Engineer Management DB
   Project ID: dedlbzhpgkmetvhbkyzq
   Purpose: Strategic Directives, PRDs, LEO Protocol
═══════════════════════════════════════════════════

📄 SQL File: 009_context_learning_schema.sql
   Size: 15.2 KB
   Estimated statements: 25

🔗 Connecting to database...
✅ Connected successfully!

⚙️  Executing SQL...
✅ SQL executed successfully!
```

### Option B: Manual (if needed)
```bash
node scripts/execute-database-sql.js database/schema/009_context_learning_schema.sql
```

### Option C: Supabase Dashboard
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `database/schema/009_context_learning_schema.sql`
3. Paste and execute

## Verification

After migration, verify tables exist:

```bash
# Test observability system
npm run agent:metrics

# Should show: "✅ Agent Observability initialized" (no warnings)
```

Or query database:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'agent_performance_metrics';
```

## Troubleshooting

### Issue: "SUPABASE_POOLER_URL not found"
**Solution**: Add to `.env` file (see Prerequisites above)

### Issue: "permission denied"
**Solution**: Ensure your Supabase user has CREATE TABLE permissions

### Issue: "table already exists"
**Solution**: Migration uses `CREATE TABLE IF NOT EXISTS`, safe to run multiple times

### Issue: Migration hangs
**Solution**:
1. Check internet connection
2. Verify Supabase project is running
3. Check connection string format

## What's Created

### agent_performance_metrics Table
```sql
Columns:
- id (UUID, primary key)
- agent_code (VARCHAR) - e.g., 'VALIDATION', 'TESTING'
- measurement_date (DATE) - Date of metrics
- total_executions (INT) - Number of times agent ran
- successful_executions (INT) - Success count
- failed_executions (INT) - Failure count
- avg_execution_time (DECIMAL) - Average time in ms
- max_execution_time (INT) - Longest execution in ms
- times_selected (INT) - Times agent was chosen
- ... (see schema for full list)

Indexes:
- idx_agent_performance (agent_code, measurement_date DESC)
- idx_agent_success_rate (successful_executions DESC)
```

## Next Steps

After migration is complete:

1. **Test the system**:
   ```bash
   node lib/agents/observability-example.cjs 1
   npm run agent:metrics
   ```

2. **Integrate into agents**:
   ```javascript
   const { AgentObservability } = require('./lib/agents/observability.cjs');
   const obs = new AgentObservability();
   await obs.initialize();

   const tracker = obs.startTracking('VALIDATION');
   // ... agent work ...
   await tracker.end({ success: true });
   ```

3. **View metrics**:
   ```bash
   npm run agent:metrics              # Summary
   npm run agent:metrics:agent VALIDATION  # Details
   npm run agent:metrics:top 10       # Top agents
   ```

## Rollback

If needed, drop the tables:

```sql
DROP TABLE IF EXISTS feedback_events;
DROP TABLE IF EXISTS interaction_history;
DROP TABLE IF EXISTS agent_performance_metrics;
DROP TABLE IF EXISTS user_context_patterns;
DROP TABLE IF EXISTS learning_configurations;
```

**Note**: This will lose all collected metrics data.

## Schema File Location

`database/schema/009_context_learning_schema.sql`

## Related Documentation

- `lib/agents/OBSERVABILITY-README.md` - Full observability docs
- `lib/agents/C1.3-COMPLETION-SUMMARY.md` - Implementation details
- `lib/agents/observability-example.cjs` - Usage examples

---

**Created**: 2025-10-26
**Part of**: Quick Wins Path - Week 1
**Status**: Ready to apply
**Estimated Time**: 2-5 minutes
