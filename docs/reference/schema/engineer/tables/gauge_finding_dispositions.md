# gauge_finding_dispositions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| fingerprint | `text` | **NO** | - | Stable finding identity (dedup key), e.g. WAVE_LINKAGE_STARVATION. Matched against roadmap_wave_items.metadata.dedup_key by lib/sourcing-engine/refill-candidate-validity.js opts.acceptedFingerprintSet. |
| disposition | `text` | **NO** | `'accepted_known_state'::text` | - |
| re_review_at | `timestamp with time zone` | **NO** | - | Suppression expiry -- a disposition with re_review_at in the past is excluded from the live suppression Set on the next refill-cron run, so the finding promotes again exactly once. |
| reason | `text` | **NO** | - | - |
| dispositioned_by | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `gauge_finding_dispositions_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `gauge_finding_dispositions_fingerprint_key`: UNIQUE (fingerprint)

### Check Constraints
- `gauge_finding_dispositions_disposition_check`: CHECK ((disposition = 'accepted_known_state'::text))

## Indexes

- `gauge_finding_dispositions_fingerprint_key`
  ```sql
  CREATE UNIQUE INDEX gauge_finding_dispositions_fingerprint_key ON public.gauge_finding_dispositions USING btree (fingerprint)
  ```
- `gauge_finding_dispositions_pkey`
  ```sql
  CREATE UNIQUE INDEX gauge_finding_dispositions_pkey ON public.gauge_finding_dispositions USING btree (id)
  ```
- `idx_gauge_finding_dispositions_re_review_at`
  ```sql
  CREATE INDEX idx_gauge_finding_dispositions_re_review_at ON public.gauge_finding_dispositions USING btree (re_review_at)
  ```

## RLS Policies

### 1. gauge_finding_dispositions_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_gauge_finding_dispositions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_gauge_finding_dispositions_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
