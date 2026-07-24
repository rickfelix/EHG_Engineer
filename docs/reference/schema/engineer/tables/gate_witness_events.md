# gate_witness_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2,251
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate_id | `text` | **NO** | - | - |
| witness_session_id | `text` | **NO** | - | The session/actor recording the witness verdict. Must differ from judged_session_id (enforced by chk_witness_not_self_judged) -- this is a necessary, not sufficient, condition for independence given the shared SUPABASE_SERVICE_ROLE_KEY architecture. |
| judged_session_id | `text` | **NO** | - | The session/actor whose work is being judged by this witness event. |
| verdict | `text` | **NO** | - | - |
| notes | `text` | YES | - | - |
| recorded_at | `timestamp with time zone` | **NO** | `now()` | - |
| enforcement_strength | `text` | YES | - | The enforcement_strength this specific event actually ran at, looked up from gate_witness_registry.gate_id at recording time (lib/eva/record-witness-event.js). Null when the gate_id has no registry row yet -- never blocks recording. |
| witness_mechanism | `text` | YES | - | The witness_mechanism this specific event actually ran at, mirroring gate_witness_registry.witness_mechanism. Null when the gate_id has no registry row yet. |
| is_downgrade | `boolean` | **NO** | `false` | true when enforcement_strength=convention -- i.e. this gate ran at convention-strength because no structural witness mechanism exists for it today. First-class, queryable evidence of how often convention-level enforcement is load-bearing, per the coordinator relay (a6fa69a9-ea69-43e4-9bce-fb129196a7c7) that named this as a missed G1 fold-in: "never silent". Defaults false so pre-existing rows (recorded before this migration) read as non-downgrade rather than NULL-ambiguous. |

## Constraints

### Primary Key
- `gate_witness_events_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chk_witness_not_self_judged`: CHECK ((witness_session_id <> judged_session_id))
- `gate_witness_events_enforcement_strength_check`: CHECK ((enforcement_strength = ANY (ARRAY['structural'::text, 'convention'::text])))
- `gate_witness_events_verdict_check`: CHECK ((verdict = ANY (ARRAY['witnessed'::text, 'rejected'::text])))
- `gate_witness_events_witness_mechanism_check`: CHECK ((witness_mechanism = ANY (ARRAY['cross_actor'::text, 'external_system'::text, 'replay'::text])))

## Indexes

- `gate_witness_events_pkey`
  ```sql
  CREATE UNIQUE INDEX gate_witness_events_pkey ON public.gate_witness_events USING btree (id)
  ```

## RLS Policies

### 1. Anon can read gate_witness_events (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role full access to gate_witness_events (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
