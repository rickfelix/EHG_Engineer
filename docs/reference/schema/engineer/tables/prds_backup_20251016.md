# prds_backup_20251016 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T13:20:04.534Z
**Rows**: 9
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `text` | YES | - | - |
| title | `text` | YES | - | - |
| content | `text` | YES | - | - |
| status | `text` | YES | - | - |
| strategic_directive_id | `text` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| target_url | `text` | YES | - | - |
| component_name | `text` | YES | - | - |
| app_path | `text` | YES | - | - |
| port | `integer(32)` | YES | - | - |

## RLS Policies

### 1. authenticated_read_prds_backup_20251016 (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_prds_backup_20251016 (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
