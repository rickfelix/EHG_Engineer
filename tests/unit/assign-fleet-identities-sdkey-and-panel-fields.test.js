import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mod = require('../../scripts/assign-fleet-identities.cjs');
const { identityAccountUuid8 } = mod;

/**
 * QF-20260725-538 — two producer/consumer contract mismatches in the same writer.
 *
 * A) The writer read w.sd_id, a column that does NOT exist on claude_sessions (it is sd_key).
 *    Supabase returns undefined for a nonexistent column rather than erroring, so every roster
 *    line fell back to 'idle' and every SET_IDENTITY carried target_sd=null — a broken reading
 *    that looked legitimate. VERIFIED LIVE: session 9301234a held QF-20260725-538 while its
 *    fleet_identity.display_name read "Alpha | idle".
 *
 * B) server/routes/fleet-panel.js formatSessionRow reads identity.role and identity.accountUuid8;
 *    the writer wrote neither, so those two chairman-facing columns could never populate.
 */
describe('QF-20260725-538 defect A: sd_key is the real column, sd_id does not exist', () => {
  it('the writer source contains NO w.sd_id / worker.sd_id reads', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'assign-fleet-identities.cjs'),
      'utf-8',
    );
    // The bug was six sites reading a nonexistent column. Pin that none come back.
    expect(src).not.toMatch(/\bw\.sd_id\b/);
    expect(src).not.toMatch(/\bworker\.sd_id\b/);
    // ...and that the correct column is what the label/target logic reads.
    expect(src).toMatch(/\bw\.sd_key\b/);
    expect(src).toMatch(/\bworker\.sd_key\b/);
  });

  it('the DB select still fetches sd_key, so the reads above resolve', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'assign-fleet-identities.cjs'),
      'utf-8',
    );
    expect(src).toMatch(/\.select\(['"]session_id, sd_key, metadata, heartbeat_at['"]\)/);
  });
});

describe('QF-20260725-538 defect B: identityAccountUuid8 scoping', () => {
  const ACCOUNT = { email: 'a@b.c', orgName: 'Org', accountUuid8: 'ca1de6e4' };

  it('stamps the local account for a session with no declared account_profile', () => {
    expect(identityAccountUuid8({ role: 'worker' }, ACCOUNT)).toBe('ca1de6e4');
    expect(identityAccountUuid8({}, ACCOUNT)).toBe('ca1de6e4');
    expect(identityAccountUuid8(null, ACCOUNT)).toBe('ca1de6e4');
  });

  it('returns null for a session that declares its OWN account_profile (canary runs a separate account)', () => {
    // The single global ~/.claude.json oauthAccount pointer cannot speak for a session running
    // under a different account. Blank beats confidently-wrong.
    expect(identityAccountUuid8({ account_profile: 'canary' }, ACCOUNT)).toBeNull();
    expect(identityAccountUuid8({ account_profile: 'other' }, ACCOUNT)).toBeNull();
  });

  it('returns null when the local account identity is unavailable (never throws, never invents)', () => {
    expect(identityAccountUuid8({}, null)).toBeNull();
    expect(identityAccountUuid8({}, undefined)).toBeNull();
    expect(identityAccountUuid8({}, {})).toBeNull();
  });
});
