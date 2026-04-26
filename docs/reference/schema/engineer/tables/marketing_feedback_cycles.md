# marketing_feedback_cycles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T21:16:02.093Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| content_id | `uuid` | YES | - | - |
| cycle_type | `text` | **NO** | - | - |
| signal_payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'open'::text` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| closed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `marketing_feedback_cycles_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_feedback_cycles_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `marketing_feedback_cycles_cycle_type_check`: CHECK ((cycle_type = ANY (ARRAY['engagement'::text, 'reply'::text, 'conversion'::text, 'unsubscribe'::text])))
- `marketing_feedback_cycles_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))

## Indexes

- `idx_marketing_feedback_cycles_status`
  ```sql
  CREATE INDEX idx_marketing_feedback_cycles_status ON public.marketing_feedback_cycles USING btree (status, created_at DESC) WHERE (status = 'open'::text)
  ```
- `idx_marketing_feedback_cycles_venture_content`
  ```sql
  CREATE INDEX idx_marketing_feedback_cycles_venture_content ON public.marketing_feedback_cycles USING btree (venture_id, content_id, created_at DESC)
  ```
- `marketing_feedback_cycles_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_feedback_cycles_pkey ON public.marketing_feedback_cycles USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_marketing_feedback_cycles (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_marketing_feedback_cycles (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

---

[← Back to Schema Overview](../database-schema-overview.md)
