# Native Claude Code Sub-Agent Integration

**Generated**: 2025-10-25T18:16:13.281Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

## 🤖 Native Claude Code Sub-Agent Integration

**Status**: ✅ TESTED & DOCUMENTED (2025-10-12)

### Overview
Claude Code supports native sub-agents via the Task tool. These sub-agents work alongside the database-driven LEO Protocol orchestration system in a hybrid architecture.

### Critical Dependency: ripgrep
**REQUIRED**: `ripgrep` (command: `rg`) must be installed for agent discovery.
```bash
# Check if installed
which rg

# Install on Ubuntu/Debian WSL2
sudo apt update && sudo apt install ripgrep -y
```

**Without ripgrep**: Agent discovery fails silently (no error messages, agents simply won't be found).

### Discovery Mechanism
1. Claude Code uses ripgrep to scan `.claude/agents/*.md` files
2. YAML frontmatter is parsed for agent configuration
3. Successfully discovered agents appear in `/agents` menu
4. Verify with: `/agents` command

### Five Sub-Agent Invocation Patterns

#### Pattern 1: Advisory Mode ✅ (RECOMMENDED for guidance)

**Use Case**: General architecture questions, no SD context

**Example**:
```
User: "What's the best way to structure a many-to-many relationship?"
Main Agent → Task(database-agent) → Expert Guidance
```

**Performance**: ~3 seconds, 0 database records
**Best For**: Design exploration, best practices, architectural guidance

---

#### Pattern 2: Direct Orchestration ✅ (PRODUCTION-READY)

**Use Case**: Explicit phase-based validation, multiple sub-agents, production workflows

**Example**:
```bash
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-MONITORING-001
```

**Performance**: ~2 seconds (parallel execution), 4 database records
**Best For**: Phase validation, multi-agent orchestration, audit trails, when user explicitly requests validation

---

#### Pattern 3: Automatic SD Detection & Execution ✅ (SMART ORCHESTRATION)

**Use Case**: Automatically detect SD-related requests and execute appropriate orchestration

**How It Works**:
Main agent detects patterns in user requests and automatically executes Pattern 2 (Direct Orchestration) without requiring explicit script syntax.

**Detection Patterns**:

1. **SD-ID Detection** (Primary Trigger):
   - Regex: `SD-[A-Z0-9]+-[A-Z0-9-]+` or `SD-[A-Z0-9]+`
   - Examples: SD-MONITORING-001, SD-UAT-020, SD-EXPORT-001

2. **Validation Keywords** (Secondary Trigger):
   - validate, check, verify, review, assess, evaluate, test, run, execute
   - Example: "validate SD-XXX", "check SD-XXX status", "run verification for SD-XXX"

3. **Phase Keywords** (Context Qualifier):
   - PLAN_VERIFY, LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, LEAD_FINAL
   - LEAD, PLAN, EXEC phases
   - pre-approval, verification, final approval
   - Example: "run PLAN_VERIFY for SD-XXX", "pre-approval check for SD-XXX"

**Automatic Execution Logic**:

```
IF user message contains SD-ID pattern (SD-XXX)
  AND (validation keyword OR phase keyword)
THEN
  Determine phase:
    - "pre-approval" OR "LEAD_PRE_APPROVAL" → LEAD_PRE_APPROVAL
    - "PRD" OR "PLAN_PRD" → PLAN_PRD
    - "verify" OR "verification" OR "PLAN_VERIFY" → PLAN_VERIFY
    - "final" OR "LEAD_FINAL" → LEAD_FINAL
    - Default: PLAN_VERIFY (most common verification)

  Execute: node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>

  Report results to user
END IF
```

**Examples of Automatic Detection**:

| User Request | Detected | Auto-Executes |
|--------------|----------|---------------|
| "Validate SD-MONITORING-001" | ✅ SD-ID + "validate" | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-MONITORING-001` |
| "Run pre-approval for SD-AUTH-003" | ✅ SD-ID + "pre-approval" | `node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-AUTH-003` |
| "Check SD-EXPORT-001 status" | ✅ SD-ID + "check" | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-EXPORT-001` |
| "PLAN_VERIFY SD-UAT-020" | ✅ Phase keyword + SD-ID | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-UAT-020` |
| "Is SD-TEST-001 ready?" | ✅ SD-ID + implied check | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001` |
| "What is SD-XXX about?" | ❌ No validation keyword | Query database, no orchestration |

**Performance**: Same as Pattern 2 (~2 seconds), but triggered automatically
**Best For**: User convenience, reducing syntax burden, natural language SD validation

**User Benefits**:
- No need to remember orchestrator script syntax
- Natural language requests work automatically
- Correct phase selected based on context
- All Pattern 2 benefits (parallel execution, database storage) automatically applied

---

#### Pattern 4: Context-Aware Sub-Agent Selection (COMING SOON)

**Use Case**: Intelligently select relevant sub-agents based on SD content analysis

**Status**: In development (Phase 2 of execution plan)

**Planned Features**:
- Compound keyword matching (require 2+ matches to reduce false positives)
- Context-aware weighting (title matches > description matches)
- Domain coordination (DATABASE + SECURITY for auth features)
- Exclusion patterns ("HTML table" ≠ database table trigger)

**Expected Release**: 2-3 weeks

---

#### Pattern 5: Error-Triggered Sub-Agent Invocation (COMING SOON)

**Use Case**: Automatically invoke specialist sub-agents when errors occur

**Status**: In development (Phase 3 of execution plan)

**Planned Features**:
- Error pattern library (database errors, authentication failures, build errors)
- Automatic diagnosis & recovery workflows
- Circuit breakers to prevent infinite loops
- Learning from resolved errors

**Expected Release**: 1-2 months

### Decision Matrix

| Scenario | Pattern | Command |
|----------|---------|---------|
| "What's the best way to...?" | 1 (Advisory) | Natural language query |
| "How should I structure...?" | 1 (Advisory) | Natural language query |
| "Validate SD-XXX" | 3 (Auto-Detect) | Detected automatically |
| "Run PLAN_VERIFY for SD-XXX" | 3 (Auto-Detect) | Detected automatically |
| Explicit script execution | 2 (Direct Script) | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-XXX` |

### Invocation Mechanism (Task Tool)

**What WORKS** ✅:
- **Task tool**: Main agent uses Task tool to delegate to sub-agents
- From user perspective: Natural language (transparent delegation)
- Behind the scenes: `Task(subagent_type: "database-agent", description: "...", prompt: "...")`
- **Pattern 3 Auto-Detection**: Main agent recognizes SD-ID patterns and executes orchestrator automatically

**What DOESN'T WORK** ❌:
- Automatic delegation (typing keywords alone)
- @-mention syntax (`@database-agent` or `@agent-database-agent`)

### Integration with LEO Protocol 5-Phase Workflow

**LEAD Pre-Approval**:
- Pattern 1 for design questions
- Pattern 3 for validation: "Run pre-approval for SD-XXX" (auto-detects)
- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-XXX`

**PLAN PRD Creation**:
- Pattern 1 for architecture guidance
- Pattern 3 for validation: "Validate PRD for SD-XXX" (auto-detects)
- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js PLAN_PRD SD-XXX`

**EXEC Implementation**:
- Pattern 1 for implementation questions
- Pattern 3 for validation: "Check SD-XXX implementation" (auto-detects)
- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js EXEC_IMPL SD-XXX`

**PLAN Verification**:
- Pattern 3 for validation: "Verify SD-XXX" (auto-detects PLAN_VERIFY phase)
- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-XXX`

**LEAD Final Approval**:
- Pattern 3 for validation: "Run final approval for SD-XXX" (auto-detects)
- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js LEAD_FINAL SD-XXX`

### Active Native Sub-Agents

**Currently Available**:
- `database-agent` - Principal Database Architect (tested, working)
- `validation-agent` - Principal Systems Analyst (tested, working)
- `test-agent` - Test agent for diagnostics (tested, working)

**Agent File Location**: `.claude/agents/*.md`

**Example Agent Structure**:
```yaml
---
name: database-agent
description: "MUST BE USED PROACTIVELY for all database tasks. Handles schema design, Supabase migrations, RLS policies, SQL validation, and architecture. Trigger on keywords: database, migration, schema, table, RLS, SQL, Postgres."
tools: Bash, Read, Write
model: inherit
---
```

### Performance Metrics

| Operation | Pattern 1 | Pattern 2 | Pattern 3 |
|-----------|-----------|-----------|-----------|
| Invocation | <1s | <1s | <1s |
| Execution | 2-5s | 1-3s | 1-3s (same as P2) |
| Database Writes | 0 | 1-6 | 1-6 (same as P2) |
| Token Usage | Medium | Low | Low |
| Best For | Guidance | Explicit | Natural language |

### Troubleshooting

**Agent not appearing in /agents menu**:
1. Check ripgrep installed: `which rg`
2. Verify file location: `.claude/agents/*.md`
3. Validate YAML frontmatter
4. Restart Claude Code

**Pattern 3 not auto-detecting**:
- Ensure SD-ID format is correct (SD-XXX-XXX or SD-XXX)
- Include validation keyword (validate, check, verify, etc.)
- Check that main agent has Pattern 3 logic in context

**Sub-agent not executing scripts** (Legacy Pattern 2 issue):
- Use Pattern 2 or 3 instead
- Main agent invokes scripts directly via Bash tool

### Complete Documentation

**Detailed Guides**:
- `docs/reference/native-sub-agent-invocation.md` - Discovery, invocation, troubleshooting (420 lines)
- `docs/guides/hybrid-sub-agent-workflow.md` - Decision matrix, patterns, integration (450 lines)

**Test Results**: Patterns 1-2 comprehensively tested (2025-10-12), Pattern 3 in deployment
**Production Status**: Patterns 1 & 2 ready, Pattern 3 active deployment, Patterns 4 & 5 in development


---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
