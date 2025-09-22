# Strategic Directives (eng)

## Table: `strategic_directives_v2`
- **Primary Key:** `sd_uuid` (generated UUID v5 from `sd_key`).
- **Natural Key:** `sd_key` (`SD-YYYY-MM-DD-<slug>`), generated from approval/create date + slug.
- **Columns:**
  - `owner TEXT NOT NULL` – accountable governance owner (defaults backfilled from `created_by`).
  - `decision_log_ref TEXT` – pointer to decision register entry.
  - `evidence_ref TEXT` – canonical evidence artifact.
  - `sd_slug TEXT` – lowercased hyphen slug (source for `sd_key`).
  - `sd_uuid UUID` – deterministic UUID for FK usage.
  - Existing metadata retained (`status`, `priority`, `metadata` JSON, etc.).
- **Constraints:**
  - `eng_sd_v2_sd_key_format_chk` ensures `sd_key` pattern.
  - Unique constraints on `sd_key` & `sd_uuid`.
- **RLS:**
  - Service role full control (`eng_sd_service_rw`).
  - Analyst read-only for approved directives (`eng_sd_analyst_ro`).
- **Consumers:**
  - Views: `v_eng_trace`, `v_eng_prd_payload_v1`, `v_eng_backlog_rollup`.
  - Downstream ingestion: venture app consumes via `v_vh_governance_snapshot`.
- **Notes:**
  - Legacy `id` values moved under `legacy_id`; do not rely on historical format.
  - All write flows must populate `owner`, `decision_log_ref`, `evidence_ref`.
