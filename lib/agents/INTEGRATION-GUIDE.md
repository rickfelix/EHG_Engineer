# Agent Observability Integration Guide

## Quick Start

We've created observable wrappers for 3 key agents that automatically track performance metrics:

1. **Database Agent** → `database-sub-agent-observable.cjs`
2. **Testing Agent** → `testing-sub-agent-observable.cjs`
3. **Validation Agent** → `validation-sub-agent-observable.cjs`

## Using Observable Agents

### Option 1: Direct Execution (CLI)
```bash
# Run observable database agent
node lib/agents/database-sub-agent-observable.cjs ./src

# Run observable testing agent
node lib/agents/testing-sub-agent-observable.cjs tests unit

# Run observable validation agent
node lib/agents/validation-sub-agent-observable.cjs ./src code
```

### Option 2: Programmatic Usage
```javascript
const { ObservableDatabaseAgent } = require('./lib/agents/database-sub-agent-observable.cjs');

const agent = new ObservableDatabaseAgent();
await agent.initialize();

const result = await agent.execute({
  path: './src'
});

console.log(`Database score: ${result.data.score}`);
```

### Option 3: Import in Your Code
```javascript
// In your scripts or tools
const { ObservableValidationAgent } = require('./lib/agents/validation-sub-agent-observable.cjs');
const { ObservableTestingAgent } = require('./lib/agents/testing-sub-agent-observable.cjs');
const { ObservableDatabaseAgent } = require('./lib/agents/database-sub-agent-observable.cjs');

// Use like normal agents, metrics tracked automatically
const validationAgent = new ObservableValidationAgent();
await validationAgent.execute({ path: './src' });
```

## How It Works

### Architecture

```
Your Code
    ↓
Observable Wrapper
    ├── Starts tracking (obs.startTracking)
    ├── Executes original agent
    ├── Parses results
    └── Ends tracking (tracker.end)
         ↓
    Database metrics saved
         ↓
    View in dashboard: npm run agent:metrics
```

### What's Tracked

**Database Agent**:
- Execution time
- Schema score
- Migrations validated
- Queries analyzed
- Overall database health score
- Success/failure rate

**Testing Agent**:
- Execution time
- Tests found/passed/failed
- Code coverage
- Test score
- Success/failure rate

**Validation Agent**:
- Execution time
- Issues found (critical/warnings)
- Files checked
- Validation score
- Success/failure rate

## Integration Patterns

### Pattern 1: Wrapper (Already Done) ✅

**What**: Create observable wrapper that calls original agent
**Pros**: No modification to original agent, easy to maintain
**Cons**: Extra file to manage

**Example**: All 3 agents implemented this way

### Pattern 2: Direct Integration

**What**: Add observability directly inside agent code
**Pros**: No wrapper needed, single file
**Cons**: Modifies original code, harder to remove

**Example**:
```javascript
// Inside agent's execute() method
const { AgentObservability } = require('./observability.cjs');
const obs = new AgentObservability();
await obs.initialize();

const tracker = obs.startTracking('DATABASE');

try {
  // ... existing agent code ...
  await tracker.end({ success: true, data: results });
} catch (error) {
  await tracker.end({ success: false, error: error.message });
  throw error;
}
```

### Pattern 3: Middleware

**What**: Create a universal agent runner with observability
**Pros**: Works with all agents, centralized
**Cons**: Requires consistent agent interface

**Example**:
```javascript
async function runAgentWithObservability(agentCode, agentPath, options) {
  const obs = new AgentObservability();
  await obs.initialize();

  const tracker = obs.startTracking(agentCode, options);

  try {
    const result = await executeAgent(agentPath, options);
    await tracker.end({ success: true, data: result });
    return result;
  } catch (error) {
    await tracker.end({ success: false, error: error.message });
    throw error;
  }
}
```

## Viewing Metrics

After running observable agents, view metrics:

```bash
# Summary of all agents
npm run agent:metrics

# Specific agent details
npm run agent:metrics:agent DATABASE
npm run agent:metrics:agent TESTING
npm run agent:metrics:agent VALIDATION

# Top performers
npm run agent:metrics:top 5

# Compare two agents
node lib/agents/metrics-dashboard.cjs compare VALIDATION TESTING
```

## Example Workflow

### 1. Run Agents
```bash
# Run database validation
node lib/agents/database-sub-agent-observable.cjs ./src

# Run tests
node lib/agents/testing-sub-agent-observable.cjs tests

# Run code validation
node lib/agents/validation-sub-agent-observable.cjs ./src
```

### 2. View Dashboard
```bash
npm run agent:metrics
```

**Output**:
```
📊 Agent Performance Summary

Agent                 Executions    Success Rate    Avg Time    Status
────────────────────────────────────────────────────────────────────
DATABASE                       5          100.0%       850ms        ✓
TESTING                        3           66.7%      2100ms        ⚠
VALIDATION                     4          100.0%       450ms        ✓
```

