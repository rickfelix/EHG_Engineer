# leo_subagent_handoffs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T03:53:19.552Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| from_agent | `text` | **NO** | - | - |
| to_agent | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| prd_id | `text` | YES | - | - |
| phase | `text` | YES | - | - |
| summary | `jsonb` | **NO** | - | - |
| critical_flags | `ARRAY` | YES | - | - |
| warnings | `ARRAY` | YES | - | - |
| recommendations | `ARRAY` | YES | - | - |
| confidence_score | `double precision(53)` | YES | - | - |
| execution_time_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| expires_at | `timestamp without time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_subagent_handoffs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_subagent_handoffs_prd_id_fkey`: prd_id → product_requirements_v2(id)
- `leo_subagent_handoffs_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `leo_subagent_handoffs_confidence_score_check`: CHECK (((confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision)))

## Indexes

- `idx_handoffs_created_at`
  ```sql
  CREATE INDEX idx_handoffs_created_at ON public.leo_subagent_handoffs USING btree (created_at)
  ```
- `idx_handoffs_from_agent`
  ```sql
  CREATE INDEX idx_handoffs_from_agent ON public.leo_subagent_handoffs USING btree (from_agent)
  ```
- `idx_handoffs_prd_id`
  ```sql
  CREATE INDEX idx_handoffs_prd_id ON public.leo_subagent_handoffs USING btree (prd_id)
  ```
- `idx_handoffs_sd_id`
  ```sql
  CREATE INDEX idx_handoffs_sd_id ON public.leo_subagent_handoffs USING btree (sd_id)
  ```
- `idx_handoffs_to_agent`
  ```sql
  CREATE INDEX idx_handoffs_to_agent ON public.leo_subagent_handoffs USING btree (to_agent)
  ```
- `leo_subagent_handoffs_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_subagent_handoffs_pkey ON public.leo_subagent_handoffs USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_subagent_handoffs (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_subagent_handoffs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
