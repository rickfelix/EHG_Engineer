# distribution_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-19T16:40:59.907Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| queue_item_id | `uuid` | YES | - | - |
| channel_id | `uuid` | YES | - | - |
| content_title | `character varying(255)` | YES | - | - |
| content_snippet | `text` | YES | - | - |
| platform | `character varying(50)` | **NO** | - | - |
| status | `character varying(30)` | **NO** | `'pending'::character varying` | - |
| tracking_url | `text` | YES | - | - |
| utm_source | `character varying(50)` | YES | - | - |
| utm_medium | `character varying(50)` | YES | - | - |
| utm_campaign | `character varying(100)` | YES | - | - |
| utm_content | `character varying(100)` | YES | - | - |
| scheduled_at | `timestamp with time zone` | YES | - | - |
| posted_at | `timestamp with time zone` | YES | - | - |
| clicks | `integer(32)` | YES | `0` | - |
| impressions | `integer(32)` | YES | `0` | - |
| engagement_rate | `numeric(5,2)` | YES | `0` | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| posted_by | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `distribution_history_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `distribution_history_channel_id_fkey`: channel_id → distribution_channels(id)
- `distribution_history_posted_by_fkey`: posted_by → users(id)
- `distribution_history_queue_item_id_fkey`: queue_item_id → marketing_content_queue(id)
- `distribution_history_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `distribution_history_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'posted'::character varying, 'scheduled'::character varying, 'failed'::character varying, 'deleted'::character varying])::text[])))

## Indexes

- `distribution_history_pkey`
  ```sql
  CREATE UNIQUE INDEX distribution_history_pkey ON public.distribution_history USING btree (id)
  ```
- `idx_dh_platform`
  ```sql
  CREATE INDEX idx_dh_platform ON public.distribution_history USING btree (platform)
  ```
- `idx_dh_posted_at`
  ```sql
  CREATE INDEX idx_dh_posted_at ON public.distribution_history USING btree (posted_at) WHERE (posted_at IS NOT NULL)
  ```
- `idx_dh_venture`
  ```sql
  CREATE INDEX idx_dh_venture ON public.distribution_history USING btree (venture_id)
  ```

## RLS Policies

### 1. dh_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. dh_venture_access (ALL)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
