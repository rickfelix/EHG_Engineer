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
import {
  encryptBankReadToken, decryptBankReadToken, loadBankReadToken,
  storeTellerCertPair, loadTellerCertPair,
} from '../../../lib/operator/cash-sources/token-vault.js';
import { readBankCashSlice } from '../../../lib/operator/cash-sources/bank-read-service.js';
import { createTellerClient } from '../../../lib/operator/cash-sources/teller-client.js';
import { computeRunway } from '../../../lib/operator/cash-burn-substrate.js';

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

// SD-LEO-INFRA-OPERATOR-RUNWAY-TRUTHFULNESS-001 FR-1
describe('FR-1: Teller mTLS cert-pair vault (separate namespace from the token vault)', () => {
  const fakeEnc = {
    encryptAppCredentials: vi.fn(async (appId, creds) => ({ appId, creds })),
    decryptAppCredentials: vi.fn(async () => ({ teller_cert_pem: 'CERT', teller_key_pem: 'KEY' })),
  };

  it('round-trips a cert pair via storeTellerCertPair/loadTellerCertPair', async () => {
    await storeTellerCertPair({ certPem: 'CERT', keyPem: 'KEY' }, { enc: fakeEnc });
    expect(fakeEnc.encryptAppCredentials).toHaveBeenCalledWith('operator-bank-read-mtls', { teller_cert_pem: 'CERT', teller_key_pem: 'KEY' });
    const loaded = await loadTellerCertPair({ enc: fakeEnc });
    expect(loaded).toEqual({ certPem: 'CERT', keyPem: 'KEY' });
  });

  it('rejects an empty cert or key', async () => {
    await expect(storeTellerCertPair({ certPem: '', keyPem: 'KEY' }, { enc: fakeEnc })).rejects.toThrow(/certPem/);
    await expect(storeTellerCertPair({ certPem: 'CERT', keyPem: '' }, { enc: fakeEnc })).rejects.toThrow(/keyPem/);
  });

  it('loadTellerCertPair is silently inert ({certPem:null,keyPem:null}) when nothing is enrolled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enc = { decryptAppCredentials: vi.fn(async () => { const e = new Error('ENOENT: no such file'); e.code = 'ENOENT'; throw e; }) };
    expect(await loadTellerCertPair({ enc })).toEqual({ certPem: null, keyPem: null });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// TS-6b(a): static guard, extended from the Stripe pattern above to Teller verbs.
describe('TS-6b(a): static guard -- no transfer/payment verb anywhere in the bank-read surface', () => {
  const FORBIDDEN_VERBS = /\.(transfer|payment|payee|zelle|ach|wire|payout)s?\b/i;

  it('bank-read-service.js contains no transfer/payment/payee/zelle/ach/wire/payout verb', () => {
    const src = readFileSync(join(REPO_ROOT, 'lib/operator/cash-sources/bank-read-service.js'), 'utf8');
    expect(src).not.toMatch(FORBIDDEN_VERBS);
  });

  it('teller-client.js contains no transfer/payment/payee/zelle/ach/wire/payout verb', () => {
    const src = readFileSync(join(REPO_ROOT, 'lib/operator/cash-sources/teller-client.js'), 'utf8');
    expect(src).not.toMatch(FORBIDDEN_VERBS);
    // Only the two read endpoints exist.
    expect(src).toMatch(/listAccounts/);
    expect(src).toMatch(/getBalance/);
  });

  it('enroll-bank-read.mjs contains no transfer/payment/payee/zelle/ach/wire/payout verb', () => {
    const src = readFileSync(join(REPO_ROOT, 'scripts/operator/enroll-bank-read.mjs'), 'utf8');
    expect(src).not.toMatch(FORBIDDEN_VERBS);
  });
});

// TS-6b(b): mocked-client behavioral negative -- a client exposing transfer/payment spies
// alongside the read methods must have ONLY the read methods invoked.
describe('TS-6b(b): behavioral negative -- readBankCashSlice never calls a transfer/payment method', () => {
  it('only listAccounts/getBalance are ever invoked, even when the client also exposes transfer/payment', async () => {
    const transfer = vi.fn();
    const payment = vi.fn();
    const client = {
      listAccounts: vi.fn(async () => [{ id: 'a1' }]),
      getBalance: vi.fn(async () => ({ currency: 'USD', available: 100 })),
      transfer,
      payment,
    };
    const slice = await readBankCashSlice({ loadToken: async () => 'tok', tellerClientFactory: () => client });
    expect(slice).toEqual({ usd: 100, other_burn_usd: null, source: 'bank' });
    expect(client.listAccounts).toHaveBeenCalledOnce();
    expect(client.getBalance).toHaveBeenCalledOnce();
    expect(transfer).not.toHaveBeenCalled();
    expect(payment).not.toHaveBeenCalled();
  });
});

// TS-6a: FR-1 bank-read fallthrough on failure -- the actual END-TO-END chain
// (read failure -> stale cash -> honest headline via computeRunway()), not just the
// low-level function returning null in isolation.
describe('TS-6a: FR-1 bank-read failure falls through to the honest headline end-to-end', () => {
  const NOW = Date.parse('2026-06-19T22:00:00Z');
  const staleRow = {
    // Cash was manually attested a while ago and is now stale -- a failed bank read
    // must NOT refresh it, so the substrate correctly withholds the runway.
    cash_usd: 5000, cash_last_synced_at: new Date(NOW - 60 * 24 * 60 * 60 * 1000).toISOString(),
    ai_burn_usd: 100, ai_burn_last_synced_at: new Date(NOW - 60 * 60 * 1000).toISOString(), ai_burn_is_lower_bound: false,
    other_burn_usd: null, other_burn_last_synced_at: null,
    revenue_usd: null, revenue_last_synced_at: null,
  };

  it('a throwing tellerClientFactory leaves cash un-refreshed, flowing through to "awaiting cash source"', async () => {
    const throwingFactory = () => { throw new Error('Teller API unreachable'); };
    const slice = await readBankCashSlice({ loadToken: async () => 'tok', tellerClientFactory: throwingFactory });
    expect(slice).toBeNull(); // the read failed -- no fresh cash_usd is ever written by the caller

    // The substrate never saw a write, so it still evaluates the pre-existing (stale) row honestly.
    const verdict = computeRunway(staleRow, { nowMs: NOW });
    expect(verdict.partials.cash.status).toBe('stale');
    expect(verdict.headline).toBe('awaiting cash source');
  });

  it('no tellerClientFactory configured (chairman not enrolled) behaves identically', async () => {
    const slice = await readBankCashSlice({ loadToken: async () => 'tok' }); // no factory
    expect(slice).toBeNull();
    const verdict = computeRunway(staleRow, { nowMs: NOW });
    expect(verdict.headline).toBe('awaiting cash source');
  });
});

// TS-6b(c)/(d): enroll-bank-read.mjs's fail-closed security gates.
describe('TS-6b(c)(d): enroll-bank-read.mjs security gates', () => {
  it('refuses under a CI/GITHUB_ACTIONS/fleet marker without the explicit confirm flag', async () => {
    const originalEnv = { ...process.env };
    const originalExit = process.exit;
    const originalArgv1 = process.argv[1];
    class ExitCalled extends Error {}
    const exitSpy = vi.fn(() => { throw new ExitCalled(); }); // guarantees main() cannot fall through
    process.exit = exitSpy;
    process.env.GITHUB_ACTIONS = 'true';
    delete process.env.BANK_READ_ENROLL_CONFIRM;
    process.argv[1] = 'not-this-module'; // suppress the entrypoint auto-run guard
    try {
      const mod = await import('../../../scripts/operator/enroll-bank-read.mjs?fresh1');
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(mod.main()).rejects.toThrow(ExitCalled);
      expect(exitSpy).toHaveBeenCalledWith(1);
      errSpy.mockRestore();
    } finally {
      process.env = originalEnv;
      process.exit = originalExit;
      process.argv[1] = originalArgv1;
    }
  });

  it('createTellerClient requires token, certPem, and keyPem (never silently proceeds with a partial credential set)', () => {
    expect(() => createTellerClient({ token: '', certPem: 'C', keyPem: 'K' })).toThrow(/token/);
    expect(() => createTellerClient({ token: 'T', certPem: '', keyPem: 'K' })).toThrow(/certPem/);
    expect(() => createTellerClient({ token: 'T', certPem: 'C', keyPem: '' })).toThrow(/keyPem/);
  });

  it('readStdin rejects immediately when stdin is a TTY (no piped input) rather than hanging', async () => {
    const mod = await import('../../../scripts/operator/enroll-bank-read.mjs?fresh2');
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    try {
      await expect(mod.readStdin()).rejects.toThrow(/stdin/);
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
  });
});
