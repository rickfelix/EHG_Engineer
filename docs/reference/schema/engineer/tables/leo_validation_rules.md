# leo_validation_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-27T22:46:06.441Z
**Rows**: 21
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (8 total)

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

## Constraints

### Primary Key
- `leo_validation_rules_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_validation_rules_gate_check`: CHECK ((gate = ANY (ARRAY['0'::text, '1'::text, 'Q'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text])))
- `leo_validation_rules_weight_check`: CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric)))

## Indexes

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
