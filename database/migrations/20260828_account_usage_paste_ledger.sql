-- Chairman-pasted /usage ledger, for burn-projection history.
-- SD-LEO-INFRA-USAGE-PASTE-LEDGER-001.
--
-- WHY THIS TABLE EXISTS. Adam currently forecasts chairman quota burn from session memory,
-- which is unverifiable. The existing programmatic poller (account_usage_snapshots,
-- SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001) is non-functional for 2 of 3 chairman accounts
-- (not_configured / duplicate_identity / unauthorized), leaving the chairman's pasted /usage
-- output as the only reliable source for those accounts. No table anywhere in this repo
-- currently retains MORE THAN ONE reading per account for a chairman paste: the existing
-- lib/fleet/account-capacity-gauge.cjs is a last-write-wins JSON overwrite keyed on
-- accountUuid8 (two same-day pastes for the same account already silently collapse today) --
-- structurally incapable of the >=2-row burn-slope calculation this SD requires. This table
-- is genuinely new surface for a genuinely new purpose (burn history), additive to, not a
-- replacement for, the existing headroom gauge (which keeps serving its own, different,
-- latest-reading-only consumers -- fleet-panel.js, fleet-dashboard.cjs, fleet-view-badges.cjs).
--
-- WHY NOT EXTEND account_usage_snapshots (the sibling poll-fed table). Considered and rejected:
-- that table's own migration + COMMENT ON TABLE explicitly states it NEVER stores an email
-- address (a security-assessed invariant); it has no provenance/source column and a `state`
-- CHECK enum closed to 8 poll-only values; its `fetchLastKnown()` reader has no source filter,
-- so a paste row would silently shadow poll history; its 90-day retention assumes a single
-- most-recent-row consumer (explicitly false for a ledger that IS the burn history); and its
-- UNIQUE(account_name, fetched_at) is keyed on a mutable display label already proven
-- non-unique by a live `duplicate_identity` state in that table's own data.
--
-- WHAT MAY AND MAY NOT BE STORED. account_email is deliberately NOT a column here, DESPITE
-- appearing in this SD's original success-criteria wording -- a PLAN-phase security review
-- found the sibling table's own `account_usage_snapshots` data is already re-emitted by an
-- unauthenticated route (server/routes/fleet-panel.js, mounted optionalAuth), and adding a
-- plaintext email column to a table one naive extension away from the same route is an
-- avoidable exposure this SD does not need to accept. account_uuid8 (the same discriminator
-- account-capacity-gauge.cjs already keys on) plus account_org_name (a display label, never
-- used in a WHERE clause) fully satisfy per-account identification.
--
-- ============================================================================================
-- THIS MIGRATION IS TIER-2 (CHAIRMAN-GATED) BY CONSTRUCTION -- same trade as the sibling table,
-- for the same reason: the REVOKE and the COMMENT ON TABLE each independently force TIER-2, and
-- removing either would buy nothing while reproducing the exact default-grant pattern a
-- 2026-07-27 catalog read found on 46 of 137 SECURITY DEFINER functions in public.
-- ============================================================================================
--
-- TWO RESET CLOCKS, TWO COLUMNS. session_pct and the two weekly meters (week_all_models_pct,
-- week_fable_pct) have INDEPENDENT reset clocks -- a single reset_at column would make
-- exhaustion-before-reset undecidable for the session meter whenever it exhausts before the
-- weekly window resets. session_reset_at governs session_pct; week_reset_at governs both
-- weekly meters (they share one weekly reset per the chairman's own /usage output shape).

CREATE TABLE IF NOT EXISTS account_usage_pastes (
  id BIGSERIAL PRIMARY KEY,

  -- Stable account discriminator from oauthAccount.accountUuid8 (lib/fleet/account-identity.cjs
  -- getAccountIdentity()). NOT NULL, unlike the sibling table: an unattributable paste violates
  -- this SD's per-account-isolation requirement outright, and the writer refuses to insert one
  -- (mirrors account-capacity-gauge.cjs's existing account_identity_unavailable refusal).
  account_uuid8 TEXT NOT NULL,

  -- Display label only. NEVER used in a WHERE clause that determines row ownership --
  -- account_uuid8 is the sole identity key, closing the exact mutable-label-uniqueness bug the
  -- sibling table's UNIQUE(account_name, fetched_at) already exhibits.
  account_org_name TEXT,

  -- When the chairman's /usage paste was recorded. Caller-supplied (not a DB default), because
  -- the chairman may report a reading for a moment slightly in the past.
  pasted_at TIMESTAMPTZ NOT NULL,

  -- Percentages as pasted. Nullable -- an unread meter must not read as 0% used (the
  -- "unknown reads as max headroom" anti-pattern account-capacity-gauge.cjs's bindingWeeklyPct
  -- already applies for its OWN different purpose; this ledger must not silently inherit it).
  session_pct NUMERIC(5,2),
  week_all_models_pct NUMERIC(5,2),
  week_fable_pct NUMERIC(5,2),

  -- Independent reset clocks -- see header note above.
  session_reset_at TIMESTAMPTZ,
  week_reset_at TIMESTAMPTZ,

  -- Free-text chairman annotation (e.g. a promo/discount note visible in the /usage paste).
  -- Bounded and sanitized at the writer (control/ANSI characters stripped before storage) --
  -- the CHECK here is the last-line defense, not the only one.
  promo_note TEXT CHECK (char_length(promo_note) <= 280),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per account per paste instant. A different account at the same instant is a
  -- DIFFERENT row (per-account isolation); the same account at a different instant is also a
  -- different row (what the JSON overwrite this table exists alongside cannot provide). A
  -- literal retry of the exact same (account, instant) pair collapses harmlessly.
  UNIQUE (account_uuid8, pasted_at)
);

-- The only query this table serves: "the N most recent rows for one account" (burn-slope input).
CREATE INDEX IF NOT EXISTS idx_account_usage_pastes_account_pasted
  ON account_usage_pastes (account_uuid8, pasted_at DESC);

COMMENT ON TABLE account_usage_pastes IS
  'One row per chairman-pasted /usage reading, written ONLY by lib/fleet/account-usage-paste-writer.cjs, feeding lib/fleet/account-usage-burn-projection.cjs (SD-LEO-INFRA-USAGE-PASTE-LEDGER-001). Additive to (not a replacement for) lib/fleet/account-capacity-gauge.cjs, which keeps serving its own latest-reading-only headroom-routing consumers. Deliberately does NOT store an email address (PLAN-phase security review: account_usage_snapshots data is already re-emitted by an unauthenticated route; account_uuid8 + account_org_name fully identify the account without that exposure).';

-- RLS: written explicitly, not inherited. The writer uses the service-role client (RLS-bypass),
-- so this is additive and zero-functional-risk; without it the security-linter sentinel
-- (rls_disabled_in_public) goes red and the table is exposed to anon/authenticated via PostgREST.
ALTER TABLE account_usage_pastes ENABLE ROW LEVEL SECURITY;

-- Guarded so the file is actually re-runnable (the sibling migration's own lesson).
DROP POLICY IF EXISTS account_usage_pastes_service_role_all ON account_usage_pastes;
CREATE POLICY account_usage_pastes_service_role_all
  ON account_usage_pastes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- THE LOAD-BEARING LINES. Default grants are the documented failure mode this SD's security
-- review cites; an inherited grant here would publish per-account usage history to anon.
-- The BIGSERIAL sequence is revoked too -- a gap found in the sibling table's own migration
-- (REVOKE ALL ON <table> does not reach the sequence backing its identity column).
REVOKE ALL ON account_usage_pastes FROM anon, authenticated;
GRANT ALL ON account_usage_pastes TO service_role;
REVOKE ALL ON SEQUENCE account_usage_pastes_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE account_usage_pastes_id_seq TO service_role;

-- Reload PostgREST schema cache so the new table is immediately visible.
NOTIFY pgrst, 'reload schema';
