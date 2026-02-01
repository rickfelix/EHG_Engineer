# leo_audit_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T03:50:45.752Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| event_retention_days | `integer(32)` | **NO** | - | - |
| pii_redaction_rules | `jsonb` | **NO** | - | - |
| required_event_types | `jsonb` | **NO** | - | - |
| description | `text` | YES | - | - |

## Constraints

### Primary Key
- `leo_audit_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_leo_audit_config_version`: UNIQUE (version)

### Check Constraints
- `leo_audit_config_event_retention_days_check`: CHECK (((event_retention_days >= 7) AND (event_retention_days <= 3650)))
- `leo_audit_config_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text])))

## Indexes

- `leo_audit_config_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_audit_config_pkey ON public.leo_audit_config USING btree (id)
  ```
- `uq_leo_audit_config_version`
  ```sql
  CREATE UNIQUE INDEX uq_leo_audit_config_version ON public.leo_audit_config USING btree (version)
  ```

## RLS Policies

### 1. Anon can read active audit config (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'active'::text)`

### 2. Service role full access to leo_audit_config (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
