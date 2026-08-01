# governance_probe_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 2
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| probe_key | `text` | **NO** | - | - |
| target_role | `text` | **NO** | - | - |
| predicate_type | `text` | **NO** | - | - |
| predicate_config | `jsonb` | **NO** | - | - |
| gt_case_ref | `text` | YES | - | - |
| added_from_situation | `text` | YES | - | issue_patterns id (GOV-*) of the originating situation — hardening-to-situation traceability; replay must catch it before the probe counts. |
| active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `governance_probe_registry_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `governance_probe_registry_probe_key_key`: UNIQUE (probe_key)

### Check Constraints
- `governance_probe_registry_predicate_type_check`: CHECK ((predicate_type = ANY (ARRAY['adherence_fact'::text, 'closure_predicate'::text])))

## Indexes

- `governance_probe_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX governance_probe_registry_pkey ON public.governance_probe_registry USING btree (id)
  ```
- `governance_probe_registry_probe_key_key`
  ```sql
  CREATE UNIQUE INDEX governance_probe_registry_probe_key_key ON public.governance_probe_registry USING btree (probe_key)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
