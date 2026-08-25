/**
 * SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001 FR-1 / TS-1 (hardened per TESTING sub-agent finding G1,
 * sub_agent_execution_results de22862f). Proves the no-purchase invocation shape used by
 * scripts/one-off/altifyai-provision-plan-mode.mjs (registrar/dns/resendDomains/emailRouting all
 * null) is safe even in a state provisionVentureEmail was NOT expected to be in for AltifyAI --
 * a throw-on-call fake, not a passive spy, so a live billable call is structurally impossible
 * rather than merely observed-after-the-fact.
 */
import { describe, it, expect } from 'vitest';
import { provisionVentureEmail } from '../../../lib/venture-email/provision-venture-email.js';

function memStore(initial = {}) {
  const rows = new Map();
  return {
    rows,
    async getOrCreate(domain, ventureId) {
      if (!rows.has(domain)) {
        rows.set(domain, { domain, venture_id: ventureId || null, provision_state: initial.state || 'pending', lock_version: 0, routes: {}, ...initial.row });
      }
      return { ...rows.get(domain) };
    },
    async casTransition(row, patch) {
      const cur = rows.get(row.domain);
      const next = { ...cur, ...patch, lock_version: cur.lock_version + 1 };
      rows.set(row.domain, next);
      return { ...next };
    },
  };
}

function memJournal() {
  const entries = [];
  const fn = async (step, detail) => { entries.push({ step, ...detail }); };
  fn.entries = entries;
  return fn;
}

const boom = (name) => () => { throw new Error(`SAFETY: ${name} must not be called in no-purchase mode`); };
const throwOnCallRegistrar = () => ({ checkDomain: boom('registrar.checkDomain'), registerDomain: boom('registrar.registerDomain') });
const throwOnCallDns = () => ({ listZones: boom('dns.listZones'), createZone: boom('dns.createZone'), listRecords: boom('dns.listRecords'), createRecord: boom('dns.createRecord') });
const throwOnCallResend = () => ({ countDomains: boom('resendDomains.countDomains'), findDomain: boom('resendDomains.findDomain'), enrollDomain: boom('resendDomains.enrollDomain'), verifyDomain: boom('resendDomains.verifyDomain'), mintScopedKey: boom('resendDomains.mintScopedKey') });
const throwOnCallRouting = () => ({ centralInbox: 'unused', ensureDestination: boom('emailRouting.ensureDestination'), ensureRoutes: boom('emailRouting.ensureRoutes') });

const venture = { id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9', domain: 'altifyai.com' };

describe('AltifyAI FR-1 no-purchase provisioning safety', () => {
  it('a fresh row (matching AltifyAI\'s real zero-rows state) returns plan_mode with all four deps null, no adapter touched', async () => {
    const res = await provisionVentureEmail(venture, {
      registrar: null, dns: null, resendDomains: null, emailRouting: null,
      store: memStore(), journal: memJournal(),
    });
    expect(res.state).toBe('plan_mode');
    expect(res.planSteps[0]).toMatch(/MANUAL: register .* re-invoke/);
  });

  it('TESTING G1 fix: even if provision_state were already "registered", ALL FOUR deps null (registrar/dns/resendDomains/emailRouting) still yields plan_mode with zero live calls', async () => {
    const store = memStore({ state: 'registered' });
    const res = await provisionVentureEmail(venture, {
      registrar: null, dns: null, resendDomains: null, emailRouting: null,
      store, journal: memJournal(),
    });
    expect(res.state).toBe('plan_mode');
    expect(res.planSteps[0]).toContain('RESEND_API_KEY');
  });

  it('regression control: with registrar:null but dns/resendDomains/emailRouting present (even as throw-on-call fakes, i.e. truthy), a "registered"-state venture proceeds PAST the plan_mode gate and reaches them -- proving registrar-only-null is NOT sufficient once state has advanced, which is exactly the G1 finding', async () => {
    const store = memStore({ state: 'registered' });
    await expect(provisionVentureEmail(venture, {
      registrar: null,
      dns: throwOnCallDns(),
      resendDomains: throwOnCallResend(),
      emailRouting: throwOnCallRouting(),
      store, journal: memJournal(),
    })).rejects.toThrow(/must not be called/);
  });

  it('documents that FR-1 must pass registrar:null explicitly -- a live (throw-on-call) registrar on a fresh row reaches checkDomain and throws, it does not silently no-op', async () => {
    await expect(provisionVentureEmail(venture, {
      registrar: throwOnCallRegistrar(),
      dns: throwOnCallDns(),
      resendDomains: throwOnCallResend(),
      emailRouting: throwOnCallRouting(),
      store: memStore(), journal: memJournal(),
    })).rejects.toThrow(/must not be called/);
  });
});
