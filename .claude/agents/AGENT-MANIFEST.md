# Custom Agent Manifest

**Last Updated**: 2025-10-12
**Total Agents**: 10 (7 active, 3 archived)

---

## Active Agents (Always Loaded)

These agents are loaded in every Claude Code session and available for automatic invocation:

1. **database-agent**
   - Used daily for schema validation, migrations, RLS policies
   - Essential for database-related SDs

2. **validation-agent**
   - Used in every SD (duplicate checks, backlog validation, infrastructure analysis)
   - Required for LEAD pre-approval phase

3. **testing-agent** (QA Engineering Director)
   - Used during PLAN verification phase
   - Essential for E2E testing and test case generation

4. **security-agent**
   - Used for auth/RLS features, security validation
   - Critical for security-related SDs

5. **design-agent**
   - Used for UI/UX SDs, component sizing, design validation
   - Important for frontend work

6. **github-agent** (DevOps Platform Architect)
   - Used for CI/CD verification, GitHub Actions validation
   - Required for deployment verification

7. **docmon-agent** (Documentation Generation)
   - Used for AI documentation generation
   - Auto-triggers at SD completion

---

## Archived Agents (On-Demand Only)

These agents are archived but can be re-enabled instantly or invoked via scripts:

### 1. **performance-agent**
- **Reason**: Only needed during performance optimization work
- **Usage**: Situational (performance analysis, load testing, caching strategies)
- **Re-enable**: `mv .claude/agents/_archived/performance-agent.md .claude/agents/`
- **Script invocation**: `node lib/sub-agent-executor.js PERFORMANCE <SD-ID>`

### 2. **uat-agent**
- **Reason**: Only needed during UAT testing phases
- **Usage**: Situational (user acceptance testing, validation workflows)
- **Re-enable**: `mv .claude/agents/_archived/uat-agent.md .claude/agents/`
- **Script invocation**: `node lib/sub-agent-executor.js UAT <SD-ID>`

### 3. **retro-agent** (Continuous Improvement Coach)
- **Reason**: Auto-triggers at SD completion, doesn't need pre-loading
- **Usage**: Automatic (generates retrospectives after SD completion)
- **Re-enable**: `mv .claude/agents/_archived/retro-agent.md .claude/agents/`
- **Script invocation**: `node lib/sub-agent-executor.js RETRO <SD-ID>`

---

## Invocation Methods

### Always-Loaded Agents
Task tool auto-detects keywords and delegates to appropriate agent.

**Example**:
```
User: "Validate the database schema for SD-ABC-001"
→ Claude Code automatically invokes database-agent
```

### Archived Agents

#### Method 1: Temporary Re-Enable
```bash
# Move agent back to active directory
mv .claude/agents/_archived/performance-agent.md .claude/agents/

# Restart Claude Code (agents re-scanned)

# Use normally through Task tool

# After use: Move back to archive
mv .claude/agents/performance-agent.md .claude/agents/_archived/
```

#### Method 2: Direct Script Invocation (No Re-Enable Needed)
```bash
# Execute sub-agent directly via script
node lib/sub-agent-executor.js PERFORMANCE SD-ABC-001

# Results stored in database: sub_agent_execution_results table
```

---

## Context Savings

**Before archival**: 643 tokens (10 agents)
**After archival**: ~400-450 tokens (7 agents)
**Savings**: ~200-250 tokens per session

---

## Maintenance

### Monthly Review
Run agent usage tracker to identify agents not used in 30 days:
```bash
node scripts/track-agent-usage.js
```

If an agent shows 0 invocations for 30 days → Consider archiving

### Re-Activation Criteria
Move agent from archive back to active if:
- Used 3+ times in a month
- Needed for ongoing project work
- Auto-trigger functionality required

---

## Backup Location

All agents backed up to: `.claude/backups/2025-10-12/`

To restore all agents:
```bash
cp .claude/backups/2025-10-12/*.md .claude/agents/
```

---

**Notes**:
- Archived agents remain fully functional via script invocation
- No functionality lost, only context space saved
- All changes reversible in <1 minute
