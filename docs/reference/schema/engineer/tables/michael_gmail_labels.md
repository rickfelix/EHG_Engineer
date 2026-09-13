# michael_gmail_labels Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 35
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| label_id | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| class | `text` | YES | - | - |
| keep_in_inbox | `boolean` | **NO** | `false` | - |
| summarize | `boolean` | **NO** | `false` | - |
| last_seen_in_gmail_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_gmail_labels_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_gmail_labels_label_id_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_gmail_labels_label_id_uniq ON public.michael_gmail_labels USING btree (label_id)
  ```
- `michael_gmail_labels_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_gmail_labels_pkey ON public.michael_gmail_labels USING btree (id)
  ```

## RLS Policies

### 1. michael_gmail_labels_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_gmail_labels_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
