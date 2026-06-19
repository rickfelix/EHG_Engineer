/**
 * SD-EHG-OPERATOR-CASH-BANK-FEED-001 — FR-5/contract tests.
 *
 * Surfaces:
 *  - stripe-balance.js: read-only available-USD slice, fail-soft, no write scope.
 *  - token-vault.js: encrypt/decrypt round-trip (injected enc), inert load.
 *  - bank-read-service.js: inert without a token; read-only when connected.
 *  - never-in-gauge-path guard: the gauge module (cash-burn-substrate.js) must not
 *    import any cash-source / vault module or reference the bank token.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readStripeCashSlice } from '../../../lib/operator/cash-sources/stripe-balance.js';
import { encryptBankReadToken, decryptBankReadToken, loadBankReadToken } from '../../../lib/operator/cash-sources/token-vault.js';
import { readBankCashSlice } from '../../../lib/operator/cash-sources/bank-read-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../..');

describe('FR-3: Stripe cash slice (read-only, fail-soft)', () => {
  it('sums available USD balance into a cash slice', async () => {
    const stripeClient = { balance: { retrieve: vi.fn(async () => ({ available: [{ amount: 1234567, currency: 'usd' }, { amount: 9999, currency: 'eur' }] })) } };
    const slice = await readStripeCashSlice({ stripeClient });
    expect(slice).toEqual({ usd: 12345.67, source: 'stripe' }); // EUR excluded; cents→USD
    expect(stripeClient.balance.retrieve).toHaveBeenCalledOnce();
  });

  it('returns a 0 slice when the account has no available USD (still a valid read)', async () => {
    const stripeClient = { balance: { retrieve: vi.fn(async () => ({ available: [] })) } };
    expect(await readStripeCashSlice({ stripeClient })).toEqual({ usd: 0, source: 'stripe' });
  });

  it('is fail-soft: returns null when the balance read throws', async () => {
    const stripeClient = { balance: { retrieve: vi.fn(async () => { throw new Error('network'); }) } };
    expect(await readStripeCashSlice({ stripeClient })).toBeNull();
  });

  it('uses ONLY balance.retrieve — never a charge/payout/transfer method (static)', () => {
    const src = readFileSync(join(REPO_ROOT, 'lib/operator/cash-sources/stripe-balance.js'), 'utf8');
    expect(src).toMatch(/balance\.retrieve\(\)/);
    expect(src).not.toMatch(/\.(charges|payouts|transfers|refunds|paymentIntents)\b/);
  });
});

describe('FR-1: token vault', () => {
  // Injected fake enc — hermetic (no .leo-keys / filesystem).
  // base64 stands in for the real AES-256-GCM enc — obscures the plaintext and round-trips.
  const fakeEnc = {
    encrypt: vi.fn(async (data, appId) => ({ encrypted: Buffer.from(JSON.stringify(data)).toString('base64'), metadata: { appId } })),
    decrypt: vi.fn(async (blob) => JSON.parse(Buffer.from(String(blob), 'base64').toString('utf8'))),
  };

  it('round-trips a token without exposing plaintext in the blob', async () => {
    const blob = await encryptBankReadToken('tok_secret_123', { enc: fakeEnc });
    expect(blob.encrypted).not.toContain('tok_secret_123');
    const back = await decryptBankReadToken(blob, { enc: fakeEnc });
    expect(back).toBe('tok_secret_123');
  });

  it('rejects an empty token', async () => {
    await expect(encryptBankReadToken('', { enc: fakeEnc })).rejects.toThrow(/non-empty/);
  });

  it('loadBankReadToken is silently inert (null, no warn) when no vault is enrolled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enc = { decryptAppCredentials: vi.fn(async () => { const e = new Error('ENOENT: no such file'); e.code = 'ENOENT'; throw e; }) };
    expect(await loadBankReadToken({ enc })).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('loadBankReadToken warns (but stays null) on a genuine decrypt/tamper failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enc = { decryptAppCredentials: vi.fn(async () => { throw new Error('Decryption failed: Unsupported state or unable to authenticate data'); }) };
    expect(await loadBankReadToken({ enc })).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/UNREADABLE/);
    warn.mockRestore();
  });
});

describe('FR-4: bank-read service is inert until enrollment', () => {
  it('returns null and makes no connection when no token is vaulted', async () => {
    const factory = vi.fn();
    const slice = await readBankCashSlice({ loadToken: async () => null, tellerClientFactory: factory });
    expect(slice).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('returns null when a token exists but no read client is wired (still inert)', async () => {
    expect(await readBankCashSlice({ loadToken: async () => 'tok' })).toBeNull();
  });

  it('reads USD balances read-only when connected', async () => {
    const client = {
      listAccounts: vi.fn(async () => [{ id: 'a1' }, { id: 'a2' }]),
      getBalance: vi.fn(async (id) => ({ currency: 'USD', available: id === 'a1' ? 100 : 50 })),
    };
    const slice = await readBankCashSlice({ loadToken: async () => 'tok', tellerClientFactory: () => client });
    expect(slice).toEqual({ usd: 150, other_burn_usd: null, source: 'bank' });
  });
});

describe('contract: bank token never in the gauge code path', () => {
  it('the gauge module does not import any cash-source/vault module or reference the token', () => {
    const gauge = readFileSync(join(REPO_ROOT, 'lib/operator/cash-burn-substrate.js'), 'utf8');
    expect(gauge).not.toMatch(/cash-sources/);
    expect(gauge).not.toMatch(/token-vault|bank-read-service/);
    expect(gauge).not.toMatch(/bank_read_token/);
  });
});
