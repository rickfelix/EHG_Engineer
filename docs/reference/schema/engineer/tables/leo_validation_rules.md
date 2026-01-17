# leo_validation_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-17T11:36:37.316Z
**Rows**: 61
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate | `text` | **NO** | - | - |
| rule_name | `text` | **NO** | - | - |
| weight | `numeric(4,3)` | **NO** | - | - |
| criteria | `jsonb` | **NO** | `'{}'::jsonb` | - |
| required | `boolean` | YES | `false` | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| handoff_type | `character varying(50)` | YES | - | Handoff type this rule applies to: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD |
| validator_module | `character varying(200)` | YES | - | Path to validator module relative to scripts/modules/ |
| validator_function | `character varying(100)` | YES | - | Export function name to call |
| execution_order | `integer(32)` | YES | `50` | Order of execution within gate (lower = earlier) |

## Constraints

### Primary Key
- `leo_validation_rules_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_validation_rules_gate_check`: CHECK ((gate = ANY (ARRAY['L'::text, '0'::text, '1'::text, 'Q'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text, '4'::text])))
- `leo_validation_rules_weight_check`: CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric)))

## Indexes

- `idx_leo_validation_rules_handoff`
  ```sql
  CREATE INDEX idx_leo_validation_rules_handoff ON public.leo_validation_rules USING btree (handoff_type, active)
  ```
- `leo_validation_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_validation_rules_pkey ON public.leo_validation_rules USING btree (id)
  ```

## RLS Policies

### 1. Anon users can read validation_rules (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_leo_validation_rules (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_leo_validation_rules (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
