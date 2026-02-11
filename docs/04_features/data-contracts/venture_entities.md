# Venture Entities (vh)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: migration, rls, sd, reference

## Core Tables

### `vh_companies`
- Root tenant container.
- RLS: members match `vh_user_company_access`; service role full control.

### `vh_user_company_access`
- Maps users to companies with `role` enum (`viewer`, `admin`, etc.).
- RLS: users can view their records; service role manages assignments.

### `vh_ventures`
- Primary venture record.
- Columns:
  - `sd_id UUID` – governance SD (read-only, set by ingest job).
  - `prd_id UUID` – governance PRD.
  - `backlog_id UUID` – governance backlog item (if applicable).
  - `gate_status TEXT` – cached governance gate decision.
  - `stage_progress JSONB` – venture stage telemetry.
- Indexes: `idx_vh_ventures_sd_id`, `idx_vh_ventures_prd_id`.
- RLS: `vh_user_can_access_company(company_id)` predicate; service role writes.

### `vh_ideas`, `vh_feedback_intelligence`, `vh_feedback_trends`, `vh_customer_sentiment_history`
- All scoped by `venture_id`/`company_id`.
- RLS: service role mutations; members read when they can access parent venture.

### Onboarding Tables (`vh_onboarding_progress`, `vh_onboarding_steps`, `vh_onboarding_preferences`)
- User-scoped onboarding state.
- RLS: user-level predicates on `user_id`.

## Ingest Views
- `vh_ingest.eng_prd_payload_v1` – direct proxy of governance PRD export; read-only.
- `vh_ingest.eng_trace` – direct proxy of governance trace view.

## Venture Views
- `v_vh_governance_snapshot`
  - Columns: `venture_id`, `sd_id`, `prd_id`, `backlog_id`, `gate_status`, `last_sync_at`.
  - Consumers: venture dashboard, analytics overlays.
- `v_vh_stage_progress`
  - Columns: `venture_id`, `stage`, `gate_met`, `qa_gate_min` (derived from `v_eng_backlog_rollup`).
  - Consumers: stage heatmaps, QA gating monitors.

## Contract Notes
- Venture migrations must never reference governance base tables directly; only `v_eng_*` views via `vh_ingest`.
- Governance UUIDs are required for any integration back to engineering systems.
- Any new venture table must adopt `vh_` prefix and include explicit RLS policy entries.
