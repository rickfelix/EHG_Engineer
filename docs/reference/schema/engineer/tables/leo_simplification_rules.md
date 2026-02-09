# leo_simplification_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:07:57.226Z
**Rows**: 8
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rule_code | `character varying(50)` | **NO** | - | - |
| rule_name | `character varying(100)` | **NO** | - | - |
| rule_type | `character varying(20)` | **NO** | - | - |
| language | `character varying(20)` | YES | `'javascript'::character varying` | - |
| pattern | `text` | **NO** | - | - |
| replacement | `text` | YES | - | - |
| enabled | `boolean` | YES | `true` | - |
| priority | `integer(32)` | YES | `100` | - |
| confidence | `numeric(3,2)` | YES | `0.80` | - |
| description | `text` | YES | - | - |
| example_before | `text` | YES | - | - |
| example_after | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_simplification_rules_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_simplification_rules_rule_code_key`: UNIQUE (rule_code)

### Check Constraints
- `leo_simplification_rules_confidence_check`: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
- `leo_simplification_rules_rule_type_check`: CHECK (((rule_type)::text = ANY ((ARRAY['logic'::character varying, 'style'::character varying, 'cleanup'::character varying])::text[])))

## Indexes

- `idx_simplification_rules_enabled`
  ```sql
  CREATE INDEX idx_simplification_rules_enabled ON public.leo_simplification_rules USING btree (enabled, priority)
  ```
- `idx_simplification_rules_language`
  ```sql
  CREATE INDEX idx_simplification_rules_language ON public.leo_simplification_rules USING btree (language)
  ```
- `idx_simplification_rules_type`
  ```sql
  CREATE INDEX idx_simplification_rules_type ON public.leo_simplification_rules USING btree (rule_type)
  ```
- `leo_simplification_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_simplification_rules_pkey ON public.leo_simplification_rules USING btree (id)
  ```
- `leo_simplification_rules_rule_code_key`
  ```sql
  CREATE UNIQUE INDEX leo_simplification_rules_rule_code_key ON public.leo_simplification_rules USING btree (rule_code)
  ```

## RLS Policies

### 1. Allow read access to simplification rules (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
