-- Archive the stale EVA Intake Roadmap row so ONE canonical roadmap remains.
-- SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-3).
-- DATA migration (no schema change): the strategic_roadmaps table holds two status='active' rows —
-- the stale "EVA Intake Roadmap" (ed12bf74, 2026-03-08, 462 stale items) and the canonical
-- "LEO Roadmap" (3aa2f3e2, 2026-06-13). The vision/LEO-ROADMAP doc names the EVA row as the one to
-- archive. This sets it to status='archived' (an allowed CHECK value: draft|active|archived) so the
-- canonical LEO Roadmap is the single active source of truth.
--
-- REVERSIBLE: to undo, UPDATE strategic_roadmaps SET status='active' WHERE id='ed12bf74-57c9-4ee0-a1b3-273bef11705c'.
-- CONSUMER COUPLING: the EHG-app reader (ehg/src/hooks/usePortfolioRoadmap.ts) currently fetches ALL
-- roadmaps with NO status filter — so this archival fully realizes "one roadmap in the cockpit" only
-- once the cross-repo ehg query adds `.eq("status","active")` (shipped with FR-5 in the ehg PR). The
-- archival is safe on its own (the row is merely marked archived).
--
-- CHAIRMAN PROD-DEPLOY GATE: intentionally NOT yet attested. Before `node scripts/apply-migration.js
-- <file> --prod-deploy`, the CHAIRMAN must add `-- @approved-by: <chairman-email>` (matching git
-- user.email) — absent here because the worker may not self-author the attestation (CONST-002), and
-- archiving a live roadmap row is a chairman-visible change best sequenced with the ehg filter merge.

UPDATE strategic_roadmaps
   SET status = 'archived',
       updated_at = now()
 WHERE id = 'ed12bf74-57c9-4ee0-a1b3-273bef11705c'
   AND title = 'EVA Intake Roadmap';

-- In-migration verify (green-now): the EVA row is archived AND exactly one active roadmap remains.
DO $verify$
DECLARE
  eva_status text;
  active_count integer;
BEGIN
  SELECT status INTO eva_status FROM strategic_roadmaps WHERE id = 'ed12bf74-57c9-4ee0-a1b3-273bef11705c';
  IF eva_status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'EVA Intake Roadmap not archived (status=%)', eva_status;
  END IF;
  SELECT count(*) INTO active_count FROM strategic_roadmaps WHERE status = 'active';
  IF active_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 active roadmap after archival, found %', active_count;
  END IF;
END
$verify$;
