# marketing_content_queue Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T13:43:51.883Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| content_id | `uuid` | YES | - | - |
| title | `character varying(255)` | **NO** | - | - |
| content_body | `text` | **NO** | - | - |
| content_type | `character varying(50)` | YES | - | - |
| target_channels | `ARRAY` | YES | `'{}'::uuid[]` | - |
| status | `character varying(30)` | **NO** | `'pending_review'::character varying` | - |
| reviewed_by | `uuid` | YES | - | - |
| reviewed_at | `timestamp with time zone` | YES | - | - |
| review_notes | `text` | YES | - | - |
| scheduled_for | `timestamp with time zone` | YES | - | - |
| utm_campaign | `character varying(100)` | YES | - | - |
| utm_content | `character varying(100)` | YES | - | - |
| priority | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `marketing_content_queue_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_content_queue_created_by_fkey`: created_by → users(id)
- `marketing_content_queue_reviewed_by_fkey`: reviewed_by → users(id)
- `marketing_content_queue_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `marketing_content_queue_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending_review'::character varying, 'in_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'scheduled'::character varying, 'ready_to_post'::character varying, 'posted'::character varying, 'failed'::character varying])::text[])))

## Indexes

- `idx_mcq_scheduled`
  ```sql
  CREATE INDEX idx_mcq_scheduled ON public.marketing_content_queue USING btree (scheduled_for) WHERE (scheduled_for IS NOT NULL)
  ```
- `idx_mcq_status`
  ```sql
  CREATE INDEX idx_mcq_status ON public.marketing_content_queue USING btree (status)
  ```
- `idx_mcq_venture`
  ```sql
  CREATE INDEX idx_mcq_venture ON public.marketing_content_queue USING btree (venture_id)
  ```
- `marketing_content_queue_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_content_queue_pkey ON public.marketing_content_queue USING btree (id)
  ```

## RLS Policies

### 1. mcq_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. mcq_venture_access (ALL)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
