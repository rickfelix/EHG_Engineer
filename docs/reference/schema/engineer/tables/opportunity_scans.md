# opportunity_scans Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T16:34:40.900Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| scan_type | `text` | **NO** | - | Type of scan: competitor (analyze URL), market_trend (scan market), full (comprehensive) |
| target_url | `text` | YES | - | - |
| target_market | `text` | YES | - | - |
| status | `text` | YES | `'pending'::text` | - |
| opportunities_found | `integer(32)` | YES | `0` | - |
| blueprints_generated | `integer(32)` | YES | `0` | - |
| blueprints_auto_approved | `integer(32)` | YES | `0` | - |
| blueprints_pending_review | `integer(32)` | YES | `0` | - |
| raw_analysis | `jsonb` | YES | - | - |
| four_buckets | `jsonb` | YES | - | Epistemic classification: { facts, assumptions, simulations, unknowns } |
| gap_analysis | `jsonb` | YES | - | Six dimensions: { features, pricing, segments, experience, integrations, quality } |
| duration_ms | `integer(32)` | YES | - | - |
| error_message | `text` | YES | - | - |
| initiated_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `opportunity_scans_pkey`: PRIMARY KEY (id)

### Check Constraints
- `opportunity_scans_scan_type_check`: CHECK ((scan_type = ANY (ARRAY['competitor'::text, 'market_trend'::text, 'full'::text])))
- `opportunity_scans_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_scans_created_at`
  ```sql
  CREATE INDEX idx_scans_created_at ON public.opportunity_scans USING btree (created_at DESC)
  ```
- `idx_scans_scan_type`
  ```sql
  CREATE INDEX idx_scans_scan_type ON public.opportunity_scans USING btree (scan_type)
  ```
- `idx_scans_status`
  ```sql
  CREATE INDEX idx_scans_status ON public.opportunity_scans USING btree (status)
  ```
- `opportunity_scans_pkey`
  ```sql
  CREATE UNIQUE INDEX opportunity_scans_pkey ON public.opportunity_scans USING btree (id)
  ```

## RLS Policies

### 1. Anyone can view scans (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role full access to scans (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
