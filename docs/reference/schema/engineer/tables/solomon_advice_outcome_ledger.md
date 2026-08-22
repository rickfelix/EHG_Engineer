# solomon_advice_outcome_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 1,728
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| advisory_id | `uuid` | YES | - | - |
| correlation_id | `text` | **NO** | - | - |
| sd_key | `text` | YES | - | - |
| proposal_summary | `text` | **NO** | - | - |
| proposal_kind | `text` | **NO** | `'advisory'::text` | - |
| decision | `text` | **NO** | `'pending'::text` | - |
| decision_by | `text` | YES | - | - |
| decision_at | `timestamp with time zone` | YES | - | - |
| outcome | `text` | **NO** | `'unknown'::text` | - |
| outcome_sd_key | `text` | YES | - | - |
| outcome_ref | `text` | YES | - | - |
| cost_tokens | `bigint(64)` | YES | - | - |
| cost_wall_ms | `bigint(64)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| closed_by | `text` | YES | - | Identifies the mechanism/actor that set `outcome` away from unknown (e.g. 'solomon-ledger-reconcile.cjs' for an auto-close, or a human identifier for a manual caused_rework judgment). NULL until closed. NOT enforced by a CHECK constraint -- a manual update to `outcome` can leave this NULL; only the reconcile script's auto-close path is guaranteed to stamp it. SD-LEO-INFRA-REWARD-SPINE-ONE-001-B. |
| closed_at | `timestamp with time zone` | YES | - | Timestamp `outcome` was set away from unknown. NULL until closed. Same enforcement caveat as closed_by. SD-LEO-INFRA-REWARD-SPINE-ONE-001-B. |
| parent_correlation_id | `text` | YES | - | When set, this row is a "tail" of the advisory whose correlation_id equals this value -- stamping the primary auto-inherits its decision onto all matching tail rows (coordinator-ack-adam.cjs recordLedgerDecision). NULL for a standalone/primary advisory. SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001. |
| defer_trigger | `text` | YES | - | Required (DB-enforced) whenever decision='deferred' -- names the concrete re-fire event that will force this deferral back into review. NULL for every other decision value. SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001. |
| cost_captured | `boolean` | YES | `false` | Durable marker: true iff cost_tokens/cost_wall_ms were captured from the writing session's authoritative telemetry at write time (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 W3, FR-6/TR-4). false (the fail-soft default) means telemetry was unavailable and the cost columns are NULL. The weekly Fable budget rollup counts ONLY cost_captured=true rows so a missing datum never distorts spend share. |
| batch_stamped | `boolean` | YES | `false` | Durable exclusion marker (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 W2, FR-5/TR-3): true iff this row's decision was stamped in the 2026-07-12 non-contemporaneous retro backfill (198 rows). The accuracy rollup (fleet-dashboard.cjs computeSolomonLedgerRollup) EXCLUDES batch_stamped=true rows from BOTH the numerator and denominator so accuracy reflects only trustworthy contemporaneous evidence. Deterministic durable column, NOT a re-derived timestamp heuristic. false (the default) = a normal contemporaneous row. |
| judgment_expired_at | `timestamp with time zone` | YES | - | When the adoption judgment aged out unanswered. INDEPENDENT of decision, which stays 'pending' -- a row can be both never-judged and still-pending, and that is the truth. Deliberately NOT a decision value: routing expiry through decision would move drain-inventory.mjs:88 and :91 together and inflate the accuracy denominator at fleet-dashboard.cjs:1959. SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-1. |
| judgment_expired_by | `text` | YES | - | Identifier of the aging process that stamped judgment_expired_at. Constraint-required so a stamp can never be ANONYMOUS -- it does NOT establish WHO stamped it, because the actor value is a public constant and every writer shares one service-role identity. TS-10 (did the mechanism actually RUN) needs a witness the database cannot supply. SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-2. |
| decision_requested | `boolean` | **NO** | `true` | Admission discriminator (SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 FR-1b): true iff the sending Solomon advisory REQUESTS a decision; false iff informational-only. Sender-stamped at send time from scripts/solomon-advisory.cjs --informational (opt-OUT: absent => true, the non-suppressing direction) via payload.decision_requested. Read by scripts/solomon-ledger-pending-resurface.cjs planStalePending (the actionable-workload queue). DELIBERATELY NOT read by lib/solomon/conduct-probes.js staleOpenAdviceCount, which is a separate governance probe holding an explicit anti-aging principle -- do not fold the two predicates into one helper. All pre-existing rows are true by DEFAULT: an explicitly documented assumption, NOT a measurement (source payloads purge at ~13 days and were unrecoverable for the large majority of them). |

## Constraints

### Primary Key
- `solomon_advice_outcome_ledger_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `solomon_advice_outcome_ledger_correlation_id_key`: UNIQUE (correlation_id)

