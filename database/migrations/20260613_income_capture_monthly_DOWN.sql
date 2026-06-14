-- @approved-by: codestreetlabs@gmail.com
-- approval context: rollback for SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001
-- Migration (DOWN): drop income_capture_monthly
-- SD: SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001
-- Date: 2026-06-13
--
-- Reverses 20260613_income_capture_monthly.sql. The table holds only aggregated/derived income inputs
-- (rebuildable from ops_payment_events) + chairman attestation references — no source-of-truth data is
-- lost by dropping it. Policies drop with the table.

DROP TABLE IF EXISTS public.income_capture_monthly;
