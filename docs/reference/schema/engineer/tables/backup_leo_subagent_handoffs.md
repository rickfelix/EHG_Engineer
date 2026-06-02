# backup_leo_subagent_handoffs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-02T12:13:54.400Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| from_agent | `text` | YES | - | - |
| to_agent | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| prd_id | `text` | YES | - | - |
| phase | `text` | YES | - | - |
| summary | `jsonb` | YES | - | - |
| critical_flags | `ARRAY` | YES | - | - |
| warnings | `ARRAY` | YES | - | - |
| recommendations | `ARRAY` | YES | - | - |
| confidence_score | `double precision(53)` | YES | - | - |
| execution_time_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp without time zone` | YES | - | - |
| expires_at | `timestamp without time zone` | YES | - | - |

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
