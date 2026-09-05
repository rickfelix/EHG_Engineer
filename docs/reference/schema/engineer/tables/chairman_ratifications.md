# chairman_ratifications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-05T10:58:44.446Z
**Rows**: 56
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| ratified_at | `timestamp with time zone` | **NO** | `now()` | DB-clock DEFAULT for live captures (enforced at the writer layer, not by this DEFAULT alone -- a DEFAULT does not prevent caller override). The FR-5 backfill path is the sole sanctioned exception, supplying true historical dates via recordHistoricalRatification. |
| quote | `text` | **NO** | - | - |
| source | `text` | **NO** | - | - |
| target_contracts | `ARRAY` | **NO** | - | - |
| scribe_seat | `text` | **NO** | - | - |
| encoded_at | `timestamp with time zone` | YES | - | - |
| encoded_ref | `jsonb` | YES | - | - |
| marker_text | `text` | YES | - | The exact final contract wording, captured at ENCODING time (not ratification time) since only the scribe completing the encode knows the actual clause text. Used by FR-4 as the grep assertion target against live regenerated contract files. |
| uttered_at | `timestamp with time zone` | YES | - | When the chairman actually SPOKE the ruling. Distinct from ratified_at, which is the DB clock at insert time. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D. |
| quote_hash | `text` | YES | - | Content hash of quote, so a later edit to the stored quote is detectable. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D. |
| transcript_ref | `text` | YES | - | Reference to the source utterance so the quote can be re-checked against its origin. SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D. |

## Constraints

### Primary Key
- `chairman_ratifications_pkey`: PRIMARY KEY (id)

### Check Constraints
- `cr_encoded_ref_shape`: CHECK (((encoded_ref IS NULL) OR (jsonb_typeof(encoded_ref) = 'object'::text)))
- `cr_encoding_state_consistent`: CHECK ((((encoded_at IS NULL) AND (encoded_ref IS NULL) AND (marker_text IS NULL)) OR ((encoded_at IS NOT NULL) AND (encoded_ref IS NOT NULL) AND (marker_text IS NOT NULL) AND (btrim(marker_text) <> ''::text))))
- `cr_quote_nonempty`: CHECK ((btrim(quote) <> ''::text))
- `cr_scribe_seat_nonempty`: CHECK ((btrim(scribe_seat) <> ''::text))
- `cr_source_shape`: CHECK (((btrim(source) <> ''::text) AND (length(btrim(source)) >= 5)))
- `cr_target_contracts_valid`: CHECK (((cardinality(target_contracts) > 0) AND (target_contracts <@ ARRAY['adam'::text, 'coordinator'::text, 'solomon'::text, 'protocol'::text])))
- `cr_utterance_provenance_present`: CHECK (((uttered_at IS NOT NULL) AND (quote_hash IS NOT NULL) AND (transcript_ref IS NOT NULL))) NOT VALID

## Indexes

- `chairman_ratifications_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_ratifications_pkey ON public.chairman_ratifications USING btree (id)
  ```
- `chairman_ratifications_unencoded_idx`
  ```sql
  CREATE INDEX chairman_ratifications_unencoded_idx ON public.chairman_ratifications USING btree (ratified_at) WHERE (encoded_at IS NULL)
  ```

## RLS Policies

### 1. chairman_ratifications_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### chairman_ratifications_no_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION chairman_ratifications_no_delete()`

### chairman_ratifications_no_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION chairman_ratifications_freeze()`

---

[← Back to Schema Overview](../database-schema-overview.md)
