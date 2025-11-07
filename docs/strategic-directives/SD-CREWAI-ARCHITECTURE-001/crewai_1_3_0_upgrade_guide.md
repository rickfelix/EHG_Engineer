# CrewAI 1.3.0 Upgrade Guide — SD-CREWAI-ARCHITECTURE-001

**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001
**Current Version**: 0.70.1
**Target Version**: 1.3.0
**Upgrade Type**: Major (breaking changes possible)
**Date**: 2025-11-06

---

## Executive Summary

This guide documents the upgrade path from CrewAI 0.70.1 → 1.3.0 for the EHG AI platform, including:

- New features (memory, planning, reasoning, multimodal)
- Breaking changes and migration strategies
- Database schema requirements
- Python code changes
- Testing requirements
- Rollback plan

**Timeline**: Week 2 of EXEC phase (2 weeks allocated)
**Risk Level**: MEDIUM (breaking changes exist but well-documented)
**Backward Compatibility**: PARTIAL (opt-in for new features)

---

## Version Comparison

### Current State (CrewAI 0.70.1)

**Installation**:
```bash
crewai==0.70.1
```

**Capabilities**:
- Basic agent orchestration (role, goal, backstory)
- Sequential and hierarchical crews
- Task execution with delegation
- Tool integration
- LLM configuration (model, temperature, max_tokens)

**Limitations**:
- No persistent memory across sessions
- No built-in reasoning capabilities
- No planning before execution
- No multimodal support (text only)
- No knowledge base integration
- Limited observability

### Target State (CrewAI 1.3.0)

**Installation**:
```bash
crewai==1.3.0
crewai-tools==0.12.0  # Updated tools package
```

**New Features**:
1. **Memory System** (5 types)
2. **Planning & Reasoning** (pre-execution planning, chain-of-thought)
3. **Multimodal Support** (text + images)
4. **Knowledge Sources** (RAG integration)
5. **Advanced LLM Controls** (separate LLMs for different tasks)
6. **Guardrails** (output validation with retry)
7. **Enhanced Observability** (callbacks, logging)
8. **Code Execution** (safe/unsafe modes)

---

## Feature #1: Memory System

### Overview

CrewAI 1.3.0 introduces 5 memory types:
1. **Short-term**: Recent conversation (last N messages)
2. **Long-term**: Persistent memory across sessions
3. **Entity**: Extract and track entities (people, places, things)
4. **Contextual**: Context-aware memory retrieval
5. **User**: User-specific memory

### Database Schema Support

**Table**: `agent_memory_configs`

```sql
CREATE TABLE agent_memory_configs (
  id UUID PRIMARY KEY,
  short_term_enabled BOOLEAN DEFAULT true,
  long_term_enabled BOOLEAN DEFAULT false,
  entity_enabled BOOLEAN DEFAULT false,
  contextual_enabled BOOLEAN DEFAULT false,
  user_enabled BOOLEAN DEFAULT false,

  -- Storage
  storage_type VARCHAR(50) DEFAULT 'postgresql',
  storage_connection_string TEXT,

  -- Limits
  short_term_max_messages INTEGER DEFAULT 10,
  long_term_max_kb INTEGER DEFAULT 1000,
  entity_max_count INTEGER DEFAULT 100,

  -- Embeddings
  embedder_provider VARCHAR(50) DEFAULT 'openai',
  embedder_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  embedder_dimensions INTEGER DEFAULT 1536
);
```

**Agent Reference**:
```sql
ALTER TABLE crewai_agents ADD COLUMN memory_enabled BOOLEAN DEFAULT false;
ALTER TABLE crewai_agents ADD COLUMN memory_config_id UUID REFERENCES agent_memory_configs(id);
```

### Python Code Example

**Before (0.70.1)**:
```python
from crewai import Agent

agent = Agent(
    role="Senior Market Analyst",
    goal="Analyze market trends",
    backstory="Expert analyst with 10 years experience"
)
# No memory - each execution starts fresh
```

