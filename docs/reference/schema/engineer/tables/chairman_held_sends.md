# chairman_held_sends Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-05T10:58:44.446Z
**Rows**: 9
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (33 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| consult_correlation_id | `uuid` | YES | - | session_coordination payload.correlation_id of the pre-send consult. THE reconciliation anchor. NULL only when performBoundedConsult reached the hold arm without an envelope (consult threw/timed out before insertCoordinationRow) — such rows are un-releasable and surface in v_chairman_held_sends_unreconcilable. |
| consult_row_id | `uuid` | YES | - | - |
| chairman_user_id | `text` | **NO** | - | - |
| chairman_email | `text` | **NO** | - | - |
| recipient_phone | `text` | YES | - | - |
| decision_id | `uuid` | YES | - | - |
| subject | `text` | **NO** | - | - |
| body | `text` | **NO** | - | - |
| options | `jsonb` | **NO** | `'[]'::jsonb` | string[] from extractOptionLabels(). CHECK-enforced to be a JSON ARRAY (not an object) because it is written verbatim to chairman_decisions.brief_data.sms_options at release. |
| consequence_level | `text` | YES | - | - |
| message_kind | `text` | YES | - | - |
| sender_callsign | `text` | YES | - | - |
| session_id | `text` | YES | - | - |
| status | `text` | **NO** | `'held'::text` | - |
| hold_reason | `text` | **NO** | - | - |
| held_at | `timestamp with time zone` | **NO** | `now()` | - |
| hold_expires_at | `timestamp with time zone` | **NO** | `(now() + '24:00:00'::interval)` | How long we keep HOLDING. NOT the SMS reply-token TTL (that is chairman_decisions.sms_reply_token_expires_at, minted at release). Defaulted to 24h to match reply-class.cjs RECONCILE_HORIZON_MS — past it the consult row has aged out of the reconciler window and the hold can never be resolved. |
| released_at | `timestamp with time zone` | YES | - | - |
| release_disposition | `text` | YES | - | - |
| release_verdict | `text` | YES | - | - |
| release_verdict_answer_row_id | `uuid` | YES | - | session_coordination.id of the ANSWERING row that released this hold. Required for status=released by CHECK — a release must cite the row that caused it, so "released" can never be asserted without the evidence that justifies it. |
| released_send_result | `jsonb` | YES | - | - |
| claimed_at | `timestamp with time zone` | YES | - | - |
| claimed_by | `text` | YES | - | - |
| attempts | `integer(32)` | **NO** | `0` | - |
| last_error | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| reply_instruction | `text` | YES | - | SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3) — mirrors message.replyInstruction at hold time so the release path can restore it and satisfy rubric-engine/lint.js check 3 (reply_instruction) on re-evaluation. Nullable: a hold with no reply instruction is a pre-existing malformed decision, not a schema violation. |
| reply_id | `text` | YES | - | SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3) — mirrors message.replyId (singular — lint.js:177 reads one string, never an array) so the release path can restore it and satisfy rubric-engine/lint.js check 9 (reply_ids). |
| no_reply_consequence | `text` | YES | - | SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3) — mirrors message.noReplyConsequence at hold time so the release path can fold it back into the composed body via composeDecisionSmsBody() exactly once (see FR-4 skipCompose). |

## Constraints

### Primary Key
- `chairman_held_sends_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `chairman_held_sends_consult_correlation_id_key`: UNIQUE (consult_correlation_id)

### Check Constraints
- `chairman_held_sends_consequence_level_check`: CHECK (((consequence_level IS NULL) OR (consequence_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))))
- `chairman_held_sends_metadata_is_object_check`: CHECK ((jsonb_typeof(metadata) = 'object'::text))
- `chairman_held_sends_options_is_array_check`: CHECK ((jsonb_typeof(options) = 'array'::text))
- `chairman_held_sends_release_disposition_check`: CHECK (((release_disposition IS NULL) OR (release_disposition = ANY (ARRAY['send'::text, 'suppress'::text, 'amend'::text]))))
- `chairman_held_sends_released_requires_citation_check`: CHECK (((status <> 'released'::text) OR ((released_at IS NOT NULL) AND (release_disposition IS NOT NULL) AND (release_verdict_answer_row_id IS NOT NULL))))
- `chairman_held_sends_status_check`: CHECK ((status = ANY (ARRAY['held'::text, 'releasing'::text, 'released'::text, 'suppressed'::text, 'abandoned'::text, 'expired'::text, 'unreconcilable'::text])))
- `chairman_held_sends_suppressed_requires_citation_check`: CHECK (((status <> 'suppressed'::text) OR ((released_at IS NOT NULL) AND (release_verdict_answer_row_id IS NOT NULL))))
- `chairman_held_sends_unreleased_is_clean_check`: CHECK (((status <> ALL (ARRAY['held'::text, 'releasing'::text])) OR ((released_at IS NULL) AND (release_disposition IS NULL))))

## Indexes

- `chairman_held_sends_claimable_idx`
  ```sql
  CREATE INDEX chairman_held_sends_claimable_idx ON public.chairman_held_sends USING btree (held_at) WHERE (status = 'held'::text)
  ```
- `chairman_held_sends_consult_correlation_id_key`
  ```sql
  CREATE UNIQUE INDEX chairman_held_sends_consult_correlation_id_key ON public.chairman_held_sends USING btree (consult_correlation_id)
  ```
- `chairman_held_sends_created_at_idx`
  ```sql
  CREATE INDEX chairman_held_sends_created_at_idx ON public.chairman_held_sends USING btree (created_at)
  ```
- `chairman_held_sends_decision_id_idx`
  ```sql
  CREATE INDEX chairman_held_sends_decision_id_idx ON public.chairman_held_sends USING btree (decision_id) WHERE (decision_id IS NOT NULL)
  ```
- `chairman_held_sends_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_held_sends_pkey ON public.chairman_held_sends USING btree (id)
  ```

## RLS Policies

### 1. chairman_held_sends_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### chairman_held_sends_touch_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
