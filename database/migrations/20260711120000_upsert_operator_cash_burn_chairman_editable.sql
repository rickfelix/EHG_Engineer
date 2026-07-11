-- upsert_operator_cash_burn: chairman-editable write path for operator_cash_burn_monthly.
-- SD-EHG-PRODUCT-UIUX-REMEDIATION-001-D (FR-5/H10).
--
-- operator_cash_burn_monthly's RLS policies grant SELECT to `authenticated` and ALL to
-- `service_role` only (verified live, 2026-07-11) -- the browser-side chairman client has
-- no write path at all today. This SECURITY DEFINER RPC, gated by fn_is_chairman() (the
-- same canonical role check used by kill_venture / approve_chairman_decision), is the
-- established pattern in this codebase for exactly this class of problem: a chairman-only
-- write against an RLS-locked table, without opening broad `authenticated` write access.
--
-- Only non-null parameters are applied (partial update) -- omitting a field leaves the
-- existing value/freshness timestamp untouched. Every field the chairman DOES set gets its
-- *_last_synced_at stamped to now() (a manual entry is "live" as of the moment it's saved,
-- until superseded by the next automated feeder run). ai_burn_is_lower_bound is set to
-- false when the chairman explicitly sets ai_burn_usd -- a manually-entered exact figure is
-- not a lower-bound estimate. revenue_livemode is set to true when the chairman explicitly
-- sets revenue_usd -- treats a chairman-asserted override/forecast with the same honesty
-- weight as a live attributed figure, per FR-5's "override/forecast" framing.
--
-- Always targets the CURRENT period_month (date_trunc('month', now())) -- mirrors
-- currentPeriodMonth() in src/hooks/useOperatorCashBurn.ts (ehg repo).
--
-- STAGED, NOT YET APPROVED FOR APPLY. Application code (the new chairman-editable
-- cash/burn form) calls this RPC and surfaces a clear "not yet enabled" error toast if
-- it 404s (function does not exist) -- it degrades safely until the chairman applies
-- this migration, matching this codebase's established staged-DDL convention.
--
-- requires-chairman-apply

CREATE OR REPLACE FUNCTION public.upsert_operator_cash_burn(
  p_cash_usd numeric DEFAULT NULL,
  p_ai_burn_usd numeric DEFAULT NULL,
  p_other_burn_usd numeric DEFAULT NULL,
  p_revenue_usd numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period_month date := date_trunc('month', now())::date;
  v_row public.operator_cash_burn_monthly;
BEGIN
  IF NOT public.fn_is_chairman() THEN
    RAISE EXCEPTION 'Only the chairman can edit the cash/burn model'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.operator_cash_burn_monthly (
    period_month, cash_usd, cash_last_synced_at,
    ai_burn_usd, ai_burn_last_synced_at, ai_burn_is_lower_bound,
    other_burn_usd, other_burn_last_synced_at,
    revenue_usd, revenue_last_synced_at, revenue_livemode
  )
  VALUES (
    v_period_month, p_cash_usd, CASE WHEN p_cash_usd IS NOT NULL THEN now() END,
    p_ai_burn_usd, CASE WHEN p_ai_burn_usd IS NOT NULL THEN now() END, CASE WHEN p_ai_burn_usd IS NOT NULL THEN false ELSE true END,
    p_other_burn_usd, CASE WHEN p_other_burn_usd IS NOT NULL THEN now() END,
    p_revenue_usd, CASE WHEN p_revenue_usd IS NOT NULL THEN now() END, CASE WHEN p_revenue_usd IS NOT NULL THEN true ELSE NULL END
  )
  ON CONFLICT (period_month) DO UPDATE SET
    cash_usd = COALESCE(EXCLUDED.cash_usd, public.operator_cash_burn_monthly.cash_usd),
    cash_last_synced_at = COALESCE(EXCLUDED.cash_last_synced_at, public.operator_cash_burn_monthly.cash_last_synced_at),
    ai_burn_usd = COALESCE(EXCLUDED.ai_burn_usd, public.operator_cash_burn_monthly.ai_burn_usd),
    ai_burn_last_synced_at = COALESCE(EXCLUDED.ai_burn_last_synced_at, public.operator_cash_burn_monthly.ai_burn_last_synced_at),
    ai_burn_is_lower_bound = CASE WHEN p_ai_burn_usd IS NOT NULL THEN false ELSE public.operator_cash_burn_monthly.ai_burn_is_lower_bound END,
    other_burn_usd = COALESCE(EXCLUDED.other_burn_usd, public.operator_cash_burn_monthly.other_burn_usd),
    other_burn_last_synced_at = COALESCE(EXCLUDED.other_burn_last_synced_at, public.operator_cash_burn_monthly.other_burn_last_synced_at),
    revenue_usd = COALESCE(EXCLUDED.revenue_usd, public.operator_cash_burn_monthly.revenue_usd),
    revenue_last_synced_at = COALESCE(EXCLUDED.revenue_last_synced_at, public.operator_cash_burn_monthly.revenue_last_synced_at),
    revenue_livemode = CASE WHEN p_revenue_usd IS NOT NULL THEN true ELSE public.operator_cash_burn_monthly.revenue_livemode END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$;

COMMENT ON FUNCTION public.upsert_operator_cash_burn IS
  'Chairman-only (fn_is_chairman-gated) partial upsert into operator_cash_burn_monthly for the current period_month. SD-EHG-PRODUCT-UIUX-REMEDIATION-001-D FR-5.';

GRANT EXECUTE ON FUNCTION public.upsert_operator_cash_burn(numeric, numeric, numeric, numeric) TO authenticated;
