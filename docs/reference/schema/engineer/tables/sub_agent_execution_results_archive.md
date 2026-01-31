# sub_agent_execution_results_archive Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T20:56:09.379Z
**Rows**: 2,036
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| sd_id | `text` | YES | - | - |
| sub_agent_code | `text` | YES | - | - |
| sub_agent_name | `text` | YES | - | - |
| verdict | `text` | YES | - | - |
| confidence | `integer(32)` | YES | - | - |
| critical_issues | `jsonb` | YES | - | - |
| warnings | `jsonb` | YES | - | - |
| recommendations | `jsonb` | YES | - | - |
| detailed_analysis | `text` | YES | - | - |
| execution_time | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| risk_assessment_id | `uuid` | YES | - | - |
| validation_mode | `text` | YES | - | - |
| justification | `text` | YES | - | - |
| conditions | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `sub_agent_execution_results_archive_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_archive_created_at`
  ```sql
  CREATE INDEX idx_archive_created_at ON public.sub_agent_execution_results_archive USING btree (created_at)
  ```
- `idx_archive_sd_id`
  ```sql
  CREATE INDEX idx_archive_sd_id ON public.sub_agent_execution_results_archive USING btree (sd_id)
  ```
- `sub_agent_execution_results_archive_pkey`
  ```sql
  CREATE UNIQUE INDEX sub_agent_execution_results_archive_pkey ON public.sub_agent_execution_results_archive USING btree (id)
  ```

## RLS Policies

### 1. Allow delete for authenticated (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow insert for authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. Allow select for authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
