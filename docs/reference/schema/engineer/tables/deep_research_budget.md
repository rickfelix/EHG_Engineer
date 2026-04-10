# deep_research_budget Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T17:29:29.773Z
**Rows**: 2
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| date | `date` | **NO** | `CURRENT_DATE` | - |
| provider | `text` | **NO** | - | - |
| total_cost_usd | `numeric(10,6)` | YES | `0` | - |
| call_count | `integer(32)` | YES | `0` | - |
| daily_cap_usd | `numeric(10,6)` | YES | `10.00` | Maximum daily spend allowed per provider (default $10) |
| alert_threshold_pct | `numeric(3,2)` | YES | `0.80` | Percentage of daily cap that triggers an alert (default 80%) |
| kill_switch | `boolean` | YES | `false` | Emergency stop - blocks all research calls for this provider/date |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `deep_research_budget_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `deep_research_budget_date_provider_key`: UNIQUE (date, provider)

### Check Constraints
- `deep_research_budget_alert_threshold_pct_check`: CHECK (((alert_threshold_pct >= (0)::numeric) AND (alert_threshold_pct <= 1.00)))
- `deep_research_budget_call_count_check`: CHECK ((call_count >= 0))
- `deep_research_budget_daily_cap_usd_check`: CHECK ((daily_cap_usd >= (0)::numeric))
- `deep_research_budget_provider_check`: CHECK ((provider = ANY (ARRAY['gemini'::text, 'anthropic'::text, 'openai'::text, 'google'::text, 'ollama'::text])))
- `deep_research_budget_total_cost_usd_check`: CHECK ((total_cost_usd >= (0)::numeric))

## Indexes

- `deep_research_budget_date_provider_key`
  ```sql
  CREATE UNIQUE INDEX deep_research_budget_date_provider_key ON public.deep_research_budget USING btree (date, provider)
  ```
- `deep_research_budget_pkey`
  ```sql
  CREATE UNIQUE INDEX deep_research_budget_pkey ON public.deep_research_budget USING btree (id)
  ```

## Triggers

### set_deep_research_budget_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
