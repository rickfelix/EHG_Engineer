# Agent Systems Bridge Architecture

## Metadata
- **Category**: Architecture
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
- **Last Updated**: 2026-02-11
- **Tags**: agents, claude-code, leo-database, prompt-compiler, institutional-memory, dynamic-agents, team-spawning

## Overview

This document describes the **Agent Systems Bridge** architecture that unifies Claude Code native agents (static `.md` files) with LEO's database-driven sub-agent system (dynamic knowledge). The bridge uses a **Prompt Compiler** pattern to pre-generate institutional knowledge into agent files at session start, achieving zero runtime overhead.

### The Problem (Before Bridge)

EHG_Engineer had **two separate agent systems** operating in isolation:

**System 1: Claude Code Native Agents**
- 17 static `.claude/agents/*.md` files
- Invoked directly by Claude Code via Task tool
- No access to database knowledge (issue patterns, trigger phrases, retrospective learnings)
- Fixed content, no institutional memory

**System 2: LEO Database Sub-Agents**
- 30 sub-agents defined in `leo_sub_agents` table
- 477 trigger phrases in `leo_sub_agent_triggers` table
- Rich institutional knowledge in `issue_patterns`, `retrospectives`
- Only accessible via `scripts/execute-subagent.js`

**Result**: 17 Claude Code agents never received database instructions, issue patterns, or Agent Experience Factory composition when spawned natively.

### The Solution (After Bridge)

The **Generate-Time Bridge** pre-compiles database knowledge into Claude Code agent files at session start:

1. Human-authored content lives in `.partial.md` source files (committed)
2. Generation script reads `.partial.md` + fetches LEO database knowledge
3. Script injects curated "Institutional Memory" blocks (500-token cap)
4. Compiled `.claude/agents/*.md` files are generated (gitignored)
5. Claude Code reads compiled files → all agents arrive with institutional memory

**Zero runtime cost** - Knowledge is pre-computed once per session.

---

## Architecture Components

### 1. Source/Build Separation

```
Source (Committed):
.claude/agents/rca-agent.partial.md        ← Human-authored identity & instructions

Build (Gitignored):
.claude/agents/rca-agent.md                ← Generated: source + DB knowledge
```

**Why This Pattern**:
- Eliminates git noise from frequently-regenerated files
- Separates human-authored content from machine-generated
- Mirrors how CLAUDE.md is already generated from database
- Enables clean, deterministic builds

### 2. Agent Code Mapping

`scripts/generate-agent-md-from-db.js` contains the canonical mapping:

```javascript
const AGENT_CODE_MAP = {
  // Claude Code filename → LEO sub-agent code
  'api-agent': 'API',
  'database-agent': 'DATABASE',
  'dependency-agent': 'DEPENDENCY',
  'design-agent': 'DESIGN',
  'docmon-agent': 'DOCMON',
  'github-agent': 'GITHUB',
  'orchestrator-child-agent': 'ORCHESTRATOR_CHILD',
  'performance-agent': 'PERFORMANCE',
  'rca-agent': 'RCA',
  'regression-agent': 'REGRESSION',
  'retro-agent': 'RETRO',
  'risk-agent': 'RISK',
  'security-agent': 'SECURITY',
  'stories-agent': 'STORIES',
  'testing-agent': 'TESTING',
  'uat-agent': 'UAT',
  'validation-agent': 'VALIDATION'
};
```

This mapping is **the single source of truth** for agent reconciliation.

### 3. Knowledge Injection

Each compiled agent receives an "Institutional Memory (Generated)" block containing:

```markdown
## Institutional Memory (Generated)

> **NOT EXHAUSTIVE**: This section contains curated institutional knowledge compiled from the LEO database at generation time. It does NOT represent all available knowledge. When uncertain, query the database directly via `node scripts/execute-subagent.js --code <CODE> --sd-id <SD-ID>` or check `issue_patterns` and `leo_sub_agents` tables for the latest data.

### Trigger Context
This agent activates on: keyword1, keyword2, keyword3 (+N more in database)

### Recent Issue Patterns
- **PAT-001** (12x): Issue summary...
  Proven fix: Solution description...

### Registered Capabilities
capability1, capability2, capability3
```

**Key Design Decisions**:
- **500-token cap** (2000 chars) enforced to prevent context bloat
- **NOT EXHAUSTIVE disclaimer** to avoid false confidence trap
- **Top 3 patterns** only (sorted by occurrence_count)
- **Database query fallback** instructions included
- **Injection point**: After "Model Usage Tracking" section, before next heading

