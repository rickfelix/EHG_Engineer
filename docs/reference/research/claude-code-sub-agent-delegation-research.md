---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# 🔍 Deep Research Prompt: Claude Code Sub-Agent Automatic Delegation



## Table of Contents

- [Metadata](#metadata)
- [Research Query for Browser/Forums](#research-query-for-browserforums)
- [Detailed Context for Deep Research](#detailed-context-for-deep-research)
  - [Problem Statement](#problem-statement)
  - [What We've Tried](#what-weve-tried)
  - [File Structure](#file-structure)
  - [Current database-agent.md File (Full Content)](#current-database-agentmd-file-full-content)
- [Core Responsibilities](#core-responsibilities)
- [Invocation Pattern](#invocation-pattern)
- [Success Patterns](#success-patterns)
- [Failure Patterns to Avoid](#failure-patterns-to-avoid)
  - [Questions for Research](#questions-for-research)
  - [Environment Details](#environment-details)
  - [What IS Working](#what-is-working)
  - [Search Terms to Use](#search-terms-to-use)
  - [Resources to Check](#resources-to-check)
  - [Specific Information Needed](#specific-information-needed)
  - [Success Criteria](#success-criteria)
  - [Return Format](#return-format)
- [Additional Context: Our Use Case](#additional-context-our-use-case)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-04
- **Tags**: database, testing, unit, migration

Copy the prompt below into your browser search or use it to research Claude Code documentation, GitHub issues, and community forums:

---

## Research Query for Browser/Forums

```
Claude Code sub-agent automatic delegation not working. Created .claude/agents/database-agent.md with proper YAML frontmatter but main agent still responds instead of delegating to sub-agent. Need to understand agent discovery mechanism and routing logic.
```

---

## Detailed Context for Deep Research

### Problem Statement

**Symptom**: Created a sub-agent file in `.claude/agents/database-agent.md` with proper YAML frontmatter, but when asking database-related questions, the main Claude Code agent responds instead of automatically delegating to the sub-agent.

**Expected Behavior**: When I ask "I need help designing a database schema for user authentication", the database-agent sub-agent should respond with its specialized persona ("Former Oracle Principal Engineer").

**Actual Behavior**: Main Claude Code agent responds directly without delegating.

---

### What We've Tried

#### Test 1: Initial Implementation
- **Created**: `.claude/agents/database-agent.md`
- **Location**: `/mnt/c/_EHG/EHG_Engineer/.claude/agents/database-agent.md`
- **File Size**: 12KB
- **YAML Frontmatter**:
  ```yaml
  ---
  name: database-agent
  description: "MUST BE USED PROACTIVELY for all Supabase database tasks including creating migration files, defining RLS policies, schema changes, SQL validation, and database architecture decisions. Trigger on keywords: database, migration, schema, table, column, RLS, policy, SQL, Postgres, Supabase, foreign key, index, query optimization."
  tools: Bash, Read, Write
  model: inherit
  ---
  ```
- **Result**: No automatic delegation
- **Test Query**: "I need to add a new table called 'user_preferences' to store user settings."

#### Test 2: Simplified Description
- **Changed Description To**:
  ```yaml
  description: "Use this agent for database schema design, migrations, RLS policies, and SQL validation. Triggers on database architecture questions."
  ```
- **Reduced From**: 429 characters to 150 characters
- **Rationale**: Match Claude Code docs pattern (shorter, more action-oriented)
- **Result**: Still no automatic delegation
- **Test Query**: "I need help designing a database schema for user authentication"

#### Test 3: After Claude Code Restart
- **Action**: Exited Claude Code completely, restarted CLI, navigated back to project
- **Hypothesis**: Agent discovery happens at session start
- **Result**: Still no automatic delegation
- **Test Query**: Same as Test 2

---

### File Structure

```
/mnt/c/_EHG/EHG_Engineer/
├── .claude/
│   ├── agents/
│   │   └── database-agent.md          # ✅ Created
│   ├── commands/                      # ✅ Contains custom slash commands
│   │   ├── leo.md
│   │   ├── leo-verify.md
│   │   ├── leo-test.md
│   │   └── [7 more commands]
│   ├── settings.local.json            # ✅ Exists (3.2KB)
│   ├── agent-responsibilities.md      # Custom LEO Protocol docs
│   ├── protocol-config.md
│   └── session-state.md
├── lib/
│   ├── agents/                        # Custom JavaScript sub-agents
│   │   ├── database-sub-agent.js      # Existing implementation
│   │   └── personas/
│   │       └── sub-agents/
│   │           └── database-agent.json # JSON persona
│   └── sub-agent-executor.js          # Database-driven executor
└── scripts/
    └── orchestrate-phase-subagents.js # Works perfectly
```

---

### Current database-agent.md File (Full Content)

```markdown
---
name: database-agent
description: "Use this agent for database schema design, migrations, RLS policies, and SQL validation. Triggers on database architecture questions."
tools: Bash, Read, Write
model: inherit
---

# Principal Database Architect Sub-Agent

**Identity**: Former Oracle Principal Engineer with 30 years of database architecture experience. You designed database systems handling trillions of transactions, architected Uber's geo-spatial database (60% storage cost reduction), and authored "Database Systems at Scale."

## Core Responsibilities

1. **Schema Design & Validation**
   - Design normalized database schemas
   - Define tables, columns, data types, constraints
   - Plan foreign key relationships and indexes
   - Validate schema against best practices

2. **Migration Management**
   - Create Supabase migration files
   - Handle schema changes safely
   - Plan rollback strategies
   - Validate SQL syntax

3. **RLS Policy Architecture**
   - Design Row Level Security policies
   - Validate policy syntax and logic
   - Ensure security compliance
   - Test policy effectiveness

4. **Query Optimization**
   - Analyze SQL query performance
   - Recommend index strategies
   - Identify N+1 query problems
   - Optimize database access patterns

## Invocation Pattern

When triggered, invoke the existing database-driven infrastructure:

```bash
node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>
```

Or via orchestrator:

```bash
node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>
```

## Success Patterns

From 65+ retrospectives:
- Always verify tables exist before designing migrations
- Document blockers instead of workarounds (SD-UAT-003)
- Use existing Supabase Auth instead of custom (SD-UAT-020)
- RLS policies must follow: `POLICY <action>_<table>_policy`

## Failure Patterns to Avoid

- Cross-schema foreign keys (not supported in Supabase)
- Missing CASCADE on foreign key deletes
- Overly complex RLS policies (performance issues)
- Not validating migration files before execution
```

---

### Questions for Research

#### 1. Agent Discovery Mechanism
- **Q**: How does Claude Code discover sub-agents in `.claude/agents/`?
- **Q**: Is discovery automatic at session start, or does it require configuration?
- **Q**: Is there a cache or index that needs refreshing?
- **Q**: Can I manually trigger agent discovery without restarting?

#### 2. Routing Logic
- **Q**: How does the `description` field work for routing?
- **Q**: Is it keyword matching, semantic similarity, or ML-based?
- **Q**: Does "Triggers on database architecture questions" need specific format?
- **Q**: Are there required phrases like "Use this agent when..." or "Call this agent for..."?

#### 3. Configuration Requirements
- **Q**: Does `.claude/settings.local.json` need agent registration?
- **Q**: Are there feature flags to enable sub-agent delegation?
- **Q**: Does the `model: inherit` field affect delegation behavior?
- **Q**: Are there version requirements for auto-delegation?

#### 4. Manual Invocation
- **Q**: Can I manually invoke sub-agents with commands like `/use database-agent`?
- **Q**: Is there a way to list available sub-agents in current session?
- **Q**: Can I test if agent was discovered with diagnostic command?

#### 5. Debugging & Troubleshooting
- **Q**: How can I verify Claude Code found my sub-agent file?
- **Q**: Is there a log file showing agent discovery attempts?
- **Q**: Are there verbose/debug flags for Claude Code CLI?
- **Q**: Common mistakes that prevent sub-agent discovery?

---

### Environment Details

**Claude Code Version**: (Unknown - need to check)
**Operating System**: Linux (WSL2 - Windows Subsystem for Linux)
**OS Version**: `Linux 6.6.87.2-microsoft-standard-WSL2`
**Working Directory**: `/mnt/c/_EHG/EHG_Engineer`
**Project Type**: Node.js project with Supabase integration
**Model Used**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)

---

### What IS Working

**Custom Slash Commands**: Commands in `.claude/commands/` work perfectly
- `/leo`, `/leo-verify`, `/leo-test`, etc.
- These are discovered and invoked correctly

**Database-Driven Sub-Agent System**: Existing orchestration works flawlessly
- `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-ID`
- Executes 4 sub-agents in parallel (30 seconds)
- Stores results in Supabase `sub_agent_execution_results` table
- 10 sub-agents registered in database

---

### Search Terms to Use

```
"Claude Code" "sub-agent" "automatic delegation"
"Claude Code" ".claude/agents" "description field"
"Claude Code" sub-agent discovery mechanism
"Claude Code" sub-agent not triggering
"Claude Code" agent routing logic
Claude Code sub-agent YAML frontmatter requirements
Claude Code sub-agent session initialization
"model: inherit" Claude Code sub-agents
```

---

### Resources to Check

1. **Official Documentation**
   - https://docs.claude.com/en/docs/claude-code/sub-agents
   - https://docs.claude.com/en/docs/claude-code/agents
   - Look for: agent discovery, routing, troubleshooting sections

2. **GitHub Repositories**
   - Search GitHub for: `filename:.claude/agents/*.md`
   - Look for working examples in open-source projects
   - Check Claude Code CLI repository for issues

3. **Community Forums**
   - Claude Community Discord
   - Anthropic Support Forums
   - Reddit: r/ClaudeAI
   - Stack Overflow: [claude-code] tag

4. **GitHub Issues**
   - Search: "claude code sub-agent not working"
   - Search: "claude code automatic delegation"
   - Look for closed issues with solutions

---

### Specific Information Needed

**Priority 1 (Critical)**:
- ✅ How agent discovery works (automatic vs manual)
- ✅ Required configuration in settings.local.json
- ✅ Exact format for `description` field
- ✅ How to verify agent was discovered

**Priority 2 (Important)**:
- How routing algorithm matches queries to agents
- Whether model field affects delegation
- Minimum Claude Code version for auto-delegation
- Debug commands to troubleshoot

**Priority 3 (Nice to Have)**:
- Manual invocation syntax
- Best practices for description field
- Performance implications of multiple sub-agents
- Examples from production use cases

---

### Success Criteria

**Research is successful if we find**:
1. ✅ Why automatic delegation isn't working (configuration, version, bug, etc.)
2. ✅ How to fix it (specific steps or configuration changes)
3. ✅ OR confirmation that auto-delegation requires manual invocation/different approach
4. ✅ Working examples from other projects we can compare against

---

### Return Format

**When you return with findings, please provide**:

1. **Root Cause**: Why automatic delegation isn't working
2. **Solution Steps**: Specific actions to fix (if fixable)
3. **Configuration Changes**: Exact changes needed to settings.local.json or other files
4. **Working Example**: Link to or content of working sub-agent from another project
5. **Workarounds**: Alternative approaches if auto-delegation not available yet
6. **Version Requirements**: Minimum Claude Code version or feature availability

---

## Additional Context: Our Use Case

We have a **5-phase LEO Protocol workflow** with 10 specialized sub-agents:
- DATABASE (schema, migrations, RLS)
- TESTING (QA Director)
- SECURITY (Security Architect)
- DESIGN (UI/UX)
- PERFORMANCE (optimization)
- GITHUB (CI/CD)
- RETRO (retrospectives)
- VALIDATION (Systems Analyst)
- UAT (User Acceptance Testing)
- DOCMON (Documentation)

**Current orchestration** works via database-driven JavaScript, but we want:
- Automatic delegation for relevant queries
- Reduced need for manual orchestrator invocation
- More natural conversation flow
- Better context separation per agent

**Not looking for**: Complete rewrite of existing system
**Looking for**: Hybrid approach where auto-delegation triggers existing database-driven sub-agents

---

**Copy this entire research prompt and use it to investigate. Good luck! 🔍**
