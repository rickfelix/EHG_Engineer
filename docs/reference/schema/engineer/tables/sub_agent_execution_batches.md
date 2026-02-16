# sub_agent_execution_batches Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| strategic_directive_id | `text` | **NO** | - | - |
| prd_id | `text` | YES | - | - |
| batch_mode | `text` | **NO** | - | - |
| total_agents | `integer(32)` | **NO** | - | - |
| completed_agents | `integer(32)` | YES | `0` | - |
| failed_agents | `integer(32)` | YES | `0` | - |
| status | `text` | **NO** | - | - |
| aggregated_results | `jsonb` | YES | `'{}'::jsonb` | - |
| confidence_score | `integer(32)` | YES | - | - |
| final_verdict | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| performance_metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sub_agent_execution_batches_pkey`: PRIMARY KEY (id)

## Indexes

- `sub_agent_execution_batches_pkey`
  ```sql
  CREATE UNIQUE INDEX sub_agent_execution_batches_pkey ON public.sub_agent_execution_batches USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sub_agent_execution_batches (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sub_agent_execution_batches (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
