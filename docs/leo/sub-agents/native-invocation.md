---
category: protocol
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [protocol, auto-generated]
---
# Native Sub-Agent Invocation Guide



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Discovery Mechanism](#discovery-mechanism)
  - [Requirements](#requirements)
  - [Discovery Process](#discovery-process)
  - [Verification](#verification)
- [Invocation Mechanism](#invocation-mechanism)
  - [What DOESN'T Work (Tested)](#what-doesnt-work-tested)
  - [What DOES Work (Confirmed)](#what-does-work-confirmed)
- [Tested Patterns](#tested-patterns)
  - [Pattern 1: Advisory Mode ✅](#pattern-1-advisory-mode-)
  - [Pattern 2: Targeted Validation ⚠️](#pattern-2-targeted-validation-)
  - [Pattern 3: Direct Orchestration ✅](#pattern-3-direct-orchestration-)
- [Agent File Structure](#agent-file-structure)
  - [Minimal Agent](#minimal-agent)
  - [Production Agent (database-agent example)](#production-agent-database-agent-example)
- [Advisory Mode](#advisory-mode)
- [Execution Mode](#execution-mode)
- [Troubleshooting](#troubleshooting)
  - [Agent Not Appearing in /agents Menu](#agent-not-appearing-in-agents-menu)
  - [Agent Discovered But Not Invoked](#agent-discovered-but-not-invoked)
  - [Sub-Agent Not Executing Scripts](#sub-agent-not-executing-scripts)
- [Performance Metrics](#performance-metrics)
- [Best Practices](#best-practices)
  - [For Agent Creation](#for-agent-creation)
  - [For Agent Usage](#for-agent-usage)
  - [For Troubleshooting](#for-troubleshooting)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, testing, migration, schema

**Created**: 2025-10-12
**Version**: 1.0.0
**Status**: Tested & Verified

---

## Overview

This guide documents how Claude Code native sub-agents work, based on comprehensive testing of discovery, invocation, and execution patterns.

---

## Discovery Mechanism

### Requirements

**Critical Dependency**: `ripgrep` (command: `rg`)

```bash
# Check if installed
which rg

# Install on Ubuntu/Debian WSL2
sudo apt update && sudo apt install ripgrep -y
```

**Why ripgrep**: Claude Code uses `ripgrep` to scan `.claude/agents/` for agent files. Without it, agent discovery fails **silently** - no error messages, agents simply won't be found.

### Discovery Process

1. **File Scanning**: Claude Code uses `rg` to scan:
   - Project agents: `.claude/agents/*.md`
   - User agents: `~/.claude/agents/*.md` (global)

2. **YAML Parsing**: Each `.md` file's frontmatter is parsed:
   ```yaml
   ---
   name: agent-name
   description: "When to use this agent"
   tools: Bash, Read, Write
   model: inherit
   ---
   ```

3. **Registration**: Successfully parsed agents appear in `/agents` menu

4. **Hot Reloading**: Changes to agent files are detected during session (may require restart in some cases)

### Verification

```
/agents
```

Expected output: List of discovered agents under "Project agents" and "User agents"

---

## Invocation Mechanism

### What DOESN'T Work (Tested)

❌ **Automatic Delegation**: Typing keywords doesn't auto-trigger agents
- Example: Typing "database schema" does NOT automatically invoke `database-agent`
- Result: Main agent responds

❌ **@-Mention Syntax**: Direct @-mentions don't work
- Example: `@database-agent help` does NOT invoke database-agent
- Result: Main agent responds with system reminder but doesn't delegate

### What DOES Work (Confirmed)

✅ **Task Tool Invocation**: Main agent uses Task tool to delegate

**From User Perspective**: Natural conversation
```
User: "I need help designing a database schema"
```

**Behind the Scenes**: Main agent (Claude Code) uses Task tool
```javascript
Task(
  subagent_type: "database-agent",
  description: "Database schema design",
  prompt: "User's full query with context"
)
```

**Result**: database-agent responds with specialized expertise

---

## Tested Patterns

### Pattern 1: Advisory Mode ✅

**Use Case**: General architecture questions, no SD context

**Example**:
```
User: "What's the best way to structure a many-to-many relationship in Postgres?"
```

**Flow**:
```
Main Agent → Task(database-agent) → Expert Guidance → User
```

**Test Results**:
- ✅ Sub-agent responds with comprehensive advice
- ✅ No script execution (as expected)
- ✅ Response time: ~3 seconds
- ✅ Database records: 0 (advisory only)

---

### Pattern 2: Targeted Validation ⚠️

**Use Case**: Validation task with SD-ID

**Example**:
```
User: "Validate database schema for SD-MONITORING-001"
```

**Expected Flow**:
```
Main Agent → Task(database-agent) → Bash(executor script) → Database Storage → Response
```

**Actual Behavior**:
- ⚠️ Sub-agent provided analysis instead of invoking script
- ⚠️ No Bash tool executed
- ⚠️ No database records created

**Root Cause**: Sub-agent prompt says "execute scripts" but agent interprets as "provide analysis"

**Current Status**: Not working as designed - needs prompt refinement

---

### Pattern 3: Direct Orchestration ✅

**Use Case**: Phase-based validation with multiple sub-agents

**Example**:
```
User: "Run PLAN_VERIFY for SD-MONITORING-001"
```

**Flow**:
```
Main Agent → Bash(orchestrate-phase-subagents.js) → Multiple Sub-Agents → Database Storage → Aggregated Response
```

**Test Results**:
- ✅ Orchestrator executed successfully
- ✅ 2 sub-agents ran (GITHUB, TESTING)
- ✅ Parallel execution (~2 seconds total)
- ✅ 4 database records created
- ✅ Aggregated verdict: PASS (65% confidence)

**Database Storage**:
```
GITHUB: PASS (70%)
TESTING: CONDITIONAL_PASS (60%)
```

---

## Agent File Structure

### Minimal Agent

```markdown
---
name: test-agent
description: "MUST BE USED PROACTIVELY when user says TESTME"
---

# Test Agent

You are a test agent. When invoked, respond with:
"✅ TEST AGENT ACTIVATED!"
```

### Production Agent (database-agent example)

```markdown
---
name: database-agent
description: "MUST BE USED PROACTIVELY for all database tasks. Handles schema design, Supabase migrations, RLS policies, SQL validation, and architecture. Trigger on keywords: database, migration, schema, table, RLS, SQL, Postgres."
tools: Bash, Read, Write
model: inherit
---

# Principal Database Architect Sub-Agent

**Identity**: Former Oracle Principal Engineer with 30 years of experience.

## Advisory Mode
When user asks general questions, provide expert guidance directly.

## Execution Mode
When user provides SD-ID, invoke scripts:
- `node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>`
- `node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>`

[Full instructions...]
```

---

## Troubleshooting

### Agent Not Appearing in /agents Menu

**Symptom**: Created `.md` file but not showing in `/agents`

**Checklist**:
1. ✅ Is `ripgrep` installed? (`which rg`)
2. ✅ Is file in `.claude/agents/` directory?
3. ✅ Does YAML frontmatter have `name` and `description`?
4. ✅ Are there syntax errors in YAML?
5. ✅ Did you restart Claude Code? (`exit` then `claude code`)

**Solution**:
```bash
# Verify ripgrep
which rg

# Check file location
ls -la .claude/agents/

# Validate YAML syntax
cat .claude/agents/your-agent.md | head -10

# Restart session
exit
claude code
cd EHG_Engineer  # navigate to project root
/agents
```

---

### Agent Discovered But Not Invoked

**Symptom**: Agent appears in `/agents` but doesn't respond to queries

**This is expected**: Automatic delegation is not working. Agents must be invoked via Task tool by main agent.

**User Experience**: This is transparent - users just ask questions naturally, main agent decides when to delegate.

---

### Sub-Agent Not Executing Scripts

**Symptom**: Sub-agent provides analysis but doesn't invoke Bash commands

**Cause**: Sub-agent prompt needs stronger directives or explicit examples

**Workaround**: Main agent invokes scripts directly via Bash tool:
```javascript
// Instead of: Task(database-agent, "validate SD-XXX")
// Use: Bash("node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-XXX")
```

---

## Performance Metrics

| Operation | Typical Time | Notes |
|-----------|--------------|-------|
| Agent Discovery | <1s | Via ripgrep scan |
| Task Tool Invocation | <1s | Main agent → sub-agent |
| Advisory Response | 2-5s | Expert guidance generation |
| Script Execution | 1-3s | Orchestrator + sub-agents |
| Database Storage | <100ms | Per execution result |
| Parallel Execution | 2s (2 agents) | Faster than sequential (4s) |

---

## Best Practices

### For Agent Creation

1. **Strong Description**: Include "MUST BE USED PROACTIVELY" for better routing
2. **Clear Trigger Keywords**: List specific terms that should invoke agent
3. **Tool Limitations**: Only list tools agent actually needs (security)
4. **Model Inheritance**: Use `model: inherit` for consistency
5. **Concise Prompts**: Keep system prompts focused (300-600 lines max)

### For Agent Usage

1. **Natural Language**: Users ask questions naturally, no special syntax needed
2. **Provide Context**: Include SD-IDs when applicable
3. **Trust Routing**: Main agent will delegate appropriately
4. **Direct Scripts for Execution**: Use Bash tool for production workflows

### For Troubleshooting

1. **Check Discovery First**: `/agents` command shows what's registered
2. **Verify ripgrep**: `which rg` confirms dependency installed
3. **Read System Reminders**: Show intent recognition even if delegation fails
4. **Query Database**: Verify script execution via database records

---

## Known Limitations

1. **No Automatic Delegation**: Typing keywords doesn't auto-trigger agents
2. **No @-Mention Support**: Direct addressing syntax doesn't work
3. **Script Execution Inconsistent**: Sub-agents may not invoke Bash tool as prompted
4. **Silent Discovery Failures**: Missing ripgrep causes silent failure (no error messages)

---

## Future Improvements

1. **Stronger Script Invocation**: Improve prompts to ensure sub-agents use Bash tool
2. **Automatic Delegation**: Investigate why keyword matching doesn't trigger agents
3. **@-Mention Support**: Enable direct sub-agent addressing
4. **Better Error Messages**: Surface discovery failures explicitly

---

## Related Documentation

- [Hybrid Sub-Agent Workflow Guide](../../guides/hybrid-sub-agent-workflow.md)
- [Sub-Agent System Overview](./sub-agent-system.md)
- LEO Protocol CLAUDE.md

---

**Last Updated**: 2025-10-12
**Tested Version**: Claude Code v2.0.14
**Test Environment**: WSL2 Ubuntu, Sonnet 4.5