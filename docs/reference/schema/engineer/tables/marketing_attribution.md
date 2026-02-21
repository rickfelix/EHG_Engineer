# marketing_attribution Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T12:42:25.832Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| content_id | `uuid` | YES | - | - |
| variant_id | `uuid` | YES | - | - |
| campaign_id | `uuid` | YES | - | - |
| platform | `text` | **NO** | - | - |
| utm_source | `text` | YES | - | - |
| utm_medium | `text` | YES | - | - |
| utm_campaign | `text` | YES | - | - |
| utm_content | `text` | YES | - | - |
| event_type | `text` | **NO** | - | - |
| event_value | `jsonb` | YES | `'{}'::jsonb` | - |
| occurred_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `marketing_attribution_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_attribution_campaign_id_fkey`: campaign_id → marketing_campaigns(id)
- `marketing_attribution_content_id_fkey`: content_id → marketing_content(id)
- `marketing_attribution_variant_id_fkey`: variant_id → marketing_content_variants(id)
- `marketing_attribution_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_attribution_content`
  ```sql
  CREATE INDEX idx_attribution_content ON public.marketing_attribution USING btree (content_id)
  ```
- `idx_attribution_event_type`
  ```sql
  CREATE INDEX idx_attribution_event_type ON public.marketing_attribution USING btree (event_type)
  ```
- `idx_attribution_occurred`
  ```sql
  CREATE INDEX idx_attribution_occurred ON public.marketing_attribution USING btree (occurred_at)
  ```
- `idx_attribution_venture`
  ```sql
  CREATE INDEX idx_attribution_venture ON public.marketing_attribution USING btree (venture_id)
  ```
- `marketing_attribution_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_attribution_pkey ON public.marketing_attribution USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_marketing_attribution (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_marketing_attribution (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

---

[← Back to Schema Overview](../database-schema-overview.md)
