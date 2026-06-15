/**
 * Unit tests for the pure YouTube strategy-extraction core (FR-3 of
 * SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001). No I/O — pure functions only.
 */
import { describe, it, expect } from 'vitest';
import {
  tokenize,
  categorizeFramework,
  dedupAgainstSDs,
  buildLedgerEntry,
  isEnhancementWorthy,
  isDisposable,
  CATEGORIES,
} from '../../../lib/integrations/youtube/strategy-extract-core.js';

describe('tokenize', () => {
  it('lowercases, drops stopwords and short tokens', () => {
    expect(tokenize('How to Build a Pricing Framework')).toEqual(['build', 'pricing', 'framework']);
  });
  it('returns [] for empty/invalid input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
  });
});

describe('categorizeFramework', () => {
  it('classifies infrastructure/automation language as enhancement', () => {
    expect(categorizeFramework('A CI/CD pipeline automation workflow for teams')).toBe('enhancement');
  });
  it('classifies build/ship language as build', () => {
    expect(categorizeFramework('How to launch an MVP and ship your first product')).toBe('build');
  });
  it('classifies research language as research', () => {
    expect(categorizeFramework('A framework to investigate and benchmark hypotheses')).toBe('research');
  });
  it('defaults to reference when nothing matches', () => {
    expect(categorizeFramework('General thoughts on leadership philosophy')).toBe('reference');
    expect(CATEGORIES).toContain(categorizeFramework('x'));
  });
  it('considers intake metadata (business_function/chairman_notes)', () => {
    expect(categorizeFramework('generic title', { business_function: 'infrastructure tooling' })).toBe('enhancement');
  });
});

describe('dedupAgainstSDs', () => {
  const sds = [
    { sd_key: 'SD-PRICING-001', title: 'Value based pricing framework rollout' },
    { sd_key: 'SD-OTHER-001', title: 'Completely unrelated subject' },
  ];
  it('flags dup-of-SD when token overlap meets threshold', () => {
    const r = dedupAgainstSDs('Pricing framework strategies', sds, 0.5);
    expect(r.status).toBe('dup-of-SD');
    expect(r.matchedSd).toBe('SD-PRICING-001');
  });
  it('returns novel below threshold', () => {
    const r = dedupAgainstSDs('Quantum widget teleportation', sds, 0.5);
    expect(r.status).toBe('novel');
    expect(r.matchedSd).toBe(null);
  });
  it('returns novel for empty SD list or empty title', () => {
    expect(dedupAgainstSDs('anything', []).status).toBe('novel');
    expect(dedupAgainstSDs('', sds).status).toBe('novel');
  });
});

describe('buildLedgerEntry', () => {
  it('builds an ok entry with category/dedup/score when a summary exists', () => {
    const e = buildLedgerEntry({
      videoId: 'abcdefghijk', title: 'T', method: 'transcript_fallback', summary: 's',
      category: 'enhancement', dedup: { status: 'novel', matchedSd: null }, score: { composite: 82, recommendation: 'promote' },
    });
    expect(e).toMatchObject({
      analysis_status: 'ok', method: 'transcript_fallback', composite_score: 82,
      recommendation: 'promote', category: 'enhancement', dedup_status: 'novel', disposed: false,
    });
  });
  it('nulls category/dedup/score on a failed_long video', () => {
    const e = buildLedgerEntry({ videoId: 'v', title: 'T', method: 'failed_long', summary: null });
    expect(e.analysis_status).toBe('failed_long');
    expect(e.category).toBe(null);
    expect(e.dedup_status).toBe(null);
    expect(e.composite_score).toBe(null);
  });
  it('maps a non-long failure to failed_other', () => {
    expect(buildLedgerEntry({ videoId: 'v', title: 'T', method: 'failed_other', summary: null }).analysis_status).toBe('failed_other');
  });
});

describe('isEnhancementWorthy', () => {
  const base = { analysis_status: 'ok', dedup_status: 'novel', category: 'enhancement', composite_score: 75 };
  it('true only for ok + novel + enhancement + score>=70', () => {
    expect(isEnhancementWorthy(base)).toBe(true);
  });
  it('false when duplicated, low-scored, wrong category, or failed', () => {
    expect(isEnhancementWorthy({ ...base, dedup_status: 'dup-of-SD' })).toBe(false);
    expect(isEnhancementWorthy({ ...base, composite_score: 60 })).toBe(false);
    expect(isEnhancementWorthy({ ...base, category: 'reference' })).toBe(false);
    expect(isEnhancementWorthy({ ...base, analysis_status: 'failed_long' })).toBe(false);
  });
});

describe('isDisposable', () => {
  it('true only for analysis_status=ok', () => {
    expect(isDisposable({ analysis_status: 'ok' })).toBe(true);
    expect(isDisposable({ analysis_status: 'failed_long' })).toBe(false);
    expect(isDisposable({ analysis_status: 'failed_other' })).toBe(false);
    expect(isDisposable(null)).toBe(false);
  });
});
