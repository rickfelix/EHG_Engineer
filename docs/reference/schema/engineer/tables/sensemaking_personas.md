---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# sensemaking_personas Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 6
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| system_prompt | `text` | **NO** | - | - |
| trigger_keywords | `ARRAY` | **NO** | - | - |
| priority | `integer(32)` | **NO** | - | - |
| is_active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sensemaking_personas_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sensemaking_personas_name_key`: UNIQUE (name)

### Check Constraints
- `sensemaking_personas_priority_check`: CHECK (((priority >= 1) AND (priority <= 9)))
- `sensemaking_personas_trigger_keywords_check`: CHECK ((array_length(trigger_keywords, 1) > 0))

## Indexes

- `idx_sensemaking_personas_active_priority`
  ```sql
  CREATE INDEX idx_sensemaking_personas_active_priority ON public.sensemaking_personas USING btree (priority) WHERE (is_active = true)
  ```
- `sensemaking_personas_name_key`
  ```sql
  CREATE UNIQUE INDEX sensemaking_personas_name_key ON public.sensemaking_personas USING btree (name)
  ```
- `sensemaking_personas_pkey`
  ```sql
  CREATE UNIQUE INDEX sensemaking_personas_pkey ON public.sensemaking_personas USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
