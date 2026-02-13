# intelligence_patterns Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T01:26:00.621Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (26 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pattern_type | `text` | **NO** | - | - |
| pattern_value | `text` | **NO** | - | - |
| pattern_description | `text` | YES | - | - |
| total_occurrences | `integer(32)` | YES | `0` | - |
| success_count | `integer(32)` | YES | `0` | - |
| failure_count | `integer(32)` | YES | `0` | - |
| success_rate | `numeric` | YES | - | - |
| lead_prediction_accuracy | `numeric` | YES | - | - |
| plan_prediction_accuracy | `numeric` | YES | - | - |
| exec_quality_correlation | `numeric` | YES | - | - |
| typical_lead_decision | `text` | YES | - | - |
| typical_plan_complexity | `integer(32)` | YES | - | - |
| typical_exec_quality | `integer(32)` | YES | - | - |
| typical_business_outcome | `text` | YES | - | - |
| recommended_lead_adjustments | `jsonb` | YES | - | - |
| recommended_plan_adjustments | `jsonb` | YES | - | - |
| recommended_exec_adjustments | `jsonb` | YES | - | - |
| common_failure_modes | `ARRAY` | YES | - | - |
| early_warning_signals | `ARRAY` | YES | - | - |
| risk_mitigation_strategies | `ARRAY` | YES | - | - |
| confidence_level | `text` | YES | `'LOW'::text` | - |
| last_updated | `timestamp with time zone` | YES | `now()` | - |
| pattern_strength | `numeric` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `intelligence_patterns_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `intelligence_patterns_pattern_type_pattern_value_key`: UNIQUE (pattern_type, pattern_value)

### Check Constraints
- `intelligence_patterns_confidence_level_check`: CHECK ((confidence_level = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `intelligence_patterns_pattern_type_check`: CHECK ((pattern_type = ANY (ARRAY['PROJECT_TYPE'::text, 'TECHNICAL_STACK'::text, 'BUSINESS_DOMAIN'::text, 'COMPLEXITY_FACTOR'::text, 'TEAM_SKILL'::text, 'TIMELINE_PRESSURE'::text])))

## Indexes

- `idx_intelligence_patterns_confidence`
  ```sql
  CREATE INDEX idx_intelligence_patterns_confidence ON public.intelligence_patterns USING btree (confidence_level)
  ```
- `idx_intelligence_patterns_success_rate`
  ```sql
  CREATE INDEX idx_intelligence_patterns_success_rate ON public.intelligence_patterns USING btree (success_rate)
  ```
- `idx_intelligence_patterns_type_value`
  ```sql
  CREATE INDEX idx_intelligence_patterns_type_value ON public.intelligence_patterns USING btree (pattern_type, pattern_value)
  ```
- `intelligence_patterns_pattern_type_pattern_value_key`
  ```sql
  CREATE UNIQUE INDEX intelligence_patterns_pattern_type_pattern_value_key ON public.intelligence_patterns USING btree (pattern_type, pattern_value)
  ```
- `intelligence_patterns_pkey`
  ```sql
  CREATE UNIQUE INDEX intelligence_patterns_pkey ON public.intelligence_patterns USING btree (id)
  ```

## RLS Policies

### 1. intelligence_patterns_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. intelligence_patterns_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
