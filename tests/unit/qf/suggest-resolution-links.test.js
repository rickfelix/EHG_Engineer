/**
 * Unit test — suggest-resolution-links matcher (FR-3, TS-9)
 * SD-LEO-INFRA-AUTO-CLOSE-QUICK-001
 *
 * The matcher is ADVISORY and NON-BLOCKING by contract: it must never throw and
 * must return [] on any error or no-match, so wiring it into the LEAD-FINAL hook
 * can never break SD completion.
 */
import { describe, it, expect } from 'vitest';
import { tokenize, overlapScore, findResolutionLinkCandidates } from '../../../lib/qf/suggest-resolution-links.js';

// Minimal supabase stub whose query chain resolves to a fixed result.
function stub(result) {
  const chain = {
    select() { return chain; },
    in() { return chain; },
    is() { return chain; },
    limit() { return Promise.resolve(result); },
  };
  return { from() { return chain; } };
}

describe('suggest-resolution-links (FR-3 / TS-9)', () => {
  it('tokenize drops stopwords and short tokens', () => {
    const t = tokenize('Fix the Stage17 blank archetype profile');
    expect(t.has('stage17')).toBe(true);
    expect(t.has('archetype')).toBe(true);
    expect(t.has('the')).toBe(false); // stopword
    expect(t.has('fix')).toBe(false); // stopword
  });

  it('overlapScore is 0 when either side is empty', () => {
    expect(overlapScore(new Set(), tokenize('archetype profile'))).toBe(0);
    expect(overlapScore(tokenize('archetype'), new Set())).toBe(0);
  });

  it('surfaces a strongly-overlapping open QF as a candidate', async () => {
    const supabase = stub({
      data: [{ id: 'QF-A', title: 'Stage17 archetype profile blank', description: 'composer surface', severity: 'high', files_changed: null, status: 'open', resolution_sd_id: null }],
      error: null,
    });
    const sd = { sd_key: 'SD-X', title: 'Fix Stage17 archetype profile composer surface', scope: 'archetype profile rendering' };
    const out = await findResolutionLinkCandidates({ supabase, sd });
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('QF-A');
    expect(out[0].suggested_sd).toBe('SD-X');
    expect(out[0].score).toBeGreaterThanOrEqual(0.34);
  });

  it('excludes weakly-overlapping QFs below threshold', async () => {
    const supabase = stub({
      data: [{ id: 'QF-B', title: 'unrelated coordinator sweep release', description: 'inbox heartbeat', severity: 'low', files_changed: null, status: 'open', resolution_sd_id: null }],
      error: null,
    });
    const sd = { sd_key: 'SD-X', title: 'Stage17 archetype profile composer', scope: 'design surface' };
    const out = await findResolutionLinkCandidates({ supabase, sd });
    expect(out).toEqual([]);
  });

  it('returns [] (never throws) on a query error — non-blocking contract', async () => {
    const supabase = stub({ data: null, error: { message: 'db down' } });
    const sd = { sd_key: 'SD-X', title: 'archetype profile', scope: 'x' };
    await expect(findResolutionLinkCandidates({ supabase, sd })).resolves.toEqual([]);
  });

  it('returns [] when supabase/sd missing or SD has no usable tokens', async () => {
    await expect(findResolutionLinkCandidates({ supabase: null, sd: { title: 'x' } })).resolves.toEqual([]);
    await expect(findResolutionLinkCandidates({ supabase: stub({ data: [], error: null }), sd: null })).resolves.toEqual([]);
    await expect(findResolutionLinkCandidates({ supabase: stub({ data: [], error: null }), sd: { title: '' } })).resolves.toEqual([]);
  });
});