**After (1.3.0)**:
```python
from crewai import Agent, Memory

# Option 1: Simple memory (short-term only)
agent = Agent(
    role="Senior Market Analyst",
    goal="Analyze market trends",
    backstory="Expert analyst with 10 years experience",
    memory=True  # Enables default short-term memory
)

# Option 2: Full memory configuration
memory_config = Memory(
    short_term=True,  # Recent messages
    long_term=True,   # Persistent across sessions
    entity=True,      # Extract entities
    contextual=True,  # Context-aware retrieval
    user=True         # User-specific memory
)

agent = Agent(
    role="Senior Market Analyst",
    goal="Analyze market trends",
    backstory="Expert analyst with 10 years experience",
    memory=memory_config
)
```

### Database-Driven Memory Configuration

**Dynamic code generation from database**:
```python
# Generated from database record
from crewai import Agent, Memory

# Query database
agent_config = db.query("SELECT * FROM crewai_agents WHERE id = ?", agent_id)
memory_config_db = db.query("SELECT * FROM agent_memory_configs WHERE id = ?", agent_config.memory_config_id)

# Build memory config
if agent_config.memory_enabled and memory_config_db:
    memory = Memory(
        short_term=memory_config_db.short_term_enabled,
        long_term=memory_config_db.long_term_enabled,
        entity=memory_config_db.entity_enabled,
        contextual=memory_config_db.contextual_enabled,
        user=memory_config_db.user_enabled,
        storage={
            "type": memory_config_db.storage_type,
            "connection_string": memory_config_db.storage_connection_string
        }
    )
else:
    memory = None

agent = Agent(
    role=agent_config.role,
    goal=agent_config.goal,
    backstory=agent_config.backstory,
    memory=memory
)
```

### Migration Strategy

**Phase 1**: Add database schema (Week 1)
- Create `agent_memory_configs` table
- Add `memory_enabled`, `memory_config_id` to `crewai_agents`

**Phase 2**: Upgrade Python dependency (Week 2)
- `pip install crewai==1.3.0`
- Update imports (no breaking changes for basic usage)

**Phase 3**: Opt-in for existing agents (Week 2+)
- Default: `memory_enabled = false` (no change in behavior)
- Gradual opt-in: Enable memory for specific agents via UI
- Test memory-enabled agents before production rollout

**Rollback**: Set `memory_enabled = false` for all agents (reverts to 0.70.1 behavior)

---

## Feature #2: Planning & Reasoning

### Overview

**Planning**: Agent/crew creates execution plan before starting work
**Reasoning**: Chain-of-thought reasoning for complex decisions

### Database Schema Support

**Agent-level**:
```sql
ALTER TABLE crewai_agents ADD COLUMN reasoning_enabled BOOLEAN DEFAULT false;
ALTER TABLE crewai_agents ADD COLUMN max_reasoning_attempts INTEGER DEFAULT 3;
```

**Crew-level**:
```sql
ALTER TABLE crewai_crews ADD COLUMN planning_enabled BOOLEAN DEFAULT false;
ALTER TABLE crewai_crews ADD COLUMN planning_llm VARCHAR(50); -- Separate LLM for planning
```

### Python Code Example

**Agent Reasoning**:
```python
from crewai import Agent

agent = Agent(
    role="Senior Market Analyst",
    goal="Analyze market trends",
    backstory="Expert analyst",
    reasoning=True,  # Enable reasoning
    max_reasoning_attempts=3  # Max reasoning iterations
)
```

**Crew Planning**:
```python
from crewai import Crew, Agent

crew = Crew(
    agents=[agent1, agent2, agent3],
    tasks=[task1, task2, task3],
    planning=True,  # Enable planning phase
    planning_llm="gpt-4"  # Separate LLM for planning (can be different from agent LLMs)
)
```

### Benefits

- **Better decisions**: Chain-of-thought reasoning improves accuracy
- **Transparency**: Reasoning steps visible in logs
- **Efficiency**: Planning reduces redundant work

### Migration Strategy

