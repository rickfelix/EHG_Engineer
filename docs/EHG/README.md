# EHG Venture Hub

## Purpose
- Operates venture lifecycle (40-stage workflow) using venture-facing tables prefixed with `vh_`.
- Consumes governance outputs from EHG_Engineering via read-only views (`vh_ingest.eng_*`).
- All strategic data remains in governance database; venture app stores execution telemetry only.

## Data Flow
1. Governance publishes SD/PRD/backlog payloads via `v_eng_*` views.
2. Venture ingest views (`vh_ingest.eng_prd_payload_v1`, `vh_ingest.eng_trace`) surface read-only snapshots.
3. Venture entities (`vh_ventures`, `vh_ideas`, feedback tables) attach governance IDs using `sd_id`, `prd_id`, `backlog_id` columns.
4. Analytics views (`v_vh_governance_snapshot`, `v_vh_stage_progress`) expose venture status alongside governance QA gates.

## Database Workflow
- Author venture migrations within `db/migrations/vh/` (timestamped, reversible).
- Update derived views under `db/views/vh/`.
- Maintain RLS policies in `db/policies/vh/rls.sql`; only service role may mutate tables.
- Document schema contracts under `docs/EHG/data-contracts/`.

## Two-App Boundary Rules
- ❌ No direct writes to EHG_Engineering tables or schemas.
- ✅ Read governance data only via `vh_ingest` views.
- ✅ All venture writes scoped by company via RLS helper `vh_user_can_access_company`.
- ✅ Governed IDs (`sd_id`, `prd_id`, `backlog_id`) are UUIDs mirrored from governance; treat as read-only metadata.

## Key Views
- `v_vh_governance_snapshot` – current linkage for each venture (sd/prd/backlog).
- `v_vh_stage_progress` – stage-level gating aligned with governance QA requirements.

## Compliance Checklist
- [ ] Migration references new UUID linkage columns.
- [ ] No Supabase client scripts target governance tables.
- [ ] CHANGELOG & audit report updated with vh migration IDs.

## Operations Runbook
- **Hydrate linkage (staging):** `bash ops/jobs/hydrate_vh_linkage.sh`
- **Ingestion job dry-run:** `VH_INGEST_ENABLED=true VH_INGEST_DRY_RUN=true node apps/ingest/vh_governance_ingest.ts`
- **Ingestion job live (staging):** set `VH_INGEST_ENABLED=true` and ensure env `VH_DATABASE_URL`; monitor `ops/audit/ingest.log`.

## SLAs & Ownership
- **Ingestion cadence:** run hydration weekly; continuous ingest job should process governance updates within 15 minutes.
- **Linkage coverage target:** ≥95% of ventures with `sd_id/prd_id/backlog_id`. Review `ops/jobs/out/ventures_missing_linkage.csv` for stragglers.
- **Feature flag default:** `VH_INGEST_ENABLED` stays `false` in production until sign-off.