### 3. Investigate Issues
```bash
# Testing agent has lower success rate
npm run agent:metrics:agent TESTING

# Shows:
# - 3 executions, 2 passed, 1 failed
# - Last failure: "Tests timed out"
# - Avg time: 2100ms (slowest agent)
```

## Integration Checklist

Use this to integrate observability into more agents:

### For Each Agent:

- [ ] Create observable wrapper: `{agent-name}-observable.cjs`
- [ ] Implement `execute(options)` method
- [ ] Add `startTracking()` at method start
- [ ] Call original agent (spawn or import)
- [ ] Parse output to extract metrics
- [ ] Call `tracker.end()` with results
- [ ] Add CLI usage if `require.main === module`
- [ ] Test execution: `node lib/agents/{agent}-observable.cjs`
- [ ] Verify metrics: `npm run agent:metrics:agent {AGENT_CODE}`
- [ ] Document usage in this guide

### Quick Template:

```javascript
const { AgentObservability } = require('./observability.cjs');

class Observable{Agent}Agent {
  constructor() {
    this.obs = new AgentObservability();
  }

  async initialize() {
    await this.obs.initialize();
  }

  async execute(options = {}) {
    if (!this.obs.initialized) await this.initialize();

    const tracker = this.obs.startTracking('{AGENT_CODE}', options);

    try {
      // Execute agent
      const result = await this._executeAgent(options);

      await tracker.end({
        success: result.success,
        data: result.data
      });

      return result;
    } catch (error) {
      await tracker.end({
        success: false,
        error: error.message
      });
      throw error;
    }
  }

  async _executeAgent(options) {
    // Implement agent execution
  }
}

module.exports = { Observable{Agent}Agent };
```

## Remaining Agents to Integrate

From the registry (14 total), we've integrated 3. Remaining 11:

- [ ] SECURITY - `security-sub-agent.js`
- [ ] DESIGN - `design-sub-agent.js`
- [ ] DEPENDENCY - `dependency-sub-agent.js`
- [ ] API - `api-sub-agent.js`
- [ ] DOCMON - `documentation-sub-agent.js`
- [ ] GITHUB - `github-review-coordinator.js`
- [ ] RETRO - `base-sub-agent.js`
- [ ] PERFORMANCE - `performance-sub-agent.js`
- [ ] UAT - `uat-sub-agent.js`
- [ ] RISK - (needs implementation)
- [ ] STORIES - (needs implementation)

**Estimated effort**: 1-2 hours per agent (11 agents = 11-22 hours total)

## Best Practices

### 1. Always Initialize
```javascript
const agent = new ObservableDatabaseAgent();
await agent.initialize(); // Don't skip this!
```

### 2. Handle Errors
```javascript
try {
  await agent.execute(options);
} catch (error) {
  console.error('Agent failed:', error.message);
  // Metrics still recorded via tracker.end()
}
```

### 3. Provide Context
```javascript
const tracker = obs.startTracking('VALIDATION', {
  path: './src',
  fileCount: 125,
  validationType: 'strict'
});
```

### 4. Parse Meaningful Data
```javascript
// Extract useful metrics from output
data: {
  issuesFound: 3,
  criticalIssues: 1,
  filesChecked: 125,
  score: 85
}
```

### 5. Use Consistent Agent Codes
Match agent codes from registry:
- ✅ `VALIDATION` (registry code)
- ❌ `validate` (inconsistent)
- ❌ `ValidAgent` (inconsistent)

## Troubleshooting

### Issue: "Table not found"
**Solution**: Run database migration:
```bash
npm run db:agent-metrics
```

### Issue: "Cannot find module"
**Solution**: Ensure you're in project root:
```bash
cd /mnt/c/_EHG/EHG_Engineer
node lib/agents/database-sub-agent-observable.cjs
```

### Issue: Agent fails but no metrics
**Solution**: Check that `tracker.end()` is called in both try and catch:
```javascript
try {
  // work
  await tracker.end({ success: true });
} catch (error) {
  await tracker.end({ success: false, error: error.message });
  throw error; // Re-throw after tracking
}
```

### Issue: Metrics show 0 executions
**Solution**:
1. Verify database migration ran
2. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env
3. Run example: `node lib/agents/observability-example.cjs 1`

## Next Steps

1. **Run the integrated agents** to generate metrics data
2. **View dashboard** to see performance
3. **Integrate remaining agents** (11 more)
4. **Add alerts** for low success rates
5. **Create weekly reports** of agent performance

## Related Documentation

- `OBSERVABILITY-README.md` - Full observability system docs
- `C1.3-COMPLETION-SUMMARY.md` - Implementation details
- `observability-example.cjs` - Usage examples
- `MIGRATION-AGENT-METRICS.md` - Database migration guide

---

**Created**: 2025-10-26
**Part of**: Quick Wins Path - Week 1
**Status**: 3 agents integrated, 11 remaining
**Estimated completion**: Week 3 (if integrating all)
