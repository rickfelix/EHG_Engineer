/**
 * Unit tests for the leaf panel enrichment orchestrator.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-001 enrichment rail core)
 */
import { describe, it, expect } from 'vitest';
import { enrichLeafViaPanel, assembleEnrichedDescription, defaultRequiredCodes, isUsableResult } from '../../../lib/eva/bridge/leaf-panel-enrichment.js';

const LEAF = { sd_key: 'SD-X-D1', title: 'Distillation Engine Worker', layer: 'api' };
// DataDistill-like: touches data (data_model), so DATABASE is required.
const ARTIFACT_TYPES = ['blueprint_data_model', 'blueprint_wireframes', 'engine_pricing_model'];
const OPTS = { dataSensitive: true, archetype: 'algorithm-core' };

/**
 * Mock driver factory.
 * @param {object} cfg
 * @param {Set<string>} [cfg.failAlways] - agent codes that always fail
 * @param {Set<string>} [cfg.failFirst] - agent codes that fail attempt 1, pass attempt 2
 * @param {Set<string>} [cfg.throwOn] - agent codes whose runAgent throws
 * @param {Set<string>} [cfg.emptySection] - agent codes that return { ok:true, section:'' } (TS-2b)
 */
function makeDriver(cfg = {}) {
  const failAlways = cfg.failAlways || new Set();
  const failFirst = cfg.failFirst || new Set();
  const throwOn = cfg.throwOn || new Set();
  const emptySection = cfg.emptySection || new Set();
  const calls = [];
  const attempts = new Map();
  return {
    calls,
    async runAgent({ agent, leaf, priorSections }) {
      calls.push({ code: agent.code, priorCount: priorSections.length });
      const n = (attempts.get(agent.code) || 0) + 1;
      attempts.set(agent.code, n);
      if (throwOn.has(agent.code)) throw new Error(`boom:${agent.code}`);
      if (failAlways.has(agent.code)) return { ok: false, error: 'fail' };
      if (emptySection.has(agent.code)) return { ok: true, section: '   ' }; // ok but whitespace-only
      if (failFirst.has(agent.code) && n === 1) return { ok: false, error: 'transient' };
      return { ok: true, section: `${agent.code} section for ${leaf.title}` };
    },
  };
}

describe('enrichLeafViaPanel — happy path', () => {
  it('enriches the leaf with one section per agent (not the template)', async () => {
    const driver = makeDriver();
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver });
    expect(r.status).toBe('enriched');
    expect(r.heldOn).toBeNull();
    expect(r.manifest).toEqual(expect.arrayContaining(['API', 'DATABASE', 'VENTURE_STACK', 'STORIES']));
    expect(r.sections.length).toBe(r.manifest.length);
    expect(r.enrichedDescription).toContain('DATABASE');
    expect(r.enrichedDescription).not.toContain('REST endpoints, request handling, validation');
    expect(r.leafKey).toBe('SD-X-D1');
  });

  it('drives agents in DAG order and accumulates priorSections', async () => {
    const driver = makeDriver();
    await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver });
    const order = driver.calls.map((c) => c.code);
    expect(order.indexOf('API')).toBeLessThan(order.indexOf('DATABASE')); // architecture before schema
    expect(order.indexOf('DATABASE')).toBeLessThan(order.indexOf('STORIES')); // schema before tests
    expect(order[order.length - 1]).toBe('STORIES'); // acceptance last
    // priorSections grow monotonically as sections accumulate
    expect(driver.calls[0].priorCount).toBe(0);
    expect(driver.calls[driver.calls.length - 1].priorCount).toBeGreaterThan(0);
  });
});

describe('enrichLeafViaPanel — fail-closed', () => {
  it('HOLDS (no stub) when a REQUIRED agent (DATABASE) cannot deliver', async () => {
    const driver = makeDriver({ failAlways: new Set(['DATABASE']) });
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver });
    expect(r.status).toBe('held');
    expect(r.heldOn).toBe('DATABASE');
    expect(r.enrichedDescription).toBeNull();
  });

  it('a thrown driver error is caught and treated as a failed attempt (required -> held)', async () => {
    const driver = makeDriver({ throwOn: new Set(['VENTURE_STACK']) });
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver });
    expect(r.status).toBe('held');
    expect(r.heldOn).toBe('VENTURE_STACK');
  });

  it('SKIPS an OPTIONAL agent that fails but still enriches', async () => {
    // PRICING is OPTIONAL and IS in the manifest (engine_pricing_model -> monetizationRelevant).
    const driver = makeDriver({ failAlways: new Set(['PRICING']) });
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver });
    expect(r.manifest).toContain('PRICING'); // it was selected...
    expect(r.status).toBe('enriched'); // ...but its failure did not hold the leaf
    expect(r.sections.some((s) => s.code === 'PRICING')).toBe(false); // and it was skipped
  });
});

