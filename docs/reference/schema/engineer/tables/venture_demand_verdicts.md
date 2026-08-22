# venture_demand_verdicts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('venture_demand_verdicts_id_seq'::regclass)` | - |
| venture_id | `uuid` | **NO** | - | - |
| verdict | `text` | **NO** | - | - |
| rungs | `jsonb` | **NO** | - | - |
| citation | `text` | **NO** | - | - |
| path_to_pass | `text` | **NO** | - | - |
| computed_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_demand_verdicts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_demand_verdicts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_demand_verdicts_citation_nonempty`: CHECK ((btrim(citation) <> ''::text))
- `venture_demand_verdicts_path_to_pass_nonempty`: CHECK ((btrim(path_to_pass) <> ''::text))
- `venture_demand_verdicts_rungs_is_object`: CHECK ((jsonb_typeof(rungs) = 'object'::text))
- `venture_demand_verdicts_verdict_check`: CHECK ((verdict = ANY (ARRAY['PASS'::text, 'BLOCKED'::text, 'NO_DATA'::text])))

## Indexes

- `venture_demand_verdicts_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_demand_verdicts_pkey ON public.venture_demand_verdicts USING btree (id)
  ```
- `venture_demand_verdicts_venture_computed_idx`
  ```sql
  CREATE INDEX venture_demand_verdicts_venture_computed_idx ON public.venture_demand_verdicts USING btree (venture_id, computed_at DESC)
  ```

## RLS Policies

### 1. venture_demand_verdicts_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### venture_demand_verdicts_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION venture_demand_verdicts_no_delete()`

### venture_demand_verdicts_no_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION venture_demand_verdicts_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
