/**
 * Unit tests — provision_venture_email step machine (PRD TS-1..TS-7).
 * SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001. All external legs injected as fakes;
 * store/journal in-memory (the module's deps seam, per DESIGN d1793007).
 */
import { describe, it, expect } from 'vitest';
import {
  provisionVentureEmail,
  guardSequenceSend,
  DOMAIN_CAPACITY_WARN_AT,
} from '../../../lib/venture-email/provision-venture-email.js';
import { AupWitnessError, VerifyPollTimeoutError } from '../../../lib/venture-email/errors.js';

function memStore(initial = {}) {
  const rows = new Map();
  const secrets = [];
  return {
    rows, secrets,
    async getOrCreate(domain, ventureId) {
      if (!rows.has(domain)) {
        rows.set(domain, { domain, venture_id: ventureId || null, provision_state: initial.state || 'pending', lock_version: 0, routes: {}, ...initial.row });
      }
      return { ...rows.get(domain) };
    },
    async casTransition(row, patch) {
      const cur = rows.get(row.domain);
      if (cur.lock_version !== row.lock_version) {
        const err = new Error('lost CAS race');
        err.name = 'ProvisioningStateError';
        throw err;
      }
      const next = { ...cur, ...patch, lock_version: cur.lock_version + 1 };
      rows.set(row.domain, next);
      return { ...next };
    },
    async storeScopedKeySecret(ventureId, domain, keyId) {
      // Pointer-only, mirroring venture_channel_secrets (NO value column exists).
      const secretRef = `venture_channel_secrets:${ventureId}:email`;
      secrets.push({ ventureId, domain, keyId, secretRef });
      return secretRef;
    },
  };
}

function memJournal() {
  const entries = [];
  const fn = async (step, detail) => { entries.push({ step, ...detail }); };
  fn.entries = entries;
  return fn;
}

const happyRegistrar = (calls = []) => ({
  checkDomain: async (d) => { calls.push(['check', d]); return { available: true, price: 10 }; },
  registerDomain: async (d) => { calls.push(['register', d]); return { ok: true }; },
});
const happyDns = (calls = []) => ({
  listZones: async (d) => { calls.push(['listZones', d]); return []; },
  createZone: async (d) => { calls.push(['createZone', d]); return { id: 'zone-1', name: d }; },
  listRecords: async () => [],
  createRecord: async (zoneId, rec) => { calls.push(['createRecord', rec.type, rec.name]); return { id: 'rec' }; },
});
const happyResend = (calls = [], { count = 1 } = {}) => ({
  countDomains: async () => count,
  findDomain: async () => ({ id: 'rd-1', records: [], status: 'pending' }),
  enrollDomain: async (d) => { calls.push(['enroll', d]); return { reused: false, id: 'rd-1', records: [{ record: 'TXT', name: `resend._domainkey.${d}`, value: 'dkim' }] }; },
  verifyDomain: async () => ({ verified: true, attempts: 1 }),
  mintScopedKey: async (d) => { calls.push(['mint', d]); return { keyId: 'key-1', keyValue: 'secret-value' }; },
});
const happyRouting = (calls = []) => ({
  centralInbox: 'inbox@central.test',
  ensureDestination: async () => ({ reused: true, verified: true }),
  ensureRoutes: async (zoneId, d) => { calls.push(['routes', d]); return [{ address: `hello@${d}` }, { address: `support@${d}` }]; },
});

const venture = { id: 'v-1', domain: 'example-venture.com' };

