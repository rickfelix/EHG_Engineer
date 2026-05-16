-- Sibling A FR-A-3: writer_consumer_asymmetry_witnesses VIEW (plain, NOT materialized)
-- Aggregates witnesses from bypass_ledger + scope_completion_chain + validation_audit_log.
-- Ordinal 20260516130002 strictly > FR-A-1 and FR-A-2 ordinals.

CREATE OR REPLACE VIEW writer_consumer_asymmetry_witnesses AS
SELECT
  bl.id AS witness_id,
  'unpaired_bypass'::text AS witness_source,
  bl.created_at AS witnessed_at,
  bl.sd_key,
  bl.sd_id,
  bl.phase,
  bl.bypass_type AS detail_type,
  bl.bypass_reason AS detail_text,
  bl.correlation_id
FROM bypass_ledger bl
WHERE bl.audit_log_id IS NULL
  AND bl.created_at > now() - INTERVAL '90 days'
UNION ALL
SELECT
  scc.id AS witness_id,
  'abandoned_chain'::text AS witness_source,
  scc.created_at AS witnessed_at,
  NULL::text AS sd_key,
  CASE WHEN scc.entity_type = 'sd' THEN scc.entity_id ELSE NULL END AS sd_id,
  scc.actual_phase AS phase,
  scc.chain_status AS detail_type,
  scc.entity_type::text AS detail_text,
  scc.correlation_id
FROM scope_completion_chain scc
WHERE (
  scc.chain_status = 'abandoned'
  OR (scc.expected_completion_at < now() AND scc.actual_completion_at IS NULL)
)
  AND scc.created_at > now() - INTERVAL '90 days'
UNION ALL
SELECT
  val.id AS witness_id,
  'pattern_witness'::text AS witness_source,
  val.created_at AS witnessed_at,
  NULL::text AS sd_key,
  CASE
    WHEN val.sd_id ~ '^[0-9a-fA-F-]{36}$' THEN val.sd_id::uuid
    ELSE NULL
  END AS sd_id,
  NULL::text AS phase,
  val.failure_category AS detail_type,
  val.failure_reason AS detail_text,
  CASE
    WHEN val.correlation_id ~ '^[0-9a-fA-F-]{36}$' THEN val.correlation_id::uuid
    ELSE NULL
  END AS correlation_id
FROM validation_audit_log val
WHERE val.failure_category IN ('writer_consumer_asymmetry', 'pattern_witness')
  OR (val.metadata->>'pattern' = 'writer-consumer-asymmetry')
  AND val.created_at > now() - INTERVAL '90 days';

COMMENT ON VIEW writer_consumer_asymmetry_witnesses IS 'Sibling A (SD-WRITERCONSUMER-...-001-A) — plain VIEW (NOT materialized per brainstorm not-doing #6) aggregating writer-consumer asymmetry witnesses from 3 sources: unpaired bypass events, abandoned scope completion chains, and pattern witnesses in validation_audit_log. 90-day rolling window. Dashboard-quarantine only (Guardrail #6) — never inline in PR/handoff/retro bodies.';
