---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Chairman Vision Dashboard Implementation

**SD**: SD-MAN-FEAT-CHAIRMAN-DASHBOARD-VISION-001
**Route**: `/chairman/vision`
**Target**: EHG frontend app (`../ehg/`)

## Files Created

### New Components (`src/components/chairman-v2/VisionDashboard/`)
- `VisionDashboard.tsx` — compositor, composes all 4 sections
- `VisionScoreCard.tsx` — portfolio vision score (0-100) with delta vs 30d
- `DimensionBreakdownPanel.tsx` — per-dimension average scores, sorted ascending (weakest first)
- `VisionTrendChart.tsx` — Recharts LineChart with 30/60/90d toggle
- `CorrectiveSDsTable.tsx` — active corrective SDs table with info drawer
- `index.ts` — barrel exports

### New Hook (`src/hooks/`)
- `useVisionDashboardData.ts` — fetches eva_vision_scores + strategic_directives_v2

### Modified Files
- `src/routes/chairmanRoutes.tsx` — added `/chairman/vision` route
- `src/components/chairman-v2/ChairmanLayout.tsx` — added Vision nav item (Eye icon)

## Data Sources
- `eva_vision_scores` — portfolio score, dimension breakdown, trend (direct Supabase query)
- `strategic_directives_v2` WHERE `vision_origin_score_id IS NOT NULL AND status NOT IN (completed,cancelled)`

## Key Implementation Notes
- `dimension_scores` is a JSONB **array** format: `[{dimension, score, weight, reasoning}]`
- Latest score per SD = row with MAX(scored_at) per sd_id
- Delta vs 30d ago: compare current avg to avg of rows older than 30 days ago
- EHG app has no git repo — changes live on disk at `C:\Users\rickf\Projects\_EHG\ehg\`
