# Agent Team Collaboration Guide

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-BRIDGE-AGENT-SYSTEMS-001
- **Last Updated**: 2026-02-11
- **Tags**: agents, teams, claude-code, collaboration, institutional-memory

## Overview

This guide explains how agents work together in the EHG_Engineer system, covering both **single-agent invocation** (via Task tool) and **multi-agent teams** (via Claude Code Teams feature).

### Key Concepts

**Agent Systems**:
- **Claude Code Native Agents**: Spawned via Task tool, work independently
- **LEO Database Sub-Agents**: Database-driven agents with institutional memory
- **Agent Bridge**: Pre-compiled knowledge injected into all agents at session start

**Collaboration Patterns**:
- **Single-Agent**: One agent works alone on a focused task
- **Multi-Agent Team**: Multiple agents work in parallel with shared context
- **Team Lead Pattern**: One agent coordinates others, distributes knowledge

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
- **[LEO Protocol v4.2 - Hybrid Sub-Agent System](../03_protocols_and_standards/LEO_v4.2_HYBRID_SUB_AGENTS.md)** - Original sub-agent design
- **[Agent Patterns Guide](./agent-patterns-guide.md)** - Agent base classes and patterns
- **[Command Ecosystem Reference](./command-ecosystem.md)** - How agents fit into LEO workflow

---

*Guide Version: 1.0.0*
*For SD-LEO-INFRA-BRIDGE-AGENT-SYSTEMS-001*
*LEO Protocol Version: 4.3.3*
