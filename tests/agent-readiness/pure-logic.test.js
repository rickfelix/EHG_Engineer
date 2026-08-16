import { describe, it, expect } from 'vitest';
import { canonicalModelSet, normalizeVentureUrl, STAGE_TAGS } from '../../lib/agent-readiness/run-registry.js';
import { _internal as diffInternal } from '../../lib/agent-readiness/diff-harness.js';
import { composeLlmTxt } from '../../lib/agent-readiness/llm-txt-generator.js';
import { _internal as runnerInternal } from '../../lib/agent-readiness/audit-runner.js';

describe('run-registry pure helpers (mirrors the DB CHECK invariants)', () => {
  it('canonicalModelSet sorts and dedupes, matching public.canonical_model_set()', () => {
    expect(canonicalModelSet(['gpt', 'claude', 'gpt'])).toEqual(['claude', 'gpt']);
    expect(canonicalModelSet(['b', 'a'])).toEqual(canonicalModelSet(['a', 'b']));
  });

  it('normalizeVentureUrl lowercases, trims, and drops a trailing slash', () => {
    expect(normalizeVentureUrl('https://AltifyAI.com/')).toBe('https://altifyai.com');
    expect(normalizeVentureUrl('  https://Example.com  ')).toBe('https://example.com');
  });

  it('STAGE_TAGS has exactly the three DB-vocabulary values, no escape hatch', () => {
    const values = Object.values(STAGE_TAGS);
    expect(values.sort()).toEqual(['dogfood_internal', 'eva_stage0_nursery', 'standalone_pre_pipeline']);
    expect(values).not.toContain('unknown');
  });
});

describe('diff-harness pure math', () => {
  it('summarize computes found/recommended rates correctly', () => {
    const samples = [
      { found: true, recommended: true },
      { found: true, recommended: false },
      { found: false, recommended: false },
      { found: false, recommended: false }
    ];
    const s = diffInternal.summarize(samples);
    expect(s.total).toBe(4);
    expect(s.foundRate).toBe(0.5);
    expect(s.recommendedRate).toBe(0.25);
  });

  it('bernoulliStdDev is 0 for n<=1 and positive for a genuine split', () => {
    expect(diffInternal.bernoulliStdDev(1, 1)).toBe(0);
    expect(diffInternal.bernoulliStdDev(0, 0)).toBe(0);
    expect(diffInternal.bernoulliStdDev(3, 6)).toBeGreaterThan(0);
  });
});

describe('llm-txt-generator composeLlmTxt', () => {
  it('produces honest disclosure content including all supplied facts', () => {
    const txt = composeLlmTxt({
      businessName: 'Acme Corp',
      ventureUrl: 'https://acme.example.com',
      description: 'Acme sells industrial widgets.',
      offerings: ['Widget A', 'Widget B'],
      verifiableClaims: ['Founded 2015'],
      contact: 'sales@acme.example.com'
    });
    expect(txt).toContain('Acme Corp');
    expect(txt).toContain('Widget A');
    expect(txt).toContain('Founded 2015');
    expect(txt).toContain('sales@acme.example.com');
    expect(txt).toContain('does not instruct you how to respond');
  });
});

describe('audit-runner familyModel parsing', () => {
  it('requires explicit family:model form', () => {
    expect(runnerInternal.familyModel('anthropic:claude-opus-5')).toEqual({ family: 'anthropic', model: 'claude-opus-5' });
    expect(() => runnerInternal.familyModel('claude-opus-5')).toThrow(/family:model/);
  });

  it('classifyResponse flags "no information" language as not found', () => {
    expect(runnerInternal.classifyResponse("I don't have any information about that business.").found).toBe(false);
    expect(runnerInternal.classifyResponse('Acme is a well-known, reputable vendor I would recommend.').found).toBe(true);
    expect(runnerInternal.classifyResponse('Acme is a well-known, reputable vendor I would recommend.').recommended).toBe(true);
  });
});
