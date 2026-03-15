# Brainstorm: Stage 5/7 Financial Modeling Integration

## Metadata
- **Date**: 2026-03-15
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Needs Triage
- **Team Analysis**: Skipped (discovery phase)
- **Related Ventures**: All active ventures
- **Part of**: Venture Stage Integration Master Plan (Area 2 of 8)

---

## Problem Statement

Stages 5 (Profitability Forecasting) and 7 (Revenue Architecture) produce financial data as flat advisory_data JSONB, but purpose-built tables (`financial_models`, `modeling_requests`) exist with proper schema and aren't used. Both tables are empty (0 rows). The stage pipeline doesn't read from or write to these structured tables.

## Discovery Summary

### financial_models table (0 rows)
- **Columns**: id, venture_id, company_id, template_type, model_name, model_data (JSONB)
- **Template types**: saas, marketplace, hardware, services, ecommerce, subscription, custom
- **FKs**: ventures.id, companies.id (duplicate FK on company_id — cleanup needed)
- **Status**: Schema complete, RLS not checked, never populated

### modeling_requests table (0 rows)
- **Columns**: id, subject, request_type, time_horizon_months, data_sources, input_parameters, status, projections, confidence_interval, actual_outcome, prediction_accuracy, venture_id, brief_id, nursery_id, requested_by
- **Request types**: time_horizon, build_cost, market_trend, portfolio_synergy, kill_gate_prediction, nursery_reeval, competitive_density
- **Status values**: pending, processing, completed, failed
- **Note**: No request_type for `profitability_forecast` or `revenue_architecture` — would need new types added

### What Stage 5 currently produces (from ListingLens deep assessment)
- financial_model artifact with: ARPU ($30), CAC ($120), LTV ($480), LTV:CAC (4.0x), payback (5 months)
- 3-year P&L: Y1 -$10K, Y2 $140K, Y3 $410K
- 3-year ROI: 6.2x
- Gross margin: 80% (unvalidated — vision API costs unknown)
- Break-even month: null (could not be computed)
- Kill/pass contradiction between artifact and stage_work

### What Stage 7 currently produces (from ListingLens deep assessment)
- pricing_model artifact with: 3 tiers ($19/$39/$99), ARPA ($30), blended unit economics
- No per-tier breakdown, no annual billing modeling
- Revenue projections reference stage 5 data

## Key Findings

1. **financial_models.template_type** is interesting — it categorizes by business model (SaaS, marketplace, etc.). This could drive which financial model template is used at stage 5.
2. **modeling_requests** has a prediction tracking system (projections → actual_outcome → prediction_accuracy) — this enables retrospective accuracy scoring of financial forecasts.
3. **Missing request types**: The check constraint doesn't include `profitability_forecast` or `revenue_architecture` — would need ALTER to add.
4. **Cross-stage potential**: modeling_requests links to venture_briefs and venture_nursery — could feed stage 0/1 financial estimates into stage 5/7 for comparison.
5. **Duplicate FK**: financial_models has two FKs on company_id pointing to same target — cleanup needed.

## Options Identified (not yet decided)

1. **financial_models as backing store for stage 5**: Stage 5 writes the P&L model to financial_models (template_type from venture archetype), venture_artifacts gets a reference
2. **modeling_requests for financial projections**: Stage 5 creates a modeling_request, the projection engine fills in projections/confidence_interval, stage checks prediction_accuracy over time
3. **Full rewrite**: Redesign the financial modeling pipeline to be template-driven per venture archetype (SaaS vs marketplace vs services have very different unit economics)

## Open Questions
- Should financial_models store versioned models (revision history)?
- How does the modeling_requests prediction accuracy loop work — who fills in actual_outcome?
- Should the kill gate at stage 5 use modeling_requests.kill_gate_prediction request type?
- Is the template_type (saas/marketplace/etc.) the right granularity for financial model selection?

## Suggested Next Steps
- Continue this brainstorm in a follow-up session with architecture decision phase
- Follow-up command: `/brainstorm Stage 5/7 Financial Modeling architecture — template-driven models, prediction accuracy tracking, kill gate integration --domain architecture --structured`
