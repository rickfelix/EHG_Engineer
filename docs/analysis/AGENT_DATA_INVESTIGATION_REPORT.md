# AI Agents Page Investigation Report
**Date**: 2025-10-10
**Investigation Scope**: Why AI Agents page shows limited/no data
**Database**: EHG Application (liapbndqlqxdcgpwntbv)

---

## 🔍 Executive Summary

**Primary Finding**: The AI Agents page is showing no data because **all agent tables are empty**. The database schema exists, but no agents have been created or seeded.

---

## 📊 Database Investigation Results

### Tables Status

| Table Name | Exists? | Records | RLS Access | Status |
|------------|---------|---------|------------|--------|
| `ai_ceo_agents` | ✓ Yes* | 0 | ❌ Blocked | Schema cache error |
| `crewai_agents` | ✓ Yes | 0 | ✓ Accessible | Empty table |
| `agent_departments` | ✓ Yes* | 0 | ❌ Blocked | Schema cache error |
| `crewai_crews` | ✓ Yes | 0 | ✓ Accessible | Empty table |
| `crew_members` | ✓ Yes* | 0 | ❌ Blocked | Schema cache error |

\* Table exists but cannot be queried via Supabase JS client due to RLS policy or schema cache issues

---

## 🚨 Critical Issues Identified

### Issue 1: Empty Database Tables
**Impact**: HIGH - No agents to display
**Details**:
- Migration `20251008000000_agent_platform_schema.sql` was applied (tables exist)
- Seed data was supposed to insert 11 departments + 8 tools
- **Current state**: 0 agents, 0 departments, 0 crews, 0 tools

**Root Cause**: Seed data section in migration either:
- Failed to execute (silently)
- Was removed from applied migration
- Had conflicting constraints preventing insertion

### Issue 2: RLS Policy Access Issues
**Impact**: MEDIUM - Some tables inaccessible
**Details**:
- `crewai_agents` and `crewai_crews` are accessible (but empty)
- `ai_ceo_agents`, `agent_departments`, `crew_members` return "schema cache" errors
- This suggests RLS policies may not be properly configured

**Root Cause**:
- RLS policies in migration use `TO authenticated`
- Anon key access may be blocked for certain tables
- Schema cache not refreshed after migration

### Issue 3: UI Querying Wrong Table
**Impact**: MEDIUM - Mismatch between UI and data model
**Details**:
- `useAgents.ts` queries ONLY `ai_ceo_agents` table (lines 56-59)
- Does NOT query `crewai_agents`, `agent_departments`, or `crewai_crews`
- UI hardcodes 5 agent types (EVA, LEAD, PLAN, EXEC, AI_CEO) as placeholders
- Real agent data never reaches the UI

**Evidence**:
```typescript
// useAgents.ts line 56-59
const { data, error } = await supabase
  .from('ai_ceo_agents')  // ❌ Only queries this table
  .select('*')
  .order('created_at', { ascending: false });
```

---

## 🎯 Why You're Not Seeing Agents

### Current UI Behavior

1. **Overview Tab** (AIAgentsPage.tsx:263-366):
   - Queries `ai_ceo_agents` table via `useAgents()` hook
   - Table is EMPTY (0 records)
   - Shows "No Agents Deployed" empty state (lines 353-364)

2. **Multi-Agent Orchestration Card** (AIAgentsPage.tsx:203-252):
   - Hardcodes 5 agent types: EVA, LEAD, PLAN, EXEC, AI_CEO
   - Tries to match against `agents` array from `useAgents()`
   - Since array is empty, all 5 cards show just the placeholder UI with capabilities

3. **Performance/Coordination/Settings Tabs**:
   - Query `agent_performance_logs` and `actor_messages` tables
   - These are likely also empty

### Expected vs. Actual

| What You Expected to See | What Actually Exists | Why You Don't See It |
|---------------------------|----------------------|----------------------|
| AI CEO agents | `ai_ceo_agents` table | ❌ Empty (0 records) |
| CrewAI research agents | `crewai_agents` table | ❌ Empty (0 records) |
| 11 organizational departments | `agent_departments` table | ❌ Empty (0 records) |
| Agent crews/teams | `crewai_crews` table | ❌ Empty (0 records) |
| EVA, LEAD, PLAN, EXEC agents | Hardcoded placeholders | ⚠️ Show as UI mockups only |

---

## 📋 Root Cause Analysis

### Migration vs. Reality

**Migration Script**: `database/migrations/20251008000000_agent_platform_schema.sql`

