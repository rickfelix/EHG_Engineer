---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# venture_raid_summary Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 136
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| venture_id | `uuid` | **NO** | - | - |
| risk_count | `integer(32)` | YES | - | - |
| action_count | `integer(32)` | YES | - | - |
| issue_count | `integer(32)` | YES | - | - |
| decision_count | `integer(32)` | YES | - | - |
| total_count | `integer(32)` | YES | - | - |
| last_updated | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `venture_raid_summary_pkey`: PRIMARY KEY (venture_id)

## Indexes

- `venture_raid_summary_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_raid_summary_pkey ON public.venture_raid_summary USING btree (venture_id)
  ```

## RLS Policies

### 1. authenticated_all_venture_raid_summary (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. service_role_all_venture_raid_summary (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
