# agent_intelligence_insights Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T14:25:45.422Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_type | `text` | **NO** | - | - |
| insight_type | `text` | **NO** | - | - |
| insight_title | `text` | **NO** | - | - |
| insight_description | `text` | **NO** | - | - |
| insight_details | `jsonb` | YES | - | - |
| trigger_conditions | `jsonb` | YES | - | - |
| confidence_threshold | `integer(32)` | YES | `70` | - |
| times_applied | `integer(32)` | YES | `0` | - |
| positive_outcomes | `integer(32)` | YES | `0` | - |
| negative_outcomes | `integer(32)` | YES | `0` | - |
| effectiveness_rate | `numeric` | YES | - | - |
| source_pattern_ids | `ARRAY` | YES | - | - |
| source_outcomes | `integer(32)` | YES | - | - |
| statistical_significance | `numeric` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| last_applied | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `agent_intelligence_insights_pkey`: PRIMARY KEY (id)

### Check Constraints
- `agent_intelligence_insights_agent_type_check`: CHECK ((agent_type = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text])))
- `agent_intelligence_insights_insight_type_check`: CHECK ((insight_type = ANY (ARRAY['DECISION_ADJUSTMENT'::text, 'RISK_FACTOR'::text, 'SUCCESS_PATTERN'::text, 'FAILURE_PATTERN'::text, 'CROSS_AGENT_CORRELATION'::text])))

## Indexes

- `agent_intelligence_insights_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_intelligence_insights_pkey ON public.agent_intelligence_insights USING btree (id)
  ```
- `idx_agent_insights_active`
  ```sql
  CREATE INDEX idx_agent_insights_active ON public.agent_intelligence_insights USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_agent_insights_agent_type`
  ```sql
  CREATE INDEX idx_agent_insights_agent_type ON public.agent_intelligence_insights USING btree (agent_type)
  ```
- `idx_agent_insights_effectiveness`
  ```sql
  CREATE INDEX idx_agent_insights_effectiveness ON public.agent_intelligence_insights USING btree (effectiveness_rate)
  ```
- `idx_agent_insights_insight_type`
  ```sql
  CREATE INDEX idx_agent_insights_insight_type ON public.agent_intelligence_insights USING btree (insight_type)
  ```

## RLS Policies

### 1. intelligence_insights_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. intelligence_insights_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
