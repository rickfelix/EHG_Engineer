/**
 * Unit tests for the session-hosted panel driver + introspection.
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-1 (TS-5a introspection; driver = FR-3 author).
 */
import { describe, it, expect } from 'vitest';
import { introspectLeafEnrichment, makePanelDriver } from '../../../lib/eva/bridge/panel-driver.js';

const ARTIFACT_TYPES = ['blueprint_data_model', 'blueprint_wireframes', 'engine_pricing_model'];
const OPTS = { dataSensitive: true, archetype: 'algorithm-core' };
const AGENT = { code: 'API', dimension: 'architecture', layer: 'api' };
const LEAF = { sd_key: 'SD-X-D1', title: 'Distillation Engine Worker' };

describe('introspectLeafEnrichment (TS-5a — pure, zero side effects)', () => {
  it('resolves an ordered manifest + required codes from venture-criteria signals', () => {
    const r = introspectLeafEnrichment({ artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS });
    expect(Array.isArray(r.manifest)).toBe(true);
    expect(r.manifest.length).toBeGreaterThan(0);
    // each manifest entry is the {code,dimension,layer} introspection shape
    expect(r.manifest[0]).toHaveProperty('code');
    expect(r.manifest[0]).toHaveProperty('dimension');
    // data-sensitive venture => DATABASE + VENTURE_STACK are required
    expect(r.requiredCodes).toEqual(expect.arrayContaining(['VENTURE_STACK', 'DATABASE']));
    expect(r.wouldRunAgents).toEqual(r.manifest.map((a) => a.code));
  });

  it('a non-data venture does not require DATABASE', () => {
    const r = introspectLeafEnrichment({ artifactTypes: ['blueprint_wireframes'], criteriaOpts: { dataSensitive: false } });
    expect(r.requiredCodes).not.toContain('DATABASE');
  });
});

describe('makePanelDriver (driver.runAgent = headless author)', () => {
  it('runAgent returns {ok:true, section} via the injected client', async () => {
    const client = { model: 'fake-1', async complete() { return { content: 'API section prose' }; } };
    const driver = makePanelDriver({ client });
    const r = await driver.runAgent({ agent: AGENT, leaf: LEAF, priorSections: [] });
    expect(r.ok).toBe(true);
    expect(r.section).toBe('API section prose');
  });

  it('runAgent HOLDs ({ok:false}) when the client is the no-key inline stub', async () => {
    const client = { isInlineOnly: true, async complete() { return { content: '{"_inline_required":true}' }; } };
    const driver = makePanelDriver({ client });
    const r = await driver.runAgent({ agent: AGENT, leaf: LEAF, priorSections: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INLINE_STUB_NO_LLM');
  });
});
