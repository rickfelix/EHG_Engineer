# chairman_switchon_policy Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| action_class | `text` | **NO** | - | - |
| classification | `text` | **NO** | - | - |
| active | `boolean` | **NO** | `true` | - |
| added_by | `text` | YES | - | - |
| added_at | `timestamp with time zone` | **NO** | `now()` | - |
| rationale | `text` | YES | - | - |

## Constraints

### Primary Key
- `chairman_switchon_policy_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `chairman_switchon_policy_action_class_key`: UNIQUE (action_class)

### Check Constraints
- `chairman_switchon_policy_action_class_check`: CHECK (((action_class = lower(btrim(action_class))) AND (action_class <> ''::text)))
- `chairman_switchon_policy_classification_check`: CHECK ((classification = ANY (ARRAY['never_auto'::text, 'reversible_eligible'::text])))

## Indexes

- `chairman_switchon_policy_action_class_key`
  ```sql
  CREATE UNIQUE INDEX chairman_switchon_policy_action_class_key ON public.chairman_switchon_policy USING btree (action_class)
  ```
- `chairman_switchon_policy_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_switchon_policy_pkey ON public.chairman_switchon_policy USING btree (id)
  ```

## RLS Policies

### 1. chairman_switchon_policy_chairman_select (SELECT)

- **Roles**: {public}
- **Using**: `fn_is_chairman()`

---

[← Back to Schema Overview](../database-schema-overview.md)
