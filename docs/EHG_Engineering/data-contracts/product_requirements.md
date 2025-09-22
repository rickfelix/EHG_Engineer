# Product Requirements (eng)

## Table: `product_requirements_v2`
- **Primary Key:** `prd_uuid` (generated UUID v5 from `sd_id`, `id`, `version`).
- **Foreign Keys:**
  - `sd_id UUID NOT NULL` → `strategic_directives_v2(sd_uuid)`.
- **Contract Columns:**
  - `completeness_score NUMERIC(5,2)` – 0-100; enforced by `eng_prd_completeness_chk`.
  - `risk_rating TEXT` – enum (`low`, `medium`, `high`).
  - `acceptance_criteria_json JSONB NOT NULL` – structured criteria payload (replaces ad-hoc arrays).
  - `commit_sha TEXT`, `pr_url TEXT` – trace links to implementation.
  - Legacy `sd_legacy_id` retained for backfill auditing; avoid in new work.
- **Indexes:** `idx_prd_sd_id` on `sd_id` for join performance.
- **RLS:**
  - Service role read/write (`eng_prd_service_rw`).
  - Analyst read-only (`eng_prd_analyst_ro`).
- **Views:**
  - `v_eng_prd_payload_v1` publishes `prd_id`, `sd_id`, `priority`, `acceptance_criteria_json`.
  - `v_eng_trace` surfaces `commit_sha` + PR linkage.
- **Migration Expectations:** Any schema change requires updating `db/migrations/eng/` and this document.
