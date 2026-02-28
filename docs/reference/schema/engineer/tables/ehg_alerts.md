---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# ehg_alerts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| alert_type | `text` | **NO** | - | - |
| severity | `text` | YES | `'info'::text` | - |
| title | `text` | **NO** | - | - |
| message | `text` | YES | - | - |
| entity_type | `text` | YES | - | - |
| entity_id | `uuid` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `ehg_alerts_pkey`: PRIMARY KEY (id)

### Check Constraints
- `ehg_alerts_alert_type_check`: CHECK ((alert_type = ANY (ARRAY['risk'::text, 'milestone'::text, 'vision_drift'::text, 'performance'::text, 'governance'::text, 'system'::text])))
- `ehg_alerts_severity_check`: CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))

## Indexes

- `ehg_alerts_pkey`
  ```sql
  CREATE UNIQUE INDEX ehg_alerts_pkey ON public.ehg_alerts USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow service insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
