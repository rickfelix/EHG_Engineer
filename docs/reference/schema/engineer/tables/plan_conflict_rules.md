# plan_conflict_rules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-28T16:19:12.153Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('plan_conflict_rules_id_seq'::regclass)` | - |
| rule_name | `character varying(100)` | **NO** | - | - |
| priority | `integer(32)` | **NO** | - | - |
| if_condition | `jsonb` | **NO** | - | - |
| then_action | `character varying(50)` | **NO** | - | - |
| override_agents | `jsonb` | YES | `'[]'::jsonb` | - |
| active | `boolean` | YES | `true` | - |
| description | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `plan_conflict_rules_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `plan_conflict_rules_rule_name_key`: UNIQUE (rule_name)

## Indexes

- `plan_conflict_rules_pkey`
  ```sql
  CREATE UNIQUE INDEX plan_conflict_rules_pkey ON public.plan_conflict_rules USING btree (id)
  ```
- `plan_conflict_rules_rule_name_key`
  ```sql
  CREATE UNIQUE INDEX plan_conflict_rules_rule_name_key ON public.plan_conflict_rules USING btree (rule_name)
  ```

## RLS Policies

### 1. authenticated_read_plan_conflict_rules (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_plan_conflict_rules (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
