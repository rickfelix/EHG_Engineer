# claim_rejects Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 193
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_key | `text` | **NO** | - | - |
| session_id | `text` | YES | - | - |
| would_reject_reasons | `ARRAY` | **NO** | - | - |
| client_version | `integer(32)` | YES | - | - |
| floor_version | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `claim_rejects_pkey`: PRIMARY KEY (id)

## Indexes

- `claim_rejects_pkey`
  ```sql
  CREATE UNIQUE INDEX claim_rejects_pkey ON public.claim_rejects USING btree (id)
  ```
- `idx_claim_rejects_created_at`
  ```sql
  CREATE INDEX idx_claim_rejects_created_at ON public.claim_rejects USING btree (created_at)
  ```
- `idx_claim_rejects_sd_key`
  ```sql
  CREATE INDEX idx_claim_rejects_sd_key ON public.claim_rejects USING btree (sd_key)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
