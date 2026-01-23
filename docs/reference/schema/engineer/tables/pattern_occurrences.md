# pattern_occurrences Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T04:03:45.232Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pattern_id | `character varying(20)` | YES | - | - |
| sd_id | `character varying` | YES | - | - |
| occurred_at | `timestamp with time zone` | YES | `now()` | - |
| source | `text` | YES | - | - |
| notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `pattern_occurrences_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `pattern_occurrences_pattern_id_fkey`: pattern_id → issue_patterns(pattern_id)
- `pattern_occurrences_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_pattern_occurrences_date`
  ```sql
  CREATE INDEX idx_pattern_occurrences_date ON public.pattern_occurrences USING btree (occurred_at DESC)
  ```
- `idx_pattern_occurrences_pattern`
  ```sql
  CREATE INDEX idx_pattern_occurrences_pattern ON public.pattern_occurrences USING btree (pattern_id)
  ```
- `pattern_occurrences_pkey`
  ```sql
  CREATE UNIQUE INDEX pattern_occurrences_pkey ON public.pattern_occurrences USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
