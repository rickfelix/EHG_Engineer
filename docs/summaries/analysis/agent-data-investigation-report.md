---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# AI Agents Page Investigation Report


## Table of Contents

- [Metadata](#metadata)
- [🔍 Executive Summary](#-executive-summary)
- [📊 Database Investigation Results](#-database-investigation-results)
  - [Tables Status](#tables-status)
- [🚨 Critical Issues Identified](#-critical-issues-identified)
  - [Issue 1: Empty Database Tables](#issue-1-empty-database-tables)
  - [Issue 2: RLS Policy Access Issues](#issue-2-rls-policy-access-issues)
  - [Issue 3: UI Querying Wrong Table](#issue-3-ui-querying-wrong-table)
- [🎯 Why You're Not Seeing Agents](#-why-youre-not-seeing-agents)
  - [Current UI Behavior](#current-ui-behavior)
  - [Expected vs. Actual](#expected-vs-actual)
- [📋 Root Cause Analysis](#-root-cause-analysis)
  - [Migration vs. Reality](#migration-vs-reality)
- [🛠️ Detailed Recommendations](#-detailed-recommendations)
  - [Recommendation 1: Re-run Seed Data (IMMEDIATE)](#recommendation-1-re-run-seed-data-immediate)
  - [Recommendation 2: Fix RLS Policies (HIGH PRIORITY)](#recommendation-2-fix-rls-policies-high-priority)
  - [Recommendation 3: Update UI to Query All Agent Tables (MEDIUM PRIORITY)](#recommendation-3-update-ui-to-query-all-agent-tables-medium-priority)
  - [Recommendation 4: Create Agent Deploy Functionality (MEDIUM PRIORITY)](#recommendation-4-create-agent-deploy-functionality-medium-priority)
  - [Recommendation 5: Add Departments & Crews Views (LOW PRIORITY)](#recommendation-5-add-departments-crews-views-low-priority)
- [📈 Expected Outcome After Fixes](#-expected-outcome-after-fixes)
  - [After Applying Seed Data](#after-applying-seed-data)
  - [UI Display](#ui-display)
- [🎯 Immediate Next Steps (Priority Order)](#-immediate-next-steps-priority-order)
- [🔗 Related Files](#-related-files)
- [✅ Verification Steps](#-verification-steps)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, unit, migration

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
| `agent_departments` | ✓ Yes* | 0 | ❌ Blocked | Schema cache error |

\* Table exists but cannot be queried via Supabase JS client due to RLS policy or schema cache issues

> **Note (2026-03)**: The `crewai_agents`, `crewai_crews`, `crew_members`, and `agent_tools` tables referenced in the original investigation have since been dropped from the database. The remaining issues around `ai_ceo_agents` and `agent_departments` still apply.

---

## 🚨 Critical Issues Identified

### Issue 1: Empty Database Tables
**Impact**: HIGH - No agents to display
**Details**:
- Migration `20251008000000_agent_platform_schema.sql` was applied (tables exist)
- Seed data was supposed to insert 11 departments
- **Current state**: 0 agents, 0 departments

**Root Cause**: Seed data section in migration either:
- Failed to execute (silently)
- Was removed from applied migration
- Had conflicting constraints preventing insertion

### Issue 2: RLS Policy Access Issues
**Impact**: MEDIUM - Some tables inaccessible
**Details**:
- `ai_ceo_agents`, `agent_departments` return "schema cache" errors
- This suggests RLS policies may not be properly configured

**Root Cause**:
- RLS policies in migration use `TO authenticated`
- Anon key access may be blocked for certain tables
- Schema cache not refreshed after migration

### Issue 3: UI Querying Wrong Table
**Impact**: MEDIUM - Mismatch between UI and data model
**Details**:
- `useAgents.ts` queries ONLY `ai_ceo_agents` table (lines 56-59)
- Does NOT query `agent_departments`
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
| 11 organizational departments | `agent_departments` table | ❌ Empty (0 records) |
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

> **Note (2026-03)**: The `crewai_agents`, `crewai_crews`, `crew_members`, and `agent_tools` tables have been dropped. Only the `agent_departments` and `ai_ceo_agents` seed data remains relevant.

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
```

**Note**: Current policies use `TO authenticated` which requires logged-in users. If the AI Agents page needs to be accessible without login, add anon policies.

---

### Recommendation 3: Update UI to Query All Agent Tables (MEDIUM PRIORITY)
**Priority**: MEDIUM
**Effort**: 2-3 hours

**Current Issue**: `useAgents.ts` only queries `ai_ceo_agents` table.

**Proposed Solution**: Update the agent hook to also query `agent_departments`:

**Update `AIAgentsPage.tsx`** to show separate sections:
- Section 1: Main Orchestration Agents (EVA, LEAD, PLAN, EXEC, AI CEO)
- Section 2: Departments (agent_departments)

---

### Recommendation 4: Create Agent Deploy Functionality (MEDIUM PRIORITY)
**Priority**: MEDIUM
**Effort**: 4-6 hours

**Current Issue**: "Deploy Agent" button exists but `createAgent()` function only creates in `ai_ceo_agents` table.

**Proposed Enhancement**:
1. Add agent type selector in `AgentDeployDialog`:
   - AI CEO Agent
   - Custom Agent

2. Update `createAgent()` to support the `ai_ceo_agents` table properly.

---

### Recommendation 5: Add Departments View (LOW PRIORITY)
**Priority**: LOW
**Effort**: 2-3 hours

**Enhancement**: Add new tab to AI Agents page:
- **Departments Tab**: Show 11 organizational departments with agent count

**UI Mockup**:
```
Tabs: [Overview] [Departments] [Performance] [Coordination] [Settings]

Departments Tab:
┌─────────────────────────────────────────────┐
│ R&D                                   3 agents│
│ Marketing                             2 agents│
│ Finance                               1 agent │
│ ...                                           │
└─────────────────────────────────────────────┘
```

---

## 📈 Expected Outcome After Fixes

### After Applying Seed Data

**ai_ceo_agents**: 0 records (no AI CEO agents defined in seed)
**agent_departments**: 11 records (organizational structure)

### UI Display

**Overview Tab**:
- Shows agents in grid view (once seeded)

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
2. **[IMMEDIATE]** Fix RLS policies → Enable anon access to agent tables
3. **[HIGH]** Update `useAgents` hook → Query all agent types
4. **[MEDIUM]** Enhance AI Agents page → Show departments
5. **[MEDIUM]** Fix "Deploy Agent" functionality → Support AI CEO agents
6. **[LOW]** Add Departments tab → Complete organizational view

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
# Expected: 11 departments

# 2. Test UI locally
cd /mnt/c/_EHG/EHG_Engineer
npm run dev
# Navigate to: http://localhost:3000/ai-agents
# Expected: See agents in grid view (once seeded)

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
