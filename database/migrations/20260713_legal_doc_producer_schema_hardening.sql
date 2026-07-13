-- Migration: 20260713_legal_doc_producer_schema_hardening.sql
-- @approved-by: codestreetlabs@gmail.com
-- SD: SD-FDBK-FIX-BUILD-LEGAL-DOC-001 (V5)
-- Purpose: fix 2 real gaps found in deep-tier adversarial review of the
-- initial schema (20260713_legal_doc_producer_schema.sql, already applied):
--
-- 1. SELF-CERTIFICATION BYPASS (the serious one): venture_legal_overrides_modify
--    was FOR ALL to any authenticated user with fn_user_has_venture_access(venture_id),
--    not restricted to service_role. Combined with the Stage-23 REQUIRED gate only
--    checking row-existence + generated_at IS NOT NULL (no authenticity check), any
--    venture-scoped user could self-write a fake row and bypass the launch-readiness
--    gate this SD exists to make un-bypassable. Fix: writes (INSERT/UPDATE/DELETE)
--    restricted to service_role only -- the producer (lib/eva/legal-doc-producer.js)
--    is the sole intended writer; venture-scoped users get SELECT only.
--
-- 2. ON DELETE CASCADE data-loss risk: legal_templates.id -> venture_legal_overrides
--    was ON DELETE CASCADE. legal_templates supports versioning/deprecation via
--    status + supersedes_id -- deleting a template row (permitted to chairman/
--    service_role under legal_templates_write) should never be the way to retire
--    it, but CASCADE meant an accidental DELETE would silently erase every
--    venture's generated-document history for that template and retroactively
--    fail their Stage-23 legal gate. Fix: ON DELETE RESTRICT -- forces the
--    supersede/deprecate flow instead of allowing an accidental destructive delete.

BEGIN;

DROP POLICY IF EXISTS venture_legal_overrides_modify ON venture_legal_overrides;
CREATE POLICY venture_legal_overrides_modify ON venture_legal_overrides
  FOR ALL
  TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE venture_legal_overrides
  DROP CONSTRAINT venture_legal_overrides_template_id_fkey,
  ADD CONSTRAINT venture_legal_overrides_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES legal_templates(id) ON DELETE RESTRICT;

COMMIT;
