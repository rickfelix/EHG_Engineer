# evidence_gate_mapping Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 8
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('evidence_gate_mapping_id_seq'::regclass)` | - |
| gate_question_id | `text` | **NO** | - | - |
| gate_question_text | `text` | **NO** | - | - |
| evidence_steps | `jsonb` | **NO** | `'[]'::jsonb` | - |
| evidence_description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `evidence_gate_mapping_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `evidence_gate_mapping_gate_question_id_key`: UNIQUE (gate_question_id)

## Indexes

- `evidence_gate_mapping_gate_question_id_key`
  ```sql
  CREATE UNIQUE INDEX evidence_gate_mapping_gate_question_id_key ON public.evidence_gate_mapping USING btree (gate_question_id)
  ```
- `evidence_gate_mapping_pkey`
  ```sql
  CREATE UNIQUE INDEX evidence_gate_mapping_pkey ON public.evidence_gate_mapping USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
