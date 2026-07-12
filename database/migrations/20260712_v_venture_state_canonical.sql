-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-3 — the ONE venture-state read model.
-- Additive TIER-1 DDL: bare CREATE VIEW (no OR REPLACE), no writes, no security definer.
--
-- CONSOLIDATION, NOT A 9TH PARALLEL VIEW (COND-2): this view is a COMPOSITION of the
-- existing fragmented venture views, keyed one-row-per-venture. Inventory + deprecation map
-- (verified against information_schema 2026-07-12):
--
--   v_active_ventures / v_archived_ventures  -> SUBSUMED: same ventures columns; this view
--       carries lifecycle_state discriminator instead of splitting into two views.
--   vw_venture_registry                      -> SUBSUMED: name/local_path/repo_url/deployment_*
--       are ventures columns surfaced here. (Resolver callers migrate last — it backs
--       lib/venture-resolver getVentureConfigAsync.)
--   v_venture_brief_summary                  -> JOINED (brief_* columns) — natural seed for the
--       chairman brief per LEAD scope.
--   v_venture_gate_debt                      -> AGGREGATED (gate_debt_count / gate_debt_min_score);
--       row-level debt detail remains in the source view (drill-down, not state).
--   venture_token_summary                    -> JOINED (token totals, cost, budget_profile).
--   venture_token_by_phase                   -> NOT folded (per-phase drill-down, not state).
--   v_ventures_stage_compat                  -> SUBSUMED (current_lifecycle_stage surfaced here;
--       compat aliasing stays in the compat view until its callers migrate).
--   v_cross_venture_patterns                 -> NOT folded (portfolio aggregate, not per-venture state).
--
-- Deprecation path: old views KEEP working (zero caller breakage today). New spine consumers
-- (chairman surface FR-6, satellites C-H) MUST read this view. Old-view callers migrate
-- opportunistically; retirement is a later data-only cleanup once pg catalog shows zero readers.

CREATE VIEW v_venture_state_canonical AS
SELECT
  v.id,
  v.name,
  v.venture_code,
  v.status,
  CASE
    WHEN v.deleted_at IS NOT NULL THEN 'deleted'
    WHEN v.status::text IN ('archived', 'killed') OR v.killed_at IS NOT NULL THEN 'archived'
    ELSE 'active'
  END AS lifecycle_state,
  v.current_lifecycle_stage,
  v.tier,
  v.archetype,
  v.health_score,
  v.health_status,
  v.attention_score,
  v.dwell_days,
  v.gate_retries_7d,
  v.gate_pass_rate_30d,
  v.milestone_velocity_30d,
  v.decision_due_at,
  v.kill_reason,
  v.killed_at,
  v.problem_statement,
  v.solution,
  v.target_market,
  v.moat_strategy,
  v.portfolio_synergy_score,
  v.deployment_target,
  v.deployment_url,
  v.repo_url,
  v.ceo_agent_id,
  v.vision_id,
  v.architecture_plan_id,
  v.pipeline_mode,
  v.created_at,
  v.updated_at,
  -- brief composition (v_venture_brief_summary seed)
  b.raw_chairman_intent  AS brief_raw_chairman_intent,
  b.origin_type          AS brief_origin_type,
  b.maturity             AS brief_maturity,
  b.build_estimate       AS brief_build_estimate,
  b.time_horizon_classification AS brief_time_horizon,
  -- gate debt rollup (v_venture_gate_debt detail stays for drill-down)
  gd.gate_debt_count,
  gd.gate_debt_min_score,
  -- token/economics rollup (venture_token_summary)
  ts.total_tokens,
  ts.total_cost_usd,
  ts.budget_profile,
  ts.last_operation_at   AS last_token_operation_at
FROM ventures v
LEFT JOIN v_venture_brief_summary b ON b.venture_id = v.id
LEFT JOIN (
  SELECT venture_id, COUNT(*) AS gate_debt_count, MIN(overall_score) AS gate_debt_min_score
  FROM v_venture_gate_debt
  GROUP BY venture_id
) gd ON gd.venture_id = v.id
LEFT JOIN venture_token_summary ts ON ts.venture_id = v.id;
