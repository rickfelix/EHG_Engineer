-- @approved-by:
-- SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (FR-6) -- narrow, single-relation, AUTHENTICATED-axis
-- exception to this SD's Deletion Audit (which otherwise cuts the authenticated axis entirely).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except at the named ceremony.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE MECHANISM THIS CLOSES (security-agent, PLAN phase, live-measured and proven 2026-08-19):
-- public.security_audit_events is the ONLY partitioned-parent (relkind='p') TRUNCATE grant in the
-- database. authenticated holds TRUNCATE on the PARENT directly, but on ZERO of its partitions.
-- Proven on a scratch mirror: TRUNCATE of a partitioned parent wipes ALL partitions regardless of
-- per-partition grants -- so a partition-level-only ACL audit reports this table clean while any
-- authenticated caller can in fact wipe the entire security/forensic audit log via the parent.
--
-- WHY THIS IS IN SCOPE DESPITE BEING ON THE AUTHENTICATED AXIS: this SD's Deletion Audit explicitly
-- cuts the general authenticated-axis TRUNCATE sweep (a separate, larger, un-scoped body of work).
-- This is a narrow, surgical, single-relation exception given the severity (the security forensic
-- log itself) and the fact the exposure mechanism (partition inheritance) is not covered by any
-- existing or planned SD -- not a silent expansion of this SD's general scope.
--
-- NOT TIME-BOUNDED: public.security_audit_events_create_partition (SECURITY DEFINER) already
-- REVOKEs ALL from anon/authenticated on every partition it creates ("born secure") -- confirmed live
-- by sampling partition ACLs. A partition created by hand rather than via that function would still
-- be born with authenticated TRUNCATE from the (postgres, public, r) default-ACL row -- the sweep's
-- FR-5 companion file closes that default for anon; it does not (and by design does not) touch the
-- authenticated axis, so this residual is disclosed here rather than silently assumed closed.
--
-- Does NOT touch: any other table on the authenticated axis; anon's grants on this table (anon
-- TRUNCATE on this table, if any, is already covered by the main sweep migration); service_role.

BEGIN;

SET LOCAL lock_timeout = '5s';

REVOKE TRUNCATE ON public.security_audit_events FROM authenticated;

-- Post-condition: confirm the parent no longer grants authenticated TRUNCATE, AND dynamically
-- confirm every CURRENTLY-EXISTING partition (via pg_inherits, not a hardcoded count -- the table is
-- monthly-RANGE-partitioned with an automated creator, so the partition count changes over time)
-- individually shows no authenticated TRUNCATE either.
DO $$
DECLARE
  part regclass;
  bad_count integer := 0;
  checked_count integer := 0;
BEGIN
  IF has_table_privilege('authenticated', 'public.security_audit_events', 'TRUNCATE') THEN
    RAISE EXCEPTION 'POST_CONDITION_FAILED: authenticated still has TRUNCATE on the parent public.security_audit_events';
  END IF;

  FOR part IN
    SELECT inhrelid::regclass
    FROM pg_inherits
    WHERE inhparent = 'public.security_audit_events'::regclass
  LOOP
    checked_count := checked_count + 1;
    IF has_table_privilege('authenticated', part, 'TRUNCATE') THEN
      bad_count := bad_count + 1;
      RAISE WARNING 'POST_CONDITION: authenticated has TRUNCATE on partition %', part;
    END IF;
  END LOOP;

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'POST_CONDITION_FAILED: % of % partition(s) grant authenticated TRUNCATE', bad_count, checked_count;
  END IF;

  RAISE NOTICE 'POST_CONDITION_PASSED: parent clean, % partition(s) individually confirmed clean', checked_count;
END $$;

COMMIT;
