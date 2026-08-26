-- SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 (TR-5): atomic replacement for the
-- read-modify-write consecutive_failures/total_synced update in
-- lib/integrations/youtube/playlist-sync.js (updateSyncState, was playlist-sync.js:244) and
-- lib/integrations/todoist/todoist-sync.js (updateSyncState, was todoist-sync.js:200). Both did
-- `existing.consecutive_failures + 1` in JS after a separate SELECT — a lost-update race under
-- overlapping runs (187 other workflows already use a concurrency group per TESTING sub-agent
-- finding; this closes the underlying non-atomicity too, not just the overlap risk).
--
-- Purely additive (new function only, no revokes/drops) — safe for the standard auto-applied
-- migrations/ path, not chairman-gated. LANGUAGE sql, invoker-rights (no SECURITY DEFINER): the
-- only real callers are already service_role-authenticated (createSupabaseServiceClient()), so
-- this function carries no more privilege than its caller already has, and FR-3's table-grant
-- lockdown on eva_sync_state protects it regardless of this function's own EXECUTE grant surface.

CREATE OR REPLACE FUNCTION public.eva_sync_state_record_sync_result(
  p_source_type text,
  p_source_identifier text,
  p_synced_count integer,
  p_error text
)
RETURNS TABLE (consecutive_failures integer, total_synced integer)
LANGUAGE sql
AS $$
  INSERT INTO public.eva_sync_state (
    source_type, source_identifier, last_sync_at, total_synced,
    consecutive_failures, last_error, last_error_at
  )
  VALUES (
    p_source_type,
    p_source_identifier,
    CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
    COALESCE(p_synced_count, 0),
    CASE WHEN p_error IS NULL THEN 0 ELSE 1 END,
    p_error,
    CASE WHEN p_error IS NULL THEN NULL ELSE now() END
  )
  ON CONFLICT (source_type, source_identifier) DO UPDATE SET
    last_sync_at = CASE WHEN p_error IS NULL THEN now() ELSE eva_sync_state.last_sync_at END,
    total_synced = CASE WHEN p_error IS NULL
                        THEN eva_sync_state.total_synced + COALESCE(p_synced_count, 0)
                        ELSE eva_sync_state.total_synced END,
    consecutive_failures = CASE WHEN p_error IS NULL
                                 THEN 0
                                 ELSE COALESCE(eva_sync_state.consecutive_failures, 0) + 1 END,
    last_error = p_error,
    last_error_at = CASE WHEN p_error IS NULL THEN NULL ELSE now() END
  RETURNING eva_sync_state.consecutive_failures, eva_sync_state.total_synced;
$$;

-- LOW-1 (TESTING sub-agent finding, EXEC review): not exploitable as-is (SECURITY INVOKER means
-- an anon/authenticated caller would still hit FR-3's table-level REVOKE), but narrowing the
-- function's own EXECUTE grant is a free hardening line consistent with this repo's existing
-- close-remaining-secdef-execute-exposure precedent, rather than leaving a PUBLIC-executable
-- function on this table for a future audit to flag.
REVOKE EXECUTE ON FUNCTION public.eva_sync_state_record_sync_result(text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eva_sync_state_record_sync_result(text, text, integer, text) TO service_role;
