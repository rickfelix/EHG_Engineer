// SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 (FR-3) — encrypt-at-rest regression tests for
// lib/integrations/youtube/oauth-manager.js#getStoredTokens/storeTokens. A live plaintext
// refresh_token was previously found in eva_sync_state (row 5ea38ba3); these tests prove the
// write path can no longer reproduce that exposure and that the read path round-trips correctly.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TOKENS = {
  access_token: 'ya29.a0-fixture-access-token',
  refresh_token: '1//01-fixture-refresh-token',
  scope: 'https://www.googleapis.com/auth/youtube',
  token_type: 'Bearer',
  expiry_date: Date.now() + 3600_000,
};

function createMockSupabase(initialRow = null, { updateError = null, insertError = null } = {}) {
  let row = initialRow;
  const updateSpy = vi.fn(async (payload) => {
    if (updateError) return { error: updateError };
    row = { ...row, ...payload };
    return { error: null };
  });
  const insertSpy = vi.fn(async (payload) => {
    if (insertError) return { error: insertError };
    row = { id: 'new-row', ...payload };
    return { error: null };
  });
  return {
    __getRow: () => row,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }),
      update: (payload) => ({ eq: () => updateSpy(payload) }),
      insert: (payload) => insertSpy(payload),
    }),
  };
}

vi.mock('../../supabase-client.js', () => ({ createSupabaseServiceClient: vi.fn() }));

