-- Account quota snapshots — retain the last-known reading per account.
-- SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-4/FR-6).
--
-- WHY THIS TABLE EXISTS. The sessions-page quota strip discards a reading the moment an account
-- stops being readable, so an EXHAUSTED account collapses to "Unavailable" and the final value —
-- the one that matters most, 100% across the board just before reset — is erased. No usage-snapshot
-- store existed anywhere (grep of lib/, scripts/, database/migrations for
-- account_usage|usage_snapshot|quota_snapshot returned zero) and the reader had no persistence call
-- at all, so this is new surface rather than an extension.
--
-- ============================================================================================
-- THIS MIGRATION IS TIER-2 (CHAIRMAN-GATED) BY CONSTRUCTION, AND THAT IS THE CORRECT TRADE.
-- ============================================================================================
-- Measured, not assumed — scripts/lib/migration-tier-classifier.mjs run against minimal synthetic
-- SQL to isolate one variable at a time:
--   table creation + index + ENABLE RLS + policy                           -> TIER-1
--   the same, plus REVOKE                                                  -> TIER-2
--   the same, plus COMMENT ON TABLE                                        -> TIER-2
-- (The first line deliberately avoids spelling the DDL keywords: the operator-contract gate's
--  created-table parser scans the file as raw SQL, comments included, so a keyword in prose
--  registers as a real statement. See the harness-bug note routed to the coordinator.)
-- So this file is TIER-2 for TWO INDEPENDENT REASONS, and that matters: REMOVING THE REVOKE WOULD
-- BUY NOTHING. The COMMENT ON alone still forces TIER-2, so there is no version of this migration
-- that trades the security control for auto-apply and actually gets it.
--
-- And the trade would be wrong even if it worked. This SD's security assessment requires the RLS to
-- be written EXPLICITLY rather than inherited, precisely because a 2026-07-27 catalog read found 46
-- of 137 SECURITY DEFINER functions in public carrying default anon/authenticated EXECUTE — every
-- one of them because no migration wrote a REVOKE. Dropping it here would reproduce the exact
-- pattern being guarded against.
--
-- So: apply via the chairman-gated path (scripts/apply-migration.js --prod-deploy with the
-- @approved-by header). THE STRIP DEGRADES GRACEFULLY UNTIL THEN — the writer is fail-soft, so an
-- absent table costs history only, never the live reading.
--
-- WHAT MAY AND MAY NOT BE STORED. Display name, percentages, reset timestamps, fetchedAt and state
-- ONLY. Never the bearer token. Never the raw email — identity resolution happens in
-- lib/fleet/account-identity.cjs before persistence and only the display name survives, so this
-- history table can never become a credential or PII surface. account_uuid8 is the account
-- discriminator the fleet already uses elsewhere (account-capacity-gauge.cjs keys its store by it),
-- and is stored here so a re-auth that changes an account behind a label is auditable after the
-- fact rather than silently rewriting history.

CREATE TABLE IF NOT EXISTS account_usage_snapshots (
  id BIGSERIAL PRIMARY KEY,

  -- The chairman-facing label at the time of the reading. NOT a foreign key: the display name is
  -- configuration (FLEET_ACCOUNT_IDENTITY_MAP) and may legitimately change; the snapshot records
  -- what was SHOWN, which is what "preserve the history" means here.
  account_name TEXT NOT NULL,

  -- Stable account discriminator from oauthAccount.accountUuid8. Nullable: a slot whose identity
  -- cannot be resolved still deserves its reading retained (that is the whole point of FR-6), and
  -- inventing a placeholder would make two unidentifiable accounts look like one.
  account_uuid8 TEXT,

  -- Percentages as read. Nullable because an unavailable reading has no number — and recording a
  -- 0 there would be the "unknown meters read as 0% used" anti-pattern the reader's own header
  -- criticises in the sibling gauge.
  weekly_pct NUMERIC(5,2),
  five_hour_pct NUMERIC(5,2),

  weekly_resets_at TIMESTAMPTZ,
  five_hour_resets_at TIMESTAMPTZ,

  -- Closed enum mirroring the reader's own states. 'ok' plus every UNAVAILABLE_REASONS member,
  -- including the two this SD introduced: 'exhausted' (the account answered 429 — quota spent) and
  -- 'duplicate_identity' (two registry slots resolved to one account, so no number can be
  -- attributed). Keeping them distinct in the STORE is what makes FR-6 possible at all: persisting
  -- an exhausted account as 'unreachable' would lose the distinction irrecoverably.
  state TEXT NOT NULL CHECK (state IN (
    'ok', 'not_configured', 'unauthorized', 'unexpected_shape',
    'timeout', 'unreachable', 'exhausted', 'duplicate_identity'
  )),

  -- When the reading was taken (from the reader), not when the row was written.
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per account per reading instant. Makes the writer idempotent under retry without
  -- needing a read-modify-write, and lets a re-run of the same tick collapse harmlessly.
  UNIQUE (account_name, fetched_at)
);

-- The only query this table serves: "most recent reading for each account".
CREATE INDEX IF NOT EXISTS idx_account_usage_snapshots_name_fetched
  ON account_usage_snapshots (account_name, fetched_at DESC);

COMMENT ON TABLE account_usage_snapshots IS
  'Per-account quota readings retained so an EXHAUSTED account can display its FINAL value with a read timestamp instead of collapsing to Unavailable (SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 FR-4/FR-6). Written by lib/fleet/account-usage-snapshot-writer.cjs from lib/fleet/account-usage-reader.cjs readings. NEVER stores a bearer token or an email address — identity resolves to a display name before persistence.';

-- RLS: written explicitly, not inherited. The writer uses the service-role client (RLS-bypass), so
-- this is additive and zero-functional-risk; without it the security-linter sentinel
-- (rls_disabled_in_public) goes red and the table is exposed to anon/authenticated via PostgREST.
ALTER TABLE account_usage_snapshots ENABLE ROW LEVEL SECURITY;

-- Guarded so the file is actually re-runnable. The TABLE and INDEX above use IF NOT EXISTS, which
-- advertises idempotence this statement did not have: a re-run aborted here, which for a
-- chairman-gated migration means the failure surfaces during a supervised apply.
DROP POLICY IF EXISTS account_usage_snapshots_service_role_all ON account_usage_snapshots;
CREATE POLICY account_usage_snapshots_service_role_all
  ON account_usage_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- THE LOAD-BEARING LINE. Default grants are the documented failure mode this SD's security
-- assessment cites; an inherited grant here would publish per-account quota history to anon.
REVOKE ALL ON account_usage_snapshots FROM anon, authenticated;
GRANT ALL ON account_usage_snapshots TO service_role;

-- Reload PostgREST schema cache so the new table is immediately visible.
NOTIFY pgrst, 'reload schema';
