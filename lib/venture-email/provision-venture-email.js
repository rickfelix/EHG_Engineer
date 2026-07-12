/**
 * provision_venture_email(venture) — one-call per-venture email identity.
 * SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001 (Solomon adjudication, commission e16f1379).
 *
 * RESUMABLE STEP MACHINE over venture_email_identities.provision_state
 * (LAST-COMPLETED-step semantics — re-invocation runs the next incomplete step):
 *   pending -> registered -> domain_enrolled -> dns_written -> verified
 *           -> key_scoped -> routes_wired -> provisioned
 * Terminal branches: plan_mode (credentials absent — manual fallback emitted),
 * failed (human needed; last_error populated).
 *
 * COMPOSITION ONLY (do-not-rebuild): registrar leg = lib/venture-acquisition/
 * registrar-adapter.js; DNS leg = lib/venture-acquisition/dns-wiring.js primitives
 * (idempotent verified-and-kept); email legs = ./resend-domains.js + ./cf-email-routing.js.
 * All adapters follow the createXxxAdapter(env,{fetchImpl}) → null-on-missing-creds
 * contract; a null adapter routes that leg to plan-mode, never a throw.
 *
 * EVERY external call — success OR failure — journals a portfolio_evidence row
 * (evidence_kind='venture_email_provision_call', provenance='real_event'); a run is
 * reconstructable from journal rows alone (Solomon verification point 1; DESIGN
 * inspectability gap closed: failures journal too). Secrets never enter journals,
 * the mapping row, OR the database at all: venture_channel_secrets holds a
 * secret_ref POINTER row only (no value column exists — lib/marketing/
 * channel-secrets.js convention); the once-revealed key VALUE is surfaced to the
 * caller via result.revealedKey for VENTURE_CHANNEL_SECRET_STORE keyring injection.
 * If a run fails after key_scoped without the caller capturing revealedKey, revoke
 * the key by its journaled ID and re-mint — values are non-recoverable by design.
 *
 * Concurrency: optimistic CAS on lock_version per state transition
 * (ProvisioningStateError on a lost race — the winner proceeds).
 */
import { createClient } from '@supabase/supabase-js';
import { createRegistrarAdapter, normalizeQuote } from '../venture-acquisition/registrar-adapter.js';
import { createDnsAdapter } from '../venture-acquisition/dns-wiring.js';
import { createResendDomainsAdapter } from './resend-domains.js';
import { createEmailRoutingAdapter } from './cf-email-routing.js';
import { storeSecret } from '../marketing/channel-secrets.js';
import { AupWitnessError, ProvisioningStateError } from './errors.js';

export const PROVISION_STATES = Object.freeze([
  'pending', 'registered', 'domain_enrolled', 'dns_written', 'verified',
  'key_scoped', 'routes_wired', 'provisioned', 'plan_mode', 'failed',
]);

/** Resend Pro domain cap; warning threshold per FR-3. */
export const DOMAIN_CAPACITY_LIMIT = 10;
export const DOMAIN_CAPACITY_WARN_AT = 8;

const STEP_ORDER = ['pending', 'registered', 'domain_enrolled', 'dns_written', 'verified', 'key_scoped', 'routes_wired'];

function defaultSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Supabase-backed store for the mapping/state row. Injectable for tests. */
export function createStore(supabase) {
  return {
    async getOrCreate(domain, ventureId) {
      const { data: existing, error: readErr } = await supabase
        .from('venture_email_identities').select('*').eq('domain', domain).maybeSingle();
      if (readErr) throw new Error(`venture_email_identities read failed: ${readErr.message}`);
      if (existing) return existing;
      const { data, error } = await supabase
        .from('venture_email_identities')
        .insert({ domain, venture_id: ventureId || null })
        .select('*').single();
      if (error) {
        // Lost the create race — the ON CONFLICT sibling row is authoritative.
        const { data: raced } = await supabase
          .from('venture_email_identities').select('*').eq('domain', domain).maybeSingle();
        if (raced) return raced;
        throw new Error(`venture_email_identities create failed: ${error.message}`);
      }
      return data;
    },
    /** Optimistic CAS: transition succeeds only when lock_version is unchanged. */
    async casTransition(row, patch) {
      const { data, error } = await supabase
        .from('venture_email_identities')
        .update({ ...patch, lock_version: row.lock_version + 1, updated_at: new Date().toISOString() })
        .eq('domain', row.domain)
        .eq('lock_version', row.lock_version)
        .select('*');
      if (error) throw new Error(`venture_email_identities update failed: ${error.message}`);
      if (!data || data.length === 0) {
        throw new ProvisioningStateError(
          `lost CAS race on ${row.domain} (another invocation transitioned the row)`,
          { domain: row.domain, expected: row.lock_version },
        );
      }
      return data[0];
    },
    /**
     * Pointer-only persistence: venture_channel_secrets has NO value column by design.
     * Delegates to the canonical channel-secrets writer (upserts the secret_ref row;
     * credentials are validated but never persisted). Returns the secret_ref; the
     * once-revealed VALUE stays with the caller (result.revealedKey) for keyring injection.
     */
    async storeScopedKeySecret(ventureId, domain, keyId, keyValue) {
      return storeSecret({
        supabase,
        ventureId,
        channelType: 'email',
        provider: 'resend',
        credentials: { key_id: keyId, api_key: keyValue, domain },
      });
    },
  };
}

