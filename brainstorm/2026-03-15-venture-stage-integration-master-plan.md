# Brainstorm: Venture Stage Integration Master Plan

## Metadata
- **Date**: 2026-03-15
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Skipped (master plan — individual brainstorms will have team analysis)
- **Related Ventures**: All active ventures

---

## Problem Statement

The EHG venture lifecycle has ~60 standalone tables with venture FKs that aren't wired into the 25-stage workflow or post-25 operations mode. Purpose-built infrastructure exists for competitive intelligence, financial modeling, risk management, exit planning, brand/design (SRIP), and marketing — but stages produce flat advisory_data JSONBs instead of leveraging these structured tables.

Additionally, stages 14-16 (THE BLUEPRINT) are marked `sd_required` but should produce AI-generated planning documents (data model, wireframes, user stories, design specs) that the chairman reviews at a promotion gate before building begins.

## Discovery Summary

### What surfaced this
The /prove deep assessment of ListingLens AI found:
- Stages 14-16 were entirely skipped (no data, no SDs created)
- The `sd_required` work type is premature — these stages need planning documents, not full SD cycles
- SRIP design infrastructure exists (4 tables, EVA module) but isn't connected to any stage
- 7 other domain areas have the same pattern: infrastructure exists, stages don't use it

### Chairman's direction
- Each area gets its own focused brainstorm → vision → arch plan → SD(s)
- Don't bite off too much — focused, incremental integration
- Consider add-to-existing vs rewrite for each area
- Ensure artifacts get stored properly in venture_artifacts
- Execute in stage order: 4 → 5 → 6 → 9 → 10 → 13 → 14 → Ops

## Integration Areas (8 Total)

### Area 1: Competitive Intelligence (Stage 4)
- **Stage**: 4 — Competitive Intelligence
- **Current required artifacts**: `competitive_analysis`
- **Standalone tables**: `competitors`, `intelligence_analysis`
- **Question**: Should stage 4 read from / write to `competitors` table instead of flat advisory_data?
- **Brainstorm command**: `/brainstorm Stage 4 Competitive Intelligence integration — wire competitors and intelligence_analysis tables into venture stage 4 artifact pipeline --domain architecture`

### Area 2: Financial Modeling (Stages 5, 7)
- **Stages**: 5 (Profitability Forecasting), 7 (Revenue Architecture)
- **Current required artifacts**: `financial_model`, `pricing_model`
- **Standalone tables**: `financial_models`, `modeling_requests`
- **Question**: Should financial_models table be the backing store for stage 5/7 artifacts?
- **Brainstorm command**: `/brainstorm Stage 5/7 Financial Modeling integration — wire financial_models table into profitability and revenue stage artifacts --domain architecture`

### Area 3: Risk Management (Stage 6)
- **Stage**: 6 — Risk Evaluation
- **Current required artifacts**: `risk_matrix`
- **Standalone tables**: `risk_escalation_log`, `risk_forecasts`, `risk_gate_passage_log`, `risk_recalibration_forms`
- **Question**: Should risk infrastructure tables back the stage 6 risk_matrix artifact?
- **Brainstorm command**: `/brainstorm Stage 6 Risk Management integration — wire risk tables into venture stage 6 evaluation pipeline --domain architecture`

### Area 4: Exit Strategy (Stage 9)
- **Stage**: 9 — Exit Strategy
- **Current required artifacts**: `exit_strategy`
- **Standalone tables**: `venture_exit_profiles`, `venture_exit_readiness`
- **Question**: Should exit tables be populated by stage 9 and read by stage 13 (tech stack)?
- **Brainstorm command**: `/brainstorm Stage 9 Exit Strategy integration — wire exit profile and readiness tables into venture stage 9 artifacts --domain architecture`

