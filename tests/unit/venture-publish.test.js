/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-D — single publish() orchestration.
 *
 * Pure, no-DB / no-real-CLI unit + activation suite:
 *  - FR-1/FR-2: publish() dry-run-default (zero side-effects + evidence), real-run
 *    blocked-on-failed-readiness, real-run published (injected fake adapters),
 *    fail-loud on a bad descriptor.
 *  - FR-3: the 3 fail-closed post-publish verifiers + gate-string distinctness.
 *  - FR-4: the family-aware Child-3 build-task deploy line (replit byte-identical).
 *  - Activation invariant: safe-publish path is live (dry-run never deploys).
 */
import { describe, it, expect } from 'vitest';

import { publish } from '../../lib/venture-deploy/publish.js';
import { GUARDRAIL_NAMES } from '../../lib/venture-deploy/spend-guardrails.js';
import { GATE_VERIFIERS, resolveVerifier } from '../../lib/eva/lifecycle/exit-gate-verifiers.js';
import { buildBuildTasks } from '../../lib/eva/bridge/build-tasks-writer.js';

const VENTURE = 'venture-ddd-444';
const ALL_ALLOW = GUARDRAIL_NAMES.map((g) => ({ guardrail: g, decision: 'allow', killswitch_open: false }));
const READY_DESCRIPTOR = {
  db_provider: 'd1',
  deployment_target: 'cloudflare-workers',
  connection: { provider: 'd1', secret_ref: `venture_db_secrets:${VENTURE}` },
};

// Spy adapter set: records calls; real CLIs never touched.
function fakeAdapters(returns = {}) {
  const calls = [];
  const a = {};
  for (const k of ['deployPages', 'deployWorkers', 'deployCloudRun', 'ensureD1', 'ensureNeon', 'ensureR2', 'runMigrations']) {
    a[k] = (args, opts) => { calls.push({ name: k, args, opts }); return Promise.resolve(returns[k] || {}); };
  }
  a._calls = calls;
  return a;
}

// Fake supabase: ventures select->maybeSingle, venture_guardrail_state select->eq (awaited),
// ventures update->eq. onUpdate captures the persisted publish record.
function fakeSupabase({ venture = null, ventureError = null, guardrails = [], guardrailsError = null, updateError = null, onUpdate = null } = {}) {
  return {
    from(table) {
      const result = table === 'ventures'
        ? { data: venture, error: ventureError }
        : { data: guardrails, error: guardrailsError };
      const selChain = {
        eq() { return selChain; },
        maybeSingle() { return Promise.resolve(result); },
        then(res, rej) { return Promise.resolve(result).then(res, rej); }, // awaitable for guardrail read
      };
      return {
        select() { return selChain; },
        update(payload) {
          return { eq() { if (onUpdate) onUpdate(payload); return Promise.resolve({ error: updateError }); } };
        },
      };
    },
  };
}

describe('FR-1/FR-2: publish() orchestration', () => {
  it('DRY-RUN by default: status planned, evidence populated, ZERO adapter side-effects', async () => {
    const adapters = fakeAdapters();
    const sb = fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR }, guardrails: ALL_ALLOW });
    const r = await publish(VENTURE, sb, {}, { adapters });
    expect(r.status).toBe('planned');
    expect(r.evidence.plannedActions.length).toBeGreaterThan(0);
    expect(adapters._calls).toHaveLength(0); // nothing executed
    expect(r.databaseReady).toBe(true);
    expect(r.guardrailsActive).toBe(true);
    expect(r.deploymentUrl).toBeNull();
  });

  it('DRY-RUN never deploys even for an UNREADY venture', async () => {
    const adapters = fakeAdapters();
    const sb = fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR }, guardrails: [] }); // no guardrails
    const r = await publish(VENTURE, sb, { dryRun: true }, { adapters });
    expect(r.status).toBe('planned');
    expect(r.guardrailsActive).toBe(false);
    expect(adapters._calls).toHaveLength(0);
  });

  it('REAL-RUN BLOCKED when guardrails are not active (names the failing check, no deploy)', async () => {
    const adapters = fakeAdapters();
    const sb = fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR }, guardrails: [] });
    const r = await publish(VENTURE, sb, { dryRun: false }, { adapters });
    expect(r.status).toBe('blocked');
    expect(r.evidence.blockedReason).toContain('guardrails');
    expect(adapters._calls).toHaveLength(0);
  });

  it('REAL-RUN BLOCKED when the DB connection is missing', async () => {
    const adapters = fakeAdapters();
    const noConn = { db_provider: 'd1', deployment_target: 'cloudflare-workers' }; // no connection
    const sb = fakeSupabase({ venture: { stack_descriptor: noConn }, guardrails: ALL_ALLOW });
    const r = await publish(VENTURE, sb, { dryRun: false }, { adapters });
    expect(r.status).toBe('blocked');
    expect(r.evidence.blockedReason).toContain('database');
    expect(adapters._calls).toHaveLength(0);
  });

  it('REAL-RUN PUBLISHED for a ready venture: adapters run, deploymentUrl set, evidence persisted', async () => {
    const adapters = fakeAdapters({ deployPages: { deploymentUrl: 'https://acme.pages.dev' } });
    let persisted = null;
    const sb = fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR }, guardrails: ALL_ALLOW, onUpdate: (p) => { persisted = p; } });
    const r = await publish(VENTURE, sb, { dryRun: false }, { adapters });
    expect(r.status).toBe('published');
    expect(r.deploymentUrl).toBe('https://acme.pages.dev');
    expect(adapters._calls.length).toBeGreaterThan(0);
    // publish evidence persisted under stack_descriptor.publish (additive — connection preserved)
    expect(persisted.stack_descriptor.publish.status).toBe('published');
    expect(persisted.stack_descriptor.connection).toEqual(READY_DESCRIPTOR.connection);
  });

  it('FAIL-LOUD on a missing/invalid stack descriptor (never a silent no-op)', async () => {
    const sb = fakeSupabase({ venture: { stack_descriptor: null }, guardrails: ALL_ALLOW });
    await expect(publish(VENTURE, sb, { dryRun: false }, { adapters: fakeAdapters() })).rejects.toThrow(/invalid\/missing stack_descriptor/);
  });

  it('requires ventureId and supabase (fail-loud)', async () => {
    await expect(publish(null, fakeSupabase())).rejects.toThrow(/ventureId/);
    await expect(publish(VENTURE, null)).rejects.toThrow(/supabase/);
  });
});