### Check Constraints
- `solomon_advice_outcome_ledger_decision_by_identity_check`: CHECK (((decision_by IS NULL) OR ((length(decision_by) <= 40) AND (decision_by !~ '[[:space:]]'::text)))) NOT VALID
- `solomon_advice_outcome_ledger_decision_check`: CHECK ((decision = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'partial'::text, 'deferred'::text])))
- `solomon_advice_outcome_ledger_defer_trigger_required`: CHECK (((decision <> 'deferred'::text) OR (defer_trigger IS NOT NULL)))
- `solomon_advice_outcome_ledger_outcome_check`: CHECK ((outcome = ANY (ARRAY['unknown'::text, 'shipped_clean'::text, 'reverted'::text, 'caused_rework'::text])))
- `solomon_advice_outcome_ledger_proposal_kind_check`: CHECK ((proposal_kind = ANY (ARRAY['advisory'::text, 'finding'::text, 'consult_answer'::text])))
- `solomon_ledger_judgment_expiry_attributed`: CHECK (((judgment_expired_at IS NULL) OR (judgment_expired_by IS NOT NULL)))

## Indexes

- `idx_solomon_ledger_created`
  ```sql
  CREATE INDEX idx_solomon_ledger_created ON public.solomon_advice_outcome_ledger USING btree (created_at DESC)
  ```
- `idx_solomon_ledger_decision`
  ```sql
  CREATE INDEX idx_solomon_ledger_decision ON public.solomon_advice_outcome_ledger USING btree (decision)
  ```
- `idx_solomon_ledger_judgment_expired`
  ```sql
  CREATE INDEX idx_solomon_ledger_judgment_expired ON public.solomon_advice_outcome_ledger USING btree (judgment_expired_at) WHERE (judgment_expired_at IS NOT NULL)
  ```
- `idx_solomon_ledger_outcome_sd_key`
  ```sql
  CREATE INDEX idx_solomon_ledger_outcome_sd_key ON public.solomon_advice_outcome_ledger USING btree (outcome_sd_key) WHERE (outcome_sd_key IS NOT NULL)
  ```
- `idx_solomon_ledger_parent_correlation`
  ```sql
  CREATE INDEX idx_solomon_ledger_parent_correlation ON public.solomon_advice_outcome_ledger USING btree (parent_correlation_id) WHERE (parent_correlation_id IS NOT NULL)
  ```
- `solomon_advice_outcome_ledger_correlation_id_key`
  ```sql
  CREATE UNIQUE INDEX solomon_advice_outcome_ledger_correlation_id_key ON public.solomon_advice_outcome_ledger USING btree (correlation_id)
  ```
- `solomon_advice_outcome_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX solomon_advice_outcome_ledger_pkey ON public.solomon_advice_outcome_ledger USING btree (id)
  ```

## RLS Policies

### 1. solomon_advice_outcome_ledger_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. solomon_advice_outcome_ledger_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_solomon_ledger_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_solomon_advice_outcome_ledger_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
