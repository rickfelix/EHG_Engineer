-- SD-LEO-FIX-STAGE-CONFIG-TEMPLATE-001
-- Fix Stage 16 lifecycle_stage_config description
-- The description incorrectly says "TypeScript interfaces, SQL schemas, and API contract generation"
-- which describes Stage 14 (Technical Architecture), not Stage 16 (Financial Projections).

UPDATE lifecycle_stage_config
SET description = 'Revenue modeling, burn rate analysis, runway calculations, break-even projections, P&L forecasting, and cash balance tracking for venture financial viability assessment.',
    updated_at = NOW()
WHERE stage_number = 16;
