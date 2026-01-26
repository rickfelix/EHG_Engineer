# research_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:26:11.529Z
**Rows**: 101
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| session_type | `text` | YES | - | - |
| status | `text` | YES | - | - |
| progress | `integer(32)` | YES | - | - |
| crew_id | `text` | YES | - | - |
| scope | `text` | YES | - | - |
| priority | `text` | YES | - | - |
| estimated_completion | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `text` | YES | - | - |
| results_summary | `jsonb` | YES | - | - |
| error_message | `text` | YES | - | - |
| total_cost_usd | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| progress_message | `text` | YES | - | - |
| user_context | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `research_sessions_pkey`: PRIMARY KEY (id)

## Indexes

- `research_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX research_sessions_pkey ON public.research_sessions USING btree (id)
  ```

## RLS Policies

### 1. authenticated_all_research_sessions (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. service_role_all_research_sessions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_research_sessions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