describe('TS-1 happy path end-to-end', () => {
  it('runs all steps in order, persists mapping, journals every step, no duplicates', async () => {
    const calls = [];
    const store = memStore();
    const journal = memJournal();
    const res = await provisionVentureEmail(venture, {
      registrar: happyRegistrar(calls), dns: happyDns(calls), resendDomains: happyResend(calls),
      emailRouting: happyRouting(calls), store, journal,
    });
    expect(res.state).toBe('provisioned');
    const row = store.rows.get('example-venture.com');
    expect(row.resend_domain_id).toBe('rd-1');
    expect(row.cf_zone_id).toBe('zone-1');
    expect(row.scoped_key_id).toBe('key-1');
    expect(row.routes.central).toBe('inbox@central.test');
    const steps = journal.entries.map((e) => e.step);
    for (const s of ['register_or_resume', 'resend_domain_enroll', 'dns_records', 'verify_poll', 'scoped_key', 'inbound_routes', 'provisioned']) {
      expect(steps).toContain(s);
    }
    expect(calls.filter((c) => c[0] === 'enroll')).toHaveLength(1);
    // secret_ref POINTER row persisted; the VALUE never touches store, row, or journal
    expect(store.secrets).toEqual([{ ventureId: 'v-1', domain: 'example-venture.com', keyId: 'key-1', secretRef: 'venture_channel_secrets:v-1:email' }]);
    expect(JSON.stringify(store.secrets)).not.toContain('secret-value');
    expect(JSON.stringify(journal.entries)).not.toContain('secret-value');
    // the once-revealed VALUE is surfaced to the caller exactly once, for keyring injection
    expect(res.revealedKey).toEqual({ secretRef: 'venture_channel_secrets:v-1:email', keyId: 'key-1', keyValue: 'secret-value' });
    expect(res.planSteps.some((s) => s.includes('VENTURE_CHANNEL_SECRET_STORE'))).toBe(true);
  });
});

describe('TS-2 resume-from-registered (beta-registrar fallback)', () => {
  it('skips the registrar leg entirely and completes DNS-onward', async () => {
    const calls = [];
    const store = memStore({ state: 'registered' });
    const res = await provisionVentureEmail(venture, {
      registrar: { checkDomain: async () => { throw new Error('must not be called'); }, registerDomain: async () => { throw new Error('must not be called'); } },
      dns: happyDns(calls), resendDomains: happyResend(calls), emailRouting: happyRouting(calls),
      store, journal: memJournal(),
    });
    expect(res.state).toBe('provisioned');
  });

  it('registrar throw (beta gate) → plan_mode with ONE manual step', async () => {
    const store = memStore();
    const journal = memJournal();
    const res = await provisionVentureEmail(venture, {
      registrar: { checkDomain: async () => ({ available: true }), registerDomain: async () => { throw new Error('TLD not supported in beta'); } },
      dns: happyDns(), resendDomains: happyResend(), emailRouting: happyRouting(),
      store, journal,
    });
    expect(res.state).toBe('plan_mode');
    expect(res.planSteps).toHaveLength(1);
    expect(res.planSteps[0]).toMatch(/MANUAL: register/);
    expect(journal.entries.find((e) => e.step === 'register_or_resume').outcome).toBe('plan_mode');
  });
});

describe('TS-3 interrupted verify-poll resumes', () => {
  it('poll timeout keeps last completed state; re-invocation resumes at verify and completes', async () => {
    const store = memStore();
    let verifies = 0;
    const flaky = { ...happyResend(), verifyDomain: async () => { verifies += 1; if (verifies === 1) throw new VerifyPollTimeoutError('timeout', { attempts: 30 }); return { verified: true, attempts: 2 }; } };
    const deps = { registrar: happyRegistrar(), dns: happyDns(), resendDomains: flaky, emailRouting: happyRouting(), store, journal: memJournal() };
    await expect(provisionVentureEmail(venture, deps)).rejects.toThrow(VerifyPollTimeoutError);
    expect(store.rows.get('example-venture.com').provision_state).toBe('dns_written'); // NOT failed
    const res = await provisionVentureEmail(venture, deps);
    expect(res.state).toBe('provisioned');
    expect(verifies).toBe(2);
  });
});

