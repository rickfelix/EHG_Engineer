# handoff_validation_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| handoff_type | `text` | **NO** | - | - |
| validation_rule | `text` | **NO** | - | - |
| requirement_level | `text` | **NO** | - | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `handoff_validation_rules_pkey`: PRIMARY KEY (id)

### Check Constraints
- `handoff_validation_rules_requirement_level_check`: CHECK ((requirement_level = ANY (ARRAY['MANDATORY'::text, 'RECOMMENDED'::text, 'OPTIONAL'::text])))

## Indexes

- `handoff_validation_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX handoff_validation_rules_pkey ON public.handoff_validation_rules USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_handoff_validation_rules (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_handoff_validation_rules (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
