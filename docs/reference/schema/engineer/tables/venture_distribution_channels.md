# venture_distribution_channels Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| channel_id | `uuid` | **NO** | - | - |
| is_organic | `boolean` | **NO** | `true` | - |
| budget_usd | `numeric(12,2)` | **NO** | `0` | Hard-enforced at the schema level: CHECK (budget_usd = 0). This table exists specifically for organic-only ventures (e.g. MarketLens, decision 08547ee8) — any paid channel/budget belongs on a different join, not here. |
| credential_ref | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| liveness_state | `text` | **NO** | `'wired_but_silent'::text` | wired_but_silent until a live-post liveness proof (auth + rate-limit + one real observed post) flips it to proven_live. "Adapter exists" alone never counts as proven_live. |
| auth_verified_at | `timestamp with time zone` | YES | - | - |
| ratelimit_verified_at | `timestamp with time zone` | YES | - | - |
| first_post_observed_at | `timestamp with time zone` | YES | - | - |
| liveness_evidence_ref | `text` | YES | - | - |

## Constraints

### Primary Key
- `venture_distribution_channels_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_distribution_channels_channel_id_fkey`: channel_id → distribution_channels(id)
- `venture_distribution_channels_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_distribution_channels_venture_id_channel_id_key`: UNIQUE (venture_id, channel_id)

### Check Constraints
- `venture_distribution_channels_budget_usd_check`: CHECK ((budget_usd = (0)::numeric))
- `venture_distribution_channels_liveness_state_check`: CHECK ((liveness_state = ANY (ARRAY['wired_but_silent'::text, 'proven_live'::text])))

## Indexes

- `idx_vdc_venture`
  ```sql
  CREATE INDEX idx_vdc_venture ON public.venture_distribution_channels USING btree (venture_id)
  ```
- `venture_distribution_channels_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_distribution_channels_pkey ON public.venture_distribution_channels USING btree (id)
  ```
- `venture_distribution_channels_venture_id_channel_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_distribution_channels_venture_id_channel_id_key ON public.venture_distribution_channels USING btree (venture_id, channel_id)
  ```

## RLS Policies

### 1. vdc_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. vdc_venture_access (ALL)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
