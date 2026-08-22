# venture_gate_attestations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('venture_gate_attestations_id_seq'::regclass)` | - |
| venture_id | `uuid` | **NO** | - | - |
| check_type | `text` | **NO** | - | - |
| verdict | `text` | **NO** | - | - |
| attested_by | `text` | **NO** | - | The identified human or named agent recording this attestation. Anonymous role words (system/worker/agent/bot/...) are rejected structurally, including digit-suffixed evasions. chairman_site_review additionally requires an email-shaped identity. NECESSARY, NOT SUFFICIENT: under a shared SUPABASE_SERVICE_ROLE_KEY a DB constraint cannot verify that a given string is the actor it names — that limit is why enforcement_strength exists and why honest writers tag these rows 'convention'. |
| produced_by | `text` | **NO** | - | Who or what produced the artifact being attested (e.g. 'stage-17-blueprint-review'). Must differ from attested_by (vga_attester_not_producer), normalised for case and whitespace. |
| subject_ref | `text` | **NO** | - | - |
| subject_content_hash | `text` | YES | - | SHA-256 of the exact artifact reviewed (deployed sha + rendered site build). NULL is permitted and honest for BLOCKED/NO_DATA — forcing a hash onto an unmeasurable row would fabricate one. Mandatory on PASS. Any later change to the artifact yields a different hash, so the gate re-blocks rather than coasting on a stale approval. |
| citation | `text` | **NO** | - | - |
| path_to_pass | `text` | **NO** | - | - |
| findings | `jsonb` | **NO** | - | - |
| enforcement_strength | `text` | **NO** | - | - |
| computed_at | `timestamp with time zone` | **NO** | `now()` | DB clock. Never writer-supplied — a writer that supplies its own timestamp can backdate an attestation. The sole ordering key for latest-wins. A human review time, if recorded, lives in findings->>'reviewed_at' and is explicitly non-authoritative. |

## Constraints

