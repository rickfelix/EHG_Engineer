# ops_friday_scorecards Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-17T00:14:05.959Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| week_date | `date` | **NO** | - | - |
| revenue_status | `text` | YES | - | - |
| customer_status | `text` | YES | - | - |
| product_status | `text` | YES | - | - |
| agent_status | `text` | YES | - | - |
| cost_status | `text` | YES | - | - |
| overall_status | `text` | **NO** | - | Worst status across all domains |
| alert_count | `integer(32)` | YES | `0` | - |
| decision_items | `jsonb` | YES | `'[]'::jsonb` | Array of items requiring chairman decision |
| computed_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ops_friday_scorecards_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ops_friday_scorecards_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `ops_friday_scorecards_venture_id_week_date_key`: UNIQUE (venture_id, week_date)

### Check Constraints
- `ops_friday_scorecards_agent_status_check`: CHECK ((agent_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text, 'grey'::text])))
- `ops_friday_scorecards_cost_status_check`: CHECK ((cost_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text, 'grey'::text])))
- `ops_friday_scorecards_customer_status_check`: CHECK ((customer_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text, 'grey'::text])))
- `ops_friday_scorecards_overall_status_check`: CHECK ((overall_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text, 'grey'::text])))
- `ops_friday_scorecards_product_status_check`: CHECK ((product_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text, 'grey'::text])))
- `ops_friday_scorecards_revenue_status_check`: CHECK ((revenue_status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text, 'grey'::text])))

## Indexes

- `idx_ops_friday_scorecards_venture_week`
  ```sql
  CREATE INDEX idx_ops_friday_scorecards_venture_week ON public.ops_friday_scorecards USING btree (venture_id, week_date DESC)
  ```
- `ops_friday_scorecards_pkey`
  ```sql
  CREATE UNIQUE INDEX ops_friday_scorecards_pkey ON public.ops_friday_scorecards USING btree (id)
  ```
- `ops_friday_scorecards_venture_id_week_date_key`
  ```sql
  CREATE UNIQUE INDEX ops_friday_scorecards_venture_id_week_date_key ON public.ops_friday_scorecards USING btree (venture_id, week_date)
  ```

## RLS Policies

### 1. ops_friday_scorecards_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ops_friday_scorecards_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 3. ops_friday_scorecards_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

### 4. ops_friday_scorecards_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`
- **With Check**: `(venture_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'venture_id'::text))::uuid)`

---

[← Back to Schema Overview](../database-schema-overview.md)
