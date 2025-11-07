# Agent Migration Strategy — SD-CREWAI-ARCHITECTURE-001

**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001
**Phase**: PLAN (Migration Planning)
**Task**: Migrate 40+ Python agents from codebase → database
**Date**: 2025-11-06
**Status**: ✅ **COMPLETE** (Migration Strategy)

---

## Executive Summary

This document defines the strategy for migrating 40+ existing Python CrewAI agents from the `/ehg/agent-platform/` codebase into the expanded database schema. The migration preserves existing functionality while enabling future database-driven code generation.

**Scope**: 45 Python agents across 16 crews

**Approach**: Automated scanning + semi-automated migration + manual validation

**Timeline**: 1 week (Phase 2 of EXEC)

**Risk Level**: LOW (read-only scanning, incremental writes, rollback support)

---

## Current State Analysis

### Python Codebase Inventory

**Location**: `/mnt/c/_EHG/ehg/agent-platform/app/agents/`

**Expected Structure**:
```
agent-platform/
├── app/
│   ├── agents/
│   │   ├── senior_market_analyst.py
│   │   ├── customer_insights_researcher.py
│   │   ├── competitive_intelligence_specialist.py
│   │   └── ... (42 more agents)
│   ├── crews/
│   │   ├── venture_research_crew.py
│   │   ├── board_meeting_crew.py
│   │   └── ... (14 more crews)
│   └── services/
│       └── research_orchestrator.py
```

### Database Current State

**From discovery phase findings**:
- **EHG Application DB**: 30 agents registered, 2 crews
- **EHG_Engineer DB**: 0 agents, 0 crews (governance gap)
- **Python Codebase**: 45 agents, 16 crews

**Gaps**:
- 15 agents unregistered (33% gap)
- 14 crews unregistered (88% gap)
- 100% governance bridge gap

---

## Migration Phases

### Phase 1: Scanning & Analysis (Day 1-2)

**Objective**: Discover all Python agents and extract configuration

**Script**: `scripts/scan-python-agents.mjs`

**Process**:
1. **Scan filesystem** for Python files matching agent patterns
2. **Parse Python AST** to extract agent configurations
3. **Map to database schema** (67 parameters)
4. **Detect duplicates** (compare with existing database records)
5. **Generate migration report** (CSV + JSON)

**Scanning Logic**:
```javascript
// Pseudo-code for scanning
async function scanPythonAgents() {
  const agentFiles = await glob('agent-platform/app/agents/**/*.py');
  const agents = [];

  for (const file of agentFiles) {
    const pythonCode = await fs.readFile(file, 'utf-8');
    const agentConfig = extractAgentConfig(pythonCode); // AST parsing

    agents.push({
      source_file: file,
      agent_key: deriveAgentKey(file), // 'senior-market-analyst'
      class_name: agentConfig.className, // 'SeniorMarketAnalyst'
      role: agentConfig.role,
      goal: agentConfig.goal,
      backstory: agentConfig.backstory,
      tools: agentConfig.tools,
      llm_model: agentConfig.llm_model || 'gpt-4-turbo-preview',
      // ... all 35 parameters
      exists_in_db: await checkDatabaseForAgent(agentConfig.role)
    });
  }

  return agents;
}
```

**AST Parsing Strategy**:
```python
# Python script for AST parsing
import ast

def extract_agent_config(python_code):
    """Extract agent configuration from Python code"""
    tree = ast.parse(python_code)

    for node in ast.walk(tree):
        # Find Agent() instantiation
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == 'Agent':
                config = {}

                # Extract keyword arguments
                for keyword in node.keywords:
                    if keyword.arg == 'role':
                        config['role'] = ast.literal_eval(keyword.value)
                    elif keyword.arg == 'goal':
                        config['goal'] = ast.literal_eval(keyword.value)
                    elif keyword.arg == 'backstory':
                        config['backstory'] = ast.literal_eval(keyword.value)
                    elif keyword.arg == 'tools':
                        config['tools'] = extract_tools_list(keyword.value)
                    # ... extract all 35 parameters

                return config

    return None
```

**Output**:
- `agent-scan-report.json` (45 agents with full config)
- `agent-scan-summary.csv` (high-level overview)
- `agent-migration-plan.json` (INSERT vs UPDATE actions)

