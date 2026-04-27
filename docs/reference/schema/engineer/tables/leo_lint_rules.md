# leo_lint_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-27T02:34:49.236Z
**Rows**: 12
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| rule_id | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| source_path | `text` | **NO** | - | - |
| enabled | `boolean` | **NO** | `true` | - |
| promoted_from_warn_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_lint_rules_pkey`: PRIMARY KEY (rule_id)

### Check Constraints
- `leo_lint_rules_severity_check`: CHECK ((severity = ANY (ARRAY['warn'::text, 'block'::text])))

## Indexes

- `idx_leo_lint_rules_enabled`
  ```sql
  CREATE INDEX idx_leo_lint_rules_enabled ON public.leo_lint_rules USING btree (enabled) WHERE (enabled = true)
  ```
- `leo_lint_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_lint_rules_pkey ON public.leo_lint_rules USING btree (rule_id)
  ```

## Triggers

### trg_leo_lint_rules_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION tg_leo_lint_rules_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
