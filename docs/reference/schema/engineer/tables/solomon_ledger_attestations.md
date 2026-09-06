# solomon_ledger_attestations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-06T17:42:38.372Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('solomon_ledger_attestations_id_seq'::regclass)` | - |
| ledger_row_id | `uuid` | **NO** | - | - |
| incident_id | `text` | **NO** | - | - |
| attested_by | `text` | **NO** | - | - |
| produced_by | `text` | **NO** | - | - |
| subject_ref | `text` | **NO** | - | - |
| source_citation | `text` | **NO** | - | Worded per-row to reflect the ACTUAL evidence strength -- never a boilerplate string identical across rows of different evidentiary quality (LEAD-phase stories-agent finding). |
| findings | `jsonb` | **NO** | - | - |
| computed_at | `timestamp with time zone` | **NO** | `now()` | DB clock. Never writer-supplied -- a writer that supplies its own timestamp can backdate an attestation. |

## Constraints

### Primary Key
- `solomon_ledger_attestations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `solomon_ledger_attestations_ledger_row_id_fkey`: ledger_row_id → solomon_advice_outcome_ledger(id)

### Unique Constraints
- `sla_one_attestation_per_row_per_incident`: UNIQUE (ledger_row_id, incident_id)

### Check Constraints
- `sla_attested_by_is_identified`: CHECK (((btrim(attested_by) <> ''::text) AND (length(btrim(attested_by)) >= 3) AND (lower(regexp_replace(btrim(attested_by), '[-_. ]?[0-9]+$'::text, ''::text)) <> ALL (ARRAY['system'::text, 'systems'::text, 'sys'::text, 'worker'::text, 'workers'::text, 'agent'::text, 'agents'::text, 'subagent'::text, 'sub_agent'::text, 'bot'::text, 'robot'::text, 'service'::text, 'services'::text, 'service_role'::text, 'serviceaccount'::text, 'svc'::text, 'admin'::text, 'administrator'::text, 'root'::text, 'superuser'::text, 'operator'::text, 'automation'::text, 'automated'::text, 'auto'::text, 'ci'::text, 'cd'::text, 'cicd'::text, 'pipeline'::text, 'cron'::text, 'job'::text, 'task'::text, 'runner'::text, 'daemon'::text, 'script'::text, 'process'::text, 'machine'::text, 'llm'::text, 'ai'::text, 'model'::text, 'claude'::text, 'gpt'::text, 'openai'::text, 'anthropic'::text, 'eva'::text, 'leo'::text, 'orchestrator'::text, 'unknown'::text, 'unspecified'::text, 'undefined'::text, 'none'::text, 'null'::text, 'nil'::text, 'na'::text, 'n/a'::text, 'tbd'::text, 'todo'::text, 'pending'::text, 'test'::text, 'tests'::text, 'testing'::text, 'tester'::text, 'anonymous'::text, 'anon'::text, 'default'::text, 'user'::text, 'users'::text, 'someone'::text, 'somebody'::text, 'me'::text, 'self'::text, 'it'::text, 'they'::text, 'placeholder'::text, 'xxx'::text, 'foo'::text, 'bar'::text, 'temp'::text, 'tmp'::text]))))
- `sla_attester_not_producer`: CHECK ((lower(btrim(attested_by)) <> lower(btrim(produced_by))))
- `sla_findings_is_object`: CHECK ((jsonb_typeof(findings) = 'object'::text))
- `sla_incident_id_nonempty`: CHECK ((btrim(incident_id) <> ''::text))
- `sla_produced_by_is_identified`: CHECK (((btrim(produced_by) <> ''::text) AND (length(btrim(produced_by)) >= 3) AND (lower(regexp_replace(btrim(produced_by), '[-_. ]?[0-9]+$'::text, ''::text)) <> ALL (ARRAY['system'::text, 'systems'::text, 'sys'::text, 'worker'::text, 'workers'::text, 'agent'::text, 'agents'::text, 'subagent'::text, 'sub_agent'::text, 'bot'::text, 'robot'::text, 'service'::text, 'services'::text, 'service_role'::text, 'serviceaccount'::text, 'svc'::text, 'admin'::text, 'administrator'::text, 'root'::text, 'superuser'::text, 'operator'::text, 'automation'::text, 'automated'::text, 'auto'::text, 'ci'::text, 'cd'::text, 'cicd'::text, 'pipeline'::text, 'cron'::text, 'job'::text, 'task'::text, 'runner'::text, 'daemon'::text, 'script'::text, 'process'::text, 'machine'::text, 'llm'::text, 'ai'::text, 'model'::text, 'claude'::text, 'gpt'::text, 'openai'::text, 'anthropic'::text, 'eva'::text, 'leo'::text, 'orchestrator'::text, 'unknown'::text, 'unspecified'::text, 'undefined'::text, 'none'::text, 'null'::text, 'nil'::text, 'na'::text, 'n/a'::text, 'tbd'::text, 'todo'::text, 'pending'::text, 'test'::text, 'tests'::text, 'testing'::text, 'tester'::text, 'anonymous'::text, 'anon'::text, 'default'::text, 'user'::text, 'users'::text, 'someone'::text, 'somebody'::text, 'me'::text, 'self'::text, 'it'::text, 'they'::text, 'placeholder'::text, 'xxx'::text, 'foo'::text, 'bar'::text, 'temp'::text, 'tmp'::text]))))
- `sla_source_citation_shape`: CHECK (((btrim(source_citation) <> ''::text) AND (length(btrim(source_citation)) >= 20)))
- `sla_subject_ref_nonempty`: CHECK ((btrim(subject_ref) <> ''::text))

## Indexes

- `sla_one_attestation_per_row_per_incident`
  ```sql
  CREATE UNIQUE INDEX sla_one_attestation_per_row_per_incident ON public.solomon_ledger_attestations USING btree (ledger_row_id, incident_id)
  ```
- `solomon_ledger_attestations_ledger_row_idx`
  ```sql
  CREATE INDEX solomon_ledger_attestations_ledger_row_idx ON public.solomon_ledger_attestations USING btree (ledger_row_id)
  ```
- `solomon_ledger_attestations_pkey`
  ```sql
  CREATE UNIQUE INDEX solomon_ledger_attestations_pkey ON public.solomon_ledger_attestations USING btree (id)
  ```

## RLS Policies

### 1. solomon_ledger_attestations_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### solomon_ledger_attestations_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION solomon_ledger_attestations_no_delete()`

### solomon_ledger_attestations_no_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION solomon_ledger_attestations_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
