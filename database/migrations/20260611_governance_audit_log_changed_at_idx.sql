-- @approved-by: codestreetlabs@gmail.com
-- SD-MAN-INFRA-RETENTION-OPS-FINISHER-001 (FR-4, closes flag d2c40522).
-- Chairman context: retention machinery + 90d windows GO'd 2026-06-10
-- (SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001); this index was emitted as the
-- needs_decision completion flag d2c40522 of that approved SD. LEAD decision +
-- RISK PASS-88 (row 3c7f4545): additive index only, no data change.
-- Retention sorts on governance_audit_log (~484k rows, ~1 insert/sec) order by
-- changed_at and hit intermittent statement timeouts (absorbed fail-soft by the
-- retention CLI — zero data loss, but weekly convergence stalls). Plain CREATE
-- INDEX accepted at LEAD: the SHARE lock blocks writes only for the build
-- (low tens of seconds at this size); inserts queue, not fail. CONCURRENTLY is
-- deliberately NOT used — it cannot run inside apply-migration's transaction
-- wrapper. Idempotent via IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_governance_audit_log_changed_at
  ON governance_audit_log (changed_at);
