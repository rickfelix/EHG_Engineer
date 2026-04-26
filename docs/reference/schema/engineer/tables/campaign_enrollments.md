# campaign_enrollments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T19:15:46.299Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lead_email | `text` | **NO** | - | - |
| campaign_id | `text` | **NO** | - | - |
| current_step | `integer(32)` | **NO** | `0` | - |
| opened_previous | `boolean` | **NO** | `false` | - |
| next_step_at | `timestamp with time zone` | YES | - | - |
| status | `text` | **NO** | `'active'::text` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `campaign_enrollments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `campaign_enrollments_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `campaign_enrollments_venture_id_lead_email_campaign_id_key`: UNIQUE (venture_id, lead_email, campaign_id)

### Check Constraints
- `campaign_enrollments_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'unsubscribed'::text])))

## Indexes

- `campaign_enrollments_pkey`
  ```sql
  CREATE UNIQUE INDEX campaign_enrollments_pkey ON public.campaign_enrollments USING btree (id)
  ```
- `campaign_enrollments_venture_id_lead_email_campaign_id_key`
  ```sql
  CREATE UNIQUE INDEX campaign_enrollments_venture_id_lead_email_campaign_id_key ON public.campaign_enrollments USING btree (venture_id, lead_email, campaign_id)
  ```
- `idx_campaign_enrollments_email`
  ```sql
  CREATE INDEX idx_campaign_enrollments_email ON public.campaign_enrollments USING btree (lead_email)
  ```
- `idx_campaign_enrollments_next_step`
  ```sql
  CREATE INDEX idx_campaign_enrollments_next_step ON public.campaign_enrollments USING btree (status, next_step_at) WHERE (status = 'active'::text)
  ```
- `idx_campaign_enrollments_venture`
  ```sql
  CREATE INDEX idx_campaign_enrollments_venture ON public.campaign_enrollments USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_all_campaign_enrollments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_campaign_enrollments (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

---

[← Back to Schema Overview](../database-schema-overview.md)
