/**
 * Unit tests for the pure YouTube strategy-extraction core (FR-3 of
 * SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001). No I/O — pure functions only.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  tokenize,
  categorizeFramework,
  dedupAgainstSDs,
  buildLedgerEntry,
  isEnhancementWorthy,
  isDisposable,
  summarizeEntries,
  runExtraction,
  cleanLedgerEntry,
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

describe('summarizeEntries', () => {
  it('counts by status/method/category/dedup/recommendation', () => {
    const s = summarizeEntries([
      { analysis_status: 'ok', method: 'native', category: 'build', dedup_status: 'novel', recommendation: 'promote' },
      { analysis_status: 'ok', method: 'transcript_fallback', category: 'build', dedup_status: 'dup-of-SD', recommendation: 'review' },
      { analysis_status: 'failed_long', method: 'failed_long', category: null, dedup_status: null, recommendation: null },
    ]);
    expect(s.total).toBe(3);
    expect(s.by_status).toEqual({ ok: 2, failed_long: 1 });
    expect(s.by_category).toEqual({ build: 2 });
    expect(s.by_dedup).toEqual({ novel: 1, 'dup-of-SD': 1 });
  });
});

describe('cleanLedgerEntry', () => {
  it('strips _-prefixed working fields', () => {
    expect(cleanLedgerEntry({ video_id: 'v', _row: {}, _summary: 's', category: 'build' })).toEqual({ video_id: 'v', category: 'build' });
  });
});

describe('runExtraction (injectable orchestration)', () => {
  const sdList = [{ sd_key: 'SD-PRICING-001', title: 'Value based pricing framework' }];
  const candidates = [
    { youtube_video_id: 'vid00000001', title: 'Pricing framework deep dive', channel_name: 'Wharton', duration_seconds: 4000, chairman_intent: 'value', target_application: 'ehg_engineer' },
    { youtube_video_id: 'vid00000002', title: 'CI automation pipeline tooling', channel_name: 'DevX', duration_seconds: 600, chairman_intent: 'insight', target_application: 'ehg_engineer' },
    { youtube_video_id: 'vid00000003', title: 'Unwatchable private video', channel_name: 'X', duration_seconds: 5000, chairman_intent: 'idea' },
  ];

  const analyzeStub = vi.fn(async (videoId) => {
    if (videoId === 'vid00000001') return { summary: 'pricing framework content', method: 'transcript_fallback' };
    if (videoId === 'vid00000002') return { summary: 'a CI automation pipeline tooling framework', method: 'native' };
    return { summary: null, method: 'failed_long' };
  });
  const scoreStub = vi.fn(async (items) => ({
    item_scores: items.map((_, i) => ({ item_index: i + 1, composite: i === 0 ? 55 : 82, recommendation: i === 0 ? 'review' : 'promote' })),
    method: 'ai',
  }));

  it('analyzes, categorizes, dedups, and batch-scores OK entries; fails-safe the rest', async () => {
    const { entries, summary } = await runExtraction(candidates, { analyzeWithFallback: analyzeStub, score: scoreStub, sdList });
    expect(entries).toHaveLength(3);

    const e1 = entries[0]; // pricing -> dup-of-SD, scored 55/review
    expect(e1.analysis_status).toBe('ok');
    expect(e1.method).toBe('transcript_fallback');
    expect(e1.dedup_status).toBe('dup-of-SD');
    expect(e1.matched_sd).toBe('SD-PRICING-001');
    expect(e1.composite_score).toBe(55);
    expect(e1.recommendation).toBe('review');

    const e2 = entries[1]; // CI automation -> enhancement, novel, scored 82/promote
    expect(e2.analysis_status).toBe('ok');
    expect(e2.category).toBe('enhancement');
    expect(e2.dedup_status).toBe('novel');
    expect(e2.composite_score).toBe(82);
    expect(isEnhancementWorthy(e2)).toBe(true);

    const e3 = entries[2]; // failed
    expect(e3.analysis_status).toBe('failed_long');
    expect(e3.category).toBe(null);
    expect(e3.composite_score).toBe(null);

    expect(summary.by_status).toEqual({ ok: 2, failed_long: 1 });
    expect(scoreStub).toHaveBeenCalledTimes(1); // batched once over the 2 OK items
  });

  it('fails-open when no score dep is provided (OK entries keep null score)', async () => {
    const { entries } = await runExtraction([candidates[1]], { analyzeWithFallback: analyzeStub, sdList });
    expect(entries[0].analysis_status).toBe('ok');
    expect(entries[0].composite_score).toBe(null);
  });

  it('treats an analyzer throw as failed_other (never propagates)', async () => {
    const thrower = vi.fn(async () => { throw new Error('boom'); });
    const { entries } = await runExtraction([candidates[1]], { analyzeWithFallback: thrower });
    expect(entries[0].analysis_status).toBe('failed_other');
  });

  it('throws only if analyzeWithFallback dep is missing', async () => {
    await expect(runExtraction(candidates, {})).rejects.toThrow(/analyzeWithFallback/);
  });
});