describe('oauth-manager encrypt-at-rest', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('storeTokens never writes a plaintext token-shaped string to source_metadata', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-1', source_metadata: {} });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens } = await import('./oauth-manager.js');
    await storeTokens(TOKENS);

    const stored = mockSupabase.__getRow();
    const raw = JSON.stringify(stored.source_metadata);
    expect(raw).not.toContain(TOKENS.access_token);
    expect(raw).not.toContain(TOKENS.refresh_token);
    expect(stored.source_metadata.encrypted_tokens).toBeTruthy();
    expect(stored.source_metadata.encrypted_tokens.encrypted).toEqual(expect.any(String));
    expect(stored.source_metadata.tokens).toBeUndefined(); // legacy plaintext key never written
  });

  it('storeTokens scrubs a pre-existing legacy plaintext `tokens` key on next write', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const legacyRow = { id: 'row-2', source_metadata: { tokens: TOKENS } };
    const mockSupabase = createMockSupabase(legacyRow);
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens } = await import('./oauth-manager.js');
    await storeTokens({ ...TOKENS, access_token: 'ya29.a0-rotated-access-token' });

    const stored = mockSupabase.__getRow();
    expect(stored.source_metadata.tokens).toBeUndefined();
    expect(JSON.stringify(stored.source_metadata)).not.toContain(TOKENS.access_token);
  });

  it('getStoredTokens round-trips a token object written by storeTokens', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-3', source_metadata: {} });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens, getStoredTokens } = await import('./oauth-manager.js');
    await storeTokens(TOKENS);
    const roundTripped = await getStoredTokens();

    expect(roundTripped).toEqual(TOKENS);
  });

  it('getStoredTokens returns null (not a throw) when no vault is present', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase(null);
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { getStoredTokens } = await import('./oauth-manager.js');
    await expect(getStoredTokens()).resolves.toBeNull();
  });

  it('getStoredTokens returns null (not a throw) on a decrypt failure -- forces re-auth rather than crashing the caller', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-4', source_metadata: { encrypted_tokens: { encrypted: 'corrupt-ciphertext', metadata: {} } } });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { getStoredTokens } = await import('./oauth-manager.js');
    await expect(getStoredTokens()).resolves.toBeNull();
  });

  it('a row that still carries the legacy plaintext `tokens` key (pre-fix data) is NOT read as valid credentials -- getStoredTokens only trusts encrypted_tokens', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-5', source_metadata: { tokens: TOKENS } });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { getStoredTokens } = await import('./oauth-manager.js');
    await expect(getStoredTokens()).resolves.toBeNull();
  });

  // TESTING mutation-pass finding (row b1c7e680-6d50-4610-b33a-c79c0c925b46): the tests above only
  // assert the raw token substring is absent from the written payload -- a "fake encryption" (base64,
  // rot13, reverse) would satisfy that just as well as real AES-256-GCM, and none of the tests above
  // would catch it. The tests below assert properties ONLY real authenticated encryption has.
  it('two storeTokens calls with IDENTICAL token data produce DIFFERENT ciphertext (proves a fresh random salt/IV per call, not a deterministic scheme like base64/rot13)', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-6', source_metadata: {} });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens } = await import('./oauth-manager.js');
    await storeTokens(TOKENS);
    const firstCiphertext = mockSupabase.__getRow().source_metadata.encrypted_tokens.encrypted;
    await storeTokens(TOKENS);
    const secondCiphertext = mockSupabase.__getRow().source_metadata.encrypted_tokens.encrypted;

    expect(firstCiphertext).not.toBe(secondCiphertext);
  });

  it('a single flipped byte in the stored ciphertext blob causes decryption to fail closed (null), not a silent garbage-decrypt -- a weaker corroborating check than the different-ciphertext-per-call test above, since a non-crypto scheme piping through JSON.parse would often also throw on corrupted input, but still confirms the fail-closed contract holds under tampering, not just under a missing/absent vault', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-7', source_metadata: {} });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens, getStoredTokens } = await import('./oauth-manager.js');
    await storeTokens(TOKENS);

    const row = mockSupabase.__getRow();
    const original = Buffer.from(row.source_metadata.encrypted_tokens.encrypted, 'base64');
    const tampered = Buffer.from(original);
    tampered[tampered.length - 1] ^= 0xff; // flip the last byte -- lands inside the ciphertext/auth-tag region
    row.source_metadata.encrypted_tokens.encrypted = tampered.toString('base64');

    // getStoredTokens fails soft (returns null, per its own fail-closed contract) rather than throwing --
    // the point of this test is that it does NOT silently return the (or a corrupted-but-plausible) token.
    await expect(getStoredTokens()).resolves.toBeNull();
  });

  it('storeTokens throws (does not silently return) when the DB update call reports an error', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-8', source_metadata: {} }, { updateError: { message: 'connection reset' } });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens } = await import('./oauth-manager.js');
    await expect(storeTokens(TOKENS)).rejects.toThrow(/failed to persist/i);
  });

  it('storeTokens throws (does not silently return) when the DB insert call reports an error (no pre-existing row)', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase(null, { insertError: { message: 'unique violation' } });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens } = await import('./oauth-manager.js');
    await expect(storeTokens(TOKENS)).rejects.toThrow(/failed to insert/i);
  });

  it('storeTokens on a brand-new row (INSERT branch, no pre-existing row) also encrypts -- never writes plaintext on first-ever auth', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase(null);
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens, getStoredTokens } = await import('./oauth-manager.js');
    await storeTokens(TOKENS);

    const stored = mockSupabase.__getRow();
    expect(JSON.stringify(stored.source_metadata)).not.toContain(TOKENS.access_token);
    expect(stored.source_metadata.encrypted_tokens).toBeTruthy();
    await expect(getStoredTokens()).resolves.toEqual(TOKENS);
  });

  it('storeTokens preserves other pre-existing keys in source_metadata (does not drop sibling data)', async () => {
    const { createSupabaseServiceClient } = await import('../../supabase-client.js');
    const mockSupabase = createMockSupabase({ id: 'row-9', source_metadata: { unrelated_sibling_field: 'keep-me' } });
    createSupabaseServiceClient.mockReturnValue(mockSupabase);

    const { storeTokens } = await import('./oauth-manager.js');
    await storeTokens(TOKENS);

    expect(mockSupabase.__getRow().source_metadata.unrelated_sibling_field).toBe('keep-me');
  });
});
