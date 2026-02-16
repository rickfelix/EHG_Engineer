# campaign_content Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| campaign_id | `uuid` | **NO** | - | - |
| content_id | `uuid` | **NO** | - | - |
| platform | `text` | **NO** | - | - |
| scheduled_at | `timestamp with time zone` | YES | - | - |
| dispatched_at | `timestamp with time zone` | YES | - | - |
| dispatch_status | `text` | **NO** | `'pending'::text` | - |
| idempotency_key | `text` | YES | - | - |
| external_post_id | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `campaign_content_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `campaign_content_campaign_id_fkey`: campaign_id → marketing_campaigns(id)
- `campaign_content_content_id_fkey`: content_id → marketing_content(id)

### Unique Constraints
- `campaign_content_idempotency_key_key`: UNIQUE (idempotency_key)

## Indexes

- `campaign_content_idempotency_key_key`
  ```sql
  CREATE UNIQUE INDEX campaign_content_idempotency_key_key ON public.campaign_content USING btree (idempotency_key)
  ```
- `campaign_content_pkey`
  ```sql
  CREATE UNIQUE INDEX campaign_content_pkey ON public.campaign_content USING btree (id)
  ```
- `idx_campaign_content_campaign`
  ```sql
  CREATE INDEX idx_campaign_content_campaign ON public.campaign_content USING btree (campaign_id)
  ```
- `idx_campaign_content_content`
  ```sql
  CREATE INDEX idx_campaign_content_content ON public.campaign_content USING btree (content_id)
  ```
- `idx_campaign_content_status`
  ```sql
  CREATE INDEX idx_campaign_content_status ON public.campaign_content USING btree (dispatch_status)
  ```

## RLS Policies

### 1. service_role_all_campaign_content (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_campaign_content (SELECT)

- **Roles**: {authenticated}
- **Using**: `(campaign_id IN ( SELECT marketing_campaigns.id
   FROM marketing_campaigns
  WHERE (marketing_campaigns.venture_id IN ( SELECT ventures.id
           FROM ventures
          WHERE ((auth.uid())::text = (ventures.created_by)::text)))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
