# eva_consultant_digests Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T17:29:29.773Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| digest_date | `date` | **NO** | - | The date this digest covers (one digest per day) |
| content | `jsonb` | **NO** | `'{}'::jsonb` | JSONB digest narrative content and structured sections |
| metrics | `jsonb` | YES | `'{}'::jsonb` | JSONB aggregated metrics for the digest period |
| source_health_summary | `jsonb` | YES | `'{}'::jsonb` | JSONB health status of data sources used to generate the digest |
| generated_by | `text` | YES | `'chairman-digest.mjs'::text` | Script or process that generated this digest |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_consultant_digests_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `eva_consultant_digests_digest_date_key`: UNIQUE (digest_date)

## Indexes

- `eva_consultant_digests_digest_date_key`
  ```sql
  CREATE UNIQUE INDEX eva_consultant_digests_digest_date_key ON public.eva_consultant_digests USING btree (digest_date)
  ```
- `eva_consultant_digests_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_consultant_digests_pkey ON public.eva_consultant_digests USING btree (id)
  ```
- `idx_eva_consultant_digests_date`
  ```sql
  CREATE INDEX idx_eva_consultant_digests_date ON public.eva_consultant_digests USING btree (digest_date DESC)
  ```

## RLS Policies

### 1. anon_select_only (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