describe('enrichLeafViaPanel — empty-section HOLD (SD-LEO-INFRA-WIRE-PRE-BUILD-002 TR-2 / TS-2b)', () => {
  it('HOLDS when a REQUIRED agent (DATABASE) returns ok:true with an empty/whitespace section', async () => {
    const driver = makeDriver({ emptySection: new Set(['DATABASE']) });
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver, options: { maxAttemptsPerAgent: 1 } });
    expect(r.status).toBe('held');
    expect(r.heldOn).toBe('DATABASE');
    expect(r.enrichedDescription).toBeNull();
    // the empty section must NOT have been stamped as a real section
    expect(r.sections.some((s) => s.code === 'DATABASE')).toBe(false);
  });

  it('SKIPS an OPTIONAL agent (PRICING) that returns an empty section but still enriches', async () => {
    const driver = makeDriver({ emptySection: new Set(['PRICING']) });
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver, options: { maxAttemptsPerAgent: 1 } });
    expect(r.status).toBe('enriched');
    expect(r.sections.some((s) => s.code === 'PRICING')).toBe(false);
  });

  it('isUsableResult: ok:true requires a non-empty trimmed section', () => {
    expect(isUsableResult({ ok: true, section: 'x' })).toBe(true);
    expect(isUsableResult({ ok: true, section: '' })).toBe(false);
    expect(isUsableResult({ ok: true, section: '   ' })).toBe(false);
    expect(isUsableResult({ ok: true })).toBe(false);
    expect(isUsableResult({ ok: false, section: 'x' })).toBe(false);
    expect(isUsableResult(null)).toBe(false);
  });
});

describe('enrichLeafViaPanel — retry within cap', () => {
  it('recovers when an agent fails its first attempt then succeeds', async () => {
    const driver = makeDriver({ failFirst: new Set(['API']) });
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver, options: { maxAttemptsPerAgent: 2 } });
    expect(r.status).toBe('enriched');
    expect(r.sections.some((s) => s.code === 'API')).toBe(true);
  });

  it('holds if a required agent never recovers within the cap', async () => {
    const driver = makeDriver({ failFirst: new Set(['API']) });
    const r = await enrichLeafViaPanel({ leaf: LEAF, artifactTypes: ARTIFACT_TYPES, criteriaOpts: OPTS, driver, options: { maxAttemptsPerAgent: 1 } });
    expect(r.status).toBe('held');
    expect(r.heldOn).toBe('API');
  });
});

describe('enrichLeafViaPanel — validation + helpers', () => {
  it('throws without a leaf or a driver', async () => {
    await expect(enrichLeafViaPanel({ driver: makeDriver() })).rejects.toThrow(/leaf/);
    await expect(enrichLeafViaPanel({ leaf: LEAF })).rejects.toThrow(/driver/);
  });

  it('defaultRequiredCodes includes DATABASE only when the venture touches data', () => {
    const manifest = [{ code: 'API' }, { code: 'VENTURE_STACK' }, { code: 'DATABASE' }];
    expect(defaultRequiredCodes(manifest, { touchesData: true })).toEqual(expect.arrayContaining(['API', 'VENTURE_STACK', 'DATABASE']));
    expect(defaultRequiredCodes(manifest, { touchesData: false })).not.toContain('DATABASE');
  });

  it('assembleEnrichedDescription renders one markdown section per agent', () => {
    const out = assembleEnrichedDescription({ title: 'T' }, [{ dimension: 'data-schema', code: 'DATABASE', section: 'DDL here' }]);
    expect(out).toContain('## data-schema [DATABASE]');
    expect(out).toContain('DDL here');
  });
});
