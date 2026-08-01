-- @approved-by: codestreetlabs@gmail.com
-- 20260731_coordination_receipts_rls_posture.sql
--
-- THE MISSING HALF of 20260731_coordination_receipt_ledger.sql (which was deliberately
-- CREATE TABLE only — its line-29 scope note excluded policies/RLS/GRANTs by design for the
-- delegation boundary). The table therefore inherited Supabase defaults: RLS DISABLED with
-- anon INSERT/UPDATE/DELETE/TRUNCATE grants. Demonstrated live 2026-07-31: SECURITY forged,
-- updated and deleted a row with the REAL anon key (control falsified — the same key is
-- refused by session_coordination), and Solomon's probe confirmed anon SELECT succeeds.
-- Receipt content deletes its source rows at +24h, so an anon TRUNCATE is unrecoverable
-- by design — this posture close is chairman-approved (SMS packet receipts-rls-posture-20260731
-- sent 20:44Z, sharpened 20:52Z, verbal "Yes" received 20:54Z, bound and recorded).
--
-- Scope as approved: enable row security + revoke anon writes. Enabling RLS with no policies
-- denies anon/authenticated entirely; the legitimate writer (coordinator ack path,
-- lib/coordination + scripts/coordinator-ack-signal.cjs) uses the service role, which
-- bypasses RLS — verified no live consumer is affected. Reader fence (coordinator-ruled)
-- lifts after the post-apply anon probe is REFUSED.

ALTER TABLE public.coordination_receipts ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.coordination_receipts FROM anon;
