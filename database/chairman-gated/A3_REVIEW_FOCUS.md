# A3 REVIEW — pre-ceremony audit of the UNAPPLIED chairman-gated DDL bundle (REVIEW-ONLY PR, never merge)

The chairman applies this bundle at a 3-factor ceremony on 2026-08-17 ~13:30Z (9:30am ET). Base branch deletes the files; head restores them byte-identical to main so the diff carries their full text. `A3_REVIEW_CONTEXT_CENSUS_2026-08-16.md` is the live-catalog census (23 applied / 15 unapplied / 1 superseded) and the proposed apply order.

## Focus asks (in priority order)
1. **Apply-time failure and rollback**: for each file, will it fail mid-transaction against the live state described in the census (e.g. UNIQUE index on existing duplicates; DEFERRABLE constraint trigger with a live forbidden row `roadmap_waves 512c7478 approved+now, 0 items`; `DO $$ RAISE EXCEPTION` post-conditions)? Is every file transactional and idempotent, and does each DOWN actually reverse it?
2. **Order and dependency**: the census proposes an order (Groups 1–6). Find any hidden dependency it missed (function created in one file used by another; a comment asserting a narrowing that another file performs; a REVOKE that a later file's GRANT assumes).
3. **The rival pair**: `20260803_chairman_queue_truthful_render.sql` vs `20260803_chairman_source4_rework.sql` both CREATE OR REPLACE the same view. Do they conflict semantically, and what is the correct MERGED definition if both behaviours are wanted?
4. **Blast radius of policy drops**: `20260815_venture_user_feedback_ownership_rpc.sql` drops the live anon INSERT policy `venture_user_insert_feedback` (17 rows / 30d) — every live client that inserts `user_%` feedback as anon must move to `fn_submit_venture_user_feedback`; is the RPC a complete replacement (same columns/constraints/rate limit) and does its GRANT set match? `20260803_session_coordination_scope_anon_reads.sql` leaves the table with RLS FORCED and ZERO policies — which non-service_role principals currently read it?
5. **Security posture**: SECURITY DEFINER functions — search_path pinned? EXECUTE revoked from PUBLIC then re-granted narrowly? Any function that lets anon spoof `venture_id`?
6. **@approved-by**: none of the 15 carry a filled attestation — flag any file whose header claims an applied/approved state that the census shows false.

Findings will be triaged by Adam before the ceremony; anything CONFIRMED as apply-time failure or regression removes that file from tomorrow's bundle.
