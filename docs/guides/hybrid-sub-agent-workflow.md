---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Hybrid Sub-Agent Workflow Guide



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Architecture Overview](#architecture-overview)
- [Three Proven Patterns](#three-proven-patterns)
  - [Pattern 1: Advisory Mode ✅](#pattern-1-advisory-mode-)
  - [Pattern 2: Direct Script Execution ✅](#pattern-2-direct-script-execution-)
  - [Pattern 3: Hybrid Trigger (Experimental) ⚠️](#pattern-3-hybrid-trigger-experimental-)
- [Decision Matrix: Which Pattern to Use?](#decision-matrix-which-pattern-to-use)
- [Integration with LEO Protocol](#integration-with-leo-protocol)
  - [5-Phase Workflow](#5-phase-workflow)
- [Performance Characteristics](#performance-characteristics)
  - [Pattern 1: Advisory Mode](#pattern-1-advisory-mode)
  - [Pattern 2: Direct Script Execution](#pattern-2-direct-script-execution)
  - [Pattern 3: Hybrid (Not Functional)](#pattern-3-hybrid-not-functional)
- [Best Practices](#best-practices)
  - [For Advisory Questions (Pattern 1)](#for-advisory-questions-pattern-1)
  - [For Execution Tasks (Pattern 2)](#for-execution-tasks-pattern-2)
  - [For Development Iteration](#for-development-iteration)
- [Troubleshooting](#troubleshooting)
  - ["Sub-Agent Didn't Execute Script"](#sub-agent-didnt-execute-script)
  - ["Orchestrator Returned BLOCKED"](#orchestrator-returned-blocked)
  - ["No Database Records Created"](#no-database-records-created)
- [Future Enhancements](#future-enhancements)
  - [Planned Improvements](#planned-improvements)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, testing, migration, schema

**Created**: 2025-10-12
**Version**: 1.0.0
**Tested**: Comprehensive testing completed ✅

---

## Executive Summary

The LEO Protocol uses a **hybrid architecture** combining:
1. **Claude Code Native Sub-Agents** (natural language interface)
2. **Database-Driven Orchestration** (deterministic execution)

This guide explains when and how to use each component based on empirical testing.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    USER INTERACTION                       │
│          (Natural Language Queries)                       │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│              MAIN CLAUDE CODE AGENT                       │
│        (Intent Recognition & Routing)                     │
└───┬──────────────────────────────────────────────────┬───┘
    │                                                   │
    │ Advisory                                          │ Execution
    │                                                   │
    ▼                                                   ▼
┌─────────────────────────┐              ┌──────────────────────────┐
│   NATIVE SUB-AGENTS     │              │  DATABASE-DRIVEN SCRIPTS │
│  (.claude/agents/*.md)  │              │  (lib/sub-agent-*.js)    │
│                         │              │  (scripts/orchestrate-*) │
│  • database-agent       │              │                          │
│  • test-agent           │              │  • sub-agent-executor.js │
│  • [future agents]      │              │  • orchestrate-phase-*.js│
│                         │              │                          │
│  Provides:              │              │  Provides:               │
│  ✅ Expert guidance     │              │  ✅ Validation           │
│  ✅ Architecture advice │              │  ✅ Test execution       │
│  ✅ Patterns & examples │              │  ✅ Database storage     │
│                         │              │  ✅ Verdict aggregation  │
└─────────────────────────┘              └──────────────────────────┘
                                                      │
                                                      ▼
                                         ┌────────────────────────┐
                                         │   SUPABASE DATABASE    │
                                         │  (Single Source of     │
                                         │   Truth)               │
                                         │                        │
                                         │  • leo_sub_agents      │
                                         │  • sub_agent_execution │
                                         │    _results            │
                                         │  • strategic_          │
                                         │    directives_v2       │
                                         └────────────────────────┘
```

---

## Three Proven Patterns

### Pattern 1: Advisory Mode ✅

**When to Use**:
- General architecture questions
- Best practices inquiry
- Design pattern exploration
- No specific SD-ID context

**User Experience**:
```
User: "What's the best way to structure a many-to-many relationship?"
```

**Flow**:
```
Main Agent
  ↓ (Task tool)
Native Sub-Agent (database-agent)
  ↓ (Expert knowledge)
Comprehensive Guidance
  ↓
User receives advice
```

**Characteristics**:
- ✅ No scripts executed
- ✅ No database writes
- ✅ Fast response (2-5 seconds)
- ✅ Rich, contextual advice
- ✅ References LEO Protocol patterns

**Example Response**: Junction table design, FK constraints, index strategy, pitfalls to avoid

**Test Results**:
- Duration: ~3 seconds
- Database records: 0
- Quality: Comprehensive architectural guidance
- Success rate: 100%

---

### Pattern 2: Direct Script Execution ✅

**When to Use**:
- Phase-based validation (PLAN_VERIFY, LEAD_FINAL)
- Multiple sub-agents needed
- Production workflows
- Database storage required

**User Experience**:
```
User: "Run PLAN_VERIFY for SD-MONITORING-001"
```

**Flow**:
```
Main Agent
  ↓ (Bash tool)
orchestrate-phase-subagents.js
  ↓ (Determines required agents)
  ├─> GITHUB sub-agent (parallel)
  ├─> DATABASE sub-agent (parallel)
  ├─> TESTING sub-agent (parallel)
  └─> [others as needed]
  ↓ (Each stores results)
Database (sub_agent_execution_results)
  ↓ (Aggregation)
Final Verdict (PASS/FAIL/BLOCKED)
  ↓
User receives comprehensive report
```

**Characteristics**:
- ✅ Parallel execution (2+ agents simultaneously)
- ✅ Database storage for audit trail
- ✅ Verdict aggregation
- ✅ Confidence scoring
- ✅ Deterministic, testable
- ✅ Production-ready

**Test Results**:
- Duration: ~2 seconds (2 agents in parallel)
- Database records: 4 (2 agents × 2 storage points)
- Verdicts: GITHUB (PASS 70%), TESTING (CONDITIONAL_PASS 60%)
- Success rate: 100%

---

### Pattern 3: Hybrid Trigger (Experimental) ⚠️

**Intended Use**:
- Targeted validation with SD context
- Single sub-agent specialization
- Natural language → script execution bridge

**User Experience**:
```
User: "Validate database schema for SD-MONITORING-001"
```

**Intended Flow**:
```
Main Agent
  ↓ (Task tool)
Native Sub-Agent (database-agent)
  ↓ (Should invoke Bash tool)
sub-agent-executor.js
  ↓
Database storage
  ↓
User receives verdict
```

**Current Status**: ⚠️ **Not Working**

**Issue**: Sub-agent provides analysis but doesn't invoke Bash tool to execute scripts

**Test Results**:
- Duration: ~5 seconds
- Database records: 0 (script not executed)
- Quality: Good analysis, but no execution
- Success rate: 0% (for script invocation goal)

**Workaround**: Use Pattern 2 (direct script execution) instead

---

## Decision Matrix: Which Pattern to Use?

| Scenario | Pattern | Rationale |
|----------|---------|-----------|
| "What's the best way to...?" | 1 (Advisory) | No SD context, seeking guidance |
| "How should I structure...?" | 1 (Advisory) | Architecture question |
| "Explain the pattern for...?" | 1 (Advisory) | Learning/understanding |
| "Validate SD-XXX" | 2 (Direct Script) | Production validation needed |
| "Run PLAN_VERIFY for SD-XXX" | 2 (Direct Script) | Phase orchestration |
| "Check database for SD-XXX" | 2 (Direct Script) | Execution + storage required |
| "Create migration for SD-XXX" | 2 (Direct Script) | File generation needed |

**Rule of Thumb**:
- Advisory/exploration → Pattern 1 (Native Sub-Agent)
- Execution/validation → Pattern 2 (Direct Script)
- Pattern 3 → Not recommended until fixed

---

## Integration with LEO Protocol

### 5-Phase Workflow

**LEAD Pre-Approval**:
```bash
# Pattern 2: Direct orchestration
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-XXX
```

**PLAN PRD Creation**:
```
# Pattern 1: Advisory for design questions
User: "How should I structure the database schema?"

# Pattern 2: Validation when ready
node scripts/orchestrate-phase-subagents.js PLAN_PRD SD-XXX
```

**EXEC Implementation**:
```
# Pattern 1: Architecture guidance during development
User: "What's the best index strategy for this query?"

# Pattern 2: Final validation before handoff
node scripts/execute-subagent.js --code DATABASE --sd-id SD-XXX
```

**PLAN Verification**:
```bash
# Pattern 2: Always use direct orchestration
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-XXX
```

**LEAD Final Approval**:
```bash
# Pattern 2: Retrospective generation
node scripts/orchestrate-phase-subagents.js LEAD_FINAL SD-XXX
```

---

## Performance Characteristics

### Pattern 1: Advisory Mode

| Metric | Value | Notes |
|--------|-------|-------|
| Invocation | <1s | Task tool overhead |
| Generation | 2-5s | Expert guidance synthesis |
| Total | 3-6s | Highly variable by complexity |
| Database Writes | 0 | No persistence needed |
| Token Usage | Medium | Comprehensive responses |

**Optimization Tips**:
- Ask specific questions for faster responses
- Provide context upfront (tech stack, constraints)
- Reference existing patterns for consistency

---

### Pattern 2: Direct Script Execution

| Metric | Value | Notes |
|--------|-------|-------|
| Script Invocation | <1s | Bash tool overhead |
| Parallel Execution | 1-3s | Multiple agents simultaneously |
| Database Storage | <100ms | Per agent result |
| Total | 2-5s | For 2-4 agents |
| Database Writes | 1-6 | Depends on agent count |
| Token Usage | Low | Minimal context needed |

**Optimization Tips**:
- Leverage parallel execution (2-4 agents in ~2s vs 6-12s sequential)
- Batch related validations in same orchestration
- Query database for historical patterns to skip redundant checks

---

### Pattern 3: Hybrid (Not Functional)

| Metric | Value | Notes |
|--------|-------|-------|
| Total | 5-10s | Analysis without execution |
| Database Writes | 0 | Scripts not invoked |
| Success Rate | 0% | Intended script execution |

**Status**: Not recommended for production use

---

## Best Practices

### For Advisory Questions (Pattern 1)

✅ **Do**:
- Ask open-ended architecture questions
- Seek best practices and patterns
- Request examples and anti-patterns
- Explore trade-offs between approaches

❌ **Don't**:
- Expect script execution or database writes
- Request file creation or modifications
- Assume results are stored anywhere
- Use for production validation

**Example Queries**:
```
✅ "What's the best way to handle soft deletes in Supabase?"
✅ "Should I use composite primary keys or surrogate IDs for junction tables?"
✅ "Explain the CASCADE vs RESTRICT trade-offs for foreign keys"

❌ "Validate my database schema" (use Pattern 2)
❌ "Create a migration file" (use Pattern 2)
❌ "Run tests for SD-XXX" (use Pattern 2)
```

---

### For Execution Tasks (Pattern 2)

✅ **Do**:
- Use for all production validations
- Provide SD-ID explicitly
- Wait for complete execution (2-5s)
- Verify database storage afterward
- Review aggregated verdicts

❌ **Don't**:
- Bypass orchestrator for phase-based work
- Ignore BLOCKED verdicts
- Proceed without fixing critical issues
- Skip database verification

**Example Commands**:
```bash
✅ node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-XXX
✅ node scripts/execute-subagent.js --code DATABASE --sd-id SD-XXX
✅ node scripts/orchestrate-phase-subagents.js LEAD_FINAL SD-XXX

❌ Expecting native sub-agents to run these automatically
```

---

### For Development Iteration

**Recommended Workflow**:

1. **Design Phase** (Pattern 1):
   ```
   User: "How should I structure the authentication schema?"
   → database-agent provides guidance
   ```

2. **Implementation Phase** (Manual):
   ```
   - Create migration files based on guidance
   - Implement RLS policies
   - Add indexes
   ```

3. **Validation Phase** (Pattern 2):
   ```bash
   node scripts/execute-subagent.js --code DATABASE --sd-id SD-XXX
   ```

4. **Review Results**:
   ```javascript
   // Query database
   SELECT * FROM sub_agent_execution_results WHERE sd_id = 'SD-XXX';
   ```

5. **Iterate if Needed**:
   ```
   If FAIL: Address issues, return to step 2
   If CONDITIONAL_PASS: Review warnings, decide if acceptable
   If PASS: Proceed to next phase
   ```

---

## Troubleshooting

### "Sub-Agent Didn't Execute Script"

**Symptom**: Asked for validation, got analysis but no database records

**Diagnosis**:
```bash
# Check database
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', 'SD-XXX')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(data.length, 'records found');
})();
"
```

**Solution**: Use Pattern 2 (direct script execution) instead

---

### "Orchestrator Returned BLOCKED"

**Symptom**: Phase validation failed with BLOCKED verdict

**Diagnosis**:
1. Check which sub-agent blocked:
   ```sql
   SELECT sub_agent_code, verdict, critical_issues
   FROM sub_agent_execution_results
   WHERE sd_id = 'SD-XXX' AND verdict = 'BLOCKED'
   ORDER BY created_at DESC;
   ```

2. Review critical issues in metadata

3. Address blockers before proceeding

**Solution**: Fix critical issues, re-run validation

---

### "No Database Records Created"

**Symptom**: Script appeared to run but no database writes

**Common Causes**:
1. Wrong SD-ID format
2. Database connection issues
3. RLS policy blocking writes
4. Script didn't actually execute (Pattern 3 failure)

**Diagnosis**:
```bash
# Verify script execution manually
node scripts/execute-subagent.js --code DATABASE --sd-id SD-XXX

# Check for errors in output
# Verify database connection
node -e "const { createClient } = require('@supabase/supabase-js'); require('dotenv').config(); console.log('URL:', process.env.SUPABASE_URL);"
```

---

## Future Enhancements

### Planned Improvements

1. **Pattern 3 Script Invocation**
   - Strengthen sub-agent prompts to reliably use Bash tool
   - Add explicit Bash tool examples in agent system prompts
   - Test with different prompt structures

2. **Automatic Delegation**
   - Investigate why keyword matching doesn't trigger agents
   - Explore stronger description field directives
   - Test semantic similarity thresholds

3. **@-Mention Support**
   - Enable direct sub-agent addressing syntax
   - Bypass main agent routing for explicit invocations
   - Reduce invocation latency

4. **Agent Performance Metrics**
   - Track invocation → response latency
   - Monitor Pattern 1 vs Pattern 2 usage
   - Optimize based on real-world usage patterns

---

## Related Documentation

- Native Sub-Agent Invocation Guide
- [Sub-Agent System Overview](../leo/sub-agents/sub-agent-system.md)
- [LEO Protocol CLAUDE.md](../../CLAUDE.md)
- Database-First Architecture

---

**Last Updated**: 2025-10-12
**Tested Version**: Claude Code v2.0.14
**Test Coverage**: 3 patterns, 100% documented
**Production Status**: Patterns 1 & 2 ready, Pattern 3 experimental