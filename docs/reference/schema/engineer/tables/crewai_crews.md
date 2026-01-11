# crewai_crews Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-11T00:33:39.932Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| crew_name | `text` | YES | - | - |
| process_type | `text` | YES | - | - |
| manager_agent_id | `text` | YES | - | - |
| description | `text` | YES | - | - |
| status | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| verbose | `boolean` | YES | - | - |
| manager_llm | `text` | YES | - | - |
| function_calling_llm | `text` | YES | - | - |
| planning_enabled | `boolean` | YES | - | - |
| planning_llm | `text` | YES | - | - |
| memory_enabled | `boolean` | YES | - | - |
| max_rpm | `integer(32)` | YES | - | - |
| cache_enabled | `boolean` | YES | - | - |
| step_callback_url | `text` | YES | - | - |
| task_callback_url | `text` | YES | - | - |
| output_log_file | `text` | YES | - | - |
| config_file_path | `text` | YES | - | - |
| prompt_file_path | `text` | YES | - | - |
| share_crew | `boolean` | YES | - | - |
| crew_key | `text` | YES | - | - |
| max_cost_usd | `integer(32)` | YES | - | - |
| compatible_stages | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `crewai_crews_pkey`: PRIMARY KEY (id)

## Indexes

- `crewai_crews_pkey`
  ```sql
  CREATE UNIQUE INDEX crewai_crews_pkey ON public.crewai_crews USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_crewai_crews (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_crewai_crews (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