describe('FR-3: fail-closed post-publish verifiers', () => {
  const PUBLISHED = {
    ...READY_DESCRIPTOR,
    publish: { status: 'published', deploymentUrl: 'https://acme.pages.dev', evidence: { plannedActions: [{ adapter: 'deployPages' }] } },
  };

  it('registers all 3 gate strings, distinct from B/C', () => {
    for (const g of ['pages url live', 'compute deployed', 'publish evidence recorded']) {
      expect(typeof resolveVerifier(g)).toBe('function');
      expect(GATE_VERIFIERS.some((v) => v.match === g)).toBe(true);
    }
    // distinct from sibling B/C gates
    const c = resolveVerifier('spend guardrails ready');
    const b = resolveVerifier('stack descriptor valid');
    expect(resolveVerifier('compute deployed')).not.toBe(c);
    expect(resolveVerifier('compute deployed')).not.toBe(b);
    // 'compute deployed' must NOT collide with the pre-existing 'application deployed'
    expect(resolveVerifier('compute deployed')).not.toBe(resolveVerifier('application deployed'));
  });

  it('pages-url-live: PASS when recorded, fail-closed when absent / on error', async () => {
    const v = resolveVerifier('pages url live');
    expect((await v({ supabase: fakeSupabase({ venture: { stack_descriptor: PUBLISHED } }), ventureId: VENTURE })).satisfied).toBe(true);
    expect((await v({ supabase: fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR } }), ventureId: VENTURE })).satisfied).toBe(false);
    expect((await v({ supabase: fakeSupabase({ ventureError: { message: 'boom' } }), ventureId: VENTURE })).satisfied).toBe(false);
  });

  it('compute-deployed: PASS only when status published, fail-closed otherwise', async () => {
    const v = resolveVerifier('compute deployed');
    expect((await v({ supabase: fakeSupabase({ venture: { stack_descriptor: PUBLISHED } }), ventureId: VENTURE })).satisfied).toBe(true);
    expect((await v({ supabase: fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR } }), ventureId: VENTURE })).satisfied).toBe(false);
  });

  it('publish-evidence-recorded: PASS when evidence present, fail-closed otherwise', async () => {
    const v = resolveVerifier('publish evidence recorded');
    expect((await v({ supabase: fakeSupabase({ venture: { stack_descriptor: PUBLISHED } }), ventureId: VENTURE })).satisfied).toBe(true);
    expect((await v({ supabase: fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR } }), ventureId: VENTURE })).satisfied).toBe(false);
  });
});

describe('FR-4: family-aware Child-3 deploy build-task line', () => {
  it('replit family (no descriptor) keeps the byte-identical Replit line', () => {
    const md = buildBuildTasks({ name: 'Acme', stackDescriptor: null });
    expect(md).toContain('**3.5 Deploy** — Replit hosting (autoscale); confirm the run command + port in `.replit`.');
  });

  it('cloudflare family references Cloudflare Pages/Workers via wrangler', () => {
    const md = buildBuildTasks({ name: 'Acme', stackDescriptor: { db_provider: 'd1', deployment_target: 'cloudflare-workers' } });
    expect(md).toContain('**3.5 Deploy** — Cloudflare Pages');
    expect(md).toContain('wrangler');
    expect(md).not.toContain('Replit hosting (autoscale)');
  });

  it('cloud-run family references gcloud run deploy', () => {
    const md = buildBuildTasks({ name: 'Acme', stackDescriptor: { db_provider: 'neon', deployment_target: 'cloud-run' } });
    expect(md).toContain('gcloud run deploy');
    expect(md).not.toContain('Replit hosting (autoscale)');
  });
});

describe('Activation invariant (GATE_ACTIVATION_INVARIANT)', () => {
  it('safe-publish path is live: dry-run default deploys nothing; post-publish gates fail-closed by default', async () => {
    const adapters = fakeAdapters();
    const sb = fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR }, guardrails: ALL_ALLOW });
    const r = await publish(VENTURE, sb, {}, { adapters });
    expect(r.status).toBe('planned');
    expect(adapters._calls).toHaveLength(0);
    // a venture that never published is not allowed to advance
    const v = resolveVerifier('compute deployed');
    expect((await v({ supabase: fakeSupabase({ venture: { stack_descriptor: READY_DESCRIPTOR } }), ventureId: 'fresh' })).satisfied).toBe(false);
  });
});
