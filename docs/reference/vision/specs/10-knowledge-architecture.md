# Knowledge Architecture Specification


## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, api, schema, rls

**Vision v2 Chairman's OS - Scoped Knowledge & Data Isolation**

> "Knowledge shared wisely, data protected fiercely."

---

## Table of Contents

1. [Overview](#overview)
2. [Knowledge Base Hierarchy](#knowledge-base-hierarchy)
3. [Data Isolation Model](#data-isolation-model)
4. [Cross-Venture Publishing](#cross-venture-publishing)
5. [Tool Usage Ledger](#tool-usage-ledger)
6. [Database Schema](#database-schema)

---

## Overview

### Current Gap

The architecture references `knowledge_base_ids` but lacks:
- Explicit KB tables with scoping
- Strict data isolation between ventures
- Publishing/redaction pipeline for cross-venture learning
- Mandatory tool usage tracking

### Solution

This spec defines:
- **Hierarchical knowledge bases** (ecosystem → portfolio → venture → agent)
- **Strict RLS** enforcing venture isolation
- **Publishing pipeline** with redaction for cross-venture learning
- **Tool usage ledger** for every tool execution

---

## Knowledge Base Hierarchy

### 2.1 Scope Levels

```typescript
type KnowledgeScope =
  | 'ecosystem'    // Available to all (public patterns, best practices)
  | 'portfolio'    // Available to ventures in same portfolio
  | 'venture'      // Private to single venture
  | 'agent';       // Private to single agent

interface KnowledgeBase {
  id: string;
  name: string;
  scope: KnowledgeScope;
  scope_id?: string;  // portfolio_id, venture_id, or agent_id

  // Access control
  owner_agent_id: string;
  read_access: KnowledgeScope;   // Min scope to read
  write_access: KnowledgeScope;  // Min scope to write

  // Content
  document_count: number;
  total_tokens: number;
}
```

### 2.2 Default Knowledge Bases

```typescript
const SYSTEM_KNOWLEDGE_BASES = [
  // Ecosystem level (read-only for agents)
  {
    name: 'Best Practices',
    scope: 'ecosystem',
    description: 'Curated patterns and anti-patterns from successful ventures',
  },
  {
    name: 'Failure Patterns',
    scope: 'ecosystem',
    description: 'Redacted learnings from failed ventures',
  },
  {
    name: 'Tool Documentation',
    scope: 'ecosystem',
    description: 'How to use each tool effectively',
  },

  // Created per venture
  {
    name: 'Venture Context',
    scope: 'venture',
    description: 'All artifacts and context for this venture',
  },
  {
    name: 'Decision History',
    scope: 'venture',
    description: 'Immutable record of all decisions and rationale',
  },
];
```

### 2.3 Document Structure

```typescript
interface KnowledgeDocument {
  id: string;
  knowledge_base_id: string;

  // Content
  title: string;
  content: string;
  content_type: 'text' | 'structured' | 'artifact_reference';
  tokens: number;

  // Classification
  category: string;          // 'market', 'technical', 'financial', etc.
  tags: string[];
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';

  // Provenance
  source_type: 'agent_generated' | 'human_created' | 'published' | 'imported';
  source_agent_id?: string;
  source_artifact_id?: string;

  // Publishing
  is_published: boolean;
  published_scope?: KnowledgeScope;
  redacted_fields?: string[];

  created_at: string;
  updated_at: string;
}
```

---

## Data Isolation Model

### 3.1 Strict RLS Policy

Replace permissive `authenticated USING (true)` with production-safe policies.

**Single-user production mode (Rick-only):**
- Grant `authenticated` access only if `fn_is_chairman()` (see `docs/vision/specs/01-database-schema.md`).
- Grant agent/automation access via `service_role`.

**Multi-user future mode (portfolios/teams):**
- Use the membership tables below to enforce venture/portfolio isolation.

```sql
-- Create membership table for access control
CREATE TABLE IF NOT EXISTS user_venture_access (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  access_level VARCHAR(20) DEFAULT 'read'
    CHECK (access_level IN ('read', 'write', 'admin')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, venture_id)
);

CREATE TABLE IF NOT EXISTS user_portfolio_access (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  access_level VARCHAR(20) DEFAULT 'read',
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, portfolio_id)
);

-- Strict RLS for ventures
CREATE POLICY "ventures_isolation" ON ventures
  FOR SELECT TO authenticated
  USING (
    -- User has direct access
    EXISTS (
      SELECT 1 FROM user_venture_access
      WHERE user_id = auth.uid() AND venture_id = ventures.id
    )
    OR
    -- User has portfolio access
    EXISTS (
      SELECT 1 FROM user_portfolio_access
      WHERE user_id = auth.uid() AND portfolio_id = ventures.portfolio_id
    )
    OR
    -- Service role (for agents)
    current_setting('role') = 'service_role'
  );

-- Apply similar pattern to all venture-scoped tables
CREATE POLICY "venture_artifacts_isolation" ON venture_artifacts
  FOR SELECT TO authenticated
  USING (
    venture_id IN (
      SELECT venture_id FROM user_venture_access WHERE user_id = auth.uid()
      UNION
      SELECT v.id FROM ventures v
      JOIN user_portfolio_access upa ON upa.portfolio_id = v.portfolio_id
      WHERE upa.user_id = auth.uid()
    )
    OR current_setting('role') = 'service_role'
  );
```

### 3.2 Agent-Level Isolation

Agents can only access knowledge within their hierarchy:

```typescript
async function canAgentAccessKB(
  agentId: string,
  kbId: string
): Promise<boolean> {
  const agent = await getAgent(agentId);
  const kb = await getKnowledgeBase(kbId);

  // Ecosystem KBs are readable by all
  if (kb.scope === 'ecosystem' && kb.read_access === 'ecosystem') {
    return true;
  }

  // Check hierarchy
  switch (kb.scope) {
    case 'agent':
      return kb.scope_id === agentId;

    case 'venture':
      return agent.venture_id === kb.scope_id;

    case 'portfolio':
      const venture = await getVenture(agent.venture_id);
      return venture.portfolio_id === kb.scope_id;

    default:
      return false;
  }
}
```

---

## Cross-Venture Publishing

### 4.1 Publishing Pipeline

```typescript
interface PublishRequest {
  document_id: string;
  target_scope: 'portfolio' | 'ecosystem';

  // Redaction
  redact_fields: string[];       // Fields to remove
  anonymize_entities: boolean;   // Replace venture/company names
  require_approval: boolean;
}

async function publishDocument(
  request: PublishRequest
): Promise<PublishResult> {
  const doc = await getDocument(request.document_id);

  // 1. Create redacted copy
  let content = doc.content;
  for (const field of request.redact_fields) {
    content = redactField(content, field);
  }
  if (request.anonymize_entities) {
    content = anonymizeEntities(content, doc.venture_id);
  }

  // 2. Create publication record
  const publication = await db.query(`
    INSERT INTO knowledge_publications
    (document_id, target_scope, redacted_content, status, requested_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    doc.id,
    request.target_scope,
    content,
    request.require_approval ? 'pending_approval' : 'approved',
    getCurrentAgentId(),
  ]);

  // 3. If auto-approved, create in target KB
  if (!request.require_approval) {
    await createPublishedDocument(publication, content);
  }

  return publication;
}
```

### 4.2 Redaction Rules

```typescript
const REDACTION_RULES = {
  // Always redact
  always: [
    'customer_names',
    'employee_names',
    'financial_details',
    'api_keys',
    'passwords',
    'pii',
  ],

  // Redact for ecosystem (not portfolio)
  ecosystem_only: [
    'venture_name',
    'competitor_names',
    'partnership_details',
    'pricing_specifics',
  ],

  // Never redact (patterns are valuable)
  never_redact: [
    'stage_number',
    'failure_category',
    'success_metrics',
    'time_to_completion',
  ],
};
```

---

## Tool Usage Ledger

### 5.1 Mandatory Tool Tracking

Every tool execution MUST be logged:

```typescript
interface ToolUsageEntry {
  id: string;
  tool_id: string;
  agent_id: string;
  venture_id?: string;

  // Execution details
  inputs_hash: string;          // Hash of inputs (not full content)
  outputs_hash?: string;
  execution_status: 'success' | 'failure' | 'timeout';
  error_message?: string;

  // Metrics
  execution_time_ms: number;
  tokens_consumed?: number;
  cost_usd?: number;

  // Audit
  correlation_id: string;
  executed_at: string;
}

// Gateway enforces logging
async function executeToolViaGateway(
  toolId: string,
  agentId: string,
  inputs: any
): Promise<ToolResult> {
  const startTime = Date.now();
  const correlationId = getCorrelationId();

  // 1. Permission check
  const allowed = await checkToolPermission(agentId, toolId);
  if (!allowed) {
    throw new PermissionDeniedError(`Agent ${agentId} cannot use tool ${toolId}`);
  }

  // 2. Quota check
  const quotaOk = await checkToolQuota(agentId, toolId);
  if (!quotaOk) {
    throw new QuotaExceededError(`Tool quota exceeded for ${toolId}`);
  }

  // 3. Execute
  let result: ToolResult;
  let status: 'success' | 'failure' | 'timeout';
  let errorMsg: string | undefined;

  try {
    result = await executeTool(toolId, inputs);
    status = 'success';
  } catch (error) {
    status = error.code === 'TIMEOUT' ? 'timeout' : 'failure';
    errorMsg = error.message;
    throw error;
  } finally {
    // 4. Always log
    await logToolUsage({
      tool_id: toolId,
      agent_id: agentId,
      venture_id: await getAgentVentureId(agentId),
      inputs_hash: hashInputs(inputs),
      outputs_hash: result ? hashOutputs(result) : undefined,
      execution_status: status,
      error_message: errorMsg,
      execution_time_ms: Date.now() - startTime,
      correlation_id: correlationId,
      executed_at: new Date().toISOString(),
    });
  }

  return result;
}
```

---

## Database Schema

### 6.1 knowledge_bases

```sql
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,

  scope VARCHAR(20) NOT NULL
    CHECK (scope IN ('ecosystem', 'portfolio', 'venture', 'agent')),
  scope_id UUID,  -- Null for ecosystem scope

  owner_agent_id UUID REFERENCES agent_registry(id),
  read_access VARCHAR(20) DEFAULT 'venture',
  write_access VARCHAR(20) DEFAULT 'venture',

  document_count INT DEFAULT 0,
  total_tokens INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_scope ON knowledge_bases(scope, scope_id);

-- RLS: Scope-based access
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_scoped_access" ON knowledge_bases
  FOR SELECT TO authenticated
  USING (
    scope = 'ecosystem'
    OR (scope = 'portfolio' AND scope_id IN (
      SELECT portfolio_id FROM user_portfolio_access WHERE user_id = auth.uid()
    ))
    OR (scope = 'venture' AND scope_id IN (
      SELECT venture_id FROM user_venture_access WHERE user_id = auth.uid()
    ))
    OR current_setting('role') = 'service_role'
  );
```

### 6.2 knowledge_documents

```sql
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,

  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  content_type VARCHAR(20) DEFAULT 'text',
  tokens INT DEFAULT 0,

  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  sensitivity VARCHAR(20) DEFAULT 'internal'
    CHECK (sensitivity IN ('public', 'internal', 'confidential', 'restricted')),

  source_type VARCHAR(30) DEFAULT 'agent_generated',
  source_agent_id UUID REFERENCES agent_registry(id),
  source_artifact_id UUID,

  is_published BOOLEAN DEFAULT FALSE,
  published_scope VARCHAR(20),
  redacted_fields TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kd_kb ON knowledge_documents(knowledge_base_id);
CREATE INDEX idx_kd_category ON knowledge_documents(category);
CREATE INDEX idx_kd_published ON knowledge_documents(is_published, published_scope);
```

### 6.3 knowledge_publications

```sql
CREATE TABLE IF NOT EXISTS knowledge_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id),
  target_scope VARCHAR(20) NOT NULL,

  redacted_content TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'published')),

  requested_by UUID REFERENCES agent_registry(id),
  reviewed_by UUID,
  review_notes TEXT,

  published_kb_id UUID REFERENCES knowledge_bases(id),
  published_doc_id UUID REFERENCES knowledge_documents(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_kp_pending ON knowledge_publications(status)
  WHERE status = 'pending_approval';
```

### 6.4 tool_usage_ledger

```sql
CREATE TABLE IF NOT EXISTS tool_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tool_registry(id),
  agent_id UUID NOT NULL REFERENCES agent_registry(id),
  venture_id UUID REFERENCES ventures(id),

  inputs_hash VARCHAR(64) NOT NULL,
  outputs_hash VARCHAR(64),
  execution_status VARCHAR(20) NOT NULL
    CHECK (execution_status IN ('success', 'failure', 'timeout')),
  error_message TEXT,

  execution_time_ms INT NOT NULL,
  tokens_consumed INT,
  cost_usd NUMERIC(10, 6),

  correlation_id UUID NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_usage_agent ON tool_usage_ledger(agent_id, executed_at DESC);
CREATE INDEX idx_tool_usage_venture ON tool_usage_ledger(venture_id, executed_at DESC);
CREATE INDEX idx_tool_usage_correlation ON tool_usage_ledger(correlation_id);
```

---

## Critical Questions for the Chairman

1. **Are any ventures competitors** and must be "hard walled" (no shared learnings)?

2. **Automatic vs curated sharing?** Should cross-venture learnings publish automatically or require EVA/Chairman approval?

3. **Legal/privacy requirements?** What are the PII, client data, and NDA constraints that must be enforced?

---

## Related Specifications

- [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md) - Tool registry
- [08-governance-policy-engine.md](./08-governance-policy-engine.md) - Access control policies
- [01-database-schema.md](./01-database-schema.md) - Foundation tables