/** Supabase-backed journal into the portfolio_evidence fabric. Injectable for tests. */
export function createJournal(supabase, ventureId) {
  return async function journal(step, detail) {
    try {
      await supabase.from('portfolio_evidence').insert({
        venture_id: ventureId || null,
        evidence_kind: 'venture_email_provision_call',
        provenance: 'real_event',
        source_module: 'lib/venture-email/provision-venture-email.js',
        subject_type: 'venture_domain',
        subject_id: detail.domain,
        payload: { step, ...detail, journaled_at: new Date().toISOString() },
      });
    } catch {
      // Journaling is evidence, not control flow — a journal fault never breaks provisioning.
    }
  };
}

/**
 * P6 rider (FR-8): register the provisioning loop's operative owner so the
 * verify-poll loop is never an unowned dormant class. ARMED semantics — real
 * provisioning events cannot occur until the first venture invokes this module;
 * the periodic-liveness watcher then owns armed-but-never-fired surfacing.
 * Fail-soft: registration is bookkeeping, never a provisioning blocker.
 */
export async function registerProvisioningOwner(supabase) {
  try {
    const { registerArmedMachinery } = await import('../machinery-class/armed-registration.js');
    return await registerArmedMachinery(supabase, { sd_key: 'SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001' }, {
      owner: 'venture-email-provisioning',
      activationTrigger: 'first provisionVentureEmail() invocation for a real venture domain (verify-poll loop)',
    });
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/**
 * AUP witness (FR-7): every sequence-send on the venture rail must carry a
 * capture-record reference. Refusal is typed and journal-able by the caller.
 */
export function guardSequenceSend({ captureRecordId } = {}) {
  if (!captureRecordId || typeof captureRecordId !== 'string' || captureRecordId.trim() === '') {
    throw new AupWitnessError('sequence-send refused: no capture-record reference (Resend AUP witness)');
  }
  return true;
}

/** Email DNS records via the EXISTING dns adapter primitives — idempotent by lookup. */
async function ensureEmailDnsRecords(dns, zoneId, records, journal, domain) {
  const existing = await dns.listRecords(zoneId);
  const have = new Set((existing || []).map((r) => `${r.type}:${r.name}:${r.content}`));
  let created = 0;
  for (const rec of records) {
    const sig = `${rec.type}:${rec.name}:${rec.content}`;
    if (have.has(sig)) continue; // verified-and-kept, never duplicated
    await dns.createRecord(zoneId, rec);
    created += 1;
  }
  await journal('dns_records', { domain, requested: records.length, created, kept: records.length - created });
  return created;
}

/**
 * Provision a venture's email identity end-to-end. Resumable and idempotent.
 *
 * @param {{ id?: string, domain: string }} venture - venture id (soft ref) + apex domain
 * @param {object} [deps] - injected seams (DESIGN d1793007): { env, fetchImpl, supabase,
 *   registrar, dns, resendDomains, emailRouting, store, journal, pollOpts }
 * @returns {Promise<{state: string, row: object, planSteps: string[],
 *   revealedKey: null|{secretRef: string, keyId: string, keyValue: string}}>}
 *   revealedKey is non-null ONLY on the invocation that minted the key — the value is
 *   revealed once by Resend and must be injected into the keyring by the caller.
 */
export async function provisionVentureEmail(venture, deps = {}) {
  if (!venture || !venture.domain) throw new Error('provisionVentureEmail: venture.domain is required');
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const supabase = deps.supabase || defaultSupabase();
  if (!supabase && !(deps.store && deps.journal)) {
    throw new Error('provisionVentureEmail: no supabase client and no injected store/journal');
  }

  const registrar = 'registrar' in deps ? deps.registrar : createRegistrarAdapter(env, { fetchImpl });
  const dns = 'dns' in deps ? deps.dns : createDnsAdapter(env, { fetchImpl });
  const resendDomains = 'resendDomains' in deps ? deps.resendDomains : createResendDomainsAdapter(env, { fetchImpl });
  const emailRouting = 'emailRouting' in deps ? deps.emailRouting : createEmailRoutingAdapter(env, { fetchImpl });
  const store = deps.store || createStore(supabase);
  const journal = deps.journal || createJournal(supabase, venture.id);

  const domain = venture.domain.toLowerCase();
  let row = await store.getOrCreate(domain, venture.id);
  const planSteps = [];
  let revealedKey = null;

  // FR-8 (P6): keep the owner registration fresh on every real invocation (fail-soft;
  // supabase may be absent in pure-injected test runs — registration is bookkeeping).
  if (supabase && !deps.skipOwnerRegistration) await registerProvisioningOwner(supabase);

  const done = (state) => STEP_ORDER.indexOf(row.provision_state) >= STEP_ORDER.indexOf(state);

  try {
    // Step 1 — register_or_resume (beta-registrar counterfactual guard: null adapter or
    // beta refusal -> plan-mode with ONE manual step; resume-from-registered supported).
    if (!done('registered')) {
      if (!registrar) {
        planSteps.push(`MANUAL: register ${domain} (CF Registrar credentials absent — plan-mode), then re-invoke`);
        await journal('register_or_resume', { domain, outcome: 'plan_mode', reason: 'registrar adapter null (no credentials)' });
        row = await store.casTransition(row, { provision_state: 'plan_mode' });
        return { state: row.provision_state, row, planSteps, revealedKey };
      }
      // checkDomain returns a registrar quote — normalizeQuote gives {registrable, priceUsd}.
      // registrable=false means the domain is taken (ours via manual registration, or foreign
      // — the DNS zone leg distinguishes: a foreign domain has no zone in our account and
      // createZone fails loudly there).
      const quote = normalizeQuote(await registrar.checkDomain(domain));
      if (quote.registrable === false) {
        await journal('register_or_resume', { domain, outcome: 'already_registered_or_taken' });
      } else {
        try {
          await registrar.registerDomain(domain, { years: 1, autoRenew: false });
          await journal('register_or_resume', { domain, outcome: 'registered' });
        } catch (regErr) {
          // Beta-gate/TLD refusal (Solomon counterfactual guard): ONE manual step, resume-from-registered.
          planSteps.push(`MANUAL: register ${domain} (registrar refused: ${regErr.message}), then re-invoke`);
          await journal('register_or_resume', { domain, outcome: 'plan_mode', reason: String(regErr.message) });
          row = await store.casTransition(row, { provision_state: 'plan_mode' });
          return { state: row.provision_state, row, planSteps, revealedKey };
        }
      }
      row = await store.casTransition(row, { provision_state: 'registered' });
    }

    // Plan-mode gate for the email legs.
    if (!resendDomains || !dns || !emailRouting) {
      const missing = [!resendDomains && 'RESEND_API_KEY', !dns && 'CLOUDFLARE tokens', !emailRouting && 'CF_EMAIL_ROUTING_TOKEN/CLOUDFLARE_ACCOUNT_ID/VENTURE_EMAIL_CENTRAL_INBOX'].filter(Boolean);
      planSteps.push(`MANUAL: provide credentials (${missing.join(', ')}), then re-invoke — state resumes from '${row.provision_state}'`);
      await journal('credential_gate', { domain, outcome: 'plan_mode', missing });
      row = await store.casTransition(row, { provision_state: 'plan_mode' });
      return { state: row.provision_state, row, planSteps, revealedKey };
    }

    // Step 2 — Resend domain enrollment (+ capacity warning at 8+).
    let enrollment;
    if (!done('domain_enrolled')) {
      const count = await resendDomains.countDomains();
      if (count + 1 >= DOMAIN_CAPACITY_WARN_AT) {
        await journal('capacity_warning', { domain, enrolled_domains: count + 1, limit: DOMAIN_CAPACITY_LIMIT, note: 'SES re-evaluation trigger at venture 11+ (architecture unchanged)' });
      }
      enrollment = await resendDomains.enrollDomain(domain);
      await journal('resend_domain_enroll', { domain, outcome: enrollment.reused ? 'reused' : 'enrolled', resend_domain_id: enrollment.id });
      row = await store.casTransition(row, { provision_state: 'domain_enrolled', resend_domain_id: enrollment.id });
    } else {
      enrollment = await resendDomains.findDomain(domain);
    }

    // Step 3 — DNS records through the existing adapter (+ DMARC p=none w/ graduation note).
    if (!done('dns_written')) {
      // dns-wiring contract: listZones takes the domain filter (GET /zones?name=<domain>).
      const zones = await dns.listZones(domain);
      let zone = (zones || []).find((z) => z.name === domain);
      if (!zone) zone = await dns.createZone(domain);
      const records = [
        ...(enrollment?.records || []).map((r) => ({ type: r.record || r.type, name: r.name, content: r.value ?? r.content, ttl: 300 })),
        // DMARC p=none now; scheduled graduation to p=quarantine after send-reputation warmup.
        { type: 'TXT', name: `_dmarc.${domain}`, content: 'v=DMARC1; p=none; rua=mailto:dmarc@' + domain, ttl: 300 },
      ];
      await ensureEmailDnsRecords(dns, zone.id, records, journal, domain);
      row = await store.casTransition(row, { provision_state: 'dns_written', cf_zone_id: zone.id });
    }

    // Step 4 — verify-poll (bounded, resumable on timeout).
    if (!done('verified')) {
      const verify = await resendDomains.verifyDomain(row.resend_domain_id || enrollment?.id, deps.pollOpts);
      await journal('verify_poll', { domain, outcome: 'verified', attempts: verify.attempts });
      row = await store.casTransition(row, { provision_state: 'verified' });
    }

    // Step 5 — per-domain scoped key (secret_ref pointer -> venture_channel_secrets;
    // ID -> mapping row; VALUE -> result.revealedKey ONCE, for keyring injection).
    if (!done('key_scoped')) {
      const key = await resendDomains.mintScopedKey(domain, row.resend_domain_id || enrollment?.id);
      const secretRef = await store.storeScopedKeySecret(venture.id, domain, key.keyId, key.keyValue);
      revealedKey = { secretRef, keyId: key.keyId, keyValue: key.keyValue };
      planSteps.push(`MANUAL: inject the once-revealed Resend key (id ${key.keyId}) into the VENTURE_CHANNEL_SECRET_STORE keyring under '${secretRef}' — value is in result.revealedKey only and is unrecoverable after this run`);
      await journal('scoped_key', { domain, outcome: 'minted', scoped_key_id: key.keyId, secret_ref: secretRef });
      row = await store.casTransition(row, { provision_state: 'key_scoped', scoped_key_id: key.keyId });
    }

    // Step 6 — inbound routes (destination verified once, reused).
    if (!done('routes_wired')) {
      const destination = await emailRouting.ensureDestination();
      const routes = await emailRouting.ensureRoutes(row.cf_zone_id, domain);
      await journal('inbound_routes', { domain, outcome: 'wired', destination_reused: destination.reused, routes });
      row = await store.casTransition(row, { provision_state: 'routes_wired', routes: { central: emailRouting.centralInbox, rules: routes } });
    }

    // Step 7 — terminal persist.
    row = await store.casTransition(row, { provision_state: 'provisioned', last_error: null });
    await journal('provisioned', { domain, outcome: 'complete' });
    return { state: row.provision_state, row, planSteps, revealedKey };
  } catch (err) {
    // Failures journal too (DESIGN inspectability gap): a stuck run is reconstructable
    // from rows alone. Resumable classes keep the last completed state; CAS races and
    // poll timeouts are NOT terminal.
    await journal('error', { domain, step_state: row.provision_state, error_name: err.name, error: String(err.message) });
    if (err.name === 'VerifyPollTimeoutError' || err.name === 'ProvisioningStateError') throw err;
    try {
      row = await store.casTransition(row, { provision_state: 'failed', last_error: `${err.name}: ${err.message}` });
    } catch { /* CAS-race on failure marking: the winner's state stands */ }
    throw err;
  }
}