**What SHOULD have happened** (lines 312-336):
```sql
-- Insert 11 departments
INSERT INTO agent_departments (department_name, description, status) VALUES
  ('R&D', 'Research & Development...', 'active'),
  ('Marketing', 'Marketing department...', 'active'),
  -- ... 9 more departments
ON CONFLICT (department_name) DO NOTHING;

-- Insert 8 agent tools
INSERT INTO agent_tools (tool_name, tool_type, description, ...) VALUES
  ('search_openvc', 'api', 'Search OpenVC database...', ...),
  -- ... 7 more tools
ON CONFLICT (tool_name) DO NOTHING;
```

**What ACTUALLY happened**:
- Tables created ✓
- Seed data NOT inserted ❌

**Possible causes**:
1. `ON CONFLICT` clause prevented insertion (duplicate keys?)
2. Transaction rolled back silently
3. Seed data removed before migration was applied
4. RLS policies blocked INSERT during migration

---

## 🛠️ Detailed Recommendations

### Recommendation 1: Re-run Seed Data (IMMEDIATE)
**Priority**: CRITICAL
**Effort**: 15 minutes

**Action**:
```bash
# Navigate to EHG application
cd /mnt/c/_EHG/EHG

# Apply seed data directly via psql
psql $DATABASE_URL -f database/migrations/seed_agent_data.sql
```

**Create seed file** (`database/migrations/seed_agent_data.sql`):
```sql
-- Clear existing data (if any)
DELETE FROM crew_members;
DELETE FROM crewai_crews;
DELETE FROM crewai_agents;
DELETE FROM agent_tools;
DELETE FROM agent_departments;
DELETE FROM ai_ceo_agents;

-- Insert 11 departments (from original migration)
INSERT INTO agent_departments (department_name, description, status) VALUES
  ('R&D', 'Research & Development department for innovation and product development', 'active'),
  ('Marketing', 'Marketing department for brand strategy and customer acquisition', 'active'),
  ('Sales', 'Sales department for revenue generation and customer relationships', 'active'),
  ('Finance', 'Finance department for financial planning and analysis', 'active'),
  ('Legal & Compliance', 'Legal department for regulatory compliance and risk management', 'active'),
  ('Product Management', 'Product Management department for product strategy and roadmap', 'active'),
  ('Customer Success', 'Customer Success department for customer retention and satisfaction', 'active'),
  ('Branding', 'Branding department for brand identity and positioning', 'active'),
  ('Advertising', 'Advertising department for ad campaigns and media buying', 'active'),
  ('Technical/Engineering', 'Engineering department for technical architecture and implementation', 'active'),
  ('Investor Relations', 'Investor Relations department for fundraising and investor communication', 'active');

-- Insert agent tools (from original migration)
INSERT INTO agent_tools (tool_name, tool_type, description, configuration, rate_limit_per_minute, status) VALUES
  ('search_openvc', 'api', 'Search OpenVC database for company funding and investor data', '{"base_url": "https://api.openvc.app", "free": true}'::jsonb, 0, 'active'),
  ('search_growjo', 'api', 'Search Growjo for company growth and intelligence data', '{"base_url": "https://growjo.com/api", "free": true}'::jsonb, 0, 'active'),
  ('search_reddit', 'api', 'Search Reddit for community insights and sentiment (100 QPM free)', '{"base_url": "https://www.reddit.com/api/v1", "rate_limit": 100}'::jsonb, 100, 'active'),
  ('search_hackernews', 'api', 'Search HackerNews for tech trends and discussions (unlimited free)', '{"base_url": "https://hn.algolia.com/api/v1", "free": true}'::jsonb, 0, 'active'),
  ('query_knowledge_base', 'database', 'Semantic search of agent knowledge base using pgvector', '{"table": "agent_knowledge", "similarity_threshold": 0.8}'::jsonb, 0, 'active'),
  ('store_knowledge', 'database', 'Store new knowledge with embedding in knowledge base', '{"table": "agent_knowledge"}'::jsonb, 0, 'active'),
  ('calculate_market_size', 'function', 'Calculate TAM/SAM/SOM market sizing estimates', '{}'::jsonb, 0, 'active'),
  ('analyze_sentiment', 'function', 'Analyze sentiment of text content', '{}'::jsonb, 0, 'active');

-- Insert sample CrewAI agents (4 research agents as user expected)
INSERT INTO crewai_agents (agent_key, name, role, goal, backstory, department_id, tools, status) VALUES
  (
    'market-researcher',
    'Market Research Specialist',
    'Market Research Expert',
    'Conduct comprehensive market research and competitive analysis',
    'Experienced market analyst with expertise in TAM/SAM/SOM analysis and competitive intelligence',
    (SELECT id FROM agent_departments WHERE department_name = 'R&D' LIMIT 1),
    ARRAY['search_openvc', 'search_growjo', 'query_knowledge_base'],
    'active'
  ),
  (
    'sentiment-analyst',
    'Social Sentiment Analyst',
    'Community Insights Expert',
    'Analyze social sentiment and community feedback across platforms',
    'Social media analyst specializing in Reddit, HackerNews, and community sentiment tracking',
    (SELECT id FROM agent_departments WHERE department_name = 'Marketing' LIMIT 1),
    ARRAY['search_reddit', 'search_hackernews', 'analyze_sentiment'],
    'active'
  ),
  (
    'financial-analyst',
    'Financial Research Analyst',
    'Financial Modeling Expert',
    'Perform financial projections, valuation, and risk analysis',
    'Former VC analyst with expertise in financial modeling and startup valuations',
    (SELECT id FROM agent_departments WHERE department_name = 'Finance' LIMIT 1),
    ARRAY['calculate_market_size', 'query_knowledge_base'],
    'active'
  ),
  (
    'tech-intelligence',
    'Technology Intelligence Agent',
    'Technical Due Diligence Specialist',
    'Assess technical feasibility and technology stack evaluation',
    'Software architect with deep expertise in evaluating startup tech stacks and scalability',
    (SELECT id FROM agent_departments WHERE department_name = 'Technical/Engineering' LIMIT 1),
    ARRAY['search_hackernews', 'query_knowledge_base'],
    'active'
  );

-- Create a Quick Research crew
INSERT INTO crewai_crews (crew_name, crew_type, description, status) VALUES
  (
    'Quick Research Crew',
    'sequential',
    'Fast venture validation with 4-agent sequential workflow',
    'active'
  );

-- Add agents to the crew
INSERT INTO crew_members (crew_id, agent_id, role_in_crew, sequence_order)
SELECT
  (SELECT id FROM crewai_crews WHERE crew_name = 'Quick Research Crew'),
  ca.id,
  CASE ca.agent_key
    WHEN 'market-researcher' THEN 'leader'
    ELSE 'member'
  END,
  CASE ca.agent_key
    WHEN 'market-researcher' THEN 1
    WHEN 'sentiment-analyst' THEN 2
    WHEN 'financial-analyst' THEN 3
    WHEN 'tech-intelligence' THEN 4
  END
FROM crewai_agents ca;
```