### 4. Incremental Mode

To minimize session-start latency, the compiler supports incremental generation:

```bash
node scripts/generate-agent-md-from-db.js --incremental
```

**How It Works**:
1. Compute SHA-256 hash of all inputs:
   - All `.partial.md` file contents (sorted for determinism)
   - Database snapshot (agents, triggers, patterns)
2. Compare hash to `.claude/.agent-gen-hash`
3. If unchanged, skip generation (~400ms session-start)
4. If changed, regenerate and update hash

**When Generation Runs**:
- Session-start hook (incremental mode)
- Manual: `npm run agents:compile`
- Post-install: `npm run postinstall`

### 5. Database-Driven Metadata (Updated 2026-02-11)

**As of Phase 4**, agent metadata is now stored in the database instead of config files. The compiler reads:

```javascript
// Read from leo_sub_agents table
const { data: agents } = await supabase
  .from('leo_sub_agents')
  .select('code, model_tier, allowed_tools, team_role, instructions, category_mappings')
  .eq('active', true);
```

**Database Columns** (added in Phase 4):
- `model_tier`: 'haiku' | 'sonnet' | 'opus' (replaces config defaults)
- `allowed_tools`: JSONB array of tool names (replaces role-based tool lists)
- `team_role`: 'leader' | 'teammate' (determines team spawning capabilities)
- `instructions`: Full agent identity text (supports DB-only dynamic agents)
- `category_mappings`: JSONB array of categories (replaces config categoryMappings)

**Compiler Behavior**:
1. Read `.partial.md` file for human-authored content (if exists)
2. Read database metadata (model_tier, allowed_tools, team_role)
3. Generate YAML frontmatter from database columns
4. Inject TEAM_COLLABORATION_PROTOCOL section (if has SendMessage tool)
5. Inject TEAM_SPAWNING_PROTOCOL section (if has TeamCreate + Task tools)
6. Inject institutional memory block (triggers, patterns, capabilities)
7. Write compiled `.md` file

**DB-Only Dynamic Agents**: If no `.partial.md` exists but `instructions` column is populated, compiler generates agent entirely from database (used by `createDynamicAgent()`).

**Legacy Config File** (`config/phase-model-routing.json`):
- **Deprecated** as of Phase 4
- Model routing now in `leo_sub_agents.model_tier` column
- Category mappings now in `leo_sub_agents.category_mappings` column
- File retained for backward compatibility but not read by compiler

---

## Reconciliation Audit

### Purpose

The reconciliation audit (`scripts/agent-reconciliation-audit.js`) identifies gaps between Claude Code agents and LEO sub-agents.

### Gap Status Definitions

| Status | Meaning | Action |
|--------|---------|--------|
| **MATCHED** | Agent exists in both systems, has triggers, config registered | ✅ No action |
| **PARTIAL** | Agent exists but missing triggers or config | ⚠️ Add missing pieces |
| **MISSING_IN_CLAUDE** | LEO sub-agent has no `.partial.md` file | ❌ Create `.partial.md` |
| **MISSING_IN_LEO** | Claude agent has no LEO database record | ❌ Add to `leo_sub_agents` |

### Audit Output

```bash
node scripts/agent-reconciliation-audit.js

# Generates:
# - artifacts/agent-reconciliation.json (machine-readable)
# - artifacts/agent-reconciliation.md (human-readable)
```

**Example Report**:
```markdown
## Summary
| Metric | Count |
|--------|-------|
| Claude Code Agents | 17 |
| LEO Sub-Agents | 30 |
| Fully Matched | 15 |
| Partially Matched | 2 |
| Missing in Claude | 13 |
| Missing in LEO | 0 |
```

---

## Workflow

### 1. Session Start Hook

The session-start hook (`scripts/hooks/agent-compiler-hook.cjs`) runs automatically when Claude Code starts:

```javascript
// CJS wrapper for ESM compiler
import('./scripts/generate-agent-md-from-db.js')
  .then(mod => mod.main())
  .catch(err => {
    console.error('[SessionStart] Agent compilation failed:', err.message);
    // Graceful degradation - session continues with stale agents
  });
```

**Characteristics**:
- 15-second timeout
- Graceful failure (continues with stale agents if generation fails)
- Uses `--incremental` mode if all `.md` files exist
- Logs to `.claude/logs/session-start.log`

### 2. Manual Compilation

For development or debugging:

```bash
# Compile all agents (live DB mode)
npm run agents:compile

# Compile with snapshot (offline mode)
node scripts/generate-agent-md-from-db.js --snapshot path/to/snapshot.json

# Dry-run (preview without writing)
node scripts/generate-agent-md-from-db.js --dry-run

# Incremental (skip if unchanged)
node scripts/generate-agent-md-from-db.js --incremental
```

### 3. Creating New Agents

To add a new agent:

1. **Create `.partial.md` file**:
   ```bash
   cp .claude/agents/template.partial.md .claude/agents/new-agent.partial.md
   ```

2. **Add to `AGENT_CODE_MAP`** in `scripts/generate-agent-md-from-db.js`:
   ```javascript
   'new-agent': 'NEW_CODE',
   ```

3. **Register in LEO database**:
   ```sql
   INSERT INTO leo_sub_agents (code, name, description, capabilities, active)
   VALUES ('NEW_CODE', 'New Agent', 'Description...', '["cap1"]', true);
   ```

4. **Add triggers**:
   ```sql
   INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, priority, active)
   SELECT id, 'keyword1', 100, true FROM leo_sub_agents WHERE code = 'NEW_CODE';
   ```

5. **Add config routing** in `config/phase-model-routing.json`

6. **Compile**:
   ```bash
   npm run agents:compile
   ```

---

## Database Tables

### `leo_sub_agents`

Core sub-agent definitions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `code` | text | Agent code (matches `AGENT_CODE_MAP` values) |
| `name` | text | Display name |
| `description` | text | Agent purpose |
| `capabilities` | jsonb | Array of capabilities |
| `metadata` | jsonb | Custom metadata |
| `active` | boolean | Whether agent is active |

### `leo_sub_agent_triggers`

Trigger phrases that activate agents.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `sub_agent_id` | uuid | FK to `leo_sub_agents` |
| `trigger_phrase` | text | Keyword or phrase |
| `priority` | int | Priority (100=highest) |
| `active` | boolean | Whether trigger is active |

### `issue_patterns`

Recurring issues captured from retrospectives.

| Column | Type | Description |
|--------|------|-------------|
| `pattern_id` | text | Pattern identifier |
| `category` | text | Category (e.g., `root_cause`, `database`) |
| `issue_summary` | text | Issue description |
| `proven_solutions` | jsonb | Array of proven fixes |
| `occurrence_count` | int | Times this pattern occurred |
| `status` | text | `active`, `resolved`, `deprecated` |

---

## Knowledge Composition

### Data Sources

The compiler pulls knowledge from multiple tables:

```javascript
async function fetchLiveData(supabase) {
  // 1. Agent definitions
  const { data: agents } = await supabase
    .from('leo_sub_agents')
    .select('id, code, name, description, capabilities, metadata')
    .eq('active', true)
    .order('code');

  // 2. Trigger phrases
  const { data: triggers } = await supabase
    .from('leo_sub_agent_triggers')
    .select('sub_agent_id, trigger_phrase, priority')
    .eq('active', true)
    .order('priority', { ascending: false });

  // 3. Issue patterns
  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('pattern_id, category, issue_summary, proven_solutions, occurrence_count')
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false });

  return { agentByCode, triggersByCode, patterns };
}
```

### Filtering Rules

**Triggers**:
- Show top 8 triggers only
- Sorted by priority (descending)
- If >8 triggers, show count: `(+N more in database)`

**Patterns**:
- Show top 3 patterns only
- Filtered by category mappings from `config/phase-model-routing.json`
- Example: RCA agent sees patterns with `category IN ('root_cause', 'defect', 'recurring_issue')`
- Sorted by occurrence_count (descending)

**Capabilities**:
- Show first 6 capabilities
- Parsed from JSONB array or string

---

## Performance Characteristics

### Generation Time

| Mode | Input | Output | Time |
|------|-------|--------|------|
| **Full generation** | 17 `.partial.md` + DB | 17 `.md` | ~2.5s |
| **Incremental (unchanged)** | Hash comparison | Skip | ~400ms |
| **Incremental (changed)** | 17 `.partial.md` + DB | 17 `.md` | ~2.5s |

### Runtime Impact

**Zero overhead** - Knowledge is pre-compiled, not fetched at invocation time.

| Scenario | Before Bridge | After Bridge |
|----------|---------------|--------------|
| Agent invocation | 1 DB query (~50ms) | 0 DB queries |
| 10 agents invoked | 10 queries (~500ms) | 0 queries |
| 100 agents invoked | 100 queries (~5s) | 0 queries |

### Token Budget