### Phase 2: Deduplication & Conflict Resolution (Day 2-3)

**Objective**: Identify duplicate agents and resolve conflicts

**Deduplication Strategy**:

**Primary Key**: `agent_key` (derived from filename or role)

**Matching Logic**:
```javascript
function deriveAgentKey(filePath) {
  // Extract filename without extension
  // 'senior_market_analyst.py' → 'senior-market-analyst'
  const filename = path.basename(filePath, '.py');
  return filename.toLowerCase().replace(/_/g, '-');
}

async function checkForDuplicates(scannedAgent) {
  // Check 1: Exact agent_key match
  const byKey = await db.query(
    'SELECT * FROM crewai_agents WHERE agent_key = $1',
    [scannedAgent.agent_key]
  );

  // Check 2: Exact role match
  const byRole = await db.query(
    'SELECT * FROM crewai_agents WHERE role = $1',
    [scannedAgent.role]
  );

  // Check 3: Fuzzy match on role (Levenshtein distance)
  const byFuzzyRole = await db.query(
    'SELECT *, levenshtein(role, $1) AS distance FROM crewai_agents WHERE levenshtein(role, $1) < 5 ORDER BY distance',
    [scannedAgent.role]
  );

  return {
    exactKeyMatch: byKey.rows[0] || null,
    exactRoleMatch: byRole.rows[0] || null,
    fuzzyMatches: byFuzzyRole.rows
  };
}
```

**Conflict Resolution Rules**:

| Scenario | DB Agent | Python Agent | Resolution |
|----------|----------|--------------|------------|
| **No conflict** | None | Exists | INSERT new record |
| **Exact match** | Exists (same agent_key) | Same role | UPDATE if Python code has newer features |
| **Role mismatch** | Exists (different role) | Same agent_key | RENAME agent_key in Python (add suffix `-v2`) |
| **Duplicate role** | Exists | Different agent_key | MANUAL REVIEW (likely same agent, different name) |

**Conflict Report**:
```json
{
  "conflicts": [
    {
      "type": "role_mismatch",
      "db_agent": {
        "id": "uuid-1",
        "agent_key": "market-analyst",
        "role": "Market Research Specialist"
      },
      "python_agent": {
        "file": "senior_market_analyst.py",
        "agent_key": "senior-market-analyst",
        "role": "Senior Market Intelligence Analyst"
      },
      "recommendation": "Different agents - INSERT python_agent as new record",
      "confidence": "high"
    }
  ]
}
```

### Phase 3: Data Mapping & Validation (Day 3-4)

**Objective**: Map Python agent config → database schema (67 parameters)

**Mapping Strategy**:

**Full Parameter Mapping** (35 agent parameters):
```javascript
function mapAgentToDatabase(pythonAgent) {
  return {
    // Basic (always present)
    agent_key: pythonAgent.agent_key,
    name: pythonAgent.class_name,
    role: pythonAgent.role,
    goal: pythonAgent.goal,
    backstory: pythonAgent.backstory,

    // Tools
    tools: pythonAgent.tools || [],

    // LLM Config
    llm_model: pythonAgent.llm_model || 'gpt-4-turbo-preview',
    temperature: pythonAgent.temperature ?? 0.7,
    max_tokens: pythonAgent.max_tokens || 4000,
    max_rpm: pythonAgent.max_rpm || 0,
    max_iter: pythonAgent.max_iter || 25,
    max_execution_time: pythonAgent.max_execution_time || 0,
    max_retry_limit: pythonAgent.max_retry_limit || 2,

    // Agent Behavior
    allow_delegation: pythonAgent.allow_delegation ?? true,
    allow_code_execution: pythonAgent.allow_code_execution ?? false,
    code_execution_mode: pythonAgent.code_execution_mode || 'safe',
    respect_context_window: pythonAgent.respect_context_window ?? true,
    cache_enabled: pythonAgent.cache_enabled ?? true,

    // Memory (default: disabled)
    memory_enabled: pythonAgent.memory_enabled ?? false,
    memory_config_id: null, // Will be set if memory_enabled

    // Reasoning (default: disabled)
    reasoning_enabled: pythonAgent.reasoning_enabled ?? false,
    max_reasoning_attempts: pythonAgent.max_reasoning_attempts || 3,

    // Prompt Templates
    system_template: pythonAgent.system_template || null,
    prompt_template: pythonAgent.prompt_template || null,
    response_template: pythonAgent.response_template || null,
    inject_date: pythonAgent.inject_date ?? false,
    date_format: pythonAgent.date_format || 'YYYY-MM-DD',

    // Multimodal (default: disabled)
    multimodal_enabled: pythonAgent.multimodal_enabled ?? false,

    // Advanced LLM
    function_calling_llm: pythonAgent.function_calling_llm || null,
    use_system_prompt: pythonAgent.use_system_prompt ?? true,

    // Knowledge Sources
    knowledge_sources: pythonAgent.knowledge_sources || [],
    embedder_config: pythonAgent.embedder_config || null,

    // Observability
    verbose: pythonAgent.verbose ?? false,
    step_callback_url: pythonAgent.step_callback_url || null,

    // Metadata
    department_id: null, // Will be set based on role categorization
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  };
}
```

