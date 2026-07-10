/**
 * Post-purchase DNS wiring + deploy-path handoff.
 *
 * SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001 FR-7 / FR-8.
 *
 * MINIMAL BY DESIGN (LEAD deletion audit): ensure the zone plus exactly the
 * record set the deploy handoff needs — apex + www pointing at the venture's
 * deploy target. Explicitly NOT general zone management.
 *
 * IDEMPOTENT: existing zone/records are verified-and-kept, never duplicated —
 * re-running the wiring after a partial failure creates only what is missing.
 *
 * DEPLOY HANDOFF (FR-8): venture_deployments rows remain OWNED by
 * lib/venture-deploy/promote.js — this module only stamps
 * ventures.deployment_url with the acquired domain once a routed deployment
 * exists. RESUMABLE: with no routed deployment yet it parks as
 * 'pending_deploy' and is safe to re-run after promote() routes (no race with
 * the deploy pipeline's own stamping).
 *
 * Same credential contract as the registrar adapter (TR-5): the DNS adapter
 * factory returns null without the token env (DNS:Edit scope) — plan mode.
 *
 * @module lib/venture-acquisition/dns-wiring
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Thin CF DNS adapter (zones + records). Null without credentials => plan mode.
 * @param {object} [env]
 * @param {{fetchImpl?: typeof fetch}} [opts]
 */
export function createDnsAdapter(env = process.env, { fetchImpl } = {}) {
  const token = env.CLOUDFLARE_REGISTRAR_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return null;
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;

  async function call(method, path, body) {
    const res = await f(`${API_BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* status carries the signal */ }
    if (!res.ok || (json && json.success === false)) {
      const detail = json?.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
      throw new Error(`dns ${method} ${path}: ${detail}`);
    }
    return json?.result ?? json;
  }

  return {
    listZones: (domain) => call('GET', `/zones?name=${encodeURIComponent(domain)}`),
    createZone: (domain) => call('POST', '/zones', { name: domain, account: { id: accountId } }),
    listRecords: (zoneId) => call('GET', `/zones/${encodeURIComponent(zoneId)}/dns_records`),
    createRecord: (zoneId, record) => call('POST', `/zones/${encodeURIComponent(zoneId)}/dns_records`, record),
  };
}

/** The minimal record set for the deploy handoff: apex + www CNAMEs to the deploy target (proxied). */
export function planDnsRecords(domain, target) {
  return [
    { type: 'CNAME', name: domain, content: target, proxied: true },
    { type: 'CNAME', name: `www.${domain}`, content: target, proxied: true },
  ];
}

/**
 * Ensure zone + minimal records exist (idempotent). Plan mode (null adapter):
 * returns the ordered plan, touches nothing.
 *
 * @param {object|null} dns - createDnsAdapter() result or injected fake
 * @param {string} domain
 * @param {string} target - deploy target hostname (from the venture's stack descriptor / routed deployment)
 * @returns {Promise<{status: string, zoneId?: string, created: object[], kept: object[], plan?: object[]}>}
 */
export async function wireDomainDns(dns, domain, target) {
  const wanted = planDnsRecords(domain, target);
  if (!dns) {
    return {
      status: 'blocked_on_credentials',
      created: [],
      kept: [],
      plan: [{ kind: 'ensure_zone', desc: `zone ${domain}` }, ...wanted.map((r) => ({ kind: 'ensure_record', desc: `${r.type} ${r.name} -> ${r.content}` }))],
    };
  }

  // Zone: reuse when present, create when absent (idempotent).
  const zones = await dns.listZones(domain);
  let zone = Array.isArray(zones) ? zones.find((z) => z.name === domain) : null;
  if (!zone) zone = await dns.createZone(domain);

  // Records: create only what is missing (verified-and-kept, never duplicated).
  const existing = (await dns.listRecords(zone.id)) || [];
  const created = [];
  const kept = [];
  for (const rec of wanted) {
    const match = existing.find((e) => e.type === rec.type && e.name === rec.name);
    if (match) { kept.push(match); continue; }
    created.push(await dns.createRecord(zone.id, rec));
  }
  return { status: 'wired', zoneId: zone.id, created, kept };
}

/**
 * FR-8: stamp the acquired domain into the deploy pipeline's contract once a
 * routed deployment exists; park pending_deploy (resumable) otherwise.
 *
 * @param {object} supabase - service-role client
 * @param {string} ventureId
 * @param {string} domain
 * @returns {Promise<{status: 'stamped'|'pending_deploy', deploymentUrl?: string}>}
 */
export async function handDomainToDeploy(supabase, ventureId, domain) {
  const { data: routed, error: rErr } = await supabase
    .from('venture_deployments')
    .select('id, status, url, created_at')
    .eq('venture_id', ventureId)
    .eq('status', 'routed')
    .order('created_at', { ascending: false })
    .limit(1);
  if (rErr) throw new Error(`handDomainToDeploy: routed lookup failed: ${rErr.message}`);
  if (!routed || routed.length === 0) {
    return { status: 'pending_deploy' }; // resumable: re-run after promote() routes
  }

  const deploymentUrl = `https://${domain}`;
  const { error: uErr } = await supabase
    .from('ventures')
    .update({ deployment_url: deploymentUrl })
    .eq('id', ventureId);
  if (uErr) throw new Error(`handDomainToDeploy: stamp failed: ${uErr.message}`);

  // Readback-verify the stamp (memory: never trust a silent UPDATE).
  const { data: check, error: cErr } = await supabase
    .from('ventures')
    .select('deployment_url')
    .eq('id', ventureId)
    .maybeSingle();
  if (cErr || check?.deployment_url !== deploymentUrl) {
    throw new Error('handDomainToDeploy: stamp readback mismatch — deployment_url not persisted');
  }
  return { status: 'stamped', deploymentUrl };
}

/**
 * The zero-further-human-steps pipeline after fn_chairman_decide(approved):
 * register (approval/ceiling/idempotency enforced inside executeAcquisition)
 * -> DNS -> deploy handoff. Each step's non-success short-circuits with that
 * step's status so callers/retries resume exactly where it stopped.
 *
 * @param {object} supabase
 * @param {string} decisionId
 * @param {{registrar?: object|null, dns?: object|null, execute?: boolean, env?: object, deployTarget?: string, now?: () => Date}} [deps]
 */
export async function runPostApprovalPipeline(supabase, decisionId, deps = {}) {
  const { executeAcquisition } = await import('./acquire.js');
  const acq = await executeAcquisition(supabase, decisionId, deps);
  if (acq.status !== 'registered' && acq.status !== 'already_acquired') return { step: 'acquire', ...acq };

  const target = deps.deployTarget || null;
  if (!target) return { step: 'dns', status: 'blocked_no_deploy_target', domain: acq.domain };
  const dnsResult = await wireDomainDns(deps.dns ?? null, acq.domain, target);
  if (dnsResult.status !== 'wired') return { step: 'dns', ...dnsResult, domain: acq.domain };

  const { data: decision } = await supabase.from('chairman_decisions').select('venture_id').eq('id', decisionId).maybeSingle();
  const handoff = await handDomainToDeploy(supabase, decision.venture_id, acq.domain);
  return { step: 'complete', status: handoff.status, domain: acq.domain, deploymentUrl: handoff.deploymentUrl };
}

export default { createDnsAdapter, planDnsRecords, wireDomainDns, handDomainToDeploy, runPostApprovalPipeline };
