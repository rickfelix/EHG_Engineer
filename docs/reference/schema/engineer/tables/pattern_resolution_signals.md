# pattern_resolution_signals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T20:56:09.379Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pattern_id | `character varying(50)` | **NO** | - | Reference to the pattern being tracked |
| signal_type | `character varying(50)` | **NO** | - | Type of resolution signal: sd_completed, metric_improved, no_recurrence |
| signal_source | `text` | YES | - | Source of the signal (e.g., SD ID, metric name) |
| confidence | `numeric(3,2)` | YES | - | Confidence level 0.00-1.00 |
| detected_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `pattern_resolution_signals_pkey`: PRIMARY KEY (id)

### Check Constraints
- `pattern_resolution_signals_confidence_check`: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))

## Indexes

- `pattern_resolution_signals_pkey`
  ```sql
  CREATE UNIQUE INDEX pattern_resolution_signals_pkey ON public.pattern_resolution_signals USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_pattern_resolution_signals (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
