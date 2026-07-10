/**
 * SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-1/FR-2 — per-venture channel
 * credential references.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storeSecret, resolveSecret, resolveChannelCredentials, createStoreSecretDep } from '../../../lib/marketing/channel-secrets.js';

function makeSupabase({ upsertError = null, maybeSingleData = null, maybeSingleError = null }) {
  const chain = {
    upsert: vi.fn(() => Promise.resolve({ error: upsertError })),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: maybeSingleData, error: maybeSingleError }))
  };
  return { from: vi.fn(() => chain), _chain: chain };
}

describe('storeSecret', () => {
  it('rejects a non-object credentials payload without touching the database', async () => {
    const supabase = makeSupabase({});
    await expect(
      storeSecret({ supabase, ventureId: 'v-1', channelType: 'x', credentials: 'not-an-object' })
    ).rejects.toThrow(/credentials must be an object/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('persists a secret_ref (never the raw credentials) and returns it', async () => {
    const supabase = makeSupabase({});
    const ref = await storeSecret({ supabase, ventureId: 'v-1', channelType: 'x', credentials: { apiKey: 'super-secret' } });

    expect(ref).toBe('venture_channel_secrets:v-1:x');
    expect(supabase._chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ venture_id: 'v-1', channel_type: 'x', secret_ref: 'venture_channel_secrets:v-1:x' }),
      expect.anything()
    );
    // The raw credential value must never appear in the persisted row.
    const persistedRow = supabase._chain.upsert.mock.calls[0][0];
    expect(JSON.stringify(persistedRow)).not.toContain('super-secret');
  });

  it('throws when the persist write fails', async () => {
    const supabase = makeSupabase({ upsertError: { message: 'db down' } });
    await expect(
      storeSecret({ supabase, ventureId: 'v-1', channelType: 'x', credentials: { apiKey: 'k' } })
    ).rejects.toThrow(/db down/);
  });
});

describe('resolveSecret (fail-closed keyring lookup)', () => {
  const ORIGINAL_ENV = process.env.VENTURE_CHANNEL_SECRET_STORE;

  afterEach(() => {
    process.env.VENTURE_CHANNEL_SECRET_STORE = ORIGINAL_ENV;
  });

  it('returns null (fail-closed) for a null/undefined secretRef', () => {
    expect(resolveSecret(null)).toBeNull();
    expect(resolveSecret(undefined)).toBeNull();
  });

  it('returns null (fail-closed) when the keyring env var is absent', () => {
    delete process.env.VENTURE_CHANNEL_SECRET_STORE;
    expect(resolveSecret('venture_channel_secrets:v-1:x')).toBeNull();
  });

  it('returns null (fail-closed) when the keyring env var is malformed JSON', () => {
    process.env.VENTURE_CHANNEL_SECRET_STORE = '{not-json';
    expect(resolveSecret('venture_channel_secrets:v-1:x')).toBeNull();
  });

  it('returns null (fail-closed) when the ref is not present in the keyring', () => {
    process.env.VENTURE_CHANNEL_SECRET_STORE = JSON.stringify({ 'other:ref': { apiKey: 'x' } });
    expect(resolveSecret('venture_channel_secrets:v-1:x')).toBeNull();
  });

  it('resolves the credentials object for a ref present in the keyring', () => {
    process.env.VENTURE_CHANNEL_SECRET_STORE = JSON.stringify({
      'venture_channel_secrets:v-1:x': { apiKey: 'k', apiSecret: 's' }
    });
    expect(resolveSecret('venture_channel_secrets:v-1:x')).toEqual({ apiKey: 'k', apiSecret: 's' });
  });

  it('never cross-resolves a different venture\'s ref (isolation)', () => {
    process.env.VENTURE_CHANNEL_SECRET_STORE = JSON.stringify({
      'venture_channel_secrets:v-1:x': { apiKey: 'v1-key' },
      'venture_channel_secrets:v-2:x': { apiKey: 'v2-key' }
    });
    expect(resolveSecret('venture_channel_secrets:v-1:x')).toEqual({ apiKey: 'v1-key' });
    expect(resolveSecret('venture_channel_secrets:v-2:x')).toEqual({ apiKey: 'v2-key' });
  });
});

describe('resolveChannelCredentials', () => {
  const ORIGINAL_ENV = process.env.VENTURE_CHANNEL_SECRET_STORE;
  afterEach(() => { process.env.VENTURE_CHANNEL_SECRET_STORE = ORIGINAL_ENV; });

  it('returns null (fail-closed) when no secret_ref is on record', async () => {
    const supabase = makeSupabase({ maybeSingleData: null });
    expect(await resolveChannelCredentials({ supabase, ventureId: 'v-1', channelType: 'x' })).toBeNull();
  });

  it('returns null (fail-closed) on a query error', async () => {
    const supabase = makeSupabase({ maybeSingleError: { message: 'timeout' } });
    expect(await resolveChannelCredentials({ supabase, ventureId: 'v-1', channelType: 'x' })).toBeNull();
  });

  it('resolves end-to-end: secret_ref lookup then keyring resolution', async () => {
    process.env.VENTURE_CHANNEL_SECRET_STORE = JSON.stringify({
      'venture_channel_secrets:v-1:x': { apiKey: 'resolved-key' }
    });
    const supabase = makeSupabase({ maybeSingleData: { secret_ref: 'venture_channel_secrets:v-1:x' } });
    expect(await resolveChannelCredentials({ supabase, ventureId: 'v-1', channelType: 'x' })).toEqual({ apiKey: 'resolved-key' });
  });
});

describe('createStoreSecretDep (positional-signature adapter)', () => {
  it('binds supabase and adapts to organic-channel-provisioning.js\'s (ventureId, channelType, credentials) DI shape', async () => {
    const supabase = makeSupabase({});
    const storeSecretDep = createStoreSecretDep({ supabase });

    const ref = await storeSecretDep('v-1', 'blog_seo', { apiKey: 'k' });

    expect(ref).toBe('venture_channel_secrets:v-1:blog_seo');
  });
});
