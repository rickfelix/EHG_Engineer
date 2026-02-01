# retrospective_insights Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T23:52:12.478Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| retrospective_id | `uuid` | **NO** | - | - |
| insight_type | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| evidence | `jsonb` | YES | - | - |
| impact_level | `text` | YES | - | - |
| affected_areas | `ARRAY` | YES | - | - |
| is_actionable | `boolean` | YES | `true` | - |
| recommended_actions | `jsonb` | YES | `'[]'::jsonb` | - |
| assigned_to | `text` | YES | - | - |
| relates_to_patterns | `ARRAY` | YES | - | - |
| frequency_observed | `integer(32)` | YES | `1` | - |
| action_taken | `boolean` | YES | `false` | - |
| action_taken_date | `timestamp with time zone` | YES | - | - |
| action_result | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `retrospective_insights_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `retrospective_insights_retrospective_id_fkey`: retrospective_id → retrospectives(id)

### Check Constraints
- `retrospective_insights_impact_level_check`: CHECK ((impact_level = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `retrospective_insights_insight_type_check`: CHECK ((insight_type = ANY (ARRAY['SUCCESS_FACTOR'::text, 'FAILURE_MODE'::text, 'PROCESS_IMPROVEMENT'::text, 'TECHNICAL_LEARNING'::text, 'BUSINESS_LEARNING'::text, 'TEAM_DYNAMIC'::text, 'TOOL_EFFECTIVENESS'::text, 'COMMUNICATION_PATTERN'::text])))

## Indexes

- `idx_insights_insight_type`
  ```sql
  CREATE INDEX idx_insights_insight_type ON public.retrospective_insights USING btree (insight_type)
  ```
- `idx_insights_is_actionable`
  ```sql
  CREATE INDEX idx_insights_is_actionable ON public.retrospective_insights USING btree (is_actionable)
  ```
- `idx_insights_retrospective_id`
  ```sql
  CREATE INDEX idx_insights_retrospective_id ON public.retrospective_insights USING btree (retrospective_id)
  ```
- `retrospective_insights_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospective_insights_pkey ON public.retrospective_insights USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_retrospective_insights (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_retrospective_insights (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### tr_insights_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_retrospective_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