**Phase 1**: Add database schema (Week 1)
- Add `reasoning_enabled`, `max_reasoning_attempts` to `crewai_agents`
- Add `planning_enabled`, `planning_llm` to `crewai_crews`

**Phase 2**: Gradual opt-in (Week 2+)
- Default: `reasoning_enabled = false`, `planning_enabled = false`
- Test with specific agents/crews
- Monitor performance impact (reasoning adds latency)

---

## Feature #3: Multimodal Support

### Overview

CrewAI 1.3.0 supports image inputs alongside text.

### Database Schema Support

```sql
ALTER TABLE crewai_agents ADD COLUMN multimodal_enabled BOOLEAN DEFAULT false;
```

### Python Code Example

```python
from crewai import Agent

agent = Agent(
    role="Visual Analyst",
    goal="Analyze product screenshots",
    backstory="Expert in UI/UX analysis",
    multimodal=True  # Enable image processing
)

# Task with image input
task = Task(
    description="Analyze this screenshot and identify usability issues",
    expected_output="List of usability improvements",
    agent=agent,
    inputs={
        "image_path": "/path/to/screenshot.png"
    }
)
```

### Requirements

- **LLM Model**: Must use multimodal-capable model (e.g., `gpt-4-vision-preview`, `claude-3-sonnet`)
- **Tools**: May require vision-specific tools

### Migration Strategy

**Phase 1**: Add database schema (Week 1)
- Add `multimodal_enabled` to `crewai_agents`

**Phase 2**: Opt-in for specific agents (Week 3+)
- Default: `multimodal_enabled = false`
- Enable only for agents that need image processing
- Update LLM model to vision-capable model

---

## Feature #4: Knowledge Sources (RAG)

### Overview

Integrate knowledge bases for retrieval-augmented generation (RAG).

### Database Schema Support

```sql
ALTER TABLE crewai_agents ADD COLUMN knowledge_sources JSONB DEFAULT '[]'::jsonb;
ALTER TABLE crewai_agents ADD COLUMN embedder_config JSONB;
```

**Existing table**:
```sql
-- Already exists in schema
CREATE TABLE agent_knowledge (
  id UUID PRIMARY KEY,
  source_type VARCHAR(50),  -- 'venture', 'research', 'feedback'
  source_id UUID,
  content TEXT,
  embedding vector(1536),  -- pgvector
  metadata JSONB,
  quality_score DECIMAL(3,2)
);
```

### Python Code Example

```python
from crewai import Agent
from crewai.knowledge.source import BaseKnowledgeSource

# Define knowledge sources
knowledge_sources = [
    BaseKnowledgeSource(
        source_type="database",
        connection_string="postgresql://...",
        table="agent_knowledge",
        embedder="openai"
    )
]

agent = Agent(
    role="Senior Market Analyst",
    goal="Analyze market trends",
    backstory="Expert analyst",
    knowledge_sources=knowledge_sources,  # RAG integration
    embedder={
        "provider": "openai",
        "model": "text-embedding-ada-002"
    }
)
```

### Benefits

- **Grounded responses**: Agent can cite knowledge base
- **Reduced hallucination**: Facts from database
- **Domain expertise**: Leverage company-specific knowledge

### Migration Strategy

**Phase 1**: Database schema (Week 1)
- Add `knowledge_sources`, `embedder_config` to `crewai_agents`
- Ensure `agent_knowledge` table has vector index

**Phase 2**: Knowledge ingestion (Week 6 - Phase 6)
- Populate `agent_knowledge` table with domain knowledge
- Create embeddings using OpenAI API
- Configure agents to use knowledge sources

---

## Feature #5: Advanced LLM Controls

### Overview

Separate LLMs for different tasks (planning, function calls, main reasoning).

### Database Schema Support

```sql
-- Agent-level
ALTER TABLE crewai_agents ADD COLUMN function_calling_llm VARCHAR(50);
ALTER TABLE crewai_agents ADD COLUMN use_system_prompt BOOLEAN DEFAULT true;

-- Crew-level
ALTER TABLE crewai_crews ADD COLUMN manager_llm VARCHAR(50);
ALTER TABLE crewai_crews ADD COLUMN planning_llm VARCHAR(50);
ALTER TABLE crewai_crews ADD COLUMN function_calling_llm VARCHAR(50);
```

