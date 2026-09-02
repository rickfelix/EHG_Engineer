/**
 * QF-20260902-914 — account_usage_pastes has been absent since 2026-08-28 (migration
 * database/migrations/20260828_account_usage_paste_ledger.sql never applied). Both the paste
 * writer (record-account-capacity.mjs) and the burn-projection CLI
 * (account-usage-paste-projection.mjs) rendered a generic "unavailable" for this specific,
 * five-day-standing cause. This is the classifier + message both scripts now call to fail loud
 * instead, with a stubbed absent-table PGRST205 error (per the QF's own reproduction: "Could not
 * find the table public.account_usage_pastes in the schema cache").
 */
import { describe, it, expect } from 'vitest';
import {
  isPasteLedgerMissingError,
  pasteLedgerMissingMessage,
  MIGRATION_PATH,
} from '../../../lib/fleet/account-usage-paste-ledger-status.cjs';

describe('isPasteLedgerMissingError (QF-20260902-914)', () => {
  it('recognizes the real PGRST205 "schema cache" error object witnessed on 2026-09-02', () => {
    const error = { message: "Could not find the table 'public.account_usage_pastes' in the schema cache" };
    expect(isPasteLedgerMissingError(error)).toBe(true);
  });

  it('recognizes the writer\'s wrapped string form (insert_failed: <pg message>)', () => {
    expect(isPasteLedgerMissingError('insert_failed: Could not find the table \'public.account_usage_pastes\' in the schema cache')).toBe(true);
  });

  it('recognizes a "does not exist" phrasing (a different PostgREST wording for the same absence)', () => {
    expect(isPasteLedgerMissingError({ message: 'relation "public.account_usage_pastes" does not exist' })).toBe(true);
  });

  it('does NOT misclassify an unrelated failure (network error, RLS denial, malformed row) as table-absence', () => {
    expect(isPasteLedgerMissingError({ message: 'fetch failed: ECONNRESET' })).toBe(false);
    expect(isPasteLedgerMissingError({ message: 'new row violates row-level security policy' })).toBe(false);
    expect(isPasteLedgerMissingError({ message: 'null value in column "session_pct" violates not-null constraint' })).toBe(false);
  });

  it('is false-safe on null/undefined/empty input -- never throws', () => {
    expect(isPasteLedgerMissingError(null)).toBe(false);
    expect(isPasteLedgerMissingError(undefined)).toBe(false);
    expect(isPasteLedgerMissingError({})).toBe(false);
  });
});

describe('pasteLedgerMissingMessage (QF-20260902-914)', () => {
  it('names the exact migration file and the chairman ceremony -- never the word "unavailable"', () => {
    const message = pasteLedgerMissingMessage();
    expect(message).toContain(MIGRATION_PATH);
    expect(message).toContain('CHAIRMAN-ONLY');
    expect(message.toLowerCase()).not.toContain('unavailable');
  });

  it('MIGRATION_PATH points at the actual staged migration file', () => {
    expect(MIGRATION_PATH).toBe('database/migrations/20260828_account_usage_paste_ledger.sql');
  });
});