- **Per-agent knowledge cap**: 500 tokens (2000 chars)
- **Typical injection size**: 200-400 tokens (varies by agent)
- **17 agents total**: ~5,100-6,800 tokens added to context
- **Context budget impact**: ~2.5-3.4% of 200k token window

---

## Error Handling

### Generation Failures

The compiler gracefully handles:

**Missing Database Credentials**:
```javascript
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}
```

**Database Query Failures**:
```javascript
const { data, error } = await supabase.from('leo_sub_agents').select('*');
if (error) {
  throw new Error(`Failed to fetch agents: ${error.message}`);
}
```

**File Write Failures**:
- Logged to console
- Recorded in `results.failed` array
- Script exits with code 1

### Runtime Degradation

If session-start generation fails:
1. Hook logs error to `.claude/logs/session-start.log`
2. Session continues with **stale agent files**
3. User is **not notified** (silent degradation)
4. Manual compilation available: `npm run agents:compile`

---

## Validation

### Config Validation

At generation time, the compiler validates required config registrations:

```javascript
const REQUIRED_CONFIG_KEYS = ['RCA', 'ORCHESTRATOR_CHILD'];

function validateConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const missing = [];

  for (const key of REQUIRED_CONFIG_KEYS) {
    // Check defaults
    if (!config.defaults?.[key]) {
      missing.push(`defaults.${key}`);
    }
    // Check at least one phaseOverride
    const inAnyPhase = Object.values(config.phaseOverrides || {}).some(p => p[key]);
    if (!inAnyPhase) {
      missing.push(`phaseOverrides.*.${key}`);
    }
    // Check categoryMappings
    if (!config.categoryMappings?.[key]) {
      missing.push(`categoryMappings.${key}`);
    }
  }

  return missing;
}
```

**Fails generation** if any required keys are missing.

### Reconciliation Validation

The audit script validates:

**For each agent**:
- Claude Code file exists?
- LEO database record exists?
- Has active triggers?
- Registered in config?

**Exits with code 1** if:
- Claude agent has no LEO mapping
- Agent missing config registration

---

## Implemented Enhancements

### Phase 4: Team-Capable Agents ✅ COMPLETE (2026-02-11)

**Status**: COMPLETED via SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001

All 31 compiled agents are now leaders with full team spawning capabilities. Agents can form coordinated teams on-demand when multi-domain expertise is required.

**Architecture Changes**:

1. **Database Schema Updates**:
   ```sql
   ALTER TABLE leo_sub_agents
     ADD COLUMN model_tier VARCHAR(20) DEFAULT 'opus'
       CHECK (model_tier IN ('haiku', 'sonnet', 'opus')),
     ADD COLUMN allowed_tools JSONB DEFAULT '["Bash", "Read", "Write"]'::jsonb,
     ADD COLUMN team_role VARCHAR(20) DEFAULT 'teammate'
       CHECK (team_role IN ('leader', 'teammate')),
     ADD COLUMN instructions TEXT,
     ADD COLUMN category_mappings JSONB DEFAULT '[]'::jsonb;
   ```

2. **Universal Leader Promotion**:
   - All 31 agents promoted from teammate to leader role
   - Updated `allowed_tools` to include: TeamCreate, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, SendMessage
   - Compiler updated to generate TEAM_SPAWNING_PROTOCOL section for all leaders

3. **Team Templates** (pre-built in database):
   - `rca-investigation` — RCA lead + DB specialist + API specialist
   - `security-audit` — Security lead + DB + API + Testing specialists
   - `performance-review` — Performance lead + DB + API specialists

4. **Dynamic Agent Creation**:
   - New module: `lib/team/agent-creator.js` (~113 LOC)
   - Creates specialist agents at runtime via database insertion
   - Dynamic agents are ALWAYS teammates (safeguard prevents recursion)
   - Depth limit enforced: compiled leader → dynamic teammate

5. **Knowledge Enrichment**:
   - New module: `lib/team/knowledge-enricher.js` (~101 LOC)
   - Wraps Agent Experience Factory with semantic search
   - Task-specific knowledge injected via `IssueKnowledgeBase.search()`
   - 1200-token budget per enrichment

6. **Team Spawning**:
   - New module: `lib/team/team-spawner.js` (~160 LOC)
   - Template-based team assembly from database
   - Generates enriched spawn prompts with task dependencies
   - CLI wrapper: `scripts/spawn-team.js`

**Example Team Formation**:

