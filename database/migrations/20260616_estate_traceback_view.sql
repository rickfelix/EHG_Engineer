-- SD-LEO-INFRA-ESTATE-DISPOSITION-001 (FR-5) — estate trace-back reader view.
--
-- conversion_ledger.linked_sd_key is WRITE-ONLY today (no SELECT path). This read-only view joins
-- each ledger item to its linked SD's status so (a) re-proposal of an already-SHIPPED idea is
-- suppressed (a consumer filters linked_sd_status='completed') and (b) provenance is auditable.
--
-- TIER-1 / auto-apply-eligible BY CONSTRUCTION: a BARE `CREATE VIEW` whose defining SELECT is
-- PAREN-FREE (no COALESCE / count() / CASE-with-parens / sub-select) and which has NO DO block —
-- either would flip scripts/lib/migration-tier-classifier.mjs to TIER-2 (chairman-gated). The
-- "is-shipped" decision is therefore left to the CONSUMER query (WHERE linked_sd_status = 'completed'),
-- not a CASE in the view, to preserve auto-apply. Additive: no change to any existing table.

CREATE VIEW v_estate_traceback AS
SELECT
  cl.id                 AS ledger_id,
  cl.source_pool        AS source_pool,
  cl.source_id          AS source_id,
  cl.title              AS title,
  cl.normalized_priority AS normalized_priority,
  cl.intake_status      AS intake_status,
  cl.disposition        AS disposition,
  cl.triage_verdict     AS triage_verdict,
  cl.linked_sd_key      AS linked_sd_key,
  cl.dedup_match_sd_key AS dedup_match_sd_key,
  cl.created_at         AS dispositioned_at,
  sd.sd_key             AS linked_sd_sd_key,
  sd.status             AS linked_sd_status,
  sd.current_phase      AS linked_sd_phase,
  sd.title              AS linked_sd_title
FROM conversion_ledger cl
LEFT JOIN strategic_directives_v2 sd ON sd.sd_key = cl.linked_sd_key;
