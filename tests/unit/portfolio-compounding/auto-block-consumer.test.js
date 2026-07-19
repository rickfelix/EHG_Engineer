/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-3) — auto_block_on_match consumer.
 * Activation test (product_requirements_v2.activation_test_id).
 *
 * Proves the consumer that finally READS the previously-inert flag is FLEET-SAFE:
 *   - advisory by default (never returns BLOCK without explicit enforce),
 *   - fails OPEN on any internal error,
 *   - enforces ONLY when enforce=true AND a pattern carries explicit block_signatures matched
 *     in the context — a pattern without signatures can never block.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateAutoBlock,
  isEnforceEnabled,
  runAutoBlockCheck,
  ENFORCE_ENV,
} from '../../../lib/governance/auto-block-consumer.js';

const curated = [
  { pattern_id: 'PAT-A', severity: 'high', issue_summary: 'no signatures pattern', prevention_checklist: ['do x'], metadata: {} },
  { pattern_id: 'PAT-B', severity: 'critical', issue_summary: 'has narrow signature', prevention_checklist: ['avoid rm -rf'], metadata: { block_signatures: ['fs.rmSync('] } },
];

describe('isEnforceEnabled — fail-closed to advisory', () => {
  it('only the exact string "on" enables enforcement', () => {
    expect(isEnforceEnabled({ [ENFORCE_ENV]: 'on' })).toBe(true);
    for (const v of [undefined, '', 'ON', 'true', '1', 'yes']) {
      expect(isEnforceEnabled({ [ENFORCE_ENV]: v })).toBe(false);
    }
  });
});

describe('evaluateAutoBlock — advisory default', () => {
  it('returns ADVISE (never BLOCK) when enforce is false, even with a matching signature', () => {
    const r = evaluateAutoBlock({ patterns: curated, context: { text: 'calls fs.rmSync(path)' }, enforce: false });
    expect(r.verdict).toBe('ADVISE');
    expect(r.blocked).toBe(false);
    expect(r.advisories).toHaveLength(2); // both surfaced for review
    expect(r.hardMatches).toHaveLength(1); // the match is detected...
  });

  it('surfaces ALL enabled patterns as advisories with their prevention checklists', () => {
    const r = evaluateAutoBlock({ patterns: curated, context: '', enforce: false });
    expect(r.advisories.map((a) => a.pattern_id)).toEqual(['PAT-A', 'PAT-B']);
    expect(r.advisories[1].prevention).toContain('avoid rm -rf');
  });
});

describe('evaluateAutoBlock — enforce is narrow + opt-in', () => {
  it('BLOCKS only when enforce=true AND a block_signature matches the context', () => {
    const r = evaluateAutoBlock({ patterns: curated, context: { text: 'danger fs.rmSync(dir)' }, enforce: true });
    expect(r.verdict).toBe('BLOCK');
    expect(r.blocked).toBe(true);
    expect(r.hardMatches[0].pattern_id).toBe('PAT-B');
  });

  it('does NOT block when enforce=true but no signature matches', () => {
    const r = evaluateAutoBlock({ patterns: curated, context: { text: 'totally unrelated change' }, enforce: true });
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBe('ADVISE');
  });

  it('a pattern WITHOUT block_signatures can NEVER block, even under enforce', () => {
    const noSig = [{ pattern_id: 'PAT-A', severity: 'high', issue_summary: 'x', metadata: {} }];
    const r = evaluateAutoBlock({ patterns: noSig, context: { text: 'x x x' }, enforce: true });
    expect(r.blocked).toBe(false);
  });
});

describe('evaluateAutoBlock — fail-open', () => {
  it('never throws and returns failedOpen on a malformed pattern set', () => {
    // patterns.find on a non-array signature etc. — force an internal error via a getter that throws
    const evil = [{ get pattern_id() { throw new Error('boom'); } }];
    const r = evaluateAutoBlock({ patterns: evil, context: 'x', enforce: true });
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBe('ADVISE');
    expect(r.failedOpen).toBe(true);
  });

  it('handles empty/missing inputs gracefully (advisory, not blocked)', () => {
    expect(evaluateAutoBlock({}).blocked).toBe(false);
    expect(evaluateAutoBlock({ patterns: [], context: 'x', enforce: true }).verdict).toBe('ADVISE');
  });
});

describe('runAutoBlockCheck — IO wrapper fail-open', () => {
  // FR-6 (count-truncation discipline): loadEnabledPatterns now paginates via
  // fetchAllPaginated, so the chain ends in .order(...).range(from, to).
  function chainSb(result) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      range: async (from, to) => (result.error
        ? result
        : { data: (result.data || []).slice(from, to + 1), error: null }),
    };
    return { from: () => chain };
  }

  it('returns advisory + enabledCount=0 when the DB read fails (never blocks)', async () => {
    const supabase = chainSb({ data: null, error: { message: 'db down' } });
    const r = await runAutoBlockCheck({ supabase, context: 'fs.rmSync(', enforce: true });
    expect(r.blocked).toBe(false);
    expect(r.enabledCount).toBe(0);
  });

  it('loads enabled patterns and advises by default', async () => {
    const supabase = chainSb({ data: curated, error: null });
    const r = await runAutoBlockCheck({ supabase, context: { text: 'fs.rmSync(x)' }, env: {} });
    expect(r.enabledCount).toBe(2);
    expect(r.verdict).toBe('ADVISE'); // env enforce unset -> advisory
    expect(r.blocked).toBe(false);
  });
});
