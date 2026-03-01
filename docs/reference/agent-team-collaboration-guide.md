---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Agent Team Collaboration Guide


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
  - [Key Concepts](#key-concepts)
- [Single-Agent Invocation](#single-agent-invocation)
  - [When to Use](#when-to-use)
  - [How to Invoke](#how-to-invoke)
  - [Institutional Memory](#institutional-memory)
  - [Example: RCA Agent Invocation](#example-rca-agent-invocation)
- [Universal Leader Architecture](#universal-leader-architecture)
  - [Why All Agents Are Leaders](#why-all-agents-are-leaders)
  - [Available Agents (All Leaders)](#available-agents-all-leaders)
  - [Team Spawning Protocol (Injected in All Leaders)](#team-spawning-protocol-injected-in-all-leaders)
  - [Example: Database Agent Spawns API Help](#example-database-agent-spawns-api-help)
- [Multi-Agent Teams](#multi-agent-teams)
  - [When to Use](#when-to-use)
  - [Claude Code Teams Feature](#claude-code-teams-feature)
  - [Team Structure](#team-structure)
  - [Example: Feature Validation Team](#example-feature-validation-team)
  - [Team Lead as Knowledge Distributor](#team-lead-as-knowledge-distributor)
  - [SendMessage for Mid-Task Discovery](#sendmessage-for-mid-task-discovery)
- [Dynamic Agent Creation](#dynamic-agent-creation)
  - [When to Create Dynamic Agents](#when-to-create-dynamic-agents)
  - [How to Create Dynamic Agents](#how-to-create-dynamic-agents)
  - [Dynamic Agent Constraints](#dynamic-agent-constraints)
  - [Example: Creating and Using a Dynamic Agent](#example-creating-and-using-a-dynamic-agent)
  - [Dynamic Agent Lifecycle](#dynamic-agent-lifecycle)
  - [Dynamic vs Compiled Agents](#dynamic-vs-compiled-agents)
- [Knowledge Layers](#knowledge-layers)
  - [When to Query Database Directly](#when-to-query-database-directly)
- [Agent Capabilities](#agent-capabilities)
  - [Registered Capabilities (From Database)](#registered-capabilities-from-database)
  - [Registered Capabilities](#registered-capabilities)
  - [Capability Discovery](#capability-discovery)
- [Coordination Patterns](#coordination-patterns)
  - [Pattern 1: Sequential Handoff](#pattern-1-sequential-handoff)
  - [Pattern 2: Parallel Independent Work](#pattern-2-parallel-independent-work)
  - [Pattern 3: Converge-Synthesize](#pattern-3-converge-synthesize)
  - [Pattern 4: Librarian Agent](#pattern-4-librarian-agent)
- [Best Practices](#best-practices)
  - [DO](#do)
  - [DON'T](#dont)
- [Common Scenarios](#common-scenarios)
  - [Scenario 1: Database Migration](#scenario-1-database-migration)
  - [Scenario 2: Feature Validation](#scenario-2-feature-validation)
  - [Scenario 3: Root Cause Analysis](#scenario-3-root-cause-analysis)
  - [Scenario 4: Retrospective Generation](#scenario-4-retrospective-generation)
- [Troubleshooting](#troubleshooting)
  - [Agent Returns "Query database directly"](#agent-returns-query-database-directly)
  - [Team Lead Not Sharing Knowledge](#team-lead-not-sharing-knowledge)
  - [Agents Not Collaborating](#agents-not-collaborating)
  - [Agent Arrives Without Institutional Memory](#agent-arrives-without-institutional-memory)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
- **Last Updated**: 2026-02-11
- **Tags**: agents, teams, claude-code, collaboration, institutional-memory, dynamic-agents, leaders

## Overview

This guide explains how agents work together in the EHG_Engineer system, covering both **single-agent invocation** (via Task tool) and **multi-agent teams** (via Claude Code Teams feature).

### Key Concepts

**Agent Systems**:
- **Claude Code Native Agents**: Spawned via Task tool, work independently
- **LEO Database Sub-Agents**: Database-driven agents with institutional memory
- **Agent Bridge**: Pre-compiled knowledge injected into all agents at session start
- **Universal Leader Architecture**: All 31 compiled agents can spawn teams (as of 2026-02-11)
- **Dynamic Agent Creation**: Agents can create new specialists at runtime

**Collaboration Patterns**:
- **Single-Agent**: One agent works alone on a focused task
- **Multi-Agent Team**: Multiple agents work in parallel with shared context
- **Team Lead Pattern**: One agent coordinates others, distributes knowledge
- **On-Demand Team Spawning**: Any agent can assemble specialist help when needed

---

## Single-Agent Invocation

### When to Use

Use single-agent invocation when:
- Task is self-contained and focused
- No collaboration needed
- Fast turnaround required
- Context is small (<50k tokens)

### How to Invoke

```
Task tool with subagent_type="<agent-code>":
"Analyze the database schema for SD-XXX-001 and identify missing indexes."
```

**Available Agents**:
| Agent Code | Use For |
|------------|---------|
| `rca-agent` | Root cause analysis, 5-whys, defect triage |
| `database-agent` | Schema design, migrations, RLS policies |
| `design-agent` | UI/UX validation, accessibility, component sizing |
| `testing-agent` | E2E test generation, coverage validation |
| `security-agent` | Authentication, authorization, vulnerability scanning |
| `performance-agent` | Performance validation, load testing, optimization |
| `regression-agent` | Backward compatibility, refactoring validation |
| `retro-agent` | Retrospective generation, lesson extraction |
| `docmon-agent` | Documentation generation, info architecture |
| `stories-agent` | User story context engineering |
| `uat-agent` | User acceptance testing coordination |
| `validation-agent` | Codebase validation, duplicate detection |
| `api-agent` | API design, endpoint documentation |
| `dependency-agent` | npm/package updates, CVE scanning |
| `github-agent` | CI/CD validation, GitHub Actions |
| `orchestrator-child-agent` | Parallel child SD execution |
| `risk-agent` | Risk assessment, mitigation strategies |

### Institutional Memory

Every agent arrives pre-loaded with institutional knowledge from the LEO database:

**What Agents Know Automatically**:
- Top 8 trigger keywords for their domain
- Top 3 recurring issue patterns (with proven fixes)
- Registered capabilities
- Past retrospective learnings (via pattern linkage)

**What's NOT Included**:
- Task-specific data (you must provide context)
- Real-time database state (agents work from pre-generated snapshots)
- Other agents' findings (unless you explicitly share)

**Reminder in Agent Context**:
```
> **NOT EXHAUSTIVE**: This section contains curated institutional knowledge compiled from the LEO database at generation time. It does NOT represent all available knowledge. When uncertain, query the database directly...
```

### Example: RCA Agent Invocation

```
Task tool with subagent_type="rca-agent":
"Investigate why the PLAN-TO-EXEC handoff is failing for SD-FEATURE-001.
The error is: 'ERR_NO_PRD'. Perform 5-whys analysis."
```

**What RCA Agent Knows**:
- Common handoff failure patterns (from `issue_patterns`)
- Trigger keywords: "root cause", "5 whys", "defect", "recurring issue"
- Past fixes for `ERR_NO_PRD` errors

**What You Must Provide**:
- The specific SD ID
- The exact error message
- Any relevant context (git state, database state)

---

## Universal Leader Architecture

**As of 2026-02-11, all 31 compiled agents are leaders.** This means any agent can spawn specialist teams on-demand when their assigned task requires multi-domain expertise.

### Why All Agents Are Leaders

**Previous Architecture** (5 leaders, 26 teammates):
- Only RCA, SECURITY, RISK, TESTING, ORCHESTRATOR_CHILD could spawn teams
- Database agent investigating a connection timeout couldn't spawn API or Performance help
- Led to incomplete analysis when problems spanned domains

**Current Architecture** (31 leaders):
- Every compiled agent has full team spawning capabilities
- Database agent can spawn API specialist to investigate timeout in endpoint
- Performance agent can spawn Database specialist to analyze query bottlenecks
- Enables emergent collaboration without predefined team structures

**Safeguard Against Recursion**:
- Dynamic agents (created at runtime) are ALWAYS teammates, never leaders
- Prevents unbounded cascading team creation
- Depth limit = 1 (compiled leader → dynamic teammate)

### Available Agents (All Leaders)

All 31 agents have identical team tools. Key agents by domain:

| Agent Code | Domain | When to Invoke |
|------------|--------|----------------|
| `rca-agent` | Root Cause Analysis | Recurring failures, 5-whys needed |
| `database-agent` | Schema & Migrations | Database design, RLS, migrations |
| `design-agent` | UI/UX & Accessibility | Component design, a11y validation |
| `testing-agent` | QA & Testing | E2E test generation, coverage |
| `security-agent` | Security & Auth | Vulnerability scanning, auth flows |
| `performance-agent` | Performance | Load testing, bottleneck analysis |
| `api-agent` | API Design | Endpoint design, REST/GraphQL |
| `dependency-agent` | Dependencies | npm updates, CVE scanning |
| `regression-agent` | Refactoring | Backward compatibility validation |
| `github-agent` | CI/CD | GitHub Actions, pipeline validation |
| `docmon-agent` | Documentation | Doc generation, info architecture |
| `retro-agent` | Retrospectives | Lesson extraction, quality scoring |
| `stories-agent` | User Stories | Acceptance criteria, user journeys |
| `uat-agent` | UAT Testing | User acceptance test coordination |
| `validation-agent` | Codebase Audit | Duplicate detection, implementation checks |
| `risk-agent` | Risk Assessment | Risk analysis, mitigation strategies |
| _(+15 more)_ | Various | Launch, Marketing, Sales, Finance, etc. |

**Full roster**: Query `leo_sub_agents` table or see `.claude/agents/` directory.

### Team Spawning Protocol (Injected in All Leaders)

Every leader agent receives this protocol guidance:

**When to spawn help** (use judgment — only when genuinely needed):
- Problem spans multiple domains (e.g., DB issue affecting API and security)
- Lack expertise to investigate a specific aspect
- Parallel investigation would significantly speed up resolution

**How to spawn help**:
1. Use `TeamCreate` to create a team for the investigation
2. Use `TaskCreate` to define tasks for each specialist needed
3. Use the `Task` tool to spawn teammates with clear, scoped prompts
4. Teammates report findings back via `SendMessage`
5. Synthesize findings and report to whoever spawned you

**Available team templates** (pre-built in database):
- `rca-investigation` — RCA lead + DB specialist + API specialist
- `security-audit` — Security lead + DB + API + Testing specialists
- `performance-review` — Performance lead + DB + API specialists

**When NOT to spawn help**:
- You can handle the task yourself with your existing tools
- The task is simple and well-scoped to your domain
- Adding coordination overhead would slow things down

### Example: Database Agent Spawns API Help

**Scenario**: Database agent investigating connection timeout discovers the issue may be in the API layer.

```
[database-agent investigation]
"Analyzed connection pool logs. All connections consumed by long-running queries.
Traced to API endpoint /api/reports/generate - making 50+ sequential DB calls.

This is an N+1 query problem in the API layer, outside my domain.
Spawning API specialist to investigate endpoint design..."

[database-agent creates team]
TeamCreate: { team_name: "timeout-investigation" }

[database-agent spawns API specialist]
Task tool with subagent_type="api-agent" (teammate):
"Investigate /api/reports/generate endpoint for N+1 query pattern.
Database agent found 50+ sequential calls consuming connection pool.

Context: SD-PERF-001, timeout occurs after 30s, affects all report types.

Proven pattern PAT-PERF-003: N+1 queries in report generation (8x)
Fix: Batch queries using JOIN instead of sequential SELECT."

[api-agent reports findings]
SendMessage to database-agent:
"API investigation complete. Confirmed N+1 pattern in reports controller.
Root cause: Sequelize findAll() in loop instead of single JOIN query.
Recommendation: Refactor to use eager loading with include clause."

[database-agent synthesizes]
"Root cause determined: N+1 query pattern in /api/reports/generate.
Database layer is correctly configured. Issue is in API implementation.
Recommend: SD-PERF-001 ownership transfer to API team for refactoring."
```

**Key Points**:
- Database agent recognized domain boundary
- Spawned specialist instead of guessing
- Provided task-specific context in spawn prompt
- Received findings via SendMessage
- Synthesized complete root cause analysis

---

## Multi-Agent Teams

### When to Use

Use teams when:
- Task requires multiple domains (e.g., design + database + testing)
- Parallel work will save time
- Agents need to share findings mid-task
- Complex orchestration needed

### Claude Code Teams Feature

Claude Code (as of Feb 2026) supports **Agent Teams** with:

| Feature | Description |
|---------|-------------|
| **SendMessage** | Direct inter-agent communication |
| **Shared Task Lists** | Coordinated work via TaskCreate/TaskUpdate |
| **Team Lead** | One agent coordinates others |
| **1M Token Context** | Massive shared context window |
| **Parallel Execution** | Multiple agents work simultaneously |

### Team Structure

```
Team Lead (Orchestrator)
├── Teammate 1 (Specialist A) - Parallel work
├── Teammate 2 (Specialist B) - Parallel work
└── Teammate 3 (Specialist C) - Parallel work
```

**Team Lead Responsibilities**:
- Spawn teammates via Task tool
- Distribute work via shared task list
- Share relevant knowledge in spawn prompts
- Coordinate findings via SendMessage
- Synthesize results

### Example: Feature Validation Team

**Scenario**: Validate a new authentication feature (SD-AUTH-001)

**Team Composition**:
```
Lead: orchestrator-child-agent
├── Teammate 1: security-agent (check auth implementation)
├── Teammate 2: testing-agent (verify test coverage)
└── Teammate 3: design-agent (validate UX)
```

**Lead Workflow**:

1. **Spawn teammates with context**:
```
Task tool with subagent_type="security-agent" (teammate):
"Validate authentication implementation for SD-AUTH-001.
Focus on: hardcoded secrets, SQL injection, XSS, session management.

Relevant patterns from database:
- PAT-SEC-001: Hardcoded API keys in config files (12x)
  Proven fix: Use environment variables + .env.example template
- PAT-SEC-004: Missing CSRF protection (8x)
  Proven fix: Add csurf middleware to Express routes"
```

2. **Create shared task list**:
```
TaskCreate:
- subject: "Security validation for SD-AUTH-001"
- description: "Check for hardcoded secrets, SQL injection, CSRF"
- owner: security-agent

TaskCreate:
- subject: "Test coverage validation for SD-AUTH-001"
- description: "Verify E2E tests cover auth flows"
- owner: testing-agent

TaskCreate:
- subject: "UX validation for SD-AUTH-001"
- description: "Check accessibility, error messages, loading states"
- owner: design-agent
```

3. **Teammates report via SendMessage**:
```
[security-agent → orchestrator]
"Security scan complete. Found 1 issue:
- PAT-SEC-001: Hardcoded API key in auth.js line 42
Recommendation: Move to .env file"

[testing-agent → orchestrator]
"Test coverage: 85%. Missing E2E tests for:
- Password reset flow
- Multi-factor auth edge cases"

[design-agent → orchestrator]
"UX validation: 2 issues:
- Login button missing loading state
- Error messages not accessible (no aria-live)"
```

4. **Lead synthesizes**:
```
"Feature validation complete for SD-AUTH-001:

✅ PASS: No critical security issues
⚠️ PASS WITH CONDITIONS:
  - Move API key to .env (security-agent)
  - Add 2 E2E tests (testing-agent)
  - Fix 2 UX issues (design-agent)

Recommendation: Address conditions before EXEC→PLAN handoff."
```

### Team Lead as Knowledge Distributor

The team lead is a **natural knowledge distributor** - it already queries context to assign tasks. Including relevant database knowledge is just an incremental addition:

**Without Knowledge Distribution**:
```
Task tool with subagent_type="database-agent":
"Check the schema for SD-DB-001."
```

**With Knowledge Distribution**:
```
Task tool with subagent_type="database-agent":
"Check the schema for SD-DB-001.

Relevant patterns from database:
- PAT-DB-003: Missing indexes on foreign keys (15x)
  Proven fix: Add btree index on FK columns
- PAT-DB-007: RLS policies missing for new tables (9x)
  Proven fix: Always create RLS policies before INSERT"
```

**Benefit**: The teammate arrives with **task-specific knowledge** (fresher than pre-generated, targeted to their work).

### SendMessage for Mid-Task Discovery

Agents can share discoveries in real-time:

```
[database-agent discovers a pattern]
SendMessage (broadcast to team):
"Found recurring pattern: All user tables missing created_at timestamps.
This matches PAT-DB-012 in database. Recommend adding timestamps to:
- users table
- user_sessions table
- user_profiles table"

[design-agent sees message, applies to their work]
"Acknowledged. Will validate timestamp display in UI."
```

**Pattern Impossible in Single-Agent Spawning**: Traditional spawning doesn't allow mid-task communication. Teams enable **emergent collaboration**.

---

## Dynamic Agent Creation

Agents can create new specialist agents **at runtime** when no existing agent fits the required expertise. This enables on-demand specialization for unique problems.

### When to Create Dynamic Agents

**Use dynamic agent creation when**:
- Problem requires very specific expertise not covered by existing 31 agents
- One-time specialist needed (e.g., "Redis Cache Specialist" for a Redis-specific investigation)
- Existing agents are too general for the task
- You need a temporary agent with narrowly scoped knowledge

**Do NOT create dynamic agents when**:
- An existing agent can handle the task (check `leo_sub_agents` roster first)
- Task is simple enough to handle yourself
- Generic expertise is sufficient

### How to Create Dynamic Agents

Dynamic agents are created via database insertion using `lib/team/agent-creator.js`:

```javascript
import { createDynamicAgent } from './lib/team/agent-creator.js';

const result = await createDynamicAgent({
  code: 'REDIS_SPECIALIST',                    // Unique identifier (required)
  name: 'Redis Cache Specialist',              // Human-readable name (required)
  description: 'Specialist in Redis caching patterns and optimization',  // (required)
  instructions: `You are a Redis specialist. Focus on:
                 - Cache invalidation strategies
                 - Redis data structure optimization
                 - Connection pooling and clustering
                 - Memory management and eviction policies`,  // Full agent identity (required)
  capabilities: ['cache_analysis', 'redis_optimization', 'connection_pooling'],  // (optional)
  categoryMappings: ['performance', 'infrastructure']  // (optional)
});

// result: { agentCode: 'REDIS_SPECIALIST', compiled: true }
```

**What happens**:
1. INSERT into `leo_sub_agents` table with all fields populated
2. Compiler regenerates agent `.md` file entirely from database (no `.partial` needed)
3. Agent is immediately spawnable via Task tool: `subagent_type="redis-specialist"`
4. Agent file contains DB-sourced instructions + team protocol

### Dynamic Agent Constraints

**CRITICAL**: Dynamic agents are ALWAYS teammates, never leaders. This is enforced in `agent-creator.js`:

```javascript
// Safeguard: Dynamic agents can only be teammates
if (teamRole !== 'teammate') {
  console.warn('   ⚠️  Dynamic agents can only be teammates');
  teamRole = 'teammate';
}

const TEAMMATE_TOOLS = ['Bash', 'Read', 'Write', 'SendMessage', 'TaskUpdate', 'TaskList', 'TaskGet'];
// NOT included: TeamCreate, Task, TaskCreate (no team spawning)
```

**Why this matters**:
- Prevents unbounded recursion (dynamic agent spawning another dynamic agent)
- Limits depth to 1: compiled leader → dynamic teammate
- Dynamic agents can execute tasks but cannot coordinate teams

**Trust boundary**: Compiled agents (from `.partial` files) are leaders. Runtime-created agents are teammates.

### Example: Creating and Using a Dynamic Agent

**Scenario**: RCA agent investigating Redis timeout needs specialized help.

```javascript
// 1. RCA agent creates specialist
const redis = await createDynamicAgent({
  code: 'REDIS_TIMEOUT_SPECIALIST',
  name: 'Redis Timeout Specialist',
  description: 'Specialist for diagnosing Redis connection timeouts',
  instructions: `You are a Redis timeout specialist. Analyze:
  - Connection pool exhaustion
  - Network latency to Redis server
  - Slow commands blocking event loop
  - Memory pressure causing evictions

  Proven patterns from database:
  - PAT-REDIS-001: Connection pool too small (12x)
  - PAT-REDIS-004: KEYS command blocking event loop (8x)`,
  capabilities: ['timeout_analysis', 'connection_pooling', 'command_profiling'],
  categoryMappings: ['performance', 'infrastructure']
});

// 2. Compiler runs automatically, generates .claude/agents/redis-timeout-specialist.md

// 3. RCA agent spawns the new specialist
Task tool with subagent_type="redis-timeout-specialist":
"Investigate Redis timeout in SD-PERF-005.
Timeout occurs after 5 seconds when cache hit rate drops below 50%.
Redis server: localhost:6379, connection pool size: 10.

Analyze: connection pool, slow commands, network latency."

// 4. Specialist reports findings
[redis-timeout-specialist → rca-agent]
SendMessage: "Timeout root cause identified:
- Connection pool size (10) too small for traffic
- KEYS * command found in cache warming code (blocking)
- Recommendation: Increase pool to 50, replace KEYS with SCAN"

// 5. RCA agent synthesizes
"Root cause: Redis connection pool exhaustion + blocking KEYS command.
CAPA: Increase pool size to 50, refactor cache warming to use SCAN.
Pattern: PAT-REDIS-001 and PAT-REDIS-004 confirmed."
```

### Dynamic Agent Lifecycle

**Creation**:
- `createDynamicAgent()` → INSERT into `leo_sub_agents` table
- Compiler triggered automatically (via migration or manual run)
- Agent `.md` file generated from database columns

**Usage**:
- Spawned like any other agent: `Task tool with subagent_type="<code>"`
- Has access to teammate tools only (Bash, Read, Write, SendMessage, TaskUpdate, TaskList, TaskGet)
- Can report findings, update tasks, communicate with team

**Cleanup**:
- Dynamic agents persist in database unless explicitly deleted
- Use for one-time investigations, then DELETE row from `leo_sub_agents`
- Compiler regeneration removes orphaned `.md` files

**Duplicate Protection**:
```javascript
// createDynamicAgent() checks for existing agent with same code
const existing = await supabase.from('leo_sub_agents').select('code').eq('code', 'REDIS_SPECIALIST').single();
if (existing.data) {
  return { agentCode: 'REDIS_SPECIALIST', existing: true };
}
```

### Dynamic vs Compiled Agents

| Aspect | Compiled Agents | Dynamic Agents |
|--------|----------------|----------------|
| **Source** | `.partial.md` files + DB | Database only |
| **Team Role** | Leader (can spawn teams) | Teammate (cannot spawn) |
| **Tools** | Full set including TeamCreate, Task | Teammate set (no team tools) |
| **Creation** | Pre-defined at build time | Runtime via `createDynamicAgent()` |
| **Count** | 31 (fixed roster) | Unlimited (on-demand) |
| **Lifespan** | Permanent | Temporary (delete after use) |
| **Use Case** | General-purpose domains | Highly specific one-time tasks |
| **Institutional Memory** | Pre-compiled knowledge blocks | No pre-compiled knowledge (query DB) |

---

## Knowledge Layers

The bridge architecture provides **layered knowledge delivery**:

| Layer | Mechanism | Freshness | Cost | Coverage |
|-------|-----------|-----------|------|----------|
| **Base Layer** | Pre-generated knowledge in `.md` files | Periodic (session start) | Zero runtime | 90% of cases |
| **Team Layer** | Lead includes task-specific knowledge in spawn prompts | Real-time | 1 DB query per teammate | Targeted |
| **Collaboration Layer** | SendMessage for mid-task discoveries | Real-time | Zero (organic) | Emergent |

**No single layer needs to be perfect** - they complement each other.

### When to Query Database Directly

Despite pre-generated knowledge, agents should query the database when:

**Specific Incident Lookup**:
```
"Find the exact error message for failed handoff #456"
→ Query audit_log table
```

**Fresh Pattern Check**:
```
"Has this pattern recurred in the last 7 days?"
→ Query issue_patterns with date filter
```

**Complete Trigger List**:
```
"Show ALL triggers for RCA agent (not just top 8)"
→ Query leo_sub_agent_triggers table
```

**Task-Specific Context**:
```
"Load PRD for SD-XXX-001"
→ Query product_requirements_v2 table
```

**Agents are instructed to do this** - the NOT EXHAUSTIVE disclaimer in their institutional memory blocks reinforces it.

---

## Agent Capabilities

### Registered Capabilities (From Database)

Each agent has capabilities registered in `leo_sub_agents.capabilities`:

```javascript
// Example: RCA Agent capabilities
{
  "capabilities": [
    "5-whys analysis",
    "Defect triage",
    "Pattern detection",
    "CAPA generation",
    "Root cause determination",
    "Fishbone diagrams"
  ]
}
```

**Shown in Agent Context**:
```
### Registered Capabilities
5-whys analysis, Defect triage, Pattern detection, CAPA generation, Root cause determination, Fishbone diagrams
```

### Capability Discovery

To find which agent has a capability:

```bash
# Query database
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_sub_agents')
  .select('code, name, capabilities')
  .contains('capabilities', ['migration'])
  .then(({data}) => console.log(data));
"
```

---

## Coordination Patterns

### Pattern 1: Sequential Handoff

**Use When**: Steps have dependencies

```
1. database-agent: Design schema
2. regression-agent: Validate backward compatibility
3. database-agent: Apply migration
4. testing-agent: Run integration tests
```

**How**:
- Lead spawns agents one at a time
- Each agent's output feeds the next
- Use TaskUpdate to mark completion before spawning next

### Pattern 2: Parallel Independent Work

**Use When**: Steps are independent

```
[Parallel]
- security-agent: Check for vulnerabilities
- design-agent: Validate UX
- docmon-agent: Generate docs
```

**How**:
- Lead spawns all agents at once (multiple Task tool calls in one message)
- Agents work independently
- Lead collects results when all complete

### Pattern 3: Converge-Synthesize

**Use When**: Multiple perspectives on same topic

```
[Parallel]
- rca-agent: Analyze failure from defect angle
- retro-agent: Analyze failure from process angle
- risk-agent: Analyze failure from risk angle

[Converge]
- Lead synthesizes: "Root cause spans 3 dimensions..."
```

**How**:
- Spawn multiple domain experts
- Each analyzes same target from their lens
- Lead combines findings into unified view

### Pattern 4: Librarian Agent

**Use When**: Frequent database queries needed

```
Lead: orchestrator-child-agent
├── Librarian: validation-agent (knowledge queries)
├── Worker 1: database-agent (schema work)
└── Worker 2: testing-agent (test work)
```

**Librarian Responsibilities**:
- Query database on demand
- Share patterns via SendMessage
- Maintain shared knowledge context

**How**:
```
[Worker 1 → Librarian]
"Need patterns for missing indexes on foreign keys"

[Librarian queries DB → broadcast]
"PAT-DB-003: Missing indexes on foreign keys (15x)
Proven fix: Add btree index on FK columns
Affected SDs: SD-DB-001, SD-DB-005, SD-DB-012"

[Worker 1]
"Thanks, applying fix..."
```

---

## Best Practices

### DO

**Single-Agent**:
- ✅ Provide specific context in spawn prompt
- ✅ Include relevant SD ID, error messages, file paths
- ✅ Trust pre-generated knowledge for common cases
- ✅ Let agent query database for specifics

**Multi-Agent Teams**:
- ✅ Include relevant patterns in spawn prompts (lead does this)
- ✅ Use shared task list for coordination
- ✅ Broadcast discoveries via SendMessage
- ✅ Let agents collaborate organically

### DON'T

**Single-Agent**:
- ❌ Assume agent knows everything (NOT EXHAUSTIVE disclaimer exists for a reason)
- ❌ Spawn agents for trivial tasks (just do it yourself)
- ❌ Provide too much context (agents have token limits)

**Multi-Agent Teams**:
- ❌ Spawn teammates without clear task boundaries
- ❌ Over-coordinate (trust agents to self-organize)
- ❌ Ignore SendMessage notifications (agents communicate for a reason)
- ❌ Create teams for tasks a single agent can handle

---

## Common Scenarios

### Scenario 1: Database Migration

**Best Approach**: Single agent
**Agent**: `database-agent`

**Why**: Database work is self-contained, no collaboration needed.

```
Task tool with subagent_type="database-agent":
"Create migration for SD-DB-001 to add user_profiles table.
Include RLS policies and indexes."
```

### Scenario 2: Feature Validation

**Best Approach**: Team
**Lead**: `orchestrator-child-agent`
**Teammates**: `security-agent`, `testing-agent`, `design-agent`

**Why**: Multi-domain validation benefits from parallel work.

### Scenario 3: Root Cause Analysis

**Best Approach**: Single agent OR converge-synthesize team
**Agent**: `rca-agent`
**Optional Team**: `rca-agent` + `retro-agent` + `risk-agent`

**Why**:
- **Single**: Most RCA cases are straightforward
- **Team**: Complex failures benefit from multiple perspectives

### Scenario 4: Retrospective Generation

**Best Approach**: Single agent
**Agent**: `retro-agent`

**Why**: Retrospective generation is a focused task with clear inputs (SD data).

---

## Troubleshooting

### Agent Returns "Query database directly"

**Problem**: Agent needs specific data not in pre-generated knowledge.

**Solution**:
1. Query database yourself: `node scripts/execute-subagent.js --code <CODE> --sd-id <SD-ID>`
2. Or provide data in spawn prompt

### Team Lead Not Sharing Knowledge

**Problem**: Lead spawns teammates without context.

**Solution**: Explicitly instruct lead to include patterns:
```
"When spawning teammates, include relevant issue patterns from the database
in their spawn prompts. Query leo_sub_agent_triggers and issue_patterns tables."
```

### Agents Not Collaborating

**Problem**: Agents work in isolation despite being on a team.

**Solution**: Use SendMessage explicitly:
```
"After completing your analysis, broadcast findings to the team via SendMessage."
```

### Agent Arrives Without Institutional Memory

**Problem**: Agent's `.md` file wasn't regenerated.

**Solution**:
```bash
# Manual regeneration
npm run agents:compile

# Check if file exists
ls .claude/agents/<agent-name>.md

# Check session-start hook logs
cat .claude/logs/session-start.log
```

---

## Related Documentation

- **[Agent Systems Bridge Architecture](../01_architecture/agent-systems-bridge-architecture.md)** - Technical architecture
- **[LEO Protocol v4.2 - Hybrid Sub-Agent System](../03_protocols_and_standards/leo-v4.2-hybrid-sub-agents.md)** - Original sub-agent design
- **[Agent Patterns Guide](./agent-patterns-guide.md)** - Agent base classes and patterns
- **[Command Ecosystem Reference](../leo/commands/command-ecosystem.md)** - How agents fit into LEO workflow

---

*Guide Version: 2.0.0*
*For SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001*
*LEO Protocol Version: 4.3.3*
*Universal Leader Architecture: Active (2026-02-11)*
