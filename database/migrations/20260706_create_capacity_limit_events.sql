-- Migration: Create capacity_limit_events (calibration ledger)
-- SD: SD-LEO-INFRA-OVERNIGHT-CAPACITY-GOVERNOR-001
--
-- Chairman-directed (2026-07-05 ~7:50 PM): under full-fleet load, session limits
-- freeze workers at prompts nobody can answer overnight. This is the append-only
-- calibration ledger every future limit event sharpens -- one row per observed
-- session-limit/weekly-cap exhaustion. Seeded here with the 2 real events
-- observed today (NOT 3 -- the plan's own text names only 2 independently
-- verifiable events; fabricating a 3rd to match a stated seed count would be
-- exactly the kind of self-authored evidence this fleet has learned to reject).
--
-- ADDITIVE ONLY: new table, no existing objects touched.

CREATE TABLE IF NOT EXISTS public.capacity_limit_events (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account              TEXT        NOT NULL,
  event_type           TEXT        NOT NULL CHECK (event_type IN ('session_window_exhausted', 'weekly_cap_hit')),
  fleet_size           INTEGER,
  window_started_at    TIMESTAMPTZ,
  limit_hit_at         TIMESTAMPTZ NOT NULL,
  session_hours_burned NUMERIC(6,2),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT capacity_limit_events_fleet_size_nonneg CHECK (fleet_size IS NULL OR fleet_size >= 0),
  CONSTRAINT capacity_limit_events_hours_nonneg CHECK (session_hours_burned IS NULL OR session_hours_burned >= 0)
);

CREATE INDEX IF NOT EXISTS idx_capacity_limit_events_account_hit
  ON public.capacity_limit_events (account, limit_hit_at DESC);

CREATE INDEX IF NOT EXISTS idx_capacity_limit_events_type
  ON public.capacity_limit_events (event_type, limit_hit_at DESC);

COMMENT ON TABLE public.capacity_limit_events IS
  'Append-only calibration ledger of observed session-limit/weekly-cap exhaustion '
  'events, per SD-LEO-INFRA-OVERNIGHT-CAPACITY-GOVERNOR-001. Every future event '
  'sharpens the overnight-capacity projection. Seeded with the 2 real events '
  'observed 2026-07-05: codestreetlabs weekly_cap_hit (triggering the account '
  'switch) and rickfelix2000 session_window_exhausted (~5.3h/~6 concurrent '
  'sessions/~32 session-hours) that followed it.';
COMMENT ON COLUMN public.capacity_limit_events.account IS
  'Which Claude account hit the limit, e.g. rickfelix2000, codestreetlabs.';
COMMENT ON COLUMN public.capacity_limit_events.event_type IS
  'session_window_exhausted: the rolling multi-hour session window ran out under '
  'concurrent fleet load. weekly_cap_hit: the account''s weekly usage cap was hit.';
COMMENT ON COLUMN public.capacity_limit_events.fleet_size IS
  'Approximate concurrent session count at the time of exhaustion, when known. '
  'NULL for event types where this wasn''t observed (e.g. a weekly cap hit by a '
  'single/few sessions over days, not a concurrent-fleet burn).';
COMMENT ON COLUMN public.capacity_limit_events.window_started_at IS
  'When the burn window began, when known -- lets session_hours_burned be '
  'cross-checked against limit_hit_at - window_started_at.';
COMMENT ON COLUMN public.capacity_limit_events.limit_hit_at IS
  'Wall-clock time the limit was actually hit. Required for every row.';
COMMENT ON COLUMN public.capacity_limit_events.session_hours_burned IS
  'Total session-hours (fleet_size x hours-elapsed) consumed by the time the '
  'limit hit, when known. This is the governor''s calibrated budget input.';

ALTER TABLE public.capacity_limit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.capacity_limit_events;
CREATE POLICY "service_role_all" ON public.capacity_limit_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select" ON public.capacity_limit_events;
CREATE POLICY "authenticated_select" ON public.capacity_limit_events
  FOR SELECT TO authenticated USING (true);

-- Seed: the 2 real observed events (2026-07-05), idempotent via a natural-key guard.
INSERT INTO public.capacity_limit_events (account, event_type, fleet_size, window_started_at, limit_hit_at, session_hours_burned, notes)
SELECT 'codestreetlabs', 'weekly_cap_hit', NULL, NULL, '2026-07-05T13:30:00-04:00'::timestamptz, NULL,
  'Weekly usage cap hit; triggered the chairman-directed switch to the rickfelix2000 account for the remainder of the day. Reset scheduled 2026-07-10 15:00 ET.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.capacity_limit_events
  WHERE account = 'codestreetlabs' AND event_type = 'weekly_cap_hit' AND limit_hit_at = '2026-07-05T13:30:00-04:00'::timestamptz
);

INSERT INTO public.capacity_limit_events (account, event_type, fleet_size, window_started_at, limit_hit_at, session_hours_burned, notes)
SELECT 'rickfelix2000', 'session_window_exhausted', 6, '2026-07-05T13:30:00-04:00'::timestamptz, '2026-07-05T18:50:00-04:00'::timestamptz, 32,
  'Fresh session window (opened by the codestreetlabs switch above) exhausted after ~5.3h at ~6 concurrent sessions (~32 session-hours) -- the exact wall this SD''s governor exists to project ahead of, so a full-fleet night does not freeze at an unanswerable prompt.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.capacity_limit_events
  WHERE account = 'rickfelix2000' AND event_type = 'session_window_exhausted' AND limit_hit_at = '2026-07-05T18:50:00-04:00'::timestamptz
);
