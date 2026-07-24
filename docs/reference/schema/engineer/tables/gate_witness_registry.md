# gate_witness_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 130
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate_id | `text` | **NO** | - | Stable identifier for the gate, e.g. "LEAD-TO-PLAN.GATE_SD_TRANSITION_READINESS" or "ship.P4_PROTECTION_INTEGRITY" for non-handoff gates. Must be unique and stable across runs. |
| handoff_type | `text` | YES | - | One of LEAD-TO-PLAN / PLAN-TO-EXEC / EXEC-TO-PLAN / PLAN-TO-LEAD / LEAD-FINAL-APPROVAL for handoff-pipeline gates, or NULL for out-of-handoff gates (e.g. the ship/merge lane). |
| classification | `text` | **NO** | - | - |
| witness_mechanism | `text` | YES | - | cross_actor: a different session/actor attests (e.g. reviewer ack, coordinator row). external_system: a signal from outside the actor's write reach (CI status, branch protection, deploy 200s). replay: deterministic re-execution by harness-owned machinery. Required (NOT NULL) when classification=already_witnessed. |
| enforcement_strength | `text` | YES | - | structural: the mechanism is categorically unforgeable by any Supabase-credentialed process (true today only for witness_mechanism=external_system, re-verified live against the external API at check-time -- see chk_gate_witness_registry_external_is_structural). convention: the mechanism is a distinguishing data column (e.g. differing session_id) but NOT cryptographically enforced, since every worker session and CI workflow share the same SUPABASE_SERVICE_ROLE_KEY and RLS provides no real separation for a Supabase-stored signal. convention-strength witnesses are an honest interim state pending per-actor-scoped credentials or signed attestations (tracked as a follow-on, not silently assumed solved). |
| exemption_reason | `text` | YES | - | Required (NOT NULL, non-empty) when classification=not_consequential_exempt. Must state why this gate carries no meaningful blast radius from self-authored evidence. |
| existing_mechanism_ref | `text` | YES | - | File:function reference to the ALREADY-EXISTING implementation this row classifies (e.g. "lib/ship/merge-witness-ladder.mjs:evaluateP3CI") -- this registry classifies and composes with existing machinery, it does not reimplement it. |
| notes | `text` | YES | - | - |
| classified_at | `timestamp with time zone` | **NO** | `now()` | - |
| classified_by | `text` | **NO** | `'unknown'::text` | - |

## Constraints

### Primary Key
- `gate_witness_registry_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_gate_witness_registry_gate_id`: UNIQUE (gate_id)

### Check Constraints
- `chk_gate_witness_registry_exempt_has_reason`: CHECK ((((classification = 'not_consequential_exempt'::text) AND (exemption_reason IS NOT NULL) AND (length(TRIM(BOTH FROM exemption_reason)) > 0)) OR (classification <> 'not_consequential_exempt'::text)))
- `chk_gate_witness_registry_external_is_structural`: CHECK (((witness_mechanism <> 'external_system'::text) OR (enforcement_strength = 'structural'::text)))
- `chk_gate_witness_registry_witnessed_has_mechanism`: CHECK ((((classification = 'already_witnessed'::text) AND (witness_mechanism IS NOT NULL)) OR (classification <> 'already_witnessed'::text)))
- `chk_gate_witness_registry_witnessed_has_strength`: CHECK ((((classification = 'already_witnessed'::text) AND (enforcement_strength IS NOT NULL)) OR (classification <> 'already_witnessed'::text)))
- `gate_witness_registry_classification_check`: CHECK ((classification = ANY (ARRAY['already_witnessed'::text, 'self_evidence_only'::text, 'not_consequential_exempt'::text])))
- `gate_witness_registry_enforcement_strength_check`: CHECK ((enforcement_strength = ANY (ARRAY['structural'::text, 'convention'::text])))
- `gate_witness_registry_witness_mechanism_check`: CHECK ((witness_mechanism = ANY (ARRAY['cross_actor'::text, 'external_system'::text, 'replay'::text])))

## Indexes

- `gate_witness_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX gate_witness_registry_pkey ON public.gate_witness_registry USING btree (id)
  ```
- `uq_gate_witness_registry_gate_id`
  ```sql
  CREATE UNIQUE INDEX uq_gate_witness_registry_gate_id ON public.gate_witness_registry USING btree (gate_id)
  ```

## RLS Policies

### 1. Anon can read gate_witness_registry (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role full access to gate_witness_registry (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