**Default Value Strategy**:
- **Explicit defaults**: Use CrewAI 1.3.0 defaults for all missing parameters
- **Backward compatibility**: Agents without new features default to disabled
- **Opt-in**: Memory, reasoning, multimodal require explicit enablement

**Validation Rules**:
```javascript
function validateMappedAgent(agent) {
  const errors = [];

  // Required fields
  if (!agent.role || agent.role.length < 3) {
    errors.push('Role must be at least 3 characters');
  }
  if (!agent.goal || agent.goal.length < 10) {
    errors.push('Goal must be at least 10 characters');
  }
  if (!agent.backstory || agent.backstory.length < 20) {
    errors.push('Backstory must be at least 20 characters');
  }

  // Type validation
  if (typeof agent.temperature !== 'number' || agent.temperature < 0 || agent.temperature > 2) {
    errors.push('Temperature must be between 0 and 2');
  }
  if (typeof agent.max_tokens !== 'number' || agent.max_tokens < 1) {
    errors.push('Max tokens must be positive');
  }

  // Tool validation
  const VALID_TOOLS = ['search_openvc', 'search_growjo', 'query_knowledge_base', ...];
  for (const tool of agent.tools) {
    if (!VALID_TOOLS.includes(tool)) {
      errors.push(`Unknown tool: ${tool}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

### Phase 4: Database Insertion (Day 4-5)

**Objective**: Insert/update agents in database with transaction safety

**Migration Script**: `scripts/migrate-agents-to-database.mjs`

**Transaction Strategy**:
```javascript
async function migrateAgents(agents) {
  const results = {
    inserted: [],
    updated: [],
    skipped: [],
    errors: []
  };

  // Start transaction
  await db.query('BEGIN');

  try {
    for (const agent of agents) {
      const mapped = mapAgentToDatabase(agent);
      const validation = validateMappedAgent(mapped);

      if (!validation.valid) {
        results.errors.push({
          agent: agent.agent_key,
          errors: validation.errors
        });
        continue;
      }

      // Check for existing agent
      const existing = await db.query(
        'SELECT id FROM crewai_agents WHERE agent_key = $1',
        [mapped.agent_key]
      );

      if (existing.rows.length > 0) {
        // UPDATE existing agent
        await db.query(`
          UPDATE crewai_agents
          SET role = $1, goal = $2, backstory = $3, tools = $4,
              llm_model = $5, temperature = $6, max_tokens = $7,
              updated_at = NOW()
          WHERE agent_key = $8
        `, [mapped.role, mapped.goal, mapped.backstory, mapped.tools,
            mapped.llm_model, mapped.temperature, mapped.max_tokens,
            mapped.agent_key]);

        results.updated.push(mapped.agent_key);
      } else {
        // INSERT new agent
        await db.query(`
          INSERT INTO crewai_agents (agent_key, name, role, goal, backstory, tools, llm_model, ...)
          VALUES ($1, $2, $3, $4, $5, $6, $7, ...)
        `, [mapped.agent_key, mapped.name, mapped.role, ...]);

        results.inserted.push(mapped.agent_key);
      }
    }

    // Commit transaction
    await db.query('COMMIT');
  } catch (error) {
    // Rollback on error
    await db.query('ROLLBACK');
    throw error;
  }

  return results;
}
```

