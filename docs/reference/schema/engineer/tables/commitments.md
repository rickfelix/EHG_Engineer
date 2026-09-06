# commitments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-06T17:42:38.372Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| owner_session | `text` | **NO** | - | - |
| counterparty_session | `text` | YES | - | - |
| subject | `text` | **NO** | - | - |
| due_by | `timestamp with time zone` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolution | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `commitments_pkey`: PRIMARY KEY (id)

## Indexes

- `commitments_pkey`
  ```sql
  CREATE UNIQUE INDEX commitments_pkey ON public.commitments USING btree (id)
  ```
- `idx_commitments_counterparty_session`
  ```sql
  CREATE INDEX idx_commitments_counterparty_session ON public.commitments USING btree (counterparty_session) WHERE (resolved_at IS NULL)
  ```
- `idx_commitments_owner_session`
  ```sql
  CREATE INDEX idx_commitments_owner_session ON public.commitments USING btree (owner_session) WHERE (resolved_at IS NULL)
  ```

## RLS Policies

### 1. commitments_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
