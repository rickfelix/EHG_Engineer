#!/usr/bin/env node
/**
 * Add User Stories for SD-VISION-V2-004
 * Vision V2: Agent Registry & Hierarchy
 *
 * Creates user stories for database schema implementation following INVEST criteria
 * with Given-When-Then acceptance criteria format (STORIES v2.0.0).
 *
 * Functional Requirements Mapping:
 * - FR-1: Enable PostgreSQL LTREE extension → US-001
 * - FR-2: Create agent_registry table → US-002
 * - FR-3: Create agent_relationships table → US-003
 * - FR-4: Create agent_memory_stores table → US-004
 * - FR-5: Create tool_registry table → US-005
 * - FR-6: Create tool_access_grants table → US-006
 * - FR-7: Create agent_messages table → US-007
 * - FR-8: Create venture_tool_quotas table → US-008
 * - FR-9: Create tool_usage_ledger table → US-009
 * - FR-10: Bootstrap Chairman and EVA agents → US-010
 * - FR-11: Seed core tools in tool_registry → US-011
 *
 * Vision Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VISION-V2-004';
const PRD_ID = 'PRD-SD-VISION-V2-004';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
const userStories = [
  {
    story_key: 'SD-VISION-V2-004:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Enable PostgreSQL LTREE extension for hierarchical agent paths',
    user_role: 'Database Administrator',
    user_want: 'Enable the PostgreSQL LTREE extension to support hierarchical agent path queries',
    user_benefit: 'The system can efficiently store and query agent hierarchies using materialized path patterns',
    priority: 'critical',
    story_points: 2,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Extension enablement - Happy path',
        given: 'PostgreSQL database is accessible AND LTREE extension is not yet enabled',
        when: 'Migration runs CREATE EXTENSION IF NOT EXISTS ltree',
        then: 'LTREE extension is enabled AND SELECT * FROM pg_extension WHERE extname = \'ltree\' returns one row'
      },
      {
        id: 'AC-001-2',
        scenario: 'LTREE data type usage',
        given: 'LTREE extension is enabled',
        when: 'Table column is defined as LTREE type',
        then: 'Column accepts hierarchical path strings like \'chairman.eva.solara_ceo.vp_strategy\' AND supports LTREE operators (<@, @>, ~)'
      },
      {
        id: 'AC-001-3',
        scenario: 'GIST index support',
        given: 'LTREE column exists in agent_registry table',
        when: 'GIST index is created on hierarchy_path column',
        then: 'Index creation succeeds AND EXPLAIN shows index usage for hierarchy queries'
      },
      {
        id: 'AC-001-4',
        scenario: 'Idempotency - Extension already exists',
        given: 'LTREE extension is already enabled',
        when: 'Migration runs CREATE EXTENSION IF NOT EXISTS ltree',
        then: 'No error occurs AND extension remains enabled'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_enable_ltree_extension.sql',
      'LTREE extension enabled in database',
      'Test query validates LTREE operators work correctly',
      'Migration is idempotent (can be run multiple times safely)',
      'Documentation updated: database/schema/README.md'
    ],
    technical_notes: 'LTREE is a PostgreSQL extension for hierarchical data structures. Enables efficient ancestor/descendant queries using @ operators and supports GIST indexing for performance. Required before creating agent_registry table. Edge cases: Extension already exists (idempotent), insufficient privileges (SUPERUSER required), extension unavailable in database (contrib package not installed).',
    implementation_approach: 'Create SQL migration with CREATE EXTENSION IF NOT EXISTS ltree. Test with sample LTREE data. Verify GIST index creation works.',
    implementation_context: 'First migration in agent hierarchy series. All subsequent agent tables depend on this extension.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 3.1 agent_registry',
      'database/schema/007_leo_protocol_schema_fixed.sql - Reference schema patterns',
      'PostgreSQL LTREE documentation: https://www.postgresql.org/docs/current/ltree.html'
    ],
    example_code_patterns: {
      migration: `-- database/migrations/YYYYMMDD_enable_ltree_extension.sql
BEGIN;

-- Enable LTREE extension for hierarchical agent paths
CREATE EXTENSION IF NOT EXISTS ltree;

-- Test LTREE functionality
DO $$
BEGIN
  -- Verify extension is enabled
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ltree') THEN
    RAISE EXCEPTION 'LTREE extension failed to enable';
  END IF;
END $$;

COMMIT;`,
      test_query: `-- Test LTREE operators
SELECT
  'chairman.eva.solara_ceo'::ltree <@ 'chairman.eva'::ltree AS is_descendant,
  'chairman.eva'::ltree @> 'chairman.eva.solara_ceo'::ltree AS is_ancestor,
  'chairman.eva.solara_ceo'::ltree ~ '*.eva.*'::lquery AS matches_pattern;`
    },
    testing_scenarios: [
      { scenario: 'Enable LTREE extension successfully', type: 'integration', priority: 'P0' },
      { scenario: 'Verify LTREE data type accepts hierarchical paths', type: 'integration', priority: 'P0' },
      { scenario: 'Test LTREE operators (<@, @>, ~)', type: 'unit', priority: 'P1' },
      { scenario: 'Idempotency - extension already exists', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/database/US-001-enable-ltree-extension.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create agent_registry table with LTREE hierarchy support',
    user_role: 'System Architect',
    user_want: 'Central agent registry table with LTREE hierarchy_path for efficient ancestor/descendant queries',
    user_benefit: 'All agents (Chairman, EVA, CEOs, VPs, crews) are tracked in a single table with hierarchical relationships queryable via LTREE operators',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Table creation - Schema validation',
        given: 'LTREE extension is enabled',
        when: 'Migration creates agent_registry table',
        then: 'Table has columns: id (UUID PK), agent_type, agent_role, display_name, parent_agent_id (FK), hierarchy_level (1-4), hierarchy_path (LTREE), venture_id (FK nullable), capabilities (TEXT[]), delegation_authority (JSONB), status, token_budget, context_window_id, created_at, updated_at, created_by'
      },
      {
        id: 'AC-002-2',
        scenario: 'Check constraints - agent_type validation',
        given: 'agent_registry table exists',
        when: 'INSERT statement uses invalid agent_type value',
        then: 'Check constraint violation error AND agent_type must be one of: chairman, eva, venture_ceo, executive, crew'
      },
      {
        id: 'AC-002-3',
        scenario: 'Check constraints - hierarchy_level validation',
        given: 'agent_registry table exists',
        when: 'INSERT statement uses hierarchy_level outside range 1-4',
        then: 'Check constraint violation error AND hierarchy_level must be BETWEEN 1 AND 4'
      },
      {
        id: 'AC-002-4',
        scenario: 'GIST index - hierarchy_path performance',
        given: 'agent_registry table has hierarchy_path column',
        when: 'GIST index idx_agent_registry_hierarchy is created',
        then: 'Index creation succeeds AND EXPLAIN shows index usage for queries like hierarchy_path <@ \'chairman.eva\''
      },
      {
        id: 'AC-002-5',
        scenario: 'RLS policies - authenticated read access',
        given: 'agent_registry table has RLS enabled',
        when: 'Authenticated user with fn_is_chairman() = true queries table',
        then: 'User can SELECT all rows'
      },
      {
        id: 'AC-002-6',
        scenario: 'RLS policies - service_role full access',
        given: 'agent_registry table has RLS enabled',
        when: 'service_role user attempts INSERT/UPDATE/DELETE',
        then: 'All operations succeed (service_role bypasses RLS with policy agent_registry_manage)'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_agent_registry_table.sql',
      'Table created with all required columns and data types',
      'Check constraints enforce agent_type and hierarchy_level values',
      'Indexes created: PK (id), type, parent, venture, hierarchy (GIST), active (partial)',
      'RLS enabled with policies for authenticated and service_role',
      'Table comment documents purpose',
      'Test data insertion succeeds',
      'LTREE hierarchy queries perform efficiently (<10ms for 1000 agents)'
    ],
    technical_notes: 'Central registry for ALL agents in the ecosystem. Uses LTREE for materialized path hierarchy enabling efficient subtree queries. delegation_authority JSONB stores spend limits, stage auto-advance rules, escalation thresholds. Edge cases: Self-referencing parent_agent_id (must be NULL for Chairman), circular hierarchy detection, orphaned agents (parent deleted), LTREE path length limits (max ~65KB), special characters in hierarchy_path components.',
    implementation_approach: 'Create table with LTREE column and GIST index. Add CHECK constraints for agent_type and hierarchy_level. Implement RLS policies. Test with sample agent hierarchy.',
    implementation_context: 'Foundation table for entire agent hierarchy system. All other agent tables reference this table.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 3.1 agent_registry schema',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 12.2 Well-known agent IDs',
      'database/schema/007_leo_protocol_schema_fixed.sql - RLS policy patterns'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  agent_type VARCHAR(50) NOT NULL
    CHECK (agent_type IN ('chairman', 'eva', 'venture_ceo', 'executive', 'crew')),
  agent_role VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,

  -- Hierarchy
  parent_agent_id UUID REFERENCES agent_registry(id),
  hierarchy_level INT NOT NULL CHECK (hierarchy_level BETWEEN 1 AND 4),
  hierarchy_path LTREE NOT NULL,

  -- Scope
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id),

  -- Capabilities
  capabilities TEXT[] DEFAULT '{}',
  tool_access TEXT[] DEFAULT '{}',
  delegation_authority JSONB DEFAULT '{}',

  -- Operational
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'terminated', 'standby')),
  token_budget INT,
  token_consumed INT DEFAULT 0,

  -- Memory
  context_window_id UUID,
  knowledge_base_ids UUID[] DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES agent_registry(id)
);`,
      indexes: `-- Indexes for agent_registry
CREATE INDEX idx_agent_registry_type ON agent_registry(agent_type);
CREATE INDEX idx_agent_registry_parent ON agent_registry(parent_agent_id);
CREATE INDEX idx_agent_registry_venture ON agent_registry(venture_id);
CREATE INDEX idx_agent_registry_hierarchy ON agent_registry USING GIST(hierarchy_path);
CREATE INDEX idx_agent_registry_active ON agent_registry(status) WHERE status = 'active';`,
      rls_policies: `-- RLS policies
ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_registry_select" ON agent_registry
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "agent_registry_manage" ON agent_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);`,
      sample_query: `-- Query all VPs for a specific venture CEO
SELECT
  id,
  agent_role,
  display_name,
  hierarchy_path
FROM agent_registry
WHERE
  hierarchy_path <@ 'chairman.eva.solara_ceo'::ltree
  AND hierarchy_level = 3
  AND agent_type = 'executive'
ORDER BY agent_role;`
    },
    testing_scenarios: [
      { scenario: 'Create table with all columns and constraints', type: 'integration', priority: 'P0' },
      { scenario: 'Insert agent with valid agent_type', type: 'integration', priority: 'P0' },
      { scenario: 'Reject invalid agent_type (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Reject invalid hierarchy_level (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'LTREE hierarchy query performance (<10ms for 1000 agents)', type: 'performance', priority: 'P1' },
      { scenario: 'RLS: authenticated user with fn_is_chairman() can SELECT', type: 'integration', priority: 'P1' },
      { scenario: 'RLS: service_role can INSERT/UPDATE/DELETE', type: 'integration', priority: 'P0' }
    ],
    e2e_test_path: 'tests/e2e/database/US-002-agent-registry-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create agent_relationships table for explicit relationship tracking',
    user_role: 'System Architect',
    user_want: 'Table to track explicit relationships between agents (reports_to, delegates_to, coordinates_with, supervises, shares_knowledge)',
    user_benefit: 'Agent relationships beyond the parent-child hierarchy are explicitly modeled, enabling peer coordination and delegation tracking',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Table creation - Schema validation',
        given: 'agent_registry table exists',
        when: 'Migration creates agent_relationships table',
        then: 'Table has columns: id (UUID PK), from_agent_id (FK), to_agent_id (FK), relationship_type, delegation_scope (JSONB), communication_channel, created_at AND UNIQUE constraint on (from_agent_id, to_agent_id, relationship_type)'
      },
      {
        id: 'AC-003-2',
        scenario: 'Check constraint - relationship_type validation',
        given: 'agent_relationships table exists',
        when: 'INSERT statement uses invalid relationship_type',
        then: 'Check constraint violation error AND relationship_type must be one of: reports_to, delegates_to, coordinates_with, supervises, shares_knowledge'
      },
      {
        id: 'AC-003-3',
        scenario: 'Foreign key cascades - agent deletion',
        given: 'Relationship exists between two agents',
        when: 'from_agent or to_agent is deleted from agent_registry',
        then: 'Relationship row is CASCADE deleted from agent_relationships'
      },
      {
        id: 'AC-003-4',
        scenario: 'Unique constraint - duplicate relationships',
        given: 'Relationship already exists (from_agent_id, to_agent_id, relationship_type)',
        when: 'INSERT attempts to create duplicate relationship',
        then: 'Unique constraint violation error'
      },
      {
        id: 'AC-003-5',
        scenario: 'Bidirectional relationships - peer coordination',
        given: 'Two VP agents in same venture (VP_STRATEGY and VP_PRODUCT)',
        when: 'Relationships created: VP_STRATEGY coordinates_with VP_PRODUCT AND VP_PRODUCT coordinates_with VP_STRATEGY',
        then: 'Both relationships exist independently in table'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_agent_relationships_table.sql',
      'Table created with all required columns',
      'Check constraint enforces relationship_type values',
      'Foreign keys with CASCADE delete on agent_registry',
      'Unique constraint on (from_agent_id, to_agent_id, relationship_type)',
      'Indexes created: from_agent_id, to_agent_id, relationship_type',
      'Test data insertion succeeds',
      'Query performance validated for relationship lookup (<5ms)'
    ],
    technical_notes: 'Explicit relationship tracking beyond parent-child hierarchy. delegation_scope JSONB can store what can be delegated, approval limits, etc. communication_channel indicates how agents interact (task_contract, message_queue, direct). Edge cases: Self-relationships (agent relates to itself - block with CHECK constraint?), circular relationships (A delegates to B, B delegates to A), orphaned relationships after agent deletion (handled by CASCADE), relationship_type typos (mitigated by CHECK constraint).',
    implementation_approach: 'Create table with FKs to agent_registry. Add CHECK constraint for relationship_type. Create indexes on both agent ID columns. Test with sample relationships.',
    implementation_context: 'Complements hierarchical relationships in agent_registry. Enables peer coordination (VPs coordinating), delegation tracking, knowledge sharing.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 3.2 agent_relationships',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 5.3 Communication Patterns'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS agent_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  to_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,

  relationship_type VARCHAR(50) NOT NULL
    CHECK (relationship_type IN (
      'reports_to',
      'delegates_to',
      'coordinates_with',
      'supervises',
      'shares_knowledge'
    )),

  -- Relationship metadata
  delegation_scope JSONB,
  communication_channel VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(from_agent_id, to_agent_id, relationship_type)
);`,
      indexes: `CREATE INDEX idx_relationships_from ON agent_relationships(from_agent_id);
CREATE INDEX idx_relationships_to ON agent_relationships(to_agent_id);
CREATE INDEX idx_relationships_type ON agent_relationships(relationship_type);`,
      sample_query: `-- Get all agents that a CEO supervises
SELECT
  ar.id,
  ar.agent_type,
  ar.agent_role,
  ar.display_name
FROM agent_relationships rel
JOIN agent_registry ar ON ar.id = rel.to_agent_id
WHERE
  rel.from_agent_id = :ceo_agent_id
  AND rel.relationship_type = 'supervises'
ORDER BY ar.hierarchy_level, ar.agent_role;`
    },
    testing_scenarios: [
      { scenario: 'Create relationship with valid relationship_type', type: 'integration', priority: 'P0' },
      { scenario: 'Reject invalid relationship_type (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'CASCADE delete when agent is deleted', type: 'integration', priority: 'P1' },
      { scenario: 'Unique constraint prevents duplicate relationships', type: 'integration', priority: 'P1' },
      { scenario: 'Bidirectional peer coordination relationships', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/e2e/database/US-003-agent-relationships-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create agent_memory_stores table for persistent agent context',
    user_role: 'AI Engineer',
    user_want: 'Table to store persistent memory for CEO and VP agents (context, decisions, learnings, preferences)',
    user_benefit: 'CEO and VP agents maintain stateful context across sessions, enabling continuity and learning over time',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Table creation - Schema validation',
        given: 'agent_registry table exists',
        when: 'Migration creates agent_memory_stores table',
        then: 'Table has columns: id (UUID PK), agent_id (FK CASCADE), memory_type, content (JSONB), summary (TEXT), embedding (VECTOR(1536)), version (INT), is_current (BOOLEAN), parent_version_id (FK self), expires_at, importance_score, created_at, updated_at'
      },
      {
        id: 'AC-004-2',
        scenario: 'Check constraint - memory_type validation',
        given: 'agent_memory_stores table exists',
        when: 'INSERT statement uses invalid memory_type',
        then: 'Check constraint violation error AND memory_type must be one of: context, decisions, learnings, preferences'
      },
      {
        id: 'AC-004-3',
        scenario: 'Vector embedding storage - pgvector support',
        given: 'pgvector extension is enabled',
        when: 'INSERT memory with embedding VECTOR(1536)',
        then: 'Embedding is stored AND IVFFLAT index supports vector similarity search'
      },
      {
        id: 'AC-004-4',
        scenario: 'Memory versioning - current flag',
        given: 'Agent has existing memory (version 1, is_current = true)',
        when: 'New memory version is inserted (version 2, is_current = true)',
        then: 'Previous version is updated to is_current = false AND new version has is_current = true AND parent_version_id references version 1'
      },
      {
        id: 'AC-004-5',
        scenario: 'Partial index - current memories only',
        given: 'agent_memory_stores table has many historical versions',
        when: 'Query filters WHERE is_current = TRUE',
        then: 'Partial index idx_memory_current is used for fast retrieval'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_agent_memory_stores_table.sql',
      'Table created with all required columns',
      'Check constraint enforces memory_type values',
      'Foreign key CASCADE delete on agent_registry',
      'VECTOR(1536) column for embeddings (requires pgvector extension)',
      'Indexes created: agent_id, (agent_id, memory_type), is_current (partial), embedding (IVFFLAT)',
      'Table comment clarifies CEOs/VPs have memory, crews are stateless',
      'Test data insertion succeeds with JSONB content',
      'Vector similarity search query performs efficiently'
    ],
    technical_notes: 'Persistent memory for stateful agents (CEO, VP) only. Crews are stateless workers and do NOT use this table. content JSONB stores structured memory data. embedding VECTOR(1536) enables semantic search over memories. importance_score for memory pruning/retention policies. Edge cases: Very large JSONB content (>1MB - consider splitting), embedding dimension mismatch (must be exactly 1536 for OpenAI), memory expiration (expires_at enforcement), version chains becoming very long (pruning old versions).',
    implementation_approach: 'Create table with JSONB content and VECTOR embedding column (requires pgvector extension). Add CHECK constraint for memory_type. Implement versioning with is_current flag. Create partial index for current memories.',
    implementation_context: 'Enables CEO/VP agents to maintain context across sessions. NOT used by stateless crew agents. Supports semantic search via vector embeddings.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 3.3 agent_memory_stores',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 9.7 Status Aggregation'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS agent_memory_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,

  memory_type VARCHAR(50) NOT NULL
    CHECK (memory_type IN ('context', 'decisions', 'learnings', 'preferences')),

  -- Content
  content JSONB NOT NULL,
  summary TEXT,
  embedding VECTOR(1536),

  -- Versioning
  version INT DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  parent_version_id UUID REFERENCES agent_memory_stores(id),

  -- Retention
  expires_at TIMESTAMPTZ,
  importance_score NUMERIC(3,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`,
      indexes: `CREATE INDEX idx_memory_agent ON agent_memory_stores(agent_id);
CREATE INDEX idx_memory_type ON agent_memory_stores(agent_id, memory_type);
CREATE INDEX idx_memory_current ON agent_memory_stores(agent_id) WHERE is_current = TRUE;
CREATE INDEX idx_memory_embedding ON agent_memory_stores USING ivfflat (embedding vector_cosine_ops);`,
      table_comment: `COMMENT ON TABLE agent_memory_stores IS
  'Persistent memory for CEO and VP agents. Crews are stateless.';`,
      sample_insert: `INSERT INTO agent_memory_stores (
  agent_id,
  memory_type,
  content,
  summary,
  version,
  is_current
) VALUES (
  :ceo_agent_id,
  'context',
  '{"venture_name": "Solara", "current_stage": 3, "key_decisions": ["Pivot to B2B"]}'::jsonb,
  'Solara venture context - currently in Stage 3 (Market Validation)',
  1,
  true
);`
    },
    testing_scenarios: [
      { scenario: 'Insert memory with JSONB content', type: 'integration', priority: 'P0' },
      { scenario: 'Reject invalid memory_type (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Store and retrieve VECTOR(1536) embedding', type: 'integration', priority: 'P1' },
      { scenario: 'Memory versioning - update is_current flag', type: 'integration', priority: 'P2' },
      { scenario: 'Partial index used for is_current = TRUE queries', type: 'performance', priority: 'P2' },
      { scenario: 'Vector similarity search query', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/e2e/database/US-004-agent-memory-stores-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create tool_registry table for shared tool catalog',
    user_role: 'Platform Engineer',
    user_want: 'Central registry of all tools available to agents (research, analysis, generation, communication, integration, database, monitoring)',
    user_benefit: 'All tools are cataloged in one place with implementation details, cost tracking, and access control metadata',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Table creation - Schema validation',
        given: 'Database is accessible',
        when: 'Migration creates tool_registry table',
        then: 'Table has columns: id (UUID PK), tool_name (UNIQUE), display_name, description, tool_category, implementation_type, implementation_config (JSONB), min_hierarchy_level (INT), required_capabilities (TEXT[]), cost_per_use_usd, is_available (BOOLEAN), rate_limit_per_minute, timeout_seconds, created_at, updated_at'
      },
      {
        id: 'AC-005-2',
        scenario: 'Check constraint - tool_category validation',
        given: 'tool_registry table exists',
        when: 'INSERT statement uses invalid tool_category',
        then: 'Check constraint violation error AND tool_category must be one of: research, analysis, generation, communication, integration, database, monitoring'
      },
      {
        id: 'AC-005-3',
        scenario: 'Check constraint - implementation_type validation',
        given: 'tool_registry table exists',
        when: 'INSERT statement uses invalid implementation_type',
        then: 'Check constraint violation error AND implementation_type must be one of: function, api, mcp_server, crew'
      },
      {
        id: 'AC-005-4',
        scenario: 'Unique constraint - tool_name uniqueness',
        given: 'Tool with tool_name "web_search" already exists',
        when: 'INSERT attempts to create another tool with tool_name "web_search"',
        then: 'Unique constraint violation error'
      },
      {
        id: 'AC-005-5',
        scenario: 'JSONB implementation_config - flexible storage',
        given: 'tool_registry table exists',
        when: 'INSERT tool with implementation_config: {"provider": "tavily", "endpoint": "/search"}',
        then: 'JSONB is stored AND can be queried with -> and ->> operators'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_tool_registry_table.sql',
      'Table created with all required columns',
      'Check constraints enforce tool_category and implementation_type values',
      'Unique constraint on tool_name',
      'Indexes created: tool_category, is_available (partial WHERE is_available = TRUE)',
      'Table comment documents purpose',
      'Test data insertion succeeds with various tool types',
      'JSONB implementation_config validated'
    ],
    technical_notes: 'Central catalog of ALL tools in the ecosystem. implementation_config JSONB stores provider-specific connection details (API endpoints, credentials refs, etc.). min_hierarchy_level defines minimum agent level allowed to use tool (1=Chairman, 2=EVA, 3=VP, 4=crew). cost_per_use_usd tracks tool usage economics. Edge cases: Tool name conflicts (unique constraint), invalid JSONB structure (validation needed?), very expensive tools (cost_per_use_usd > $10?), tools becoming unavailable (is_available = false), rate limits per tool vs per agent.',
    implementation_approach: 'Create table with CHECK constraints for enums. Add unique constraint on tool_name. Store implementation details in JSONB. Create partial index for available tools.',
    implementation_context: 'Foundation for tool access control system. Referenced by tool_access_grants and tool_usage_ledger tables.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 4.1 tool_registry',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 4.3 Seed Data: Core Tools'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS tool_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200),
  description TEXT,

  -- Classification
  tool_category VARCHAR(50) NOT NULL
    CHECK (tool_category IN (
      'research',
      'analysis',
      'generation',
      'communication',
      'integration',
      'database',
      'monitoring'
    )),

  -- Implementation
  implementation_type VARCHAR(50) NOT NULL
    CHECK (implementation_type IN ('function', 'api', 'mcp_server', 'crew')),
  implementation_config JSONB NOT NULL,

  -- Access control
  min_hierarchy_level INT DEFAULT 4,
  required_capabilities TEXT[] DEFAULT '{}',
  cost_per_use_usd NUMERIC(10, 6) DEFAULT 0,

  -- Operational
  is_available BOOLEAN DEFAULT TRUE,
  rate_limit_per_minute INT,
  timeout_seconds INT DEFAULT 30,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`,
      indexes: `CREATE INDEX idx_tool_registry_category ON tool_registry(tool_category);
CREATE INDEX idx_tool_registry_available ON tool_registry(is_available) WHERE is_available = TRUE;`,
      table_comment: `COMMENT ON TABLE tool_registry IS
  'Shared tool registry for all agents in the ecosystem.';`,
      sample_insert: `INSERT INTO tool_registry (
  tool_name,
  display_name,
  tool_category,
  implementation_type,
  implementation_config,
  min_hierarchy_level,
  cost_per_use_usd
) VALUES (
  'web_search',
  'Web Search',
  'research',
  'api',
  '{"provider": "tavily", "endpoint": "/search"}'::jsonb,
  4,
  0.001
);`
    },
    testing_scenarios: [
      { scenario: 'Insert tool with valid tool_category', type: 'integration', priority: 'P0' },
      { scenario: 'Reject invalid tool_category (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Reject invalid implementation_type (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Unique constraint prevents duplicate tool_name', type: 'integration', priority: 'P1' },
      { scenario: 'JSONB implementation_config storage and retrieval', type: 'integration', priority: 'P0' }
    ],
    e2e_test_path: 'tests/e2e/database/US-005-tool-registry-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create tool_access_grants table for agent-specific tool permissions',
    user_role: 'Security Engineer',
    user_want: 'Table to track which agents have access to which tools with grant types (direct, inherited, temporary) and usage limits',
    user_benefit: 'Tool access is explicitly controlled per agent with daily limits and temporal validity windows',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Table creation - Schema validation',
        given: 'agent_registry and tool_registry tables exist',
        when: 'Migration creates tool_access_grants table',
        then: 'Table has columns: id (UUID PK), agent_id (FK CASCADE), tool_id (FK CASCADE), grant_type, granted_by (FK agent_registry), daily_usage_limit, usage_count_today, valid_from, valid_until, created_at AND UNIQUE constraint on (agent_id, tool_id)'
      },
      {
        id: 'AC-006-2',
        scenario: 'Check constraint - grant_type validation',
        given: 'tool_access_grants table exists',
        when: 'INSERT statement uses invalid grant_type',
        then: 'Check constraint violation error AND grant_type must be one of: direct, inherited, temporary'
      },
      {
        id: 'AC-006-3',
        scenario: 'Unique constraint - one grant per agent-tool pair',
        given: 'Agent already has grant for specific tool',
        when: 'INSERT attempts to create duplicate grant for same (agent_id, tool_id)',
        then: 'Unique constraint violation error'
      },
      {
        id: 'AC-006-4',
        scenario: 'Temporal validity - valid_from and valid_until',
        given: 'Grant has valid_from = 2025-01-01 and valid_until = 2025-12-31',
        when: 'Query checks grant validity on 2025-06-15',
        then: 'Grant is considered valid (NOW() BETWEEN valid_from AND valid_until)'
      },
      {
        id: 'AC-006-5',
        scenario: 'Usage limit enforcement - daily_usage_limit',
        given: 'Grant has daily_usage_limit = 100 and usage_count_today = 99',
        when: 'Agent attempts to use tool one more time',
        then: 'Usage is allowed AND usage_count_today is incremented to 100'
      },
      {
        id: 'AC-006-6',
        scenario: 'Usage limit exceeded - blocking',
        given: 'Grant has daily_usage_limit = 100 and usage_count_today = 100',
        when: 'Agent attempts to use tool again',
        then: 'Application logic should block usage (exceeds daily limit)'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_tool_access_grants_table.sql',
      'Table created with all required columns',
      'Check constraint enforces grant_type values',
      'Foreign keys CASCADE delete on agent_registry and tool_registry',
      'Unique constraint on (agent_id, tool_id)',
      'Indexes created: agent_id, tool_id',
      'Test data insertion succeeds',
      'Temporal validity query logic validated'
    ],
    technical_notes: 'Explicit tool access control per agent. grant_type: direct (explicitly granted), inherited (from parent agent), temporary (expires). daily_usage_limit enforces quotas per agent. usage_count_today must reset daily (application logic or scheduled job). Edge cases: Grant expiration (valid_until < NOW()), daily limit reset timing (UTC vs venture timezone?), inherited grants when parent grant is revoked, temporary grants cleanup (expired grants should be archived?), usage_count_today overflow (what happens at INT max?).',
    implementation_approach: 'Create table with FKs to agent_registry and tool_registry. Add CHECK constraint for grant_type. Implement unique constraint. Create indexes for efficient grant lookup.',
    implementation_context: 'Enables fine-grained tool access control. Works with tool_usage_ledger for quota enforcement. Supports temporal access (temporary grants).',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 4.2 tool_access_grants',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 11.2 Tool Execution Gateway'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS tool_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,

  -- Grant details
  grant_type VARCHAR(50) DEFAULT 'direct'
    CHECK (grant_type IN ('direct', 'inherited', 'temporary')),
  granted_by UUID REFERENCES agent_registry(id),

  -- Limits
  daily_usage_limit INT,
  usage_count_today INT DEFAULT 0,

  -- Temporal
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agent_id, tool_id)
);`,
      indexes: `CREATE INDEX idx_tool_grants_agent ON tool_access_grants(agent_id);
CREATE INDEX idx_tool_grants_tool ON tool_access_grants(tool_id);`,
      sample_query: `-- Check if agent has valid access to tool
SELECT
  tag.*,
  tr.tool_name,
  tr.display_name
FROM tool_access_grants tag
JOIN tool_registry tr ON tr.id = tag.tool_id
WHERE
  tag.agent_id = :agent_id
  AND tag.tool_id = :tool_id
  AND (tag.valid_until IS NULL OR tag.valid_until > NOW())
  AND (tag.daily_usage_limit IS NULL OR tag.usage_count_today < tag.daily_usage_limit);`
    },
    testing_scenarios: [
      { scenario: 'Create grant with valid grant_type', type: 'integration', priority: 'P0' },
      { scenario: 'Reject invalid grant_type (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Unique constraint prevents duplicate grants', type: 'integration', priority: 'P1' },
      { scenario: 'Temporal validity check (valid_from, valid_until)', type: 'integration', priority: 'P1' },
      { scenario: 'Daily usage limit tracking', type: 'integration', priority: 'P0' },
      { scenario: 'Block usage when daily_usage_limit exceeded', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/database/US-006-tool-access-grants-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-007',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create agent_messages table for cross-agent communication protocol',
    user_role: 'System Architect',
    user_want: 'Table to store agent-to-agent messages for task delegation, status reports, escalations, coordination, and queries',
    user_benefit: 'All inter-agent communication is tracked in database enabling async messaging, priority queues, and audit trails',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Table creation - Schema validation',
        given: 'agent_registry table exists',
        when: 'Migration creates agent_messages table',
        then: 'Table has columns: id (UUID PK), message_type, from_agent_id (FK), to_agent_id (FK), correlation_id (UUID), subject, body (JSONB), attachments (UUID[]), priority, requires_response (BOOLEAN), response_deadline, responded_at, response_message_id (FK self), status, route_through (UUID[]), current_position (INT), created_at, delivered_at, completed_at'
      },
      {
        id: 'AC-007-2',
        scenario: 'Check constraint - message_type validation',
        given: 'agent_messages table exists',
        when: 'INSERT statement uses invalid message_type',
        then: 'Check constraint violation error AND message_type must be one of: task_delegation, task_completion, status_report, escalation, coordination, broadcast, query, response'
      },
      {
        id: 'AC-007-3',
        scenario: 'Check constraint - priority validation',
        given: 'agent_messages table exists',
        when: 'INSERT statement uses invalid priority',
        then: 'Check constraint violation error AND priority must be one of: low, normal, high, critical'
      },
      {
        id: 'AC-007-4',
        scenario: 'Check constraint - status validation',
        given: 'agent_messages table exists',
        when: 'INSERT statement uses invalid status',
        then: 'Check constraint violation error AND status must be one of: pending, delivered, read, processing, completed, failed'
      },
      {
        id: 'AC-007-5',
        scenario: 'Partial index - pending messages',
        given: 'agent_messages table has many completed messages',
        when: 'Query filters WHERE status = \'pending\'',
        then: 'Partial index idx_messages_pending is used for fast inbox retrieval'
      },
      {
        id: 'AC-007-6',
        scenario: 'Message correlation - request-response pairs',
        given: 'Agent A sends query message with id = msg_1',
        when: 'Agent B sends response message with correlation_id = msg_1',
        then: 'Response is linked to original query via correlation_id AND response_message_id on msg_1 is updated'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_agent_messages_table.sql',
      'Table created with all required columns',
      'Check constraints enforce message_type, priority, and status values',
      'Foreign keys to agent_registry and self-reference for response_message_id',
      'Indexes created: to_agent_id, from_agent_id, correlation_id, pending (partial)',
      'JSONB body validated for flexible message content',
      'Test data insertion succeeds with various message types',
      'Correlation_id query validated'
    ],
    technical_notes: 'Central message bus for agent communication. body JSONB stores message-type-specific payloads. correlation_id links request-response pairs. route_through enables multi-hop routing (agent A -> agent B -> agent C). status workflow: pending -> delivered -> processing -> completed/failed. Edge cases: Message loops (A sends to B, B sends to A infinitely), correlation_id collisions (use UUIDs), very large body JSONB (>1MB payloads), response_deadline enforcement (requires scheduled job?), orphaned messages (sender/receiver deleted), partial index performance on large tables.',
    implementation_approach: 'Create table with JSONB body for flexible message content. Add CHECK constraints for enums. Implement partial index for pending messages. Add correlation_id for message threading.',
    implementation_context: 'Foundation for async agent communication. Enables task delegation (CEO -> VP), escalations (VP -> CEO), peer coordination (VP <-> VP). Works with agent runtime service.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 5.1 Message Types',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 5.2 agent_messages Table',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 5.3 Communication Patterns'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type VARCHAR(50) NOT NULL,
  from_agent_id UUID NOT NULL REFERENCES agent_registry(id),
  to_agent_id UUID NOT NULL REFERENCES agent_registry(id),
  correlation_id UUID,

  -- Content
  subject VARCHAR(500) NOT NULL,
  body JSONB NOT NULL,
  attachments UUID[] DEFAULT '{}',

  -- Priority & Response
  priority VARCHAR(20) DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  requires_response BOOLEAN DEFAULT FALSE,
  response_deadline TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_message_id UUID REFERENCES agent_messages(id),

  -- Status
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'read', 'processing', 'completed', 'failed')),

  -- Routing
  route_through UUID[] DEFAULT '{}',
  current_position INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);`,
      indexes: `CREATE INDEX idx_messages_to ON agent_messages(to_agent_id, status);
CREATE INDEX idx_messages_from ON agent_messages(from_agent_id);
CREATE INDEX idx_messages_correlation ON agent_messages(correlation_id);
CREATE INDEX idx_messages_pending ON agent_messages(to_agent_id) WHERE status = 'pending';`,
      sample_insert: `INSERT INTO agent_messages (
  message_type,
  from_agent_id,
  to_agent_id,
  subject,
  body,
  priority,
  requires_response,
  response_deadline
) VALUES (
  'task_delegation',
  :ceo_agent_id,
  :vp_strategy_agent_id,
  'Task: Complete Market Analysis for Stage 3',
  '{"task_contract_id": "tc_123", "context": {...}, "expected_outputs": [...]}'::jsonb,
  'high',
  true,
  NOW() + INTERVAL '7 days'
);`
    },
    testing_scenarios: [
      { scenario: 'Insert message with valid message_type', type: 'integration', priority: 'P0' },
      { scenario: 'Reject invalid message_type (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Reject invalid priority (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Reject invalid status (check constraint)', type: 'integration', priority: 'P1' },
      { scenario: 'Partial index used for pending message queries', type: 'performance', priority: 'P1' },
      { scenario: 'Message correlation - request-response linking', type: 'integration', priority: 'P0' }
    ],
    e2e_test_path: 'tests/e2e/database/US-007-agent-messages-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-008',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create venture_tool_quotas table for per-venture tool usage limits',
    user_role: 'Platform Engineer',
    user_want: 'Table to track tool usage quotas per venture with daily/monthly limits and cost caps',
    user_benefit: 'Tool usage is isolated per venture preventing one venture from exhausting shared tool quotas',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-008-1',
        scenario: 'Table creation - Schema validation',
        given: 'ventures and tool_registry tables exist',
        when: 'Migration creates venture_tool_quotas table',
        then: 'Table has columns: id (UUID PK), venture_id (FK CASCADE), tool_id (FK CASCADE), daily_limit, monthly_limit, cost_limit_usd, usage_today, usage_this_month, cost_this_month_usd, last_daily_reset, last_monthly_reset, created_at, updated_at AND UNIQUE constraint on (venture_id, tool_id)'
      },
      {
        id: 'AC-008-2',
        scenario: 'Unique constraint - one quota per venture-tool pair',
        given: 'Quota already exists for venture X and tool Y',
        when: 'INSERT attempts to create duplicate quota for same (venture_id, tool_id)',
        then: 'Unique constraint violation error'
      },
      {
        id: 'AC-008-3',
        scenario: 'Daily usage tracking - increment on use',
        given: 'Quota has daily_limit = 1000 and usage_today = 500',
        when: 'Tool is used by agent in that venture',
        then: 'usage_today is incremented to 501'
      },
      {
        id: 'AC-008-4',
        scenario: 'Daily limit enforcement - block when exceeded',
        given: 'Quota has daily_limit = 1000 and usage_today = 1000',
        when: 'Agent attempts to use tool',
        then: 'Application logic should block usage (daily quota exhausted)'
      },
      {
        id: 'AC-008-5',
        scenario: 'Monthly usage tracking - cumulative',
        given: 'Quota has monthly_limit = 10000 and usage_this_month = 5000',
        when: 'Tool is used 100 times today',
        then: 'usage_this_month is incremented to 5100'
      },
      {
        id: 'AC-008-6',
        scenario: 'Cost tracking - cumulative per month',
        given: 'Quota has cost_limit_usd = 100.00 and cost_this_month_usd = 50.00',
        when: 'Tool is used with cost $0.50',
        then: 'cost_this_month_usd is incremented to 50.50'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_venture_tool_quotas_table.sql',
      'Table created with all required columns',
      'Foreign keys CASCADE delete on ventures and tool_registry',
      'Unique constraint on (venture_id, tool_id)',
      'Test data insertion succeeds',
      'Usage increment and limit validation logic documented',
      'Reset timestamps (last_daily_reset, last_monthly_reset) initialized'
    ],
    technical_notes: 'Per-venture quota isolation prevents one venture from exhausting shared tool quotas. usage_today and usage_this_month must be reset by scheduled job (daily UTC reset, monthly 1st of month reset). cost_this_month_usd tracks spend against cost_limit_usd. Edge cases: Reset timing in different timezones (UTC vs venture local time?), quota updates during active usage (race conditions), cost overruns (allow 110% before blocking?), retroactive quota changes (decrease daily_limit when usage_today > new limit), quota deletion (cascade behavior).',
    implementation_approach: 'Create table with venture_id and tool_id FKs. Add unique constraint. Implement usage and cost tracking columns. Document reset logic for scheduled job.',
    implementation_context: 'Works with tool_usage_ledger for audit trail. Used by tool execution gateway to enforce quotas. Requires scheduled job for daily/monthly resets.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 11.3 Venture Tool Quotas Table'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS venture_tool_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,

  -- Quotas
  daily_limit INT,
  monthly_limit INT,
  cost_limit_usd NUMERIC(10, 2),

  -- Current usage
  usage_today INT DEFAULT 0,
  usage_this_month INT DEFAULT 0,
  cost_this_month_usd NUMERIC(10, 2) DEFAULT 0,

  -- Reset timestamps
  last_daily_reset TIMESTAMPTZ DEFAULT NOW(),
  last_monthly_reset TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(venture_id, tool_id)
);`,
      sample_insert: `INSERT INTO venture_tool_quotas (
  venture_id,
  tool_id,
  daily_limit,
  monthly_limit,
  cost_limit_usd
) VALUES (
  :venture_id,
  (SELECT id FROM tool_registry WHERE tool_name = 'web_search'),
  1000,
  30000,
  50.00
);`,
      usage_increment: `-- Increment usage when tool is used
UPDATE venture_tool_quotas
SET
  usage_today = usage_today + 1,
  usage_this_month = usage_this_month + 1,
  cost_this_month_usd = cost_this_month_usd + :tool_cost_usd,
  updated_at = NOW()
WHERE
  venture_id = :venture_id
  AND tool_id = :tool_id;`,
      daily_reset: `-- Daily reset job (run at 00:00 UTC)
UPDATE venture_tool_quotas
SET
  usage_today = 0,
  last_daily_reset = NOW()
WHERE
  last_daily_reset < CURRENT_DATE;`
    },
    testing_scenarios: [
      { scenario: 'Create quota with limits', type: 'integration', priority: 'P0' },
      { scenario: 'Unique constraint prevents duplicate quotas', type: 'integration', priority: 'P1' },
      { scenario: 'Increment usage_today on tool use', type: 'integration', priority: 'P0' },
      { scenario: 'Block usage when daily_limit exceeded', type: 'integration', priority: 'P1' },
      { scenario: 'Increment usage_this_month cumulatively', type: 'integration', priority: 'P1' },
      { scenario: 'Increment cost_this_month_usd on usage', type: 'integration', priority: 'P0' },
      { scenario: 'Daily reset clears usage_today', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/database/US-008-venture-tool-quotas-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-009',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create tool_usage_ledger table for tool consumption audit trail',
    user_role: 'Platform Engineer',
    user_want: 'Immutable audit log of every tool execution with agent, venture, tokens consumed, cost, and execution time',
    user_benefit: 'Complete audit trail of tool usage for cost attribution, quota enforcement, and performance monitoring',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-009-1',
        scenario: 'Table creation - Schema validation',
        given: 'agent_registry, ventures, and tool_registry tables exist',
        when: 'Migration creates tool_usage_ledger table',
        then: 'Table has columns: id (UUID PK), agent_id (FK), venture_id (FK nullable), tool_id (FK), tokens_consumed, cost_usd, execution_ms, created_at'
      },
      {
        id: 'AC-009-2',
        scenario: 'Immutable audit trail - no updates/deletes',
        given: 'tool_usage_ledger table exists',
        when: 'Application attempts UPDATE or DELETE on ledger row',
        then: 'Operation should be blocked (application logic enforces immutability - consider trigger?)'
      },
      {
        id: 'AC-009-3',
        scenario: 'Log entry creation - successful tool execution',
        given: 'Agent uses tool successfully (tokens_consumed = 1500, cost = $0.003, execution_ms = 2500)',
        when: 'Ledger entry is inserted',
        then: 'Row is created with agent_id, venture_id, tool_id, tokens_consumed, cost_usd, execution_ms, created_at'
      },
      {
        id: 'AC-009-4',
        scenario: 'Indexes for audit queries - venture-based cost reports',
        given: 'tool_usage_ledger has many rows',
        when: 'Query aggregates cost per venture: SELECT venture_id, SUM(cost_usd) FROM tool_usage_ledger GROUP BY venture_id',
        then: 'idx_tool_usage_venture index is used for efficient aggregation'
      },
      {
        id: 'AC-009-5',
        scenario: 'Indexes for audit queries - agent-based usage reports',
        given: 'tool_usage_ledger has many rows',
        when: 'Query retrieves agent usage history: SELECT * FROM tool_usage_ledger WHERE agent_id = :agent_id ORDER BY created_at DESC',
        then: 'idx_tool_usage_agent index is used'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_create_tool_usage_ledger_table.sql',
      'Table created with all required columns',
      'Foreign keys to agent_registry, ventures, and tool_registry',
      'Indexes created: venture_id + created_at DESC, agent_id + created_at DESC',
      'Test data insertion succeeds',
      'Query performance validated for cost/usage reports (<50ms for 100K rows)',
      'Immutability enforcement documented (trigger or application logic)'
    ],
    technical_notes: 'Immutable audit log - once written, never modified or deleted (archive old data instead). Used for cost attribution, quota enforcement, and performance monitoring. Edge cases: Very high volume (millions of rows per month - partition by month?), retroactive cost adjustments (insert compensating entry instead of update), ledger integrity (ensure every tool execution is logged), orphaned entries (venture/agent deleted but ledger retained), execution_ms outliers (timeouts, errors), cost_usd precision (NUMERIC(10, 6) = $0.000001 precision).',
    implementation_approach: 'Create append-only table with FKs. Add indexes for venture and agent queries. Consider partitioning by month for large volumes. Document immutability.',
    implementation_context: 'Works with venture_tool_quotas for quota enforcement. Provides audit trail for cost attribution and usage analytics. Consider partitioning strategy for scale.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 11.3 Venture Tool Quotas Table (ledger reference)'
    ],
    example_code_patterns: {
      table_creation: `CREATE TABLE IF NOT EXISTS tool_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id),
  venture_id UUID REFERENCES ventures(id),
  tool_id UUID NOT NULL REFERENCES tool_registry(id),

  tokens_consumed INT DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  execution_ms INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);`,
      indexes: `CREATE INDEX idx_tool_usage_venture ON tool_usage_ledger(venture_id, created_at DESC);
CREATE INDEX idx_tool_usage_agent ON tool_usage_ledger(agent_id, created_at DESC);`,
      sample_insert: `INSERT INTO tool_usage_ledger (
  agent_id,
  venture_id,
  tool_id,
  tokens_consumed,
  cost_usd,
  execution_ms
) VALUES (
  :agent_id,
  :venture_id,
  :tool_id,
  1500,
  0.003,
  2500
);`,
      cost_report_query: `-- Venture cost report (last 30 days)
SELECT
  v.name AS venture_name,
  COUNT(*) AS usage_count,
  SUM(tul.tokens_consumed) AS total_tokens,
  SUM(tul.cost_usd) AS total_cost_usd,
  AVG(tul.execution_ms) AS avg_execution_ms
FROM tool_usage_ledger tul
JOIN ventures v ON v.id = tul.venture_id
WHERE
  tul.created_at >= NOW() - INTERVAL '30 days'
GROUP BY v.id, v.name
ORDER BY total_cost_usd DESC;`
    },
    testing_scenarios: [
      { scenario: 'Insert ledger entry on tool execution', type: 'integration', priority: 'P0' },
      { scenario: 'Immutability - block UPDATE/DELETE (trigger or app logic)', type: 'integration', priority: 'P1' },
      { scenario: 'Venture cost report query performance (<50ms for 100K rows)', type: 'performance', priority: 'P1' },
      { scenario: 'Agent usage history query uses index', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/database/US-009-tool-usage-ledger-table.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-010',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Bootstrap Chairman and EVA agents with well-known UUIDs',
    user_role: 'Platform Engineer',
    user_want: 'Chairman and EVA agent records created with predefined UUIDs (00000000-0000-0000-0000-000000000001 and ...0002) and correct hierarchy',
    user_benefit: 'Chairman and EVA agents exist as foundation of agent hierarchy with consistent, well-known identifiers',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-010-1',
        scenario: 'Bootstrap Chairman agent - well-known ID',
        given: 'agent_registry table exists',
        when: 'Bootstrap migration inserts Chairman agent',
        then: 'Agent with id = 00000000-0000-0000-0000-000000000001, agent_type = chairman, agent_role = ECOSYSTEM_CHAIRMAN, display_name = "Rick (Chairman)", hierarchy_level = 1, hierarchy_path = \'chairman\', parent_agent_id = NULL exists'
      },
      {
        id: 'AC-010-2',
        scenario: 'Bootstrap EVA agent - well-known ID',
        given: 'Chairman agent exists',
        when: 'Bootstrap migration inserts EVA agent',
        then: 'Agent with id = 00000000-0000-0000-0000-000000000002, agent_type = eva, agent_role = CHIEF_OPERATING_OFFICER, display_name = "EVA (COO)", hierarchy_level = 2, hierarchy_path = \'chairman.eva\', parent_agent_id = Chairman ID exists'
      },
      {
        id: 'AC-010-3',
        scenario: 'Chairman capabilities - ecosystem governance',
        given: 'Chairman agent exists',
        when: 'Querying Chairman capabilities',
        then: 'capabilities array includes: ecosystem_governance, capital_allocation, kill_decision'
      },
      {
        id: 'AC-010-4',
        scenario: 'EVA capabilities - venture management',
        given: 'EVA agent exists',
        when: 'Querying EVA capabilities',
        then: 'capabilities array includes: venture_onboarding, ceo_management, portfolio_aggregation, escalation_routing'
      },
      {
        id: 'AC-010-5',
        scenario: 'Chairman-EVA relationship - reports_to',
        given: 'Chairman and EVA agents exist',
        when: 'Querying agent_relationships',
        then: 'Relationship exists: from_agent_id = EVA, to_agent_id = Chairman, relationship_type = reports_to AND reverse relationship: from_agent_id = Chairman, to_agent_id = EVA, relationship_type = supervises'
      },
      {
        id: 'AC-010-6',
        scenario: 'Idempotency - bootstrap runs multiple times',
        given: 'Chairman and EVA already exist',
        when: 'Bootstrap migration runs again',
        then: 'No duplicate agents created AND no errors occur'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_bootstrap_chairman_and_eva.sql',
      'Chairman agent inserted with well-known UUID ...0001',
      'EVA agent inserted with well-known UUID ...0002',
      'Chairman-EVA relationships created (reports_to, supervises)',
      'Migration is idempotent (uses INSERT ... ON CONFLICT DO NOTHING)',
      'Constants exported: lib/agents/constants.ts with CHAIRMAN_AGENT_ID and EVA_AGENT_ID',
      'Test query validates both agents and relationship exist'
    ],
    technical_notes: 'Well-known UUIDs enable hardcoded references in application code. Chairman has unlimited authority (delegation_authority with nulls). EVA has operational limits (can_approve_spend_usd = 1000, can_approve_token_budget = 500000). Edge cases: UUID conflicts (extremely unlikely with well-known IDs), migration ordering (must run after agent_registry and agent_relationships tables created), idempotency (use ON CONFLICT DO NOTHING), capabilities arrays (immutable or updatable?).',
    implementation_approach: 'Create migration with hardcoded UUIDs for Chairman and EVA. Insert into agent_registry with specific capabilities. Create relationships. Use ON CONFLICT for idempotency. Export constants.',
    implementation_context: 'Foundation agents for entire hierarchy. All ventures will have CEOs with parent_agent_id = EVA. Required before any venture instantiation.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 12.2 Bootstrap Migration',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 12.3 Well-Known Agent IDs',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 7.1 EVA\'s Evolved Role'
    ],
    example_code_patterns: {
      bootstrap_migration: `BEGIN;

-- 1. Create Chairman agent (represents the human)
INSERT INTO agent_registry (
  id,
  agent_type,
  agent_role,
  display_name,
  parent_agent_id,
  hierarchy_level,
  hierarchy_path,
  status,
  capabilities,
  delegation_authority
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'chairman',
  'ECOSYSTEM_CHAIRMAN',
  'Rick (Chairman)',
  NULL,
  1,
  'chairman',
  'active',
  ARRAY['ecosystem_governance', 'capital_allocation', 'kill_decision'],
  '{"can_approve_spend_usd": null, "can_approve_token_budget": null}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 2. Create EVA agent
INSERT INTO agent_registry (
  id,
  agent_type,
  agent_role,
  display_name,
  parent_agent_id,
  hierarchy_level,
  hierarchy_path,
  status,
  capabilities,
  delegation_authority
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'eva',
  'CHIEF_OPERATING_OFFICER',
  'EVA (COO)',
  '00000000-0000-0000-0000-000000000001',
  2,
  'chairman.eva',
  'active',
  ARRAY['venture_onboarding', 'ceo_management', 'portfolio_aggregation', 'escalation_routing'],
  '{
    "can_approve_spend_usd": 1000,
    "can_approve_token_budget": 500000,
    "can_hire_crews": false,
    "can_onboard_ventures": true
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 3. Create relationships
INSERT INTO agent_relationships (from_agent_id, to_agent_id, relationship_type)
VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'reports_to'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'supervises')
ON CONFLICT (from_agent_id, to_agent_id, relationship_type) DO NOTHING;

COMMIT;`,
      constants_export: `// lib/agents/constants.ts
export const CHAIRMAN_AGENT_ID = '00000000-0000-0000-0000-000000000001';
export const EVA_AGENT_ID = '00000000-0000-0000-0000-000000000002';`
    },
    testing_scenarios: [
      { scenario: 'Bootstrap creates Chairman agent with well-known UUID', type: 'integration', priority: 'P0' },
      { scenario: 'Bootstrap creates EVA agent with well-known UUID', type: 'integration', priority: 'P0' },
      { scenario: 'Chairman has correct capabilities', type: 'integration', priority: 'P1' },
      { scenario: 'EVA has correct capabilities', type: 'integration', priority: 'P1' },
      { scenario: 'Chairman-EVA relationship created', type: 'integration', priority: 'P0' },
      { scenario: 'Idempotency - bootstrap runs twice without errors', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/database/US-010-bootstrap-chairman-eva.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-004:US-011',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Seed core tools in tool_registry with categories and costs',
    user_role: 'Platform Engineer',
    user_want: 'Core tools (web_search, code_generator, venture_query, etc.) seeded in tool_registry with correct categories, implementation details, and costs',
    user_benefit: 'Agents can be granted access to operational tools immediately after hierarchy setup',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-011-1',
        scenario: 'Seed research tools - web_search',
        given: 'tool_registry table exists',
        when: 'Seed migration inserts research tools',
        then: 'Tool with tool_name = web_search, display_name = "Web Search", tool_category = research, implementation_type = api, implementation_config = {"provider": "tavily", "endpoint": "/search"}, min_hierarchy_level = 4 exists'
      },
      {
        id: 'AC-011-2',
        scenario: 'Seed generation tools - code_generator',
        given: 'tool_registry table exists',
        when: 'Seed migration inserts generation tools',
        then: 'Tool with tool_name = code_generator, tool_category = generation, implementation_type = api, implementation_config = {"provider": "anthropic", "model": "claude-sonnet-4"}, min_hierarchy_level = 3 exists'
      },
      {
        id: 'AC-011-3',
        scenario: 'Seed database tools - venture_query',
        given: 'tool_registry table exists',
        when: 'Seed migration inserts database tools',
        then: 'Tool with tool_name = venture_query, tool_category = database, implementation_type = function, implementation_config = {"module": "lib/tools/venture_query.ts"}, min_hierarchy_level = 3 exists'
      },
      {
        id: 'AC-011-4',
        scenario: 'Cost attribution - tools with cost_per_use_usd',
        given: 'Seed migration inserts tools',
        when: 'Querying tools with cost > 0',
        then: 'web_search has cost_per_use_usd > 0 (e.g., $0.001) AND code_generator has cost_per_use_usd > 0'
      },
      {
        id: 'AC-011-5',
        scenario: 'Tool availability - all seeded tools active',
        given: 'Seed migration inserts tools',
        when: 'Querying WHERE is_available = TRUE',
        then: 'All seeded tools have is_available = TRUE'
      },
      {
        id: 'AC-011-6',
        scenario: 'Idempotency - seed runs multiple times',
        given: 'Tools already seeded',
        when: 'Seed migration runs again',
        then: 'No duplicate tools created AND no errors occur (ON CONFLICT DO NOTHING)'
      }
    ],
    definition_of_done: [
      'Migration file created: database/migrations/YYYYMMDD_seed_core_tools.sql',
      'Research tools seeded: web_search, company_lookup, market_data',
      'Analysis tools seeded: financial_model, sentiment_analyzer, tam_calculator',
      'Generation tools seeded: code_generator, document_writer, image_generator',
      'Database tools seeded: venture_query, artifact_store',
      'Communication tools seeded: email_sender, slack_notifier',
      'All tools have correct tool_category, implementation_type, and min_hierarchy_level',
      'Migration is idempotent (uses ON CONFLICT DO NOTHING)',
      'Test query validates all tools exist with correct categories'
    ],
    technical_notes: 'Seed data for operational tools. implementation_config JSONB varies by tool type: API tools have provider/endpoint, function tools have module path, MCP servers have connection string. min_hierarchy_level: 1=Chairman only, 2=EVA+, 3=VP+, 4=all agents. Edge cases: Tool name conflicts (unique constraint), implementation_config schema validation (no enforced schema), cost_per_use_usd updates (seed should set initial values, updates happen separately), tool versioning (how to handle tool upgrades?), idempotency (ON CONFLICT DO NOTHING vs DO UPDATE SET?).',
    implementation_approach: 'Create seed migration with INSERT statements for each tool. Use ON CONFLICT DO NOTHING for idempotency. Reference vision spec Section 4.3 for complete tool list.',
    implementation_context: 'Provides operational tools for agents. Required before granting tools to EVA or venture agents. Tool access controlled via tool_access_grants table.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 4.3 Seed Data: Core Tools'
    ],
    example_code_patterns: {
      seed_migration: `BEGIN;

INSERT INTO tool_registry (tool_name, display_name, tool_category, implementation_type, implementation_config, min_hierarchy_level, cost_per_use_usd) VALUES
-- Research Tools
('web_search', 'Web Search', 'research', 'api', '{"provider": "tavily", "endpoint": "/search"}'::jsonb, 4, 0.001),
('company_lookup', 'Company Database Lookup', 'research', 'api', '{"provider": "clearbit", "endpoint": "/companies"}'::jsonb, 4, 0.002),
('market_data', 'Market Data API', 'research', 'api', '{"provider": "statista", "endpoint": "/data"}'::jsonb, 3, 0.005),

-- Analysis Tools
('financial_model', 'Financial Modeling Engine', 'analysis', 'function', '{"module": "lib/tools/financial_model.ts"}'::jsonb, 3, 0),
('sentiment_analyzer', 'Sentiment Analysis', 'analysis', 'api', '{"provider": "openai", "model": "gpt-4o-mini"}'::jsonb, 4, 0.0001),
('tam_calculator', 'TAM/SAM Calculator', 'analysis', 'function', '{"module": "lib/tools/tam_calculator.ts"}'::jsonb, 4, 0),

-- Generation Tools
('code_generator', 'Code Generation', 'generation', 'api', '{"provider": "anthropic", "model": "claude-sonnet-4"}'::jsonb, 3, 0.015),
('document_writer', 'Document Writer', 'generation', 'api', '{"provider": "anthropic", "model": "claude-sonnet-4"}'::jsonb, 4, 0.015),
('image_generator', 'Image Generation', 'generation', 'api', '{"provider": "stability", "model": "sdxl"}'::jsonb, 3, 0.040),

-- Database Tools
('venture_query', 'Venture Database Query', 'database', 'function', '{"module": "lib/tools/venture_query.ts"}'::jsonb, 3, 0),
('artifact_store', 'Artifact Storage', 'database', 'function', '{"module": "lib/tools/artifact_store.ts"}'::jsonb, 4, 0),

-- Communication Tools
('email_sender', 'Email Sender', 'communication', 'api', '{"provider": "sendgrid"}'::jsonb, 2, 0.001),
('slack_notifier', 'Slack Notification', 'communication', 'api', '{"provider": "slack"}'::jsonb, 3, 0)
ON CONFLICT (tool_name) DO NOTHING;

COMMIT;`,
      verify_query: `-- Verify all seeded tools exist
SELECT
  tool_category,
  COUNT(*) AS tool_count,
  SUM(CASE WHEN is_available THEN 1 ELSE 0 END) AS available_count
FROM tool_registry
GROUP BY tool_category
ORDER BY tool_category;`
    },
    testing_scenarios: [
      { scenario: 'Seed research tools (web_search, company_lookup, market_data)', type: 'integration', priority: 'P0' },
      { scenario: 'Seed generation tools (code_generator, document_writer, image_generator)', type: 'integration', priority: 'P0' },
      { scenario: 'Seed database tools (venture_query, artifact_store)', type: 'integration', priority: 'P0' },
      { scenario: 'All seeded tools have is_available = TRUE', type: 'integration', priority: 'P1' },
      { scenario: 'Tools with cost_per_use_usd > 0 identified', type: 'integration', priority: 'P1' },
      { scenario: 'Idempotency - seed runs twice without errors', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/database/US-011-seed-core-tools.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log(`📚 Adding ${userStories.length} user stories for ${SD_ID} to database...\n`);

  try {
    // Verify SD exists
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title')
      .eq('id', SD_ID)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${SD_ID} not found in database`);
      console.log('   Create SD first before adding user stories');
      process.exit(1);
    }

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   SD ID: ${sdData.id}\n`);

    // Verify PRD exists
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, title')
      .eq('id', PRD_ID)
      .single();

    if (prdError || !prdData) {
      console.log(`❌ PRD ${PRD_ID} not found in database`);
      console.log('   Create PRD first before adding user stories');
      process.exit(1);
    }

    console.log(`✅ Found PRD: ${prdData.title}\n`);

    // Insert user stories
    let successCount = 0;
    let errorCount = 0;

    for (const story of userStories) {
      const { data: _data, error } = await supabase
        .from('user_stories')
        .insert(story)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          console.log(`⚠️  ${story.story_key} already exists, skipping...`);
        } else {
          console.error(`❌ Failed to insert ${story.story_key}:`, error.message);
          errorCount++;
        }
      } else {
        console.log(`✅ ${story.story_key}: ${story.title}`);
        successCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ ${successCount} user stories added`);
    console.log(`   ⚠️  ${errorCount} errors`);
    console.log(`   📋 Total: ${userStories.length} user stories`);

    console.log('\n📝 Next steps:');
    console.log('1. Review user stories in database');
    console.log('2. Validate INVEST criteria compliance');
    console.log('3. Create E2E tests for each user story (e2e_test_path field)');
    console.log('4. Update story status as work progresses (draft -> in_progress -> completed)');

  } catch (error) {
    console.error('❌ Error adding user stories:', error.message);
    process.exit(1);
  }
}

addUserStories();
