# EHG_Engineer Database

**Database ID**: `dedlbzhpgkmetvhbkyzq` (Supabase)
**Tables**: 312+
**Schema Documentation**: Auto-generated from database introspection

## Quick Links

| Resource | Description |
|----------|-------------|
| [Schema Overview](../docs/reference/schema/engineer/database-schema-overview.md) | Quick reference for all tables |
| [All Tables (312+)](../docs/reference/schema/engineer/README.md) | Complete table documentation |
| [Migration Guide](migrations/README.md) | How to write and run migrations |
| [Migration Inventory](docs/migration-inventory.md) | All 192+ migration files |
| [Database Agent Patterns](../docs/reference/database-agent-patterns.md) | Best practices for database work |

## Core Domains

| Domain | Key Tables | Description |
|--------|------------|-------------|
| **Strategic Directives** | `strategic_directives_v2`, `sd_phase_handoffs`, `sd_backlog_map` | SD lifecycle and phase management |
| **Product Requirements** | `product_requirements_v2`, `prd_quality_scores` | PRD tracking and quality gates |
| **LEO Protocol** | `leo_protocols`, `leo_sub_agents`, `leo_protocol_sections` | Protocol configuration |
| **Agent System** | `agent_artifacts`, `agent_task_contracts`, `agent_runs` | AI agent coordination |
| **Quality & Retrospectives** | `retrospectives`, `ai_quality_assessments`, `lessons_learned` | Quality gates and learning |
| **Compliance** | `compliance_policies`, `circuit_breaker_blocks` | Governance enforcement |
| **Skills & Patterns** | `skills_inventory`, `skill_assignments`, `failure_patterns` | Skill management |
| **Ventures** | `ventures`, `venture_stages`, `venture_artifacts` | Venture portfolio |

## Database Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                    │
├─────────────────────────────────────────────────────────────┤
│  Database: dedlbzhpgkmetvhbkyzq (CONSOLIDATED)              │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ EHG_Engineer    │  │ EHG App         │                   │
│  │ (LEO Protocol)  │  │ (Portfolio UI)  │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                            │
│           └────────┬───────────┘                            │
│                    ▼                                        │
│           ┌────────────────┐                                │
│           │ Shared Schema  │                                │
│           │ 312+ Tables    │                                │
│           └────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

## Regenerating Schema Documentation

Schema documentation is auto-generated from live database introspection:

```bash
# Regenerate all schema docs
npm run schema:docs:engineer

# Output location: docs/reference/schema/engineer/
```

**When to regenerate:**
- After applying new migrations
- After schema changes
- When documentation appears outdated

## Adding New Tables

### 1. Create Migration File

```bash
# File: database/migrations/YYYYMMDD_description.sql
-- or
# File: supabase/migrations/YYYYMMDDHHMMSS_description.sql
```

### 2. Include Required Elements

```sql
-- 1. Create table
CREATE TABLE IF NOT EXISTS my_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- 3. Add RLS policies
CREATE POLICY "Authenticated users can view"
ON my_table FOR SELECT TO authenticated USING (true);

-- 4. Add indexes
CREATE INDEX idx_my_table_created ON my_table(created_at);

-- 5. Add trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON my_table
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
```

### 3. Apply and Verify

```bash
# Apply migration
supabase db push

# Regenerate docs
npm run schema:docs:engineer
```

## Common Tasks

| Task | Command |
|------|---------|
| View all tables | `npm run schema:docs:engineer` then browse `docs/reference/schema/engineer/` |
| Check migration status | `supabase migration list` |
| Apply pending migrations | `supabase db push` |
| Validate schema | `npm run db:validate` |
| Check RLS coverage | See [database-agent-patterns.md](../docs/reference/database-agent-patterns.md) |

## RLS Policy Patterns

All tables must have Row Level Security enabled. Common patterns:

```sql
-- Pattern 1: Authenticated read, service_role write
CREATE POLICY "authenticated_read" ON table FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write" ON table FOR ALL TO service_role USING (true);

-- Pattern 2: User-owned resources
CREATE POLICY "user_owned" ON table FOR ALL TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- Pattern 3: Organization-scoped
CREATE POLICY "org_scoped" ON table FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
```

## Feature-Specific Documentation

| Feature | Documentation |
|---------|---------------|
| User Stories System | [docs/USER_STORIES_V1.1.md](docs/USER_STORIES_V1.1.md) |
| Migration Consolidation | [docs/MIGRATION_CONSOLIDATION_README.md](docs/MIGRATION_CONSOLIDATION_README.md) |
| Migration Inventory | [docs/migration-inventory.md](docs/migration-inventory.md) |

## Supabase Connection

```bash
# Link to project
supabase link --project-ref dedlbzhpgkmetvhbkyzq

# Check connection
supabase db ping

# Run SQL query
supabase db exec --sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
```

## Environment Variables

```bash
# Required for database access
SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>  # For migrations

# Connection string (for direct access)
DATABASE_URL=postgresql://postgres:<password>@db.dedlbzhpgkmetvhbkyzq.supabase.co:5432/postgres
```

## Related Documentation

- [Database Agent Patterns](../docs/reference/database-agent-patterns.md) - Best practices, anti-patterns, and lessons learned
- [Migration Checklist](../docs/guides/database-migration-checklist.md) - Pre-migration validation steps
- [RLS Policy Guide](../docs/reference/rls-policy-catalog.md) - Security policy reference

---

**Last Updated**: 2026-01-03
**Auto-Generated Schema Docs**: Run `npm run schema:docs:engineer` to regenerate