### Python Code Example

```python
from crewai import Agent, Crew

# Agent with separate LLM for function calls
agent = Agent(
    role="Senior Market Analyst",
    llm="gpt-4-turbo-preview",  # Main LLM for reasoning
    function_calling_llm="gpt-4",  # Separate LLM for function calls (more reliable)
    use_system_prompt=True
)

# Crew with separate LLMs
crew = Crew(
    agents=[agent1, agent2],
    manager_llm="gpt-4",  # Manager agent LLM (hierarchical crews)
    planning_llm="gpt-4-turbo-preview",  # Planning phase LLM
    function_calling_llm="gpt-4"  # Function call LLM
)
```

### Benefits

- **Cost optimization**: Use cheaper models for simple tasks
- **Reliability**: Use more reliable models for critical tasks
- **Performance**: Balance speed vs accuracy

---

## Feature #6: Guardrails (Task Validation)

### Overview

Validate task outputs with retry logic.

### Database Schema Support

```sql
ALTER TABLE crewai_tasks ADD COLUMN guardrail_function TEXT;
ALTER TABLE crewai_tasks ADD COLUMN guardrail_max_retries INTEGER DEFAULT 3;
```

### Python Code Example

```python
from crewai import Task

# Define validation function
def validate_market_analysis(output):
    """Validate market analysis output"""
    required_keys = ["tam", "sam", "som", "market_trend"]
    if not all(key in output for key in required_keys):
        return False, "Missing required market sizing fields"
    if output["tam"] < output["sam"]:
        return False, "TAM must be greater than SAM"
    return True, "Valid"

task = Task(
    description="Calculate market sizing for venture",
    expected_output="Market sizing with TAM/SAM/SOM",
    agent=market_analyst,
    guardrail=validate_market_analysis,  # Validation function
    guardrail_max_retries=3  # Retry up to 3 times if validation fails
)
```

### Benefits

- **Quality assurance**: Automatically validate outputs
- **Retry logic**: Agent self-corrects on failures
- **Reduced errors**: Catch issues before downstream processing

---

## Feature #7: Code Execution

### Overview

Agents can execute Python code (safe or unsafe mode).

### Database Schema Support

```sql
ALTER TABLE crewai_agents ADD COLUMN allow_code_execution BOOLEAN DEFAULT false;
ALTER TABLE crewai_agents ADD COLUMN code_execution_mode VARCHAR(20) DEFAULT 'safe' CHECK (code_execution_mode IN ('safe', 'unsafe'));
```

### Python Code Example

```python
from crewai import Agent

# Safe mode (Docker sandbox)
agent_safe = Agent(
    role="Data Analyst",
    allow_code_execution=True,
    code_execution_mode="safe"  # Runs in Docker container
)

# Unsafe mode (direct execution - NOT RECOMMENDED for production)
agent_unsafe = Agent(
    role="System Admin",
    allow_code_execution=True,
    code_execution_mode="unsafe"  # Runs directly on server
)
```

### Security Considerations

- **Safe mode**: Requires Docker installed
- **Unsafe mode**: ONLY use in controlled environments (severe security risk)
- **Default**: `allow_code_execution = false` (disabled)

---

## Breaking Changes & Migration

### Breaking Change #1: Import Paths

**0.70.1**:
```python
from crewai import Agent, Task, Crew
```

**1.3.0** (NO CHANGE):
```python
from crewai import Agent, Task, Crew  # Same imports work
```

**New imports**:
```python
from crewai import Memory  # NEW
from crewai.knowledge.source import BaseKnowledgeSource  # NEW
```

### Breaking Change #2: Default Behavior

**Behavior changes**:
- None (all new features are OPT-IN via parameters)

**Recommendation**: Explicitly set new parameters to `False` during migration to maintain 0.70.1 behavior.

### Breaking Change #3: Dependency Versions