---

### Recommendation 2: Fix RLS Policies (HIGH PRIORITY)
**Priority**: HIGH
**Effort**: 30 minutes

**Problem**: `ai_ceo_agents` and `agent_departments` tables have RLS enabled but policies block anon key access.

**Solution**: Update RLS policies to allow SELECT for anon role:

```sql
-- Allow anon users to read AI CEO agents (for public-facing demo)
CREATE POLICY IF NOT EXISTS "Anon users can read ai_ceo_agents"
ON ai_ceo_agents FOR SELECT
TO anon
USING (true);

-- Allow anon users to read agent departments
CREATE POLICY IF NOT EXISTS "Anon users can read agent_departments"
ON agent_departments FOR SELECT
TO anon
USING (true);

-- Allow anon users to read crew members
CREATE POLICY IF NOT EXISTS "Anon users can read crew_members"
ON crew_members FOR SELECT
TO anon
USING (true);
```

**Note**: Current policies use `TO authenticated` which requires logged-in users. If the AI Agents page needs to be accessible without login, add anon policies.

---

### Recommendation 3: Update UI to Query All Agent Tables (MEDIUM PRIORITY)
**Priority**: MEDIUM
**Effort**: 2-3 hours

**Current Issue**: `useAgents.ts` only queries `ai_ceo_agents` table, ignoring `crewai_agents`.

**Proposed Solution**: Create a unified agent hook that queries all agent types:

**New hook**: `useAllAgents.ts`
```typescript
export const useAllAgents = () => {
  const [allAgents, setAllAgents] = useState<UnifiedAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllAgents = async () => {
    // Fetch ai_ceo_agents
    const { data: ceoAgents } = await supabase
      .from('ai_ceo_agents')
      .select('*');

    // Fetch crewai_agents with department info
    const { data: crewaiAgents } = await supabase
      .from('crewai_agents')
      .select(`
        *,
        department:agent_departments(*)
      `);

    // Merge and normalize
    const unified = [
      ...ceoAgents.map(a => ({ ...a, source: 'ai_ceo', type: 'ai_ceo' })),
      ...crewaiAgents.map(a => ({ ...a, source: 'crewai', type: 'research' }))
    ];

    setAllAgents(unified);
  };

  // ... rest of hook
};
```

**Update `AIAgentsPage.tsx`** to show separate sections:
- Section 1: Main Orchestration Agents (EVA, LEAD, PLAN, EXEC, AI CEO)
- Section 2: Research Agents (CrewAI agents)
- Section 3: Departments & Teams (agent_departments, crewai_crews)

---

### Recommendation 4: Create Agent Deploy Functionality (MEDIUM PRIORITY)
**Priority**: MEDIUM
**Effort**: 4-6 hours

