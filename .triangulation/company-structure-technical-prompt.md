# Triangulation Prompt: Technical/Schema Focus

## Instructions

**Send to**: A different AI than the first prompt (or same AI in new session)
**Focus**: Data modeling and implementation specifics

---

## PROMPT TO SEND (Copy below this line)

---

# Schema Design Review: Agent Performance and Organizational Structure

## Background

I have an existing PostgreSQL database with these relevant tables:

```sql
-- Existing: Sub-agent definitions
CREATE TABLE leo_sub_agents (
  id UUID PRIMARY KEY,
  name VARCHAR(100) UNIQUE,
  code VARCHAR(50) UNIQUE,  -- e.g., 'SECURITY', 'TESTING', 'DATABASE'
  description TEXT,
  capabilities JSONB,        -- e.g., ["rls", "auth", "encryption"]
  activation_type VARCHAR(20), -- 'automatic', 'manual', 'conditional'
  priority INTEGER,
  active BOOLEAN DEFAULT true
);

-- Existing: Execution results (populated, ~1000+ rows)
CREATE TABLE sub_agent_execution_results (
  id UUID PRIMARY KEY,
  sd_id VARCHAR(100),        -- Work item ID
  sub_agent_code VARCHAR(50),
  verdict VARCHAR(20),       -- 'PASS', 'FAIL', 'BLOCKED', 'WARNING'
  confidence INTEGER,        -- 0-100
  execution_time INTEGER,    -- seconds
  critical_issues JSONB,
  recommendations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Existing: Performance metrics (schema only, not populated)
CREATE TABLE agent_performance_metrics (
  id UUID PRIMARY KEY,
  agent_code VARCHAR(50),
  measurement_date DATE,
  total_executions INTEGER,
  successful_executions INTEGER,
  failed_executions INTEGER,
  avg_execution_time DECIMAL,
  positive_feedback INTEGER,
  negative_feedback INTEGER,
  UNIQUE(agent_code, measurement_date)
);

-- Existing: Hierarchical agent registry (schema only, 2 rows: Chairman, EVA)
CREATE TABLE agent_registry (
  id UUID PRIMARY KEY,
  agent_type VARCHAR(50),    -- 'chairman', 'eva', 'venture_ceo', 'executive', 'crew'
  agent_role VARCHAR(100),
  display_name VARCHAR(255),
  parent_agent_id UUID REFERENCES agent_registry(id),
  hierarchy_level SMALLINT,  -- 1-5
  hierarchy_path LTREE,      -- PostgreSQL LTREE for path queries
  capabilities TEXT[],
  token_budget BIGINT,
  status VARCHAR(20) DEFAULT 'active'
);

-- Existing: Keyword triggers (populated)
CREATE TABLE leo_sub_agent_triggers (
  id UUID PRIMARY KEY,
  sub_agent_id UUID REFERENCES leo_sub_agents(id),
  trigger_phrase VARCHAR(500),
  trigger_type VARCHAR(20),  -- 'keyword', 'pattern', 'condition'
  priority INTEGER,
  active BOOLEAN DEFAULT true
);
```

## Current Routing Logic

```javascript
// Simplified current implementation
async function selectSubAgent(userInput) {
  const triggers = await db.query(`
    SELECT sa.* FROM leo_sub_agents sa
    JOIN leo_sub_agent_triggers t ON t.sub_agent_id = sa.id
    WHERE $1 ILIKE '%' || t.trigger_phrase || '%'
      AND sa.active = true
    ORDER BY t.priority DESC
    LIMIT 1
  `, [userInput]);
  return triggers[0];
}
```

## Goals

1. **Group sub-agents into "departments"** (e.g., QA, Security, Infrastructure)
2. **Compute and use performance metrics** for routing decisions
3. **Support capability-based matching** (not just keywords)
4. **Track "employee-like" KPIs**: accuracy, speed, rework rate
5. **Enable future promotion/demotion logic** based on performance

## Questions

1. **Schema Extension**: What's the minimal change to add department grouping?
   - Add column to `leo_sub_agents`?
   - Create separate `departments` table with FK?
   - Use `agent_registry` (which already has hierarchy)?

2. **KPI Computation**: Given `sub_agent_execution_results` has real data, how would you compute:
   - Accuracy score (successful / total)
   - Speed percentile (relative to peers)
   - Rework rate (re-executions on same SD)

   Materialized view? Trigger-based updates? Scheduled job?

3. **Routing Enhancement**: To add capability + performance routing, would you:
   - Modify the existing query?
   - Create a scoring function?
   - Build a separate routing service?

4. **Avoiding Pitfalls**: What schema anti-patterns should I watch for?
   - Denormalization risks?
   - Index considerations?
   - JSONB vs normalized columns for capabilities?

5. **Migration Safety**: How to add this without breaking existing keyword routing?

## Constraints

- PostgreSQL 15 (Supabase hosted)
- Must remain backward compatible with existing code
- Prefer additive changes over modifications
- Performance matters (routing happens on every sub-agent invocation)

## Output Format

1. **Recommended Schema Changes** (SQL DDL)
2. **KPI Computation Approach** (with tradeoffs)
3. **Updated Routing Query** (pseudocode or SQL)
4. **Migration Steps** (ordered)
5. **What NOT to Do** (anti-patterns)

---

## END OF PROMPT