### Primary Key
- `venture_gate_attestations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_gate_attestations_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_gate_attestations_check_type_check`: CHECK ((check_type = ANY (ARRAY['stage17_judgment'::text, 'chairman_site_review'::text])))
- `venture_gate_attestations_enforcement_strength_check`: CHECK ((enforcement_strength = ANY (ARRAY['structural'::text, 'convention'::text])))
- `venture_gate_attestations_verdict_check`: CHECK ((verdict = ANY (ARRAY['PASS'::text, 'BLOCKED'::text, 'NO_DATA'::text])))
- `vga_attested_by_is_identified`: CHECK (((btrim(attested_by) <> ''::text) AND (length(btrim(attested_by)) >= 3) AND (lower(regexp_replace(btrim(attested_by), '[-_. ]?[0-9]+$'::text, ''::text)) <> ALL (ARRAY['system'::text, 'systems'::text, 'sys'::text, 'worker'::text, 'workers'::text, 'agent'::text, 'agents'::text, 'subagent'::text, 'sub_agent'::text, 'bot'::text, 'robot'::text, 'service'::text, 'services'::text, 'service_role'::text, 'serviceaccount'::text, 'svc'::text, 'admin'::text, 'administrator'::text, 'root'::text, 'superuser'::text, 'operator'::text, 'automation'::text, 'automated'::text, 'auto'::text, 'ci'::text, 'cd'::text, 'cicd'::text, 'pipeline'::text, 'cron'::text, 'job'::text, 'task'::text, 'runner'::text, 'daemon'::text, 'script'::text, 'process'::text, 'machine'::text, 'llm'::text, 'ai'::text, 'model'::text, 'claude'::text, 'gpt'::text, 'openai'::text, 'anthropic'::text, 'eva'::text, 'leo'::text, 'orchestrator'::text, 'unknown'::text, 'unspecified'::text, 'undefined'::text, 'none'::text, 'null'::text, 'nil'::text, 'na'::text, 'n/a'::text, 'tbd'::text, 'todo'::text, 'pending'::text, 'test'::text, 'tests'::text, 'testing'::text, 'tester'::text, 'anonymous'::text, 'anon'::text, 'default'::text, 'user'::text, 'users'::text, 'someone'::text, 'somebody'::text, 'me'::text, 'self'::text, 'it'::text, 'they'::text, 'placeholder'::text, 'xxx'::text, 'foo'::text, 'bar'::text, 'temp'::text, 'tmp'::text]))))
- `vga_attester_not_producer`: CHECK ((lower(btrim(attested_by)) <> lower(btrim(produced_by))))
- `vga_chairman_review_is_human`: CHECK (((check_type <> 'chairman_site_review'::text) OR (btrim(attested_by) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)))
- `vga_citation_resolvable_shape`: CHECK (((btrim(citation) <> ''::text) AND (length(btrim(citation)) >= 12) AND (btrim(citation) ~ '^(https?://[^[:space:]]+|[a-z_][a-z0-9_]*:[A-Za-z0-9._/-]{6,}|[A-Za-z0-9._/-]+@[0-9a-f]{7,64})$'::text)))
- `vga_content_hash_shape`: CHECK (((subject_content_hash IS NULL) OR (subject_content_hash ~ '^[0-9a-f]{64}$'::text)))
- `vga_findings_is_object`: CHECK ((jsonb_typeof(findings) = 'object'::text))
- `vga_pass_requires_content_hash`: CHECK (((verdict <> 'PASS'::text) OR (subject_content_hash IS NOT NULL)))
- `vga_path_to_pass_nonempty`: CHECK ((btrim(path_to_pass) <> ''::text))
- `vga_produced_by_is_identified`: CHECK (((btrim(produced_by) <> ''::text) AND (length(btrim(produced_by)) >= 3) AND (lower(regexp_replace(btrim(produced_by), '[-_. ]?[0-9]+$'::text, ''::text)) <> ALL (ARRAY['system'::text, 'systems'::text, 'sys'::text, 'worker'::text, 'workers'::text, 'agent'::text, 'agents'::text, 'subagent'::text, 'sub_agent'::text, 'bot'::text, 'robot'::text, 'service'::text, 'services'::text, 'service_role'::text, 'serviceaccount'::text, 'svc'::text, 'admin'::text, 'administrator'::text, 'root'::text, 'superuser'::text, 'operator'::text, 'automation'::text, 'automated'::text, 'auto'::text, 'ci'::text, 'cd'::text, 'cicd'::text, 'pipeline'::text, 'cron'::text, 'job'::text, 'task'::text, 'runner'::text, 'daemon'::text, 'script'::text, 'process'::text, 'machine'::text, 'llm'::text, 'ai'::text, 'model'::text, 'claude'::text, 'gpt'::text, 'openai'::text, 'anthropic'::text, 'eva'::text, 'leo'::text, 'orchestrator'::text, 'unknown'::text, 'unspecified'::text, 'undefined'::text, 'none'::text, 'null'::text, 'nil'::text, 'na'::text, 'n/a'::text, 'tbd'::text, 'todo'::text, 'pending'::text, 'test'::text, 'tests'::text, 'testing'::text, 'tester'::text, 'anonymous'::text, 'anon'::text, 'default'::text, 'user'::text, 'users'::text, 'someone'::text, 'somebody'::text, 'me'::text, 'self'::text, 'it'::text, 'they'::text, 'placeholder'::text, 'xxx'::text, 'foo'::text, 'bar'::text, 'temp'::text, 'tmp'::text]))))
- `vga_structural_requires_external_verification`: CHECK (((enforcement_strength <> 'structural'::text) OR ((jsonb_typeof((findings -> 'external_verification'::text)) = 'object'::text) AND ((findings -> 'external_verification'::text) <> '{}'::jsonb))))
- `vga_subject_ref_nonempty`: CHECK ((btrim(subject_ref) <> ''::text))

## Indexes

- `venture_gate_attestations_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_gate_attestations_pkey ON public.venture_gate_attestations USING btree (id)
  ```
- `venture_gate_attestations_venture_type_computed_idx`
  ```sql
  CREATE INDEX venture_gate_attestations_venture_type_computed_idx ON public.venture_gate_attestations USING btree (venture_id, check_type, computed_at DESC)
  ```

## RLS Policies

### 1. venture_gate_attestations_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### venture_gate_attestations_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION venture_gate_attestations_no_delete()`

### venture_gate_attestations_no_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION venture_gate_attestations_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