**Dry-Run Mode**:
```bash
# Test migration without writing
node scripts/migrate-agents-to-database.mjs --dry-run

# Output:
# ✅ Would INSERT: 15 agents
# ✅ Would UPDATE: 30 agents
# ⏭️ Would SKIP: 0 agents
# ❌ ERRORS: 0
```

**Actual Migration**:
```bash
# Execute migration
node scripts/migrate-agents-to-database.mjs --execute

# Output:
# ✅ INSERTED: 15 agents
# ✅ UPDATED: 30 agents
# ⏭️ SKIPPED: 0 agents
# ❌ ERRORS: 0
# 📊 Total: 45 agents migrated
```

### Phase 5: Governance Bridge Population (Day 5)

**Objective**: Populate `leo_to_crewai_agent_mapping` bridge table

**Script**: `scripts/populate-governance-bridge.mjs`

**Process**:
```javascript
async function populateGovernanceBridge() {
  // Get all operational agents from EHG Application DB
  const operationalAgents = await operationalDB.query(`
    SELECT id, agent_key, role
    FROM crewai_agents
    WHERE status = 'active'
  `);

  for (const opAgent of operationalAgents.rows) {
    // Check if governance record exists
    const govAgent = await governanceDB.query(`
      SELECT id FROM leo_agents
      WHERE agent_key = $1
    `, [opAgent.agent_key]);

    let govAgentId;

    if (govAgent.rows.length === 0) {
      // Create governance record
      const result = await governanceDB.query(`
        INSERT INTO leo_agents (agent_key, agent_type, role, description)
        VALUES ($1, 'crewai', $2, $3)
        RETURNING id
      `, [opAgent.agent_key, opAgent.role, `Operational agent: ${opAgent.role}`]);

      govAgentId = result.rows[0].id;
    } else {
      govAgentId = govAgent.rows[0].id;
    }

    // Create bridge mapping
    await governanceDB.query(`
      INSERT INTO leo_to_crewai_agent_mapping (
        leo_agent_id,
        crewai_agent_id,
        crewai_agent_key,
        sync_status,
        last_synced_at
      ) VALUES ($1, $2, $3, 'synced', NOW())
      ON CONFLICT (leo_agent_id, crewai_agent_id) DO UPDATE
      SET sync_status = 'synced', last_synced_at = NOW()
    `, [govAgentId, opAgent.id, opAgent.agent_key]);
  }
}
```

---

## Crew Migration

**Similar process for crews**:

1. **Scan** `/ehg/agent-platform/app/crews/` for Python crew definitions
2. **Extract** crew config (agents, tasks, process_type, manager_agent)
3. **Map** to `crewai_crews` schema (18 parameters)
4. **Populate** `crew_members` junction table
5. **Validate** all crew members exist in `crewai_agents`

**Crew Mapping**:
```javascript
function mapCrewToDatabase(pythonCrew) {
  return {
    crew_name: pythonCrew.crew_name,
    description: pythonCrew.description,
    process_type: pythonCrew.process_type || 'sequential', // sequential, hierarchical, consensual
    manager_agent_id: null, // Will be set if hierarchical

    // NEW CrewAI 1.3.0 fields
    verbose: pythonCrew.verbose ?? false,
    manager_llm: pythonCrew.manager_llm || null,
    function_calling_llm: pythonCrew.function_calling_llm || null,
    planning_enabled: pythonCrew.planning_enabled ?? false,
    planning_llm: pythonCrew.planning_llm || null,
    memory_enabled: pythonCrew.memory_enabled ?? false,
    max_rpm: pythonCrew.max_rpm || 0,
    cache_enabled: pythonCrew.cache_enabled ?? true,
    step_callback_url: pythonCrew.step_callback_url || null,
    task_callback_url: pythonCrew.task_callback_url || null,
    output_log_file: pythonCrew.output_log_file || null,
    config_file_path: pythonCrew.config_file_path || null,
    prompt_file_path: pythonCrew.prompt_file_path || null,
    share_crew: pythonCrew.share_crew ?? false,

    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  };
}
```

---

## Testing Strategy

### Unit Tests

**Test scanning logic**:
```javascript
test('scanPythonAgents extracts correct agent config', async () => {
  const pythonCode = `
from crewai import Agent

