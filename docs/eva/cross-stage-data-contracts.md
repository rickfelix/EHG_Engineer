---
Category: Reference
Status: Approved
Version: 1.0.0
Author: SD-LEO-FEAT-STAGE-POST-LAUNCH-001
Last Updated: 2026-05-05
Tags: [eva, stage-templates, data-contracts, venture-artifacts, cross-stage]
---
# EVA Cross-Stage Data Contracts

Authoritative reference for how lifecycle stages exchange data via `venture_artifacts`. Each contract documents: source stage, sink stage, artifact_type key, expected payload shape, and missing-data fallback marker.

> Why a doc and not just code: cross-stage data contracts are spread across `lib/eva/stage-templates/analysis-steps/*.js` files. When upstream stage output schemas drift, downstream stages silently consume wrong shapes. This file is the single discoverable reference for grep-style auditing.

## Contracts

### S16 → S25 — Financial baseline for post-launch review

**Source**: Stage 16 (Financial Projections) writes `venture_artifacts` row with:
- `lifecycle_stage = 16`
- `artifact_type = 'financial_forecast_summary'`
- payload shape includes `month1_signups`, `month1_revenue`, `churn_rate` (numbers; `'TBD'` accepted)

**Sink**: Stage 25 (Post-Launch Review) — `analyzeStage25PostLaunchReview` retrieves the row via:
```sql
SELECT * FROM venture_artifacts
WHERE venture_id = $1
  AND lifecycle_stage = 16
  AND artifact_type = 'financial_forecast_summary'
ORDER BY created_at DESC LIMIT 1;
```

**Missing-baseline fallback**: When the row is absent, S25 emits `baseline_status: 'no_baseline'` (review still produces, but `metrics.*.projected` falls back to `'TBD'`). Distinct from full `status: 'no_data'` (which is gated on FR-4 reason classification).

### S22-S24 → S25 — Launch artifact namespace separation

**Source**: Stages 22-24 write `launch_*` prefixed artifacts:
- `launch_test_plan`, `launch_uat_report`, `launch_deployment_runbook`
- `launch_marketing_checklist`, `launch_analytics_dashboard`
- `launch_assumptions_vs_reality` *(deprecated for S25 use; see grace window note)*
- `launch_user_feedback_summary` *(deprecated for S25 use)*

**Sink**: Stage 25 reads its OWN artifacts using the `postlaunch_*` namespace:
- `postlaunch_assumptions_vs_reality`
- `postlaunch_user_feedback_summary`
- `postlaunch_analytics_dashboard`

**Why two namespaces**: S22-S24 launch operations and S25 post-launch review historically collided in the `launch_*` namespace. Per SD-LEO-FEAT-STAGE-POST-LAUNCH-001 FR-2, S25 outputs migrated to `postlaunch_*` prefix. Legacy `launch_*` keys preserved in CHECK constraint during grace window; separate post-grace SD will DROP legacy keys.

**Migration**: `database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql` (CHECK), `20260504_ensure_s25_lifecycle_stage_config.sql` (gate).

### S24 → S25 — Real-launch detection

**Source**: Stage 24 (Live & Announce) writes a launch indicator. Per SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-3, S24 today may be theatrical (no real platform integrations).

**Sink**: Stage 25 inspects `stage24Data.real_launch`:
- `true` → metrics collection proceeds against postlaunch artifacts
- `false` (or absent) → S25 emits `status: 'no_data', reason: 's24_no_real_launch'`

**No-data reason discrimination** (FR-4):
| Reason                  | Meaning                                          | UI variant         |
|-------------------------|--------------------------------------------------|--------------------|
| `s24_no_real_launch`    | S24 was theatrical; no real launch happened yet  | `Alert default`    |
| `s24_parse_error`       | S24 emitted but payload was unparseable          | `Alert destructive`|
| `no_artifact`           | postlaunch_* artifacts absent for venture        | `Alert default`    |
| `no_baseline`           | S16 financial forecast missing                   | inline (non-error) |

### S25 → S26 — Exit-gate for advance to Growth Playbook

**Source**: Stage 25 must emit at least one row of each required postlaunch_* type before stage 26 (Growth Playbook) can advance.

**Sink**: `advance_venture_stage(v, 25 → 26)` RPC reads `lifecycle_stage_config.required_artifacts` for stage 25:
```jsonb
["postlaunch_assumptions_vs_reality",
 "postlaunch_user_feedback_summary",
 "postlaunch_analytics_dashboard"]
```

When any required key is absent in `venture_artifacts` for the venture, RPC returns `ARTIFACT_MISSING` enum.

## Adding a new contract

1. Append a section here with source/sink/payload/fallback.
2. Reference the SD that introduced the contract.
3. Cross-link from the producing and consuming `analysis-step/*.js` files via JSDoc `@see` tag.
4. If the contract needs a CHECK constraint update, schedule a migration in `database/migrations/` and document the grace window.
