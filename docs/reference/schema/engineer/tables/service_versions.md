# service_versions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T00:36:32.652Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| service_id | `uuid` | **NO** | - | - |
| version | `text` | **NO** | - | - |
| artifact_schema | `jsonb` | **NO** | - | - |
| changelog | `text` | YES | - | - |
| deprecated_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `service_versions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `service_versions_service_id_fkey`: service_id → ehg_services(id)

### Unique Constraints
- `service_versions_service_id_version_key`: UNIQUE (service_id, version)

## Indexes

- `idx_service_versions_service_id`
  ```sql
  CREATE INDEX idx_service_versions_service_id ON public.service_versions USING btree (service_id)
  ```
- `service_versions_pkey`
  ```sql
  CREATE UNIQUE INDEX service_versions_pkey ON public.service_versions USING btree (id)
  ```
- `service_versions_service_id_version_key`
  ```sql
  CREATE UNIQUE INDEX service_versions_service_id_version_key ON public.service_versions USING btree (service_id, version)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