class SeniorMarketAnalyst:
    def __init__(self):
        self.agent = Agent(
            role="Senior Market Intelligence Analyst",
            goal="Analyze market trends and calculate TAM/SAM/SOM",
            backstory="Expert analyst with 10 years experience",
            tools=['search_openvc', 'query_knowledge_base'],
            llm="gpt-4-turbo-preview",
            temperature=0.7
        )
  `;

  const config = extractAgentConfig(pythonCode);

  expect(config.role).toBe('Senior Market Intelligence Analyst');
  expect(config.tools).toEqual(['search_openvc', 'query_knowledge_base']);
  expect(config.temperature).toBe(0.7);
});
```

**Test deduplication**:
```javascript
test('checkForDuplicates detects exact matches', async () => {
  // Setup: Insert test agent
  await db.query(`
    INSERT INTO crewai_agents (agent_key, role, goal, backstory)
    VALUES ('test-agent', 'Test Role', 'Test Goal', 'Test Backstory')
  `);

  const scannedAgent = {
    agent_key: 'test-agent',
    role: 'Test Role'
  };

  const duplicates = await checkForDuplicates(scannedAgent);

  expect(duplicates.exactKeyMatch).toBeTruthy();
  expect(duplicates.exactKeyMatch.agent_key).toBe('test-agent');
});
```

### Integration Tests

**Test full migration workflow**:
```javascript
test('migrateAgents inserts new agents and updates existing', async () => {
  const agents = [
    { agent_key: 'new-agent', role: 'New Role', ... },
    { agent_key: 'existing-agent', role: 'Updated Role', ... }
  ];

  // Pre-insert existing agent
  await db.query(`INSERT INTO crewai_agents (agent_key, role, ...) VALUES ('existing-agent', 'Old Role', ...)`);

  const results = await migrateAgents(agents);

  expect(results.inserted).toContain('new-agent');
  expect(results.updated).toContain('existing-agent');

  // Verify update
  const updated = await db.query('SELECT role FROM crewai_agents WHERE agent_key = $1', ['existing-agent']);
  expect(updated.rows[0].role).toBe('Updated Role');
});
```

---

## Rollback Plan

### Scenario 1: Migration Fails Mid-Process

**Cause**: Database error, validation failure, network issue

**Rollback**:
```bash
# Transaction automatically rolled back
# No data written to database
# Safe to retry migration
```

### Scenario 2: Migration Succeeds But Incorrect Data

**Cause**: Mapping bug, incorrect default values

**Rollback**:
```sql
-- Delete all agents inserted after migration start time
DELETE FROM crewai_agents
WHERE created_at >= '2025-11-06 10:00:00';

-- Restore from backup (if available)
-- psql -U postgres -d ehg_application < backup_pre_migration.sql
```

**Prevention**: Always backup before migration
```bash
# Backup database before migration
pg_dump -U postgres -d ehg_application > backup_pre_migration_$(date +%Y%m%d_%H%M%S).sql
```

---

## Success Criteria

### Phase 1: Scanning
- ✅ All 45 Python agent files scanned
- ✅ Agent configurations extracted (35 parameters per agent)
- ✅ Scan report generated (JSON + CSV)

### Phase 2: Deduplication
- ✅ All duplicates identified
- ✅ Conflicts resolved (automatic or flagged for manual review)
- ✅ Migration plan validated (INSERT vs UPDATE actions clear)

### Phase 3: Data Mapping
- ✅ All agents mapped to database schema
- ✅ Validation passed (100% of agents)
- ✅ Default values applied correctly

### Phase 4: Database Insertion
- ✅ 45 agents inserted or updated
- ✅ Zero data loss
- ✅ Transaction committed successfully
- ✅ Database constraints satisfied (unique agent_key, valid foreign keys)

### Phase 5: Governance Bridge
- ✅ 45 governance records created
- ✅ 45 bridge mappings created
- ✅ Sync status = 'synced'

### Overall
- ✅ 100% agent migration rate (45/45)
- ✅ 100% crew migration rate (16/16)
- ✅ Zero data corruption
- ✅ Backward compatible (existing agent executions continue working)

---

## Timeline & Resource Allocation

### Week Schedule

