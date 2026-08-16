-- SD-LEO-INFRA-ROLE-SESSION-SELF-001 / FR-4 — one row per boundary crossing, even under a race.
-- ============================================================================================
-- lib/governance/chairman-override-record.js checks for an existing override_key before it
-- inserts, which makes a retried tick a no-op. That is check-then-insert, and it is NOT race-safe:
-- two truly concurrent writers can both miss and both insert. This index closes that window.
--
-- Follows the live precedent at 20260711b_feedback_telemetry_scope_narrow.sql:31-33 — a PARTIAL
-- unique index over (category, metadata->>'<key>') scoped by category — rather than inventing a
-- second dedup convention on the same table. `feedback` carries many categories with entirely
-- different metadata shapes, so a table-wide unique index is not expressible; the partial predicate
-- is what makes this safe for everyone else's rows.
--
-- WHY THIS IS ITS OWN MIGRATION rather than part of the writer's change: until it is applied, the
-- writer is still correct for the ordinary (non-concurrent) case, and the residual is stated in
-- its docblock instead of being implied to be solved. Applying this turns a stated limitation into
-- a guarantee; it does not fix a broken writer.
-- ============================================================================================

-- SCOPED BY source_type, DELIBERATELY. The telegram insert policy constrains only source_type, so
-- an anon actor can write category='chairman_override' with arbitrary metadata. A unique index on
-- (category, override_key) alone would let a pre-seeded forgery WIN the key and guarantee the
-- genuine record could never be written — the index would enforce the forgery. Scoping to
-- auto_capture means a forgery is noise beside the real record, never a replacement for it.
DROP INDEX IF EXISTS public.idx_feedback_chairman_override_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_chairman_override_dedup
  ON public.feedback (category, source_type, (metadata->>'override_key'))
  WHERE category = 'chairman_override' AND source_type = 'auto_capture';

COMMENT ON INDEX public.idx_feedback_chairman_override_dedup IS
  'One row per chairman-override boundary crossing. The key is boundary|directed_at|session_id, so a retry dedupes while two DIFFERENT crossings stay two rows — idempotency must never become erasure. SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-4.';

NOTIFY pgrst, 'reload schema';
