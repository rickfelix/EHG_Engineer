# risk_assessments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T11:57:53.424Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| assessed_at | `timestamp with time zone` | YES | `now()` | - |
| assessed_by | `text` | YES | `'RISK'::text` | - |
| phase | `text` | **NO** | - | - |
| technical_complexity | `smallint(16)` | YES | - | 1-10 scale: Code complexity, refactoring needs, technical debt |
| security_risk | `smallint(16)` | YES | - | 1-10 scale: Auth, data exposure, RLS, vulnerabilities |
| performance_risk | `smallint(16)` | YES | - | 1-10 scale: Query optimization, caching, scaling concerns |
| integration_risk | `smallint(16)` | YES | - | 1-10 scale: Third-party APIs, service dependencies |
| data_migration_risk | `smallint(16)` | YES | - | 1-10 scale: Schema changes, data integrity, rollback complexity |
| ui_ux_risk | `smallint(16)` | YES | - | 1-10 scale: Component complexity, accessibility, responsive design |
| overall_risk_score | `numeric(4,2)` | YES | - | - |
| risk_level | `text` | YES | - | - |
| critical_issues | `jsonb` | YES | `'[]'::jsonb` | - |
| warnings | `jsonb` | YES | `'[]'::jsonb` | - |
| recommendations | `jsonb` | YES | `'[]'::jsonb` | - |
| verdict | `text` | YES | - | - |
| confidence | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `risk_assessments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `risk_assessments_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `risk_assessments_confidence_check`: CHECK (((confidence >= 0) AND (confidence <= 100)))
- `risk_assessments_data_migration_risk_check`: CHECK (((data_migration_risk >= 1) AND (data_migration_risk <= 10)))
- `risk_assessments_integration_risk_check`: CHECK (((integration_risk >= 1) AND (integration_risk <= 10)))
- `risk_assessments_performance_risk_check`: CHECK (((performance_risk >= 1) AND (performance_risk <= 10)))
- `risk_assessments_phase_check`: CHECK ((phase = ANY (ARRAY['LEAD_PRE_APPROVAL'::text, 'PLAN_PRD'::text, 'EXEC_IMPL'::text, 'PLAN_VERIFY'::text, 'LEAD'::text, 'LEAD_APPROVAL'::text, 'PLAN'::text, 'EXEC'::text, 'VERIFY'::text, 'PLAN_VERIFICATION'::text])))
- `risk_assessments_risk_level_check`: CHECK ((risk_level = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])))
- `risk_assessments_security_risk_check`: CHECK (((security_risk >= 1) AND (security_risk <= 10)))
- `risk_assessments_technical_complexity_check`: CHECK (((technical_complexity >= 1) AND (technical_complexity <= 10)))
- `risk_assessments_ui_ux_risk_check`: CHECK (((ui_ux_risk >= 1) AND (ui_ux_risk <= 10)))
- `risk_assessments_verdict_check`: CHECK ((verdict = ANY (ARRAY['PASS'::text, 'CONDITIONAL_PASS'::text, 'FAIL'::text, 'ESCALATE'::text])))
- `risk_critical_issues_max_50`: CHECK (((critical_issues IS NULL) OR (jsonb_typeof(critical_issues) <> 'array'::text) OR (jsonb_array_length(critical_issues) <= 50)))
- `risk_recommendations_max_30`: CHECK (((recommendations IS NULL) OR (jsonb_typeof(recommendations) <> 'array'::text) OR (jsonb_array_length(recommendations) <= 30)))
- `risk_warnings_max_50`: CHECK (((warnings IS NULL) OR (jsonb_typeof(warnings) <> 'array'::text) OR (jsonb_array_length(warnings) <= 50)))

## Indexes

- `idx_risk_assessments_phase`
  ```sql
  CREATE INDEX idx_risk_assessments_phase ON public.risk_assessments USING btree (phase)
  ```
- `idx_risk_assessments_risk_level`
  ```sql
  CREATE INDEX idx_risk_assessments_risk_level ON public.risk_assessments USING btree (risk_level)
  ```
- `idx_risk_assessments_sd_id`
  ```sql
  CREATE INDEX idx_risk_assessments_sd_id ON public.risk_assessments USING btree (sd_id)
  ```
- `idx_risk_assessments_verdict`
  ```sql
  CREATE INDEX idx_risk_assessments_verdict ON public.risk_assessments USING btree (verdict)
  ```
- `risk_assessments_pkey`
  ```sql
  CREATE UNIQUE INDEX risk_assessments_pkey ON public.risk_assessments USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_risk_assessments (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_risk_assessments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_risk_to_refactoring_pattern

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION create_refactoring_pattern_from_risk()`

### trg_risk_to_refactoring_pattern

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION create_refactoring_pattern_from_risk()`

### trigger_risk_assessments_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_risk_assessments_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
