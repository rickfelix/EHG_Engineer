-- @approved-by: codestreetlabs@gmail.com
-- Approval basis: chairman-approved Phase 1 (via operator), relayed by coordinator
-- coordinator-100acd08 2026-06-09 (session_coordination "UNBLOCKED + RE-SCOPED: chairman approved").
-- SD-LEO-GEN-SCOPE-ANON-KEY-001 — Phase 1 (zero-risk, ships standalone)
-- Remove the anon-ROLE public SELECT on public.companies. The anon KEY is shipped in the
-- EHG app browser bundle, so a public USING(true) anon SELECT policy lets ANYONE holding the
-- anon key read all ~1,303 company rows. Chairman-approved 2026-06-09 (deep-research wf_bfe9dd87).
--
-- SAFE — verified (research + behavioral):
--   * companies has NO live anon-role reader. The EHG app reads companies via useChairmanData.ts
--     but ONLY inside ProtectedRoute -> a logged-in JWT is attached -> PostgREST sees role=authenticated,
--     served by "Authenticated users can view companies" / "Company access companies". EHG_Engineer
--     reads companies only via the service-role client (bypasses RLS). No EHG-app change required.
--   * Dropping the anon policy removes nothing an authenticated user or the fleet (service_role) needs.
--
-- Reversible: re-create with
--   CREATE POLICY "Anon read companies" ON public.companies FOR SELECT TO anon USING (true);
--
-- OUT OF SCOPE (Phase 2, separate SD, gated on dashboard migration + canary):
--   public.strategic_directives_v2 anon_read policy. Do NOT drop it here — the LEO Realtime Dashboard
--   (src/services/realtime-dashboard.js) subscribes via the anon key and Realtime postgres_changes
--   delivery requires the subscribing role to hold RLS SELECT; dropping it before the dashboard is
--   migrated off the anon subscription silently stops its change events (the policy already churned
--   3x: added 2025-11, dropped 2025-12-17, re-added 2025-12-18 when automation broke).

DROP POLICY IF EXISTS "Anon read companies" ON public.companies;
-- belt-and-suspenders: drop the SD's paraphrased name too, in case a variant exists.
DROP POLICY IF EXISTS anon_select_companies ON public.companies;
