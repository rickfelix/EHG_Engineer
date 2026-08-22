# sms_decision_class_whitelist Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| decision_class | `text` | **NO** | - | - |
| active | `boolean` | **NO** | `true` | - |
| added_by | `text` | YES | - | - |
| added_at | `timestamp with time zone` | **NO** | `now()` | - |
| rationale | `text` | YES | - | - |

## Constraints

### Primary Key
- `sms_decision_class_whitelist_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sms_decision_class_whitelist_decision_class_key`: UNIQUE (decision_class)

### Check Constraints
- `sms_decision_class_whitelist_decision_class_check`: CHECK (((decision_class = lower(btrim(decision_class))) AND (decision_class <> ''::text)))

## Indexes

- `sms_decision_class_whitelist_decision_class_key`
  ```sql
  CREATE UNIQUE INDEX sms_decision_class_whitelist_decision_class_key ON public.sms_decision_class_whitelist USING btree (decision_class)
  ```
- `sms_decision_class_whitelist_pkey`
  ```sql
  CREATE UNIQUE INDEX sms_decision_class_whitelist_pkey ON public.sms_decision_class_whitelist USING btree (id)
  ```

## RLS Policies

### 1. sms_decision_class_whitelist_chairman_select (SELECT)

- **Roles**: {public}
- **Using**: `fn_is_chairman()`

---

[← Back to Schema Overview](../database-schema-overview.md)
