/**
 * SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A FR-1/FR-2/FR-4 — provisioning readiness report.
 * See lib/venture-provisioning/exec-boundary-readiness.js header for why a report,
 * not three separate feature builds.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  checkDeploymentHealth,
  extractAssetUrls,
  assessDistributionReadiness,
  assessAnalyticsReadiness,
  buildProvisioningReadinessReport,
  recordProvisioningReadiness,
  toVentureHealthStatus,
} from '../../../lib/venture-provisioning/exec-boundary-readiness.js';

describe('extractAssetUrls', () => {
  it('extracts and resolves script src and link href .js/.css references, matching the real AltifyAI shell shape', () => {
    const html = '<script src="/assets/index-BIbscYPC.js"></script><link href="/assets/index-C31l6Hjn.css">';
    expect(extractAssetUrls(html, 'https://altifyai.example.workers.dev')).toEqual([
      'https://altifyai.example.workers.dev/assets/index-BIbscYPC.js',
      'https://altifyai.example.workers.dev/assets/index-C31l6Hjn.css',
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(extractAssetUrls('<div>plain html</div>', 'https://x.example')).toEqual([]);
  });
});

describe('checkDeploymentHealth', () => {
  function makeFetch({ shellOk = true, shellStatus = 200, html, assetOk = true, assetStatus = 200 } = {}) {
    return vi.fn((url) => {
      if (url.endsWith('.js') || url.endsWith('.css')) {
        return Promise.resolve({ ok: assetOk, status: assetStatus });
      }
      return Promise.resolve({ ok: shellOk, status: shellStatus, text: () => Promise.resolve(html ?? '<script src="/a.js"></script>') });
    });
  }

  it('reports reachable:true + assetsVerified:true when the shell AND its referenced assets all resolve — the real AltifyAI success case', async () => {
    const fetchImpl = makeFetch({ html: '<script src="/assets/index-BIbscYPC.js"></script><link href="/assets/index-C31l6Hjn.css">' });
    const r = await checkDeploymentHealth('https://altifyai.example.workers.dev', { fetchImpl, now: () => '2026-08-17T18:00:00Z' });
    expect(r.reachable).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(r.assetsVerified).toBe(true);
    expect(r.assetChecks).toHaveLength(2);
  });

  it('reports assetsVerified:false when the shell is 200 but a referenced asset 404s — the shell-only-200 trap the coordinator flagged', async () => {
    const fetchImpl = makeFetch({ html: '<script src="/assets/broken.js"></script>', assetOk: false, assetStatus: 404 });
    const r = await checkDeploymentHealth('https://x.example', { fetchImpl, now: () => 't' });
    expect(r.reachable).toBe(true);
    expect(r.assetsVerified).toBe(false);
    expect(r.assetChecks[0]).toMatchObject({ ok: false, statusCode: 404 });
  });

  it('reports assetsVerified:false when the shell has no asset references to check', async () => {
    const fetchImpl = makeFetch({ html: '<div>no assets here</div>' });
    const r = await checkDeploymentHealth('https://x.example', { fetchImpl, now: () => 't' });
    expect(r.reachable).toBe(true);
    expect(r.assetsVerified).toBe(false);
    expect(r.error).toBe('no_asset_references_found_in_html');
  });

  it('reports reachable:false on a non-ok shell response, still capturing the status code', async () => {
    const fetchImpl = makeFetch({ shellOk: false, shellStatus: 503 });
    const r = await checkDeploymentHealth('https://x.example', { fetchImpl, now: () => 't' });
    expect(r.reachable).toBe(false);
    expect(r.statusCode).toBe(503);
    expect(r.assetsVerified).toBe(false);
  });

  it('reports reachable:false with the error message on a network failure — never throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await checkDeploymentHealth('https://x.example', { fetchImpl, now: () => 't' });
    expect(r.reachable).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });

  it('handles a missing url without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const r = await checkDeploymentHealth(null, { fetchImpl, now: () => 't' });
    expect(r.reachable).toBe(false);
    expect(r.error).toBe('no_url');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('assessDistributionReadiness', () => {
  it('reports provisioned:true and no decision-point when the organic channel was actually provisioned', () => {
    const r = assessDistributionReadiness(null, { ok: true, channelType: 'blog_seo' });
    expect(r).toEqual({ organicChannelProvisioned: true, decisionPoint: null });
  });

  it('surfaces the landing-page demand-test as the real candidate, chairman-gated — this is the FR-2 deliverable, not a workaround', () => {
    const artifact = {
      artifact_data: {
        record: 'landing_page',
        status: 'deploy_ready_not_deployed',
        capture_endpoint: 'PLACEHOLDER',
        hands_to_chairman: ['deploy to Cloudflare Pages', 'wire opt-in capture endpoint'],
      },
    };
    const r = assessDistributionReadiness(artifact, { ok: false, reason: 'no_channel_config_provided' });
    expect(r.organicChannelProvisioned).toBe(false);
    expect(r.decisionPoint.fr).toBe('FR-2');
    expect(r.decisionPoint.kind).toBe('distribution_channel');
    expect(r.decisionPoint.candidate).toBe('landing_page_email_capture');
    expect(r.decisionPoint.blockedOn).toContain('wire opt-in capture endpoint');
  });

  it('falls back to a generic no-usable-config decision-point when the artifact is absent or unrecognized', () => {
    const r = assessDistributionReadiness(null, { ok: false, reason: 'no_distribution_channel_config' });
    expect(r.organicChannelProvisioned).toBe(false);
    expect(r.decisionPoint.fr).toBe('FR-2');
    expect(r.decisionPoint.candidate).toBeNull();
    expect(r.decisionPoint.status).toBe('no_usable_channel_config');
  });
});

describe('assessAnalyticsReadiness', () => {
  it('reports exists:true and the sink table name when one candidate is present', () => {
    const r = assessAnalyticsReadiness({ venture_analytics_events: true, analytics_events: false });
    expect(r).toEqual({ analyticsSinkExists: true, sinkTable: 'venture_analytics_events', decisionPoint: null });
  });

  it('reports exists:false with an unresourced decision-point when no candidate exists — the honest FR-4 outcome', () => {
    const r = assessAnalyticsReadiness({});
    expect(r.analyticsSinkExists).toBe(false);
    expect(r.decisionPoint.fr).toBe('FR-4');
    expect(r.decisionPoint.kind).toBe('analytics_wiring');
    expect(r.decisionPoint.status).toBe('unresourced');
  });
});

describe('buildProvisioningReadinessReport (orchestration, injected deps)', () => {
  function fakeSupabase({ channelArtifact = null, sinkExists = {} } = {}) {
    return {
      from(table) {
        if (table === 'venture_artifacts') {
          const chain = { eq: () => chain, maybeSingle: () => Promise.resolve({ data: channelArtifact, error: null }) };
          return { select: () => chain };
        }
        // analytics sink candidate probes
        return {
          select: () => ({
            limit: () => Promise.resolve(sinkExists[table] ? { data: [], error: null } : { data: null, error: { message: 'missing' } }),
          }),
        };
      },
    };
  }

  it('assembles deploy + distribution + analytics into one report with a decisionPoints array', async () => {
    const supabase = fakeSupabase({ channelArtifact: null, sinkExists: {} });
    const fetchImpl = vi.fn((url) => {
      if (url.endsWith('.js')) return Promise.resolve({ ok: true, status: 200 });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<script src="/a.js"></script>') });
    });
    const provisionOrganicChannel = vi.fn().mockResolvedValue({ ok: false, reason: 'no_distribution_channel_config' });

    const report = await buildProvisioningReadinessReport(
      { supabase, ventureId: 'v1', deploymentUrl: 'https://altifyai.example.workers.dev' },
      { fetchImpl, provisionOrganicChannel, now: () => '2026-08-17T18:00:00Z' }
    );

    expect(report.ventureId).toBe('v1');
    expect(report.deploy.reachable).toBe(true);
    expect(report.distribution.organicChannelProvisioned).toBe(false);
    expect(report.analytics.analyticsSinkExists).toBe(false);
    expect(report.decisionPoints).toHaveLength(2);
    expect(report.decisionPoints.map((d) => d.kind)).toEqual(['distribution_channel', 'analytics_wiring']);
  });
});

describe('toVentureHealthStatus', () => {
  it('maps reachable+verified to healthy', () => {
    expect(toVentureHealthStatus({ reachable: true, assetsVerified: true })).toBe('healthy');
  });
  it('maps reachable but unverified assets to warning — the shell-only-200 trap, never silently healthy', () => {
    expect(toVentureHealthStatus({ reachable: true, assetsVerified: false })).toBe('warning');
  });
  it('maps unreachable to critical', () => {
    expect(toVentureHealthStatus({ reachable: false, assetsVerified: false })).toBe('critical');
  });
});

describe('recordProvisioningReadiness', () => {
  // ventures is queried TWICE: .update().eq().select() for the deploy-state write (the
  // .select() lets us detect a zero-rows-matched update — see the dedicated test below),
  // and a separate .select() to read current_lifecycle_stage (venture_artifacts.lifecycle_stage
  // is NOT NULL, caught live by the constraint on first persist attempt).
  //
  // venture_artifacts.update() serves TWO distinct call shapes, disambiguated by payload:
  //   - supersede-before-insert: exactly {is_current: false} — no .select() chained
  //   - 23505 fallback: the full replacement row (is_current: true + other fields) — chained
  //     with .select().single(), same as insert()
  function fakeSupabase({
    currentLifecycleStage = 19,
    updateError = null,
    updateRows = [{ id: 'v1' }],
    insertResult = { data: { id: 'artifact-1' }, error: null },
    updateFallbackResult = { data: { id: 'artifact-1-updated' }, error: null },
  } = {}) {
    const calls = [];
    const supabase = {
      from: (table) => {
        if (table === 'ventures') {
          return {
            update: (payload) => {
              calls.push({ table, op: 'update', payload });
              return {
                eq: (col, val) => {
                  calls.push({ table, op: 'eq', col, val });
                  return { select: () => Promise.resolve({ data: updateError ? null : updateRows, error: updateError }) };
                },
              };
            },
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { current_lifecycle_stage: currentLifecycleStage }, error: null }) }) }),
          };
        }
        if (table === 'venture_artifacts') {
          return {
            update: (payload) => {
              calls.push({ table, op: 'update', payload });
              const isSupersede = payload.is_current === false;
              const chain = {
                eq: (col, val) => { calls.push({ table, op: 'eq', col, val }); return chain; },
                select: () => ({ single: () => Promise.resolve(isSupersede ? { data: null, error: null } : updateFallbackResult) }),
              };
              return chain;
            },
            insert: (payload) => {
              calls.push({ table, op: 'insert', payload });
              return { select: () => ({ single: () => Promise.resolve(insertResult) }) };
            },
          };
        }
        throw new Error('unexpected table ' + table);
      },
    };
    return { supabase, calls };
  }

  it('updates the ventures row with the real observed deploy state and inserts the artifact', async () => {
    const { supabase } = fakeSupabase();
    const report = { deploy: { url: 'https://altifyai.example.workers.dev', reachable: true, assetsVerified: true } };

    const result = await recordProvisioningReadiness({ supabase, ventureId: 'v1', report });

    expect(result.ventureUpdated).toBe(true);
    expect(result.artifactId).toBe('artifact-1');
  });

  it('reports health_status critical when the deploy was not reachable', async () => {
    const { supabase, calls } = fakeSupabase();
    await recordProvisioningReadiness({ supabase, ventureId: 'v1', report: { deploy: { url: 'https://x', reachable: false, assetsVerified: false } } });
    const ventureUpdate = calls.find((c) => c.table === 'ventures' && c.op === 'update');
    expect(ventureUpdate.payload.health_status).toBe('critical');
  });

  it('reports health_status warning when reachable but assets are NOT verified — this is the shell-only-200 case the coordinator required guarding against, never optimistically healthy', async () => {
    const { supabase, calls } = fakeSupabase();
    await recordProvisioningReadiness({ supabase, ventureId: 'v1', report: { deploy: { url: 'https://x', reachable: true, assetsVerified: false } } });
    const ventureUpdate = calls.find((c) => c.table === 'ventures' && c.op === 'update');
    expect(ventureUpdate.payload.health_status).toBe('warning');
  });

  it('inserts the artifact with the venture\'s real current_lifecycle_stage, not a hardcoded value', async () => {
    const { supabase, calls } = fakeSupabase({ currentLifecycleStage: 19 });
    await recordProvisioningReadiness({ supabase, ventureId: 'v1', report: { deploy: { url: 'https://x', reachable: true, assetsVerified: true } } });
    const insertCall = calls.find((c) => c.table === 'venture_artifacts' && c.op === 'insert');
    expect(insertCall.payload).toMatchObject({ lifecycle_stage: 19 });
  });

  // Regression guard for the incident this module's header documents: the first version
  // reused 'launch_readiness_checklist', a LIVE GATE TOKEN for AltifyAI's stage 23->24
  // launch-readiness check, and silently disarmed it. A database-agent review caught it
  // post-persist; this test catches it pre-merge instead.
  it('inserts using the non-gate-token artifact_type — never the live "launch_readiness_checklist" gate token', async () => {
    const { supabase, calls } = fakeSupabase();
    await recordProvisioningReadiness({ supabase, ventureId: 'v1', report: { deploy: { url: 'https://x', reachable: true, assetsVerified: true } } });
    const insertCall = calls.find((c) => c.table === 'venture_artifacts' && c.op === 'insert');
    expect(insertCall.payload.artifact_type).toBe('launch_deployment_runbook');
    expect(insertCall.payload.artifact_type).not.toBe('launch_readiness_checklist');
  });

  it('supersedes (is_current:false) any prior current row of this artifact_type BEFORE inserting the replacement — prevents duplicate is_current=true rows across a lifecycle_stage transition', async () => {
    const { supabase, calls } = fakeSupabase();
    await recordProvisioningReadiness({ supabase, ventureId: 'v1', report: { deploy: { url: 'https://x', reachable: true, assetsVerified: true } } });

    const supersedeIdx = calls.findIndex((c) => c.table === 'venture_artifacts' && c.op === 'update' && c.payload.is_current === false);
    const insertIdx = calls.findIndex((c) => c.table === 'venture_artifacts' && c.op === 'insert');
    expect(supersedeIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(supersedeIdx);
  });

  it('falls back to UPDATE on a 23505 unique-violation from the insert (same-stage concurrent re-run racing the supersede step)', async () => {
    const { supabase } = fakeSupabase({
      insertResult: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_unique_current_artifact"' } },
      updateFallbackResult: { data: { id: 'artifact-1-updated' }, error: null },
    });
    const result = await recordProvisioningReadiness({ supabase, ventureId: 'v1', report: { deploy: { url: 'https://x', reachable: true, assetsVerified: true } } });
    expect(result.artifactId).toBe('artifact-1-updated');
    expect(result.insertError).toBeNull();
  });

  // The "UPDATE-0=SUCCESS" trap: supabase-js resolves {data:null, error:null} even when an
  // .update().eq() matches zero rows. Without .select() + a row-returned assertion, a
  // stale/missing ventureId would silently report ventureUpdated:true.
  it('reports ventureUpdated:false when the ventures UPDATE matches zero rows, even though error is null', async () => {
    const { supabase } = fakeSupabase({ updateRows: [] });
    const result = await recordProvisioningReadiness({ supabase, ventureId: 'nonexistent-venture', report: { deploy: { url: 'https://x', reachable: true, assetsVerified: true } } });
    expect(result.ventureUpdated).toBe(false);
    expect(result.ventureUpdateError).toBeNull();
  });

  it('reports ventureUpdated:false and surfaces the message when the ventures UPDATE errors', async () => {
    const { supabase } = fakeSupabase({ updateError: { message: 'connection reset' } });
    const result = await recordProvisioningReadiness({ supabase, ventureId: 'v1', report: { deploy: { url: 'https://x', reachable: true, assetsVerified: true } } });
    expect(result.ventureUpdated).toBe(false);
    expect(result.ventureUpdateError).toBe('connection reset');
  });
});