**0.70.1 dependencies**:
```
crewai==0.70.1
pydantic>=1.10,<2.0
langchain>=0.0.200
```

**1.3.0 dependencies**:
```
crewai==1.3.0
pydantic>=2.0  # BREAKING: Pydantic v2
langchain>=0.1.0
crewai-tools==0.12.0
```

**Pydantic v1 → v2 migration**:
- Model definitions may need updates
- Validation logic changes
- See: https://docs.pydantic.dev/latest/migration/

---

## Upgrade Procedure (Step-by-Step)

### Week 1: Database Schema Expansion

**Step 1**: Apply database migration
```bash
# Apply forward migration
psql -U postgres -d ehg_application -f /path/to/20251106000000_crewai_full_platform_schema.sql
```

**Step 2**: Verify schema
```sql
-- Check new columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'crewai_agents' AND column_name IN ('memory_enabled', 'reasoning_enabled', 'multimodal_enabled');

-- Check new tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('agent_memory_configs', 'agent_code_deployments');
```

**Step 3**: Validate existing data
```sql
-- Verify existing agents still work
SELECT COUNT(*) FROM crewai_agents;
SELECT COUNT(*) FROM crewai_crews;
SELECT COUNT(*) FROM crewai_tasks;

-- Check new columns have defaults
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE memory_enabled = false) as memory_disabled,
  COUNT(*) FILTER (WHERE reasoning_enabled = false) as reasoning_disabled
FROM crewai_agents;
```

### Week 2: Python Dependency Upgrade

**Step 1**: Update requirements.txt
```bash
# Before
crewai==0.70.1

# After
crewai==1.3.0
crewai-tools==0.12.0
pydantic>=2.0
```

**Step 2**: Install in dev environment
```bash
# Create virtual environment
python -m venv venv_crewai_1_3_0
source venv_crewai_1_3_0/bin/activate

# Install dependencies
pip install -r requirements.txt

# Verify installation
python -c "import crewai; print(crewai.__version__)"
# Expected output: 1.3.0
```

**Step 3**: Run compatibility tests
```bash
# Run existing unit tests
pytest tests/agents/ -v

# Run E2E tests
pytest tests/e2e/crewai/ -v
```

**Step 4**: Fix Pydantic v2 issues (if any)
```python
# Common Pydantic v1 → v2 changes

# Before (v1)
from pydantic import BaseModel

class AgentConfig(BaseModel):
    role: str

    class Config:
        allow_mutation = False

# After (v2)
from pydantic import BaseModel, ConfigDict

class AgentConfig(BaseModel):
    role: str

    model_config = ConfigDict(frozen=True)  # replaces allow_mutation=False
```

**Step 5**: Deploy to staging
```bash
# Deploy to staging environment
npm run deploy:staging

# Smoke test
curl https://staging.ehg.com/api/agents
curl https://staging.ehg.com/api/crews
```

**Step 6**: Deploy to production (if smoke tests pass)
```bash
# Create deployment tag
git tag crewai-1.3.0-upgrade
git push origin crewai-1.3.0-upgrade

# Deploy to production
npm run deploy:production
```

---

## Testing Strategy

### Tier 1: Smoke Tests (MANDATORY)

1. **Agent creation**: Create agent with basic config (0.70.1 style)
2. **Crew execution**: Run simple sequential crew
3. **Task completion**: Execute task with delegation
4. **Database queries**: Query `crewai_agents`, `crewai_crews` successfully

### Tier 2: Feature Tests (HIGH PRIORITY)

1. **Memory**: Create agent with memory enabled, verify persistence
2. **Reasoning**: Enable reasoning, verify reasoning steps in logs
3. **Planning**: Enable crew planning, verify plan generated
4. **Multimodal**: Send image to multimodal agent, verify response
5. **Knowledge sources**: Query agent with RAG, verify citations

### Tier 3: Performance Tests (CONDITIONAL)

1. **Memory overhead**: Compare execution time with/without memory
2. **Reasoning latency**: Measure reasoning step duration
3. **Concurrent agents**: Run 10+ agents concurrently

