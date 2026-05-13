/**
 * QF-20260513-258 — closes feedback a583d097
 *
 * Verifies createDatabaseClient() skips the SUPABASE_DB_PASSWORD requirement
 * when the caller passes options.connectionString. This is the CI codepath
 * for the Pre-merge Migration Readiness workflow: SUPABASE_POOLER_URL is the
 * only exposed credential, the discrete DB password env vars are not set.
 *
 * Before this fix, supabase-connection.js threw "Database password not found"
 * unconditionally even when a connection string was supplied — blocking all
 * migration-readiness probes on PRs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const SAVED_ENV = {};
const ENV_KEYS = ['SUPABASE_DB_PASSWORD', 'EHG_DB_PASSWORD'];

function snapshotEnv() {
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
}

describe('createDatabaseClient — connectionString skips password requirement (QF-20260513-258)', () => {
  beforeEach(() => {
    snapshotEnv();
    delete process.env.SUPABASE_DB_PASSWORD;
    delete process.env.EHG_DB_PASSWORD;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('throws when neither password nor connectionString is provided', async () => {
    await expect(
      createDatabaseClient('engineer', { verify: true })
    ).rejects.toThrow(/Database password not found/);
  });

  it('does NOT throw the password error when connectionString is provided (even without env passwords)', async () => {
    // We pass a syntactically-valid pg URL with bogus credentials so the
    // password check is bypassed. The connection itself will fail later
    // (refused/timeout), but the error must NOT be "Database password not found".
    const bogusUrl = 'postgres://anonymous:anonymous@127.0.0.1:1/postgres';
    try {
      const client = await createDatabaseClient('engineer', {
        connectionString: bogusUrl,
        timeout: 100, // fast-fail the actual connect
      });
      // If somehow connected (it won't), clean up
      await client.end().catch(() => {});
    } catch (err) {
      expect(err.message).not.toMatch(/Database password not found/);
    }
  });

  it('mentions options.connectionString in the password-missing error remediation', async () => {
    await expect(
      createDatabaseClient('engineer', {})
    ).rejects.toThrow(/options\.connectionString/);
  });
});
