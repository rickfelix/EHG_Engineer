---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Agent Observability System


## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
  - [Track Agent Execution](#track-agent-execution)
  - [View Metrics Dashboard](#view-metrics-dashboard)
- [Architecture](#architecture)
  - [Components](#components)
  - [Database Schema](#database-schema)
  - [Data Flow](#data-flow)
- [API Reference](#api-reference)
  - [AgentObservability Class](#agentobservability-class)
- [CLI Dashboard](#cli-dashboard)
  - [Commands](#commands)
- [Usage Examples](#usage-examples)
  - [Example 1: Basic Tracking](#example-1-basic-tracking)
  - [Example 2: Tracking with Context](#example-2-tracking-with-context)
  - [Example 3: Wrapper Function](#example-3-wrapper-function)
  - [Example 4: Agent Class Integration](#example-4-agent-class-integration)
  - [Example 5: Parallel Tracking](#example-5-parallel-tracking)
- [Integration with Existing Systems](#integration-with-existing-systems)
  - [Integration with Agent Registry (C1.1)](#integration-with-agent-registry-c11)
  - [Integration with Script CLI (A1.2)](#integration-with-script-cli-a12)
- [Metrics Explanation](#metrics-explanation)
  - [Success Rate](#success-rate)
  - [Average Execution Time](#average-execution-time)
  - [Max Execution Time](#max-execution-time)
- [Performance Considerations](#performance-considerations)
  - [Database Writes](#database-writes)
  - [Caching](#caching)
  - [Graceful Degradation](#graceful-degradation)
- [Troubleshooting](#troubleshooting)
  - [Issue: "Agent performance metrics table not found"](#issue-agent-performance-metrics-table-not-found)
  - [Issue: Metrics not appearing in dashboard](#issue-metrics-not-appearing-in-dashboard)
  - [Issue: Empty metrics for specific agent](#issue-empty-metrics-for-specific-agent)
  - [Issue: Slow dashboard performance](#issue-slow-dashboard-performance)
- [Best Practices](#best-practices)
  - [1. Always Initialize First](#1-always-initialize-first)
  - [2. Always End Trackers](#2-always-end-trackers)
  - [3. Provide Meaningful Context](#3-provide-meaningful-context)
  - [4. Track All Agent Executions](#4-track-all-agent-executions)
  - [5. Review Metrics Regularly](#5-review-metrics-regularly)
- [Future Enhancements (Phase 2)](#future-enhancements-phase-2)
- [Metrics Summary](#metrics-summary)
- [Related Files](#related-files)

**Version**: 1.0.0
**Task**: C1.3 - Agent Observability Metrics
**Phase**: Phase 1, Week 2 (Agent Coordination & Monitoring)
**Status**: ✅ COMPLETED

## Overview

Complete observability system for tracking agent usage, performance, and effectiveness. Provides real-time monitoring, historical metrics, and performance analytics for all LEO Protocol sub-agents.

## Features

✅ **Agent Invocation Tracking** - Track every agent execution
✅ **Performance Metrics** - Execution time, success/failure rates
✅ **Database Persistence** - Metrics stored in `agent_performance_metrics` table
✅ **Real-Time Monitoring** - View currently executing agents
✅ **Historical Analysis** - 30-day performance history
✅ **Top Agent Rankings** - Identify best performing agents
✅ **Agent Comparison** - Side-by-side agent performance
✅ **Success Rate Analytics** - Track agent reliability
✅ **Execution Time Analysis** - Identify slow agents
✅ **Interactive Dashboard** - CLI for viewing metrics

## Quick Start

### Track Agent Execution
```javascript
const { AgentObservability } = require('./lib/agents/observability.cjs');

const obs = new AgentObservability();
await obs.initialize();

// Start tracking
const tracker = obs.startTracking('VALIDATION');

try {
  // Your agent code here
  await runValidation();

  // End tracking with success
  await tracker.end({ success: true });
} catch (error) {
  // End tracking with failure
  await tracker.end({ success: false, error: error.message });
}
```

### View Metrics Dashboard
```bash
# Show summary of all agents
npm run agent:metrics

# View specific agent details
npm run agent:metrics:agent VALIDATION

# Show top 10 agents
npm run agent:metrics:top 10
```

## Architecture

### Components

```
lib/agents/
├── observability.cjs           (350 LOC) - Core tracking system
├── metrics-dashboard.cjs       (550 LOC) - CLI dashboard
├── observability-example.cjs   (300 LOC) - Usage examples
├── registry.cjs                (From C1.1) - Agent registry
└── OBSERVABILITY-README.md     (This file)
```

### Database Schema

Uses existing `agent_performance_metrics` table from `database/schema/009_context_learning_schema.sql`:

```sql
CREATE TABLE agent_performance_metrics (
    id UUID PRIMARY KEY,
    agent_code VARCHAR(50) NOT NULL,
    agent_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    measurement_window VARCHAR(20) NOT NULL DEFAULT 'daily',

    -- Execution Metrics
    total_executions INTEGER NOT NULL DEFAULT 0,
    successful_executions INTEGER NOT NULL DEFAULT 0,
    failed_executions INTEGER NOT NULL DEFAULT 0,
    avg_execution_time DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    max_execution_time INTEGER NOT NULL DEFAULT 0,

    -- Selection Metrics
    times_selected INTEGER NOT NULL DEFAULT 0,
    avg_selection_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.0,

    -- User Feedback
    positive_feedback INTEGER NOT NULL DEFAULT 0,
    negative_feedback INTEGER NOT NULL DEFAULT 0,
    user_dismissals INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Data Flow

```
Agent Execution
  ↓
obs.startTracking('AGENT_CODE')
  ↓
[Agent performs work]
  ↓
tracker.end({ success, data })
  ↓
Metrics recorded to database
  ↓
metrics-dashboard.cjs queries database
  ↓
Display metrics to user
```

## API Reference

### AgentObservability Class

#### Constructor
```javascript
const obs = new AgentObservability();
```

#### Methods

##### initialize()
Initialize the observability system and verify database connection.

```javascript
await obs.initialize();
```

##### startTracking(agentCode, context)
Start tracking an agent invocation.

**Parameters**:
- `agentCode` (string): Agent code (e.g., 'VALIDATION', 'TESTING')
- `context` (object, optional): Additional context data

**Returns**: Tracker object with `end()` method

```javascript
const tracker = obs.startTracking('VALIDATION', {
  testType: 'unit',
  fileCount: 25
});
```

##### tracker.end(result)
End tracking and record metrics.

**Parameters**:
- `result.success` (boolean): Whether execution succeeded
- `result.error` (string, optional): Error message if failed
- `result.data` (object, optional): Result data
- `result.context` (object, optional): Additional context

```javascript
await tracker.end({
  success: true,
  data: { testsRun: 125, passed: 120 }
});
```

##### getAgentMetrics(agentCode, options)
Get historical metrics for a specific agent.

**Parameters**:
- `agentCode` (string): Agent code
- `options.window` (string): Time window ('daily', 'weekly', 'monthly')
- `options.limit` (number): Number of records to fetch
- `options.startDate` (string): Start date (YYYY-MM-DD)
- `options.endDate` (string): End date (YYYY-MM-DD)

**Returns**: Metrics object with records and summary

```javascript
const metrics = await obs.getAgentMetrics('VALIDATION', {
  window: 'daily',
  limit: 30
});

console.log(metrics.summary.totalExecutions);
console.log(metrics.summary.successRate);
console.log(metrics.summary.avgExecutionTime);
```

##### getAllMetrics(options)
Get metrics for all agents.

**Parameters**:
- `options.window` (string): Time window
- `options.limit` (number): Days to fetch

**Returns**: Array of metrics for all agents

```javascript
const allMetrics = await obs.getAllMetrics({ limit: 7 });

allMetrics.forEach(metric => {
  console.log(`${metric.agentCode}: ${metric.summary.totalExecutions} executions`);
});
```

##### getTopAgents(limit)
Get top performing agents by success rate.

**Returns**: Array of top agents

```javascript
const topAgents = await obs.getTopAgents(10);
```

##### getMostActiveAgents(limit)
Get agents with most executions.

**Returns**: Array of most active agents

```javascript
const activeAgents = await obs.getMostActiveAgents(10);
```

##### getActiveTrackers()
Get currently executing agents.

**Returns**: Array of active tracker information

```javascript
const active = obs.getActiveTrackers();
console.log(`${active.length} agents currently executing`);
```

## CLI Dashboard

### Commands

#### summary (default)
Show summary of all agents with performance overview.

```bash
npm run agent:metrics
# or
node lib/agents/metrics-dashboard.cjs summary
```

**Output**:
```
📊 Agent Performance Summary

════════════════════════════════════════════════════════════════════════════════
Agent Performance (Last 7 Days)

Agent Code            Executions    Success Rate      Avg Time      Status
────────────────────────────────────────────────────────────────────────────────
VALIDATION                   245          98.8%          125ms          ✓
TESTING                      189          95.2%          340ms          ✓
DATABASE                     156          97.4%           85ms          ✓
SECURITY                      98          100.0%         210ms          ✓
...

════════════════════════════════════════════════════════════════════════════════
Overall Statistics:
  Total Agents Tracked: 14
  Total Executions:     1,245
  Overall Success Rate: 97.5%
```

#### agent <code>
Show detailed metrics for a specific agent.

```bash
npm run agent:metrics:agent VALIDATION
# or
node lib/agents/metrics-dashboard.cjs agent VALIDATION
```

**Output**:
```
📈 Agent Details: Validation Agent

════════════════════════════════════════════════════════════════════════════════
Agent Information:
  Code:        VALIDATION
  Category:    Quality Assurance
  Description: Validates code quality and standards compliance

Performance Summary (Last 30 Days):
  Total Executions:      245
  Successful:            242 (98.8%)
  Failed:                3
  Avg Execution Time:    125ms
  Max Execution Time:    450ms
  First Seen:            2025-10-20
  Last Seen:             2025-10-26

Daily Metrics (Last 7 Days):

Date          Executions      Success      Failed      Avg Time
────────────────────────────────────────────────────────────────
2025-10-26            45       45 (100%)          0        120ms
2025-10-25            38       37 (97%)           1        130ms
...
```

#### top [limit]
Show top performing agents.

```bash
npm run agent:metrics:top 5
# or
node lib/agents/metrics-dashboard.cjs top 5
```

**Output**:
```
🏆 Top 5 Performing Agents

════════════════════════════════════════════════════════════════════════════════
Rank    Agent                       Executions    Success Rate      Avg Time
────────────────────────────────────────────────────────────────────────────────
1.      Security Agent                      98          100.0%         210ms
2.      Validation Agent                   245           98.8%         125ms
3.      Database Agent                     156           97.4%          85ms
4.      Testing Agent                      189           95.2%         340ms
5.      Documentation Agent                 67           94.0%         180ms
```

#### active
Show currently executing agents.

```bash
node lib/agents/metrics-dashboard.cjs active
```

**Output**:
```
⚡ Active Agent Executions

════════════════════════════════════════════════════════════════════════════════
Agent                 Duration       Started
────────────────────────────────────────────────────────────────────────────────
Testing Agent             2.5s      14:32:15
Validation Agent          0.8s      14:32:17
```

#### compare <code1> <code2>
Compare two agents side by side.

```bash
node lib/agents/metrics-dashboard.cjs compare VALIDATION TESTING
```

**Output**:
```
⚖️  Agent Comparison

════════════════════════════════════════════════════════════════════════════════
Metric                     Validation Agent           Testing Agent
────────────────────────────────────────────────────────────────────────────────
Total Executions           245                        189
Success Rate               98.8%                      95.2%
Avg Execution Time         125ms                      340ms
Max Execution Time         450ms                      980ms
Failed Executions          3                          9
```

## Usage Examples

### Example 1: Basic Tracking
```javascript
const { AgentObservability } = require('./lib/agents/observability.cjs');

async function runValidation() {
  const obs = new AgentObservability();
  await obs.initialize();

  const tracker = obs.startTracking('VALIDATION');

  try {
    // Validation logic
    const result = await validateCode();

    await tracker.end({
      success: true,
      data: result
    });
  } catch (error) {
    await tracker.end({
      success: false,
      error: error.message
    });
    throw error;
  }
}
```

### Example 2: Tracking with Context
```javascript
const tracker = obs.startTracking('TESTING', {
  testType: 'unit',
  framework: 'jest',
  fileCount: 25
});

const result = await runTests();

await tracker.end({
  success: true,
  data: {
    totalTests: 125,
    passed: 120,
    failed: 5
  },
  context: {
    coverage: 85.5
  }
});
```

### Example 3: Wrapper Function
```javascript
async function withObservability(agentCode, agentFunction, context = {}) {
  const obs = new AgentObservability();
  await obs.initialize();

  const tracker = obs.startTracking(agentCode, context);

  try {
    const result = await agentFunction();
    await tracker.end({ success: true, data: result });
    return result;
  } catch (error) {
    await tracker.end({ success: false, error: error.message });
    throw error;
  }
}

// Usage
const result = await withObservability('DATABASE', async () => {
  return await runMigrations();
}, { database: 'production' });
```

### Example 4: Agent Class Integration
```javascript
class ValidationAgent {
  constructor() {
    this.obs = new AgentObservability();
  }

  async initialize() {
    await this.obs.initialize();
  }

  async validate(data) {
    const tracker = this.obs.startTracking('VALIDATION', {
      dataSize: JSON.stringify(data).length
    });

    try {
      const result = await this._performValidation(data);
      await tracker.end({ success: true, data: result });
      return result;
    } catch (error) {
      await tracker.end({ success: false, error: error.message });
      throw error;
    }
  }
}
```

### Example 5: Parallel Tracking
```javascript
const obs = new AgentObservability();
await obs.initialize();

const tracker1 = obs.startTracking('VALIDATION');
const tracker2 = obs.startTracking('TESTING');
const tracker3 = obs.startTracking('SECURITY');

await Promise.all([
  runValidation().then(() => tracker1.end({ success: true })),
  runTests().then(() => tracker2.end({ success: true })),
  runSecurity().then(() => tracker3.end({ success: true })),
]);
```

## Integration with Existing Systems

### Integration with Agent Registry (C1.1)
```javascript
const { AgentRegistry } = require('./lib/agents/registry.cjs');
const { AgentObservability } = require('./lib/agents/observability.cjs');

const registry = new AgentRegistry();
const obs = new AgentObservability();

await Promise.all([
  registry.initialize(),
  obs.initialize()
]);

// Get agent metadata from registry
const agent = registry.getAgent('VALIDATION');

// Track agent execution
const tracker = obs.startTracking(agent.code);
// ... execution ...
await tracker.end({ success: true });
```

### Integration with Script CLI (A1.2)
The observability system can track script executions:

```javascript
// In cli.cjs
const { AgentObservability } = require('../lib/agents/observability.cjs');

async function executeScript(scriptName, args) {
  const obs = new AgentObservability();
  await obs.initialize();

  const tracker = obs.startTracking('SCRIPT_EXECUTION', {
    scriptName,
    args
  });

  try {
    // Execute script
    const result = await runScript(scriptName, args);
    await tracker.end({ success: true, data: result });
    return result;
  } catch (error) {
    await tracker.end({ success: false, error: error.message });
    throw error;
  }
}
```

## Metrics Explanation

### Success Rate
Percentage of executions that completed successfully.

**Formula**: `(successful_executions / total_executions) * 100`

**Interpretation**:
- `>= 95%`: Excellent reliability
- `85-95%`: Good reliability
- `< 85%`: Needs investigation

### Average Execution Time
Mean time taken for agent execution in milliseconds.

**Calculation**: Weighted average across all executions

**Interpretation**:
- `< 200ms`: Fast
- `200-1000ms`: Normal
- `> 1000ms`: Slow (may need optimization)

### Max Execution Time
Longest execution time recorded.

**Use**: Identify outliers and worst-case performance

## Performance Considerations

### Database Writes
Metrics are recorded asynchronously to avoid blocking agent execution:

```javascript
// Non-blocking metric recording
this._recordMetrics(metrics).catch(err => {
  console.error('Failed to record metrics:', err);
});
```

### Caching
Metrics cache reduces database queries:

```javascript
// Cache invalidated on updates
this.metricsCache.delete(agentCode);
```

### Graceful Degradation
System continues working if database is unavailable:

```javascript
if (!this.initialized) {
  return this._getEmptyMetrics(agentCode);
}
```

## Troubleshooting

### Issue: "Agent performance metrics table not found"
**Cause**: Database migration not run
**Solution**: Run migration:
```bash
# Apply database/schema/009_context_learning_schema.sql to Supabase
```

### Issue: Metrics not appearing in dashboard
**Cause**: No agents have been tracked yet
**Solution**: Run example to generate test metrics:
```bash
node lib/agents/observability-example.cjs 1
```

### Issue: Empty metrics for specific agent
**Cause**: Agent has not been executed
**Solution**: Verify agent code spelling and check if agent has run

### Issue: Slow dashboard performance
**Cause**: Large number of historical records
**Solution**: Reduce query limit or filter by date range

## Best Practices

### 1. Always Initialize First
```javascript
const obs = new AgentObservability();
await obs.initialize(); // Don't forget this!
```

### 2. Always End Trackers
```javascript
try {
  await agentWork();
  await tracker.end({ success: true });
} catch (error) {
  await tracker.end({ success: false, error: error.message });
  throw error; // Re-throw after tracking
}
```

### 3. Provide Meaningful Context
```javascript
const tracker = obs.startTracking('TESTING', {
  testType: 'unit',          // Helpful for filtering
  framework: 'jest',         // Helpful for analysis
  fileCount: 25              // Helpful for performance analysis
});
```

### 4. Track All Agent Executions
Consistent tracking enables accurate performance analysis.

### 5. Review Metrics Regularly
```bash
# Weekly review
npm run agent:metrics

# Investigate low performers
npm run agent:metrics:agent LOW_SUCCESS_AGENT
```

## Future Enhancements (Phase 2)

1. **Web Dashboard**: Visual charts and graphs
2. **Alerting**: Notify when success rate drops below threshold
3. **Trending**: Track performance trends over time
4. **Comparison**: Compare performance across time periods
5. **Export**: Export metrics to CSV/JSON
6. **Cost Tracking**: Track API costs per agent
7. **User Feedback Integration**: Collect user satisfaction
8. **Agent Recommendations**: Suggest best agent for task
9. **Performance Budgets**: Set performance goals per agent
10. **Automated Optimization**: Auto-adjust agent selection

## Metrics Summary

| Metric | Value |
|--------|-------|
| Core System LOC | 350 |
| Dashboard LOC | 550 |
| Examples LOC | 300 |
| Total LOC | 1,200 |
| CLI Commands | 6 |
| API Methods | 9 |
| Database Tables | 1 (reused) |
| Performance Impact | < 5ms overhead |
| Documentation | ✅ Complete |

## Related Files

- **observability.cjs** - Core tracking system
- **metrics-dashboard.cjs** - CLI dashboard
- **observability-example.cjs** - Usage examples
- **registry.cjs** (C1.1) - Agent registry
- **database/schema/009_context_learning_schema.sql** - Database schema

---

**Version**: 1.0.0
**Created**: 2025-10-26
**Part of**: Phase 1, Week 2 Agent Coordination
**Dependencies**: C1.1 Agent Registry, Database schema 009
**Next**: Phase 2 - Advanced agent coordination