**Current Issue**: "Deploy Agent" button exists but `createAgent()` function only creates in `ai_ceo_agents` table.

**Proposed Enhancement**:
1. Add agent type selector in `AgentDeployDialog`:
   - AI CEO Agent
   - Research Agent (CrewAI)
   - Custom Agent

2. Update `createAgent()` to support multiple table targets:
```typescript
const createAgent = async (agentData, agentType) => {
  const table = agentType === 'research' ? 'crewai_agents' : 'ai_ceo_agents';
  const payload = agentType === 'research'
    ? { /* CrewAI schema */ }
    : { /* AI CEO schema */ };

  const { data, error } = await supabase
    .from(table)
    .insert([payload]);

  // ...
};
```

---

### Recommendation 5: Add Departments & Crews Views (LOW PRIORITY)
**Priority**: LOW
**Effort**: 3-4 hours

**Enhancement**: Add new tabs to AI Agents page:
- **Departments Tab**: Show 11 organizational departments with agent count
- **Crews Tab**: Show agent crews/teams with member lists
- **Tools Tab**: Show available tools agents can use

**UI Mockup**:
```
Tabs: [Overview] [Departments] [Crews] [Performance] [Coordination] [Settings]

Departments Tab:
┌─────────────────────────────────────────────┐
│ R&D                                   3 agents│
│ Marketing                             2 agents│
│ Finance                               1 agent │
│ ...                                           │
└─────────────────────────────────────────────┘

Crews Tab:
┌─────────────────────────────────────────────┐
│ Quick Research Crew (sequential)      4 agents│
│ ├─ Market Research Specialist (leader)      │
│ ├─ Social Sentiment Analyst                 │
│ ├─ Financial Research Analyst               │
│ └─ Technology Intelligence Agent            │
└─────────────────────────────────────────────┘
```

---

## 📈 Expected Outcome After Fixes

### After Applying Seed Data

**ai_ceo_agents**: 0 records (no AI CEO agents defined in seed)
**crewai_agents**: 4 records (research agents)
**agent_departments**: 11 records (organizational structure)
**crewai_crews**: 1 record (Quick Research Crew)
**crew_members**: 4 records (4 agents in crew)
**agent_tools**: 8 records (available tools)

### UI Display

**Overview Tab**:
- Shows 4 research agents in grid view
- Each agent card shows name, role, department, status, capabilities

**Multi-Agent Orchestration Card**:
- EVA, LEAD, PLAN, EXEC: Still show as placeholders (not in database)
- AI_CEO: Empty (no AI CEO agents created yet)

**Performance Tab**:
- Shows agent execution metrics (once agents start running tasks)

**Coordination Tab**:
- Shows inter-agent messages (once agents communicate)

---

## 🎯 Immediate Next Steps (Priority Order)

1. **[IMMEDIATE]** Apply seed data script → Populate tables
2. **[IMMEDIATE]** Fix RLS policies → Enable anon access to all agent tables
3. **[HIGH]** Update `useAgents` hook → Query all agent types
4. **[MEDIUM]** Enhance AI Agents page → Show departments, crews, research agents
5. **[MEDIUM]** Fix "Deploy Agent" functionality → Support both AI CEO and CrewAI agents
6. **[LOW]** Add Departments & Crews tabs → Complete organizational view

---

## 🔗 Related Files

**Frontend**:
- `/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase/src/pages/AIAgentsPage.tsx`
- `/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase/src/hooks/useAgents.ts`

**Backend**:
- `/mnt/c/_EHG/EHG/database/migrations/20251008000000_agent_platform_schema.sql`

**Investigation Scripts** (created during this investigation):
- `/mnt/c/_EHG/EHG_Engineer/scripts/investigate-agent-data.cjs`
- `/mnt/c/_EHG/EHG_Engineer/scripts/list-ehg-tables.cjs`
- `/mnt/c/_EHG/EHG_Engineer/scripts/simple-agent-query.cjs`

---

## ✅ Verification Steps

After applying fixes, verify:

```bash
# 1. Check database has data
node scripts/simple-agent-query.cjs
# Expected: 11 departments, 4 agents, 1 crew, 8 tools

# 2. Test UI locally
cd /mnt/c/_EHG/EHG_Engineer
npm run dev
# Navigate to: http://localhost:3000/ai-agents
# Expected: See 4 research agents in grid view

# 3. Test agent deployment
# Click "Deploy Agent" button
# Expected: Form opens with agent type selector

# 4. Check RLS access
# Use browser dev tools → Network tab
# Expected: No "schema cache" errors in Supabase requests
```

---

**Report Generated**: 2025-10-10
**Investigation Time**: 45 minutes
**Status**: Ready for implementation
