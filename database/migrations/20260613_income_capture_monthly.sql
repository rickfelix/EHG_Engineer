-- @approved-by: codestreetlabs@gmail.com
-- approval context: SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 — chairman-authorized roadmap SD
--   (coordinator-assigned). NOTE: this migration creates the EMPTY structured substrate only. The
--   chairman-supplied DEDUCTION FIGURES (ppo/solo_401k/se_tax) are NOT in this migration — they arrive
--   later via a chairman_decisions attestation row; the columns ship NULL = explicit unattested.
--   Prod-apply of this migration is routed for chairman/coordinator go (financial domain) — not self-applied.
-- Migration: income_capture_monthly — structured replacement-net input substrate
-- SD: SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001
-- Date: 2026-06-13
--
-- WHAT THIS DOES
--   1. Creates public.income_capture_monthly — a PORTFOLIO-level, MONTHLY table holding the five
--      STRUCTURED replacement-net inputs (recurring_revenue, business_expenses, ppo, retirement_solo_401k,
--      se_tax) as separate columns. There is deliberately NO precomputed "net" column — net is computed
--      at read time by scripts/glide-path/replacement-net.js, so gross is never reconstructable from a
--      single field (structured-not-topline).
--   2. recurring_revenue + business_expenses are fleet-derivable (NOT NULL DEFAULT 0). The three
--      chairman-gated deductions (ppo, retirement_solo_401k, se_tax) are NULLABLE with NO default —
--      NULL = explicit "unattested" (never a silent 0). deduction_attestation_ref FKs the chairman
--      attestation row that supplied them; NULL ref + NULL columns = visibly unattested.
--   3. UNIQUE(period_month, livemode) so a TEST-mode aggregate and a LIVE-mode aggregate for the same
--      month never collide; the income gauge reads livemode=true only.
--   4. Least-privilege RLS: service_role writes (the aggregator), authenticated reads (the gauge);
--      anon/authenticated table-level writes revoked. ops_payment_events RLS is UNCHANGED.
--
-- Why NOT extend ops_revenue_metrics: it is per-VENTURE / per-DAY with per-venture JWT RLS and a
--   full-spread upsert writer; this substrate is portfolio-level / monthly — grain mismatch + writer
--   breakage + wrong RLS. (DATABASE sub-agent verdict, evidence 6bc9ed41.)
--
-- Rollback: database/migrations/20260613_income_capture_monthly_DOWN.sql

CREATE TABLE IF NOT EXISTS public.income_capture_monthly (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month                date NOT NULL,                              -- first-of-month
  recurring_revenue           numeric(12,2) NOT NULL DEFAULT 0,           -- aggregated from ops_payment_events; -> replacementNet revenue
  business_expenses           numeric(12,2) NOT NULL DEFAULT 0,           -- incl. AI/infra
  ppo                         numeric(12,2),                             -- NULL = unattested (chairman-supplied only)
  retirement_solo_401k        numeric(12,2),                             -- NULL = unattested; -> replacementNet retirement
  se_tax                      numeric(12,2),                             -- NULL = unattested
  revenue_source              text NOT NULL DEFAULT 'ops_payment_events_aggregate',
  revenue_event_count         integer NOT NULL DEFAULT 0,                 -- # charges aggregated (audit)
  livemode                    boolean NOT NULL DEFAULT true,              -- true = real income, false = TEST-mode
  deduction_attestation_ref   uuid REFERENCES public.chairman_decisions(id), -- NULL = no chairman attestation
  computed_at                 timestamptz DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  CONSTRAINT income_capture_period_livemode_unique UNIQUE (period_month, livemode),
  CONSTRAINT income_capture_first_of_month CHECK (date_trunc('month', period_month) = period_month)
);

CREATE INDEX IF NOT EXISTS idx_income_capture_period ON public.income_capture_monthly (period_month DESC);

ALTER TABLE public.income_capture_monthly ENABLE ROW LEVEL SECURITY;

-- Writer: only the service-role aggregator transforms charges -> structured rows.
CREATE POLICY income_capture_service ON public.income_capture_monthly
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reader: authenticated read-only for the distance-to-quit income gauge. No anon policy.
CREATE POLICY income_capture_auth_read ON public.income_capture_monthly
  FOR SELECT TO authenticated USING (true);

-- Belt-and-suspenders least-privilege: no table-level write grants for anon/authenticated.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.income_capture_monthly FROM anon, authenticated;
