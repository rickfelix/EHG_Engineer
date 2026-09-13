# chairman_ratification_verifications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 101
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| target_ratification_id | `uuid` | **NO** | - | - |
| attempt_kind | `text` | **NO** | - | - |
| outcome | `text` | **NO** | - | - |
| encoded_at_persisted | `boolean` | **NO** | - | - |
| pin_tier | `text` | YES | - | Literal TIER value from lib/chairman/pinned-contract-read.mjs (exact_commit_pin | approximate_encoded_at_pin | db_section_content). Tier 2 and 3 are materially WEAKER evidence than tier 1 and a reader cannot otherwise tell them apart. NULL only when outcome is 'not_applicable' (an encoded_ref shape with no rendered file), where no tier was resolved. |
| commit_sha | `text` | YES | - | - |
| target_file | `text` | YES | - | - |
| file_sha256 | `text` | YES | - | - |
| marker_offset | `integer(32)` | YES | - | UTF-16 code-unit index from JS String.prototype.indexOf into the content hashed as file_sha256. NOT a byte offset and NOT a line number. |
| attempted_encoded_ref | `jsonb` | **NO** | - | What the encode was about to assert. On a refused attempt the parent row keeps encoded_ref NULL permanently, so this column is the only surviving record of the attempted claim. |
| attempted_marker_text | `text` | **NO** | - | - |
| marker_sha256 | `text` | **NO** | - | - |
| reason | `text` | YES | - | - |
| producer | `text` | **NO** | - | - |
| run_id | `text` | **NO** | - | - |
| detail | `jsonb` | **NO** | `'{}'::jsonb` | - |
| verified_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_ratification_verifications_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_ratification_verifications_target_ratification_id_fkey`: target_ratification_id → chairman_ratifications(id)

### Check Constraints
- `chairman_ratification_verifications_attempt_kind_check`: CHECK ((attempt_kind = ANY (ARRAY['live_encode'::text, 'legacy_backfill_audit'::text])))
- `chairman_ratification_verifications_outcome_check`: CHECK ((outcome = ANY (ARRAY['verified'::text, 'marker_absent'::text, 'no_commit_pin'::text, 'unverifiable_infrastructure'::text, 'not_applicable'::text])))
- `chairman_ratification_verifications_pin_tier_check`: CHECK (((pin_tier IS NULL) OR (pin_tier = ANY (ARRAY['exact_commit_pin'::text, 'approximate_encoded_at_pin'::text, 'db_section_content'::text]))))
- `crv_attempted_encoded_ref_is_object`: CHECK ((jsonb_typeof(attempted_encoded_ref) = 'object'::text))
- `crv_attempted_marker_text_nonempty`: CHECK ((btrim(attempted_marker_text) <> ''::text))
- `crv_backfill_audits_encoded_rows_only`: CHECK (((attempt_kind <> 'legacy_backfill_audit'::text) OR (encoded_at_persisted = true)))
- `crv_commit_sha_shape`: CHECK (((commit_sha IS NULL) OR (commit_sha ~ '^[0-9a-f]{7,40}$'::text)))
- `crv_commit_sha_tier_agreement`: CHECK ((((pin_tier IS NULL) AND (commit_sha IS NULL)) OR ((pin_tier IS NOT NULL) AND ((pin_tier = 'db_section_content'::text) = (commit_sha IS NULL)))))
- `crv_detail_is_object`: CHECK ((jsonb_typeof(detail) = 'object'::text))
- `crv_file_sha256_shape`: CHECK (((file_sha256 IS NULL) OR (file_sha256 ~ '^[0-9a-f]{64}$'::text)))
- `crv_marker_absent_never_persisted`: CHECK (((attempt_kind <> 'live_encode'::text) OR (outcome <> 'marker_absent'::text) OR (encoded_at_persisted = false)))
- `crv_marker_offset_nonneg`: CHECK (((marker_offset IS NULL) OR (marker_offset >= 0)))
- `crv_marker_offset_requires_a_read`: CHECK (((marker_offset IS NULL) OR ((commit_sha IS NOT NULL) AND (target_file IS NOT NULL) AND (file_sha256 IS NOT NULL))))
- `crv_marker_sha256_shape`: CHECK ((marker_sha256 ~ '^[0-9a-f]{64}$'::text))
- `crv_no_commit_pin_is_tier3`: CHECK (((outcome <> 'no_commit_pin'::text) OR (pin_tier = 'db_section_content'::text)))
- `crv_no_commit_pin_never_persisted`: CHECK (((attempt_kind <> 'live_encode'::text) OR (outcome <> 'no_commit_pin'::text) OR (encoded_at_persisted = false)))
- `crv_nonverified_has_reason`: CHECK (((outcome = 'verified'::text) OR (btrim(COALESCE(reason, ''::text)) <> ''::text)))
- `crv_producer_shape`: CHECK (((btrim(producer) <> ''::text) AND (length(btrim(producer)) >= 8)))
- `crv_run_id_shape`: CHECK (((btrim(run_id) <> ''::text) AND (length(btrim(run_id)) >= 6)))
- `crv_target_file_is_repo_relative`: CHECK (((target_file IS NULL) OR ((btrim(target_file) <> ''::text) AND (target_file !~ '^([A-Za-z]:)?[\\/]'::text) AND (POSITION(('..'::text) IN (target_file)) = 0))))
- `crv_tier_null_only_for_uncheckable_outcomes`: CHECK (((pin_tier IS NOT NULL) OR (outcome = ANY (ARRAY['not_applicable'::text, 'unverifiable_infrastructure'::text]))))
- `crv_verified_requires_pin_evidence`: CHECK (((outcome <> 'verified'::text) OR ((commit_sha IS NOT NULL) AND (target_file IS NOT NULL) AND (file_sha256 IS NOT NULL) AND (marker_offset IS NOT NULL))))

## Indexes

- `chairman_ratification_verifications_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_ratification_verifications_pkey ON public.chairman_ratification_verifications USING btree (id)
  ```
- `crv_not_verified_idx`
  ```sql
  CREATE INDEX crv_not_verified_idx ON public.chairman_ratification_verifications USING btree (verified_at DESC) WHERE (outcome <> 'verified'::text)
  ```
- `crv_one_backfill_audit_per_ratification`
  ```sql
  CREATE UNIQUE INDEX crv_one_backfill_audit_per_ratification ON public.chairman_ratification_verifications USING btree (target_ratification_id) WHERE (attempt_kind = 'legacy_backfill_audit'::text)
  ```
- `crv_target_ratification_idx`
  ```sql
  CREATE INDEX crv_target_ratification_idx ON public.chairman_ratification_verifications USING btree (target_ratification_id, verified_at DESC)
  ```

## RLS Policies

### 1. chairman_ratification_verifications_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### chairman_ratification_verifications_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION chairman_ratification_verifications_no_delete()`

### chairman_ratification_verifications_no_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION chairman_ratification_verifications_freeze()`

### crv_stamp_verified_at

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION chairman_ratification_verifications_stamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