### Area 5: Brand & Design / SRIP (Stages 10-11)
- **Stages**: 10 (Customer & Brand), 11 (Naming & Visual Identity)
- **Current required artifacts**: `strategic_narrative`, `marketing_manifest`, `cultural_design_config`, `gtm_plan`
- **Standalone tables**: `naming_favorites`, `naming_suggestions`, `srip_site_dna`, `srip_brand_interviews`, `srip_synthesis_prompts`, `srip_quality_checks`
- **Question**: Should SRIP design sourcing be a required step in stage 10-11? Should wireframes/design spec be a new artifact type?
- **Brainstorm command**: `/brainstorm Stages 10-11 Brand & Design SRIP integration — wire SRIP design sourcing and naming tables into venture identity stages --domain architecture`

### Area 6: Stage 13 Subsystem (Stage 13)
- **Stage**: 13 — Product Roadmap (Kill Gate)
- **Current required artifacts**: `tech_stack_decision`
- **Standalone tables**: `stage13_assessments`, `stage13_substage_states`, `stage13_valuations`
- **Question**: Stage 13 already has its own subsystem — does it feed venture_artifacts properly?
- **Brainstorm command**: `/brainstorm Stage 13 subsystem integration — ensure stage13 assessment, substage, and valuation tables feed into venture_artifacts --domain architecture`

### Area 7: Blueprint Planning (Stages 14-16)
- **Stages**: 14 (Data Model Architecture), 15 (Epic & User Story Breakdown), 16 (Schema Firewall — Promotion Gate)
- **Current required artifacts**: `data_model`, `erd_diagram`, `user_story_pack`, `api_contract`, `schema_spec`
- **Current work_type**: `sd_required` — NEEDS TO CHANGE to `artifact_only`
- **New artifacts needed**: wireframes, design_spec, infrastructure_baseline
- **Key change**: Promotion gate at stage 16 should review ALL blueprint artifacts before building starts
- **Template-driven**: Infrastructure baseline comes from a shared template, customized per venture
- **Brainstorm command**: `/brainstorm Stages 14-16 Blueprint Planning redesign — change from sd_required to artifact_only, add wireframes and design docs, define promotion gate go/no-go criteria --domain protocol --structured`

### Area 8: Operations Mode (Post-25)
- **Pipeline modes**: operations → growth → scaling → exit_prep → divesting → sold
- **Standalone tables**: `marketing_campaigns`, `marketing_channels`, `marketing_content`, `marketing_content_queue`, `marketing_attribution`, `channel_budgets`, `capital_transactions`, `distribution_history`, `venture_financial_contract`, `venture_phase_budgets`, `daily_rollups`, `monthly_ceo_reports`, `pending_ceo_handoffs`, `service_tasks`, `service_telemetry`, `venture_token_budgets`, `venture_tool_quotas`, `public_portfolio`, `missions`
- **Question**: What does the operations workflow look like? Stages? Dashboards? Recurring reviews?
- **Brainstorm command**: `/brainstorm Post-25 Operations Mode design — define the operations, growth, and scaling workflow for live ventures --domain protocol --structured`

## Execution Plan

1. Execute brainstorms in stage order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
2. Each brainstorm produces: vision document + architecture plan + SD(s)
3. SDs are executed through normal LEO LEAD → PLAN → EXEC workflow
4. After all 8 areas are integrated, run /prove again on a venture to validate the full pipeline

## Out of Scope
- Cross-cutting infrastructure tables (agent_*, eva_*, chairman_*) — these serve all stages
- Venture metadata tables (venture_documents, venture_asset_registry) — general purpose, not stage-specific

## Open Questions
- Should we create a single orchestrator SD for the entire integration, or keep them fully independent?
- What quality threshold should the promotion gate at stage 16 enforce?
- How does the SRIP design sourcing interact with the blueprint wireframes at stage 14-16?

## Suggested Next Steps
- Start with `/brainstorm` for Area 1 (Competitive Intelligence, Stage 4)
- Work through each area in sequence
- After all 8 are complete, update lifecycle_stage_config with new artifact requirements