```javascript
// Database agent investigating timeout spawns API specialist
[database-agent creates team]
TeamCreate: { team_name: "timeout-investigation" }

[database-agent spawns API specialist]
Task tool with subagent_type="api-agent" (teammate):
"Investigate /api/reports/generate endpoint for N+1 query pattern.
Database agent found 50+ sequential calls consuming connection pool."

[api-agent reports findings]
SendMessage to database-agent:
"API investigation complete. Confirmed N+1 pattern in reports controller.
Recommendation: Refactor to use eager loading with include clause."
```

**Trust Boundary**: Compiled agents (leaders) vs Dynamic agents (teammates)

**Benefits**:
- Any agent can spawn specialist help when encountering multi-domain problems
- Emergent collaboration without predefined team structures
- On-demand specialization for unique problems
- Zero cascading team creation (depth limit enforced)

**Files Added**:
- `lib/team/agent-creator.js` (dynamic agent creation)
- `lib/team/knowledge-enricher.js` (AEF + semantic search wrapper)
- `lib/team/team-spawner.js` (template-based team assembly)
- `lib/team/index.js` (public exports)
- `scripts/enrich-teammate-prompt.js` (CLI wrapper for enrichment)
- `scripts/spawn-team.js` (CLI wrapper for team spawning)
- `database/migrations/20260211_agent_team_capabilities.sql` (schema + seed data)

---

## Future Enhancements

### Phase 5: Database Single Source of Truth

Move human-authored identity text from `.partial.md` into `leo_sub_agents` table (partially implemented via `instructions` column):

```sql
-- Already added in Phase 4:
ALTER TABLE leo_sub_agents
  ADD COLUMN instructions TEXT;

-- Future additions:
ALTER TABLE leo_sub_agents
  ADD COLUMN identity_text TEXT,
  ADD COLUMN trigger_examples JSONB;
```

**Status**: **Partially Complete** - `instructions` column added in Phase 4, supports DB-only dynamic agents. Remaining work: migrate existing `.partial.md` content to `identity_text` column.

**Benefits**:
- Database becomes 100% single source of truth
- No `.partial.md` files needed (all in DB)
- Easier to version and audit changes
- Enables web UI for agent editing

### Phase 6: Fully Ephemeral Agents

Generation script reads 100% from DB, `.claude/agents/` becomes purely ephemeral:

```javascript
// Generate agent from DB only
async function generateAgent(agentCode, data) {
  const agent = data.agentByCode[agentCode];

  // All content from DB (no .partial.md files)
  const content = `
${agent.identity_text || agent.instructions}

${composeKnowledgeBlock(agentCode, data)}

${generateTeamProtocols(agent)}
  `;

  return content;
}
```

**Status**: **Foundation Ready** - Compiler supports DB-only generation for dynamic agents (no `.partial` required). Remaining work: migrate compiled agents to use DB-sourced `identity_text`.

---

## Related Documentation

- **[LEO Protocol v4.2 - Hybrid Sub-Agent System](../03_protocols_and_standards/LEO_v4.2_HYBRID_SUB_AGENTS.md)** - Original sub-agent architecture
- **[Agent Patterns Guide](../reference/agent-patterns-guide.md)** - Agent base classes and patterns
- **[Command Ecosystem Reference](../reference/command-ecosystem.md)** - How agents fit into LEO workflow
- **[Documentation Standards](../03_protocols_and_standards/DOCUMENTATION_STANDARDS.md)** - File organization rules

---

## Files Reference

| File | Purpose | LOC |
|------|---------|-----|
| `scripts/generate-agent-md-from-db.js` | Prompt compiler (main, now reads DB metadata) | 532 |
| `scripts/agent-reconciliation-audit.js` | Gap analysis | 282 |
| `scripts/hooks/agent-compiler-hook.cjs` | Session-start hook | 42 |
| `.claude/agents/*.partial.md` | Human-authored source (17 files) | ~500 each |
| `.claude/agents/*.md` | Generated build artifacts (gitignored, 31+ files) | ~700 each |
| `lib/team/agent-creator.js` | Dynamic agent creation | 113 |
| `lib/team/knowledge-enricher.js` | AEF + semantic search wrapper | 101 |
| `lib/team/team-spawner.js` | Template-based team assembly | 160 |
| `scripts/enrich-teammate-prompt.js` | CLI enrichment wrapper | 40 |
| `scripts/spawn-team.js` | CLI team spawner | 50 |
| `config/phase-model-routing.json` | Model tier routing (deprecated - now in DB) | 180 |

---

*Bridge Architecture Version: 2.0.0*
*Phase 4 Implemented by: SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001*
*LEO Protocol Version: 4.3.3*
*Team-Capable Agents: Active (2026-02-11)*