| Day | Phase | Activities | Duration |
|-----|-------|-----------|----------|
| **Mon** | 1 - Scanning | Implement scanning script, test AST parsing | 8 hrs |
| **Tue** | 1-2 | Complete scan, start deduplication logic | 8 hrs |
| **Wed** | 2-3 | Resolve conflicts, begin data mapping | 8 hrs |
| **Thu** | 3-4 | Complete mapping, dry-run migration | 8 hrs |
| **Fri** | 4-5 | Execute migration, populate bridge, validate | 8 hrs |

**Total**: 40 hours (1 week full-time)

### Resource Requirements

**Developer Time**: 1 senior developer (40 hours)

**Database Access**:
- Read access to Python codebase
- Write access to both databases (operational + governance)
- Service role key for RLS bypass

**Tools Required**:
- Node.js 18+
- Python 3.10+ (for AST parsing)
- PostgreSQL client
- Git access

---

## Known Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Scanning misses agents** | MEDIUM | LOW | Manual verification of agent count, cross-check with git history |
| **AST parsing fails** | MEDIUM | MEDIUM | Fallback to regex parsing, manual review of unparsed files |
| **Duplicate agents created** | HIGH | LOW | Unique constraints on agent_key, deduplication logic tested |
| **Data mapping errors** | HIGH | MEDIUM | Validation rules, dry-run mode, manual spot checks |
| **Migration corrupts data** | HIGH | LOW | Transactions, database backup, rollback plan |
| **Governance bridge breaks** | MEDIUM | LOW | Test bridge queries before migration, verify FK constraints |

---

## Post-Migration Validation

### Validation Queries

**Check agent count**:
```sql
-- Operational DB
SELECT COUNT(*) FROM crewai_agents; -- Should be 45

-- Governance DB
SELECT COUNT(*) FROM leo_agents WHERE agent_type = 'crewai'; -- Should be 45

-- Bridge table
SELECT COUNT(*) FROM leo_to_crewai_agent_mapping; -- Should be 45
```

**Check for orphaned records**:
```sql
-- Agents without department
SELECT agent_key FROM crewai_agents WHERE department_id IS NULL;

-- Bridge mappings without agents
SELECT * FROM leo_to_crewai_agent_mapping lm
WHERE NOT EXISTS (
  SELECT 1 FROM crewai_agents ca WHERE ca.id = lm.crewai_agent_id
);
```

**Verify data integrity**:
```sql
-- All agents have valid tools
SELECT agent_key, tools FROM crewai_agents
WHERE array_length(tools, 1) > 0
AND NOT EXISTS (
  SELECT 1 FROM agent_tools WHERE tool_name = ANY(crewai_agents.tools)
);

-- All crews have valid agents
SELECT crew_name FROM crewai_crews
WHERE manager_agent_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM crewai_agents WHERE id = crewai_crews.manager_agent_id
);
```

---

## Documentation Artifacts

**Generated Files**:
1. `agent-scan-report.json` - Full agent configurations
2. `agent-scan-summary.csv` - High-level overview
3. `agent-migration-plan.json` - INSERT/UPDATE actions
4. `conflict-report.json` - Duplicate detection results
5. `migration-results.json` - Final migration statistics
6. `validation-report.md` - Post-migration validation results

**Database Records**:
- `crewai_agents` table: 45 records
- `crewai_crews` table: 16 records
- `crew_members` table: ~80 records (agent-crew relationships)
- `leo_agents` table: 45 records
- `leo_to_crewai_agent_mapping` table: 45 records

---

## Conclusion

**Agent migration strategy is COMPLETE** with:
- ✅ 5-phase migration process (scan → dedupe → map → insert → bridge)
- ✅ Automated scanning with AST parsing
- ✅ Deduplication logic (exact + fuzzy matching)
- ✅ Full parameter mapping (67 CrewAI parameters)
- ✅ Transaction safety + rollback plan
- ✅ Testing strategy (unit + integration)
- ✅ Success criteria defined (100% migration rate)
- ✅ 1-week timeline with detailed schedule

**Ready for EXEC phase implementation** (Phase 2, Week 2).

---

**Document Generated**: 2025-11-06
**Migration Strategy**: ✅ COMPLETE
**LEO Protocol Phase**: PLAN (Architecture Design)
**Next Deliverable**: UI wireframes (delegate to design-agent)

<!-- Agent Migration Strategy | SD-CREWAI-ARCHITECTURE-001 | 2025-11-06 -->