---

## Rollback Plan

### Scenario 1: Critical Bug in CrewAI 1.3.0

**Rollback to 0.70.1**:
```bash
# Revert Python dependency
pip install crewai==0.70.1

# Restart services
systemctl restart crewai-agent-platform
```

**Database**: NO rollback needed (new columns have defaults, backward compatible)

### Scenario 2: Database Schema Issues

**Rollback database schema**:
```bash
# Apply rollback migration
psql -U postgres -d ehg_application -f /path/to/20251106000000_crewai_full_platform_schema_rollback.sql
```

**Warning**: Data in new columns will be LOST (memory configs, code deployments)

### Scenario 3: Pydantic v2 Breaking Changes

**Fix without rollback**:
1. Update Pydantic model definitions
2. Use compatibility shim: `pydantic.v1` (available in Pydantic v2)
```python
from pydantic.v1 import BaseModel  # Use v1 API in v2
```

---

## Success Criteria

### Phase 1 Complete (Database Schema)
- ✅ All new tables created (`agent_memory_configs`, `agent_code_deployments`)
- ✅ All new columns added to existing tables
- ✅ RLS policies applied
- ✅ Backward compatible (existing queries work)

### Phase 2 Complete (Python Upgrade)
- ✅ CrewAI 1.3.0 installed
- ✅ All imports resolve successfully
- ✅ Pydantic v2 compatibility verified
- ✅ Existing agents execute without errors
- ✅ Smoke tests pass (100%)

### Phase 3 Complete (Feature Opt-In)
- ✅ At least 1 agent with memory enabled
- ✅ At least 1 agent with reasoning enabled
- ✅ At least 1 crew with planning enabled
- ✅ Feature flags in database work correctly

---

## Known Issues & Workarounds

### Issue #1: Pydantic v2 Validation Errors

**Symptom**: `ValidationError: 1 validation error for AgentConfig`

**Cause**: Pydantic v2 stricter validation

**Workaround**:
```python
# Add explicit validation
from pydantic import field_validator

class AgentConfig(BaseModel):
    role: str

    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        if not v or len(v) < 3:
            raise ValueError('Role must be at least 3 characters')
        return v
```

### Issue #2: Memory Storage Connection String

**Symptom**: Memory not persisting across sessions

**Cause**: Missing storage connection string

**Fix**:
```sql
UPDATE agent_memory_configs
SET storage_connection_string = 'postgresql://user:pass@host:5432/dbname'
WHERE storage_type = 'postgresql' AND storage_connection_string IS NULL;
```

---

## Reference Documentation

**CrewAI Documentation**:
- Official Docs: https://docs.crewai.com/
- Migration Guide: https://docs.crewai.com/migration/1.3.0
- Memory System: https://docs.crewai.com/core-concepts/memory
- Planning: https://docs.crewai.com/core-concepts/planning

**Pydantic Migration**:
- v1 → v2 Guide: https://docs.pydantic.dev/latest/migration/

**EHG Documentation**:
- Database Schema Design: `/docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/database_schema_design.md`
- PRD Expansion Summary: `/docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/prd_expansion_summary.md`

---

## Conclusion

**CrewAI 1.3.0 upgrade is feasible** with:
- ✅ Database schema support (completed)
- ✅ Backward compatibility (opt-in for new features)
- ✅ Clear migration path (2-week timeline)
- ✅ Rollback plan (if needed)
- ✅ Testing strategy (Tier 1/2/3)

**Next Steps**:
1. Apply database migration (Week 1)
2. Upgrade Python dependency (Week 2)
3. Gradual feature opt-in (Week 3+)
4. Monitor performance and stability

---

**Document Generated**: 2025-11-06
**CrewAI Upgrade**: 0.70.1 → 1.3.0
**Phase**: PLAN (Architecture Design)
**Status**: ✅ COMPLETE (Upgrade Guide)

<!-- CrewAI 1.3.0 Upgrade Guide | SD-CREWAI-ARCHITECTURE-001 | 2025-11-06 -->
