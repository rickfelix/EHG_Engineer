# Backlog (eng)


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: rls, feature, sd, directive

## Table: `eng_backlog`
- **Primary Key:** `id UUID` (generated).
- **Foreign Keys:**
  - `sd_id UUID NOT NULL` → `strategic_directives_v2(sd_uuid)`.
  - `prd_id UUID` → `product_requirements_v2(prd_uuid)`.
- **Contract Columns:**
  - `type TEXT` – enum (`feature`, `bug`, `chore`, `doc`).
  - `state TEXT` – enum (`todo`, `doing`, `blocked`, `done`).
  - `priority TEXT` – enum (`P0`-`P3`).
  - `qa_gate_min NUMERIC` – 0-100 gate threshold.
  - `gate_status TEXT` – textual gating result (default `pending`).
  - `commit_sha`, `pr_url` – trace to delivery artifacts.
  - `metadata JSONB` – carries `my_comments`, `stage_number`, `phase`, `extras` snapshot from legacy imports.
- **Derived Views:**
  - `v_eng_trace` joins backlog items with PRDs for commit mapping.
  - `v_eng_backlog_rollup` emits `readiness_score` for analytics.
- **RLS:**
  - Service role read/write (`eng_backlog_service_rw`).
  - Analyst read-only (`eng_backlog_analyst_ro`).
- **Legacy Data:**
  - Original `sd_backlog_map` retained as `eng_backlog_legacy` for historical reconciliation; do not write to it.
