# learning_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T12:42:25.832Z
**Rows**: 111
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| command_mode | `text` | **NO** | - | - |
| sd_id | `text` | YES | - | - |
| surfaced_patterns | `jsonb` | YES | `'[]'::jsonb` | - |
| surfaced_lessons | `jsonb` | YES | `'[]'::jsonb` | - |
| surfaced_improvements | `jsonb` | YES | `'[]'::jsonb` | - |
| user_decisions | `jsonb` | YES | `'{}'::jsonb` | - |
| rejection_feedback | `jsonb` | YES | `'{}'::jsonb` | - |
| improvements_applied | `jsonb` | YES | `'[]'::jsonb` | - |
| execution_log | `jsonb` | YES | `'[]'::jsonb` | - |
| rollback_payload | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `text` | YES | `'PENDING'::text` | - |
| confidence_score | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| sd_created_id | `character varying(50)` | YES | - | SD created as a result of this learning decision. NULL if no SD was created. |

## Constraints

### Primary Key
- `learning_decisions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `learning_decisions_sd_created_id_fkey`: sd_created_id → strategic_directives_v2(id)
- `learning_decisions_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_learning_decisions_sd_id`
  ```sql
  CREATE INDEX idx_learning_decisions_sd_id ON public.learning_decisions USING btree (sd_id)
  ```
- `idx_learning_decisions_status`
  ```sql
  CREATE INDEX idx_learning_decisions_status ON public.learning_decisions USING btree (status)
  ```
- `learning_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX learning_decisions_pkey ON public.learning_decisions USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_learning_decisions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