describe('TS-4 scoped-key value routing (isolation substrate)', () => {
  it('DB gets pointer + ID only; the VALUE is surfaced once via result.revealedKey', async () => {
    const store = memStore();
    const res = await provisionVentureEmail(venture, { registrar: happyRegistrar(), dns: happyDns(), resendDomains: happyResend(), emailRouting: happyRouting(), store, journal: memJournal() });
    expect(store.rows.get('example-venture.com').scoped_key_id).toBe('key-1');
    expect(JSON.stringify(store.rows.get('example-venture.com'))).not.toContain('secret-value');
    expect(store.secrets[0]).toEqual({ ventureId: 'v-1', domain: 'example-venture.com', keyId: 'key-1', secretRef: 'venture_channel_secrets:v-1:email' });
    expect(res.revealedKey.keyValue).toBe('secret-value');
  });

  it('a resumed run past key_scoped never re-reveals the key (revealedKey stays null)', async () => {
    const store = memStore({ state: 'key_scoped', row: { scoped_key_id: 'key-1', resend_domain_id: 'rd-1', cf_zone_id: 'zone-1' } });
    const res = await provisionVentureEmail(venture, { registrar: happyRegistrar(), dns: happyDns(), resendDomains: happyResend(), emailRouting: happyRouting(), store, journal: memJournal() });
    expect(res.state).toBe('provisioned');
    expect(res.revealedKey).toBeNull();
    expect(store.secrets).toEqual([]);
  });
});

describe('TS-5 capacity warning at 8+', () => {
  it('emits a capacity-warning journal row and continues', async () => {
    const journal = memJournal();
    const res = await provisionVentureEmail(venture, {
      registrar: happyRegistrar(), dns: happyDns(), resendDomains: happyResend([], { count: DOMAIN_CAPACITY_WARN_AT - 1 }),
      emailRouting: happyRouting(), store: memStore(), journal,
    });
    expect(res.state).toBe('provisioned');
    const warn = journal.entries.find((e) => e.step === 'capacity_warning');
    expect(warn).toBeTruthy();
    expect(warn.note).toContain('SES re-evaluation');
  });
});

describe('TS-6 AUP witness', () => {
  it('sequence-send without a capture record is refused with the typed error', () => {
    expect(() => guardSequenceSend({})).toThrow(AupWitnessError);
    expect(() => guardSequenceSend({ captureRecordId: '  ' })).toThrow(AupWitnessError);
    expect(guardSequenceSend({ captureRecordId: 'cap-123' })).toBe(true);
  });
});

describe('TS-7 plan-mode without credentials', () => {
  it('null registrar adapter → plan_mode with actionable manual step, no throw', async () => {
    const journal = memJournal();
    const res = await provisionVentureEmail(venture, {
      registrar: null, dns: happyDns(), resendDomains: happyResend(), emailRouting: happyRouting(),
      store: memStore(), journal,
    });
    expect(res.state).toBe('plan_mode');
    expect(res.planSteps[0]).toMatch(/MANUAL: register .* re-invoke/);
  });

  it('null email-leg adapters after registration → plan_mode naming the missing credentials', async () => {
    const res = await provisionVentureEmail(venture, {
      registrar: happyRegistrar(), dns: null, resendDomains: null, emailRouting: null,
      store: memStore(), journal: memJournal(),
    });
    expect(res.state).toBe('plan_mode');
    expect(res.planSteps[0]).toContain('RESEND_API_KEY');
  });
});

describe('journaling of failures (DESIGN inspectability)', () => {
  it('a hard step failure journals an error row and marks failed', async () => {
    const store = memStore();
    const journal = memJournal();
    const broken = { ...happyResend(), enrollDomain: async () => { throw new Error('resend 500 forever'); } };
    await expect(provisionVentureEmail(venture, { registrar: happyRegistrar(), dns: happyDns(), resendDomains: broken, emailRouting: happyRouting(), store, journal }))
      .rejects.toThrow('resend 500 forever');
    expect(journal.entries.find((e) => e.step === 'error')).toBeTruthy();
    expect(store.rows.get('example-venture.com').provision_state).toBe('failed');
    expect(store.rows.get('example-venture.com').last_error).toContain('resend 500 forever');
  });
});
