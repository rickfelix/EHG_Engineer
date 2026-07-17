/**
 * SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-C — portfolio review round.
 * TS-1 dry-run zero writes · TS-2 one-packet-per-cadence idempotency ·
 * TS-3 graceful degradation without governed artifact · TS-4 synthetic
 * venture exclusion · TS-5 round registration.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  portfolioReviewHandler,
  composeReviewPacket,
  isRealVenture,
  registerPortfolioReviewRound,
  PORTFOLIO_REVIEW_DECISION_TYPE,
} from '../portfolio-review-round.mjs';

const REAL_VENTURE = { id: 'v1', name: 'ApexNiche', status: 'active', is_demo: false, current_lifecycle_stage: 6 };
const STRATEGY = { vision_key: 'VISION-PORTFOLIO-STRATEGY-001', content: 'strategy', extracted_dimensions: {} };

/** Minimal chainable supabase stub. `pending` controls the idempotency probe. */
function makeDb({ ventures = [REAL_VENTURE], pending = [] } = {}) {
  const writes = { upserts: [], inserts: [] };
  const db = {
    writes,
    from(table) {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        limit: vi.fn(async () => (table === 'chairman_decisions' ? { data: pending } : { data: [] })),
        upsert: vi.fn((row) => {
          writes.upserts.push({ table, row });
          return { select: () => ({ single: async () => ({ data: { id: 'rev-1' } }) }), error: null, then: undefined };
        }),
      };
      if (table === 'ventures') {
        // .eq('status','active') terminates the ventures read
        chain.eq = vi.fn(async () => ({ data: ventures, error: null }));
      }
      if (table === 'management_reviews') {
        chain.upsert = vi.fn(async (row) => {
          writes.upserts.push({ table, row });
          return { error: null };
        });
      }
      return chain;
    },
  };
  return db;
}

describe('isRealVenture (TS-4)', () => {
  it('excludes is_demo and synthetic-name rows, keeps real ventures', () => {
    expect(isRealVenture(REAL_VENTURE)).toBe(true);
    expect(isRealVenture({ ...REAL_VENTURE, is_demo: true })).toBe(false);
    expect(isRealVenture({ ...REAL_VENTURE, name: 'Pipeline-Test-1784250113322' })).toBe(false);
    expect(isRealVenture({ ...REAL_VENTURE, name: 'TS-fixture-a6e265ae' })).toBe(false);
    expect(isRealVenture({ ...REAL_VENTURE, name: 'Test Venture for Financial Engine' })).toBe(false);
    expect(isRealVenture({ ...REAL_VENTURE, name: 'HCGate-RealDB-rpc-block-1784238026383' })).toBe(false);
    expect(isRealVenture({ ...REAL_VENTURE, name: '__e2e_product_review_gate_rpc_1784238025597__' })).toBe(false);
    expect(isRealVenture({ ...REAL_VENTURE, name: 'ApexNiche AI' })).toBe(true);
    expect(isRealVenture({ ...REAL_VENTURE, name: 'Image Alt Text Generator' })).toBe(true);
  });
});

describe('composeReviewPacket (TS-3)', () => {
  it('degrades gracefully without an active strategy artifact', () => {
    const packet = composeReviewPacket({ strategy: null, ventures: [REAL_VENTURE], reviewDate: '2026-07-17' });
    expect(packet.recommendation).toBe('fix');
    expect(packet.narrative).toContain('MISSING or not chairman-ratified');
    expect(packet.sections.strategy_active).toBe(false);
  });

  it('proposes proceed when the strategy artifact is active', () => {
    const packet = composeReviewPacket({ strategy: STRATEGY, ventures: [REAL_VENTURE], reviewDate: '2026-07-17' });
    expect(packet.recommendation).toBe('proceed');
    expect(packet.sections.strategy_vision_key).toBe('VISION-PORTFOLIO-STRATEGY-001');
  });
});

describe('portfolioReviewHandler', () => {
  it('TS-1: dry-run composes the packet with zero writes', async () => {
    const db = makeDb();
    const record = vi.fn();
    const result = await portfolioReviewHandler({
      dryRun: true, supabase: db, deps: { loadStrategy: async () => STRATEGY, record },
    });
    expect(result.dryRun).toBe(true);
    expect(result.packet.recommendation).toBe('proceed');
    expect(record).not.toHaveBeenCalled();
    expect(db.writes.upserts).toHaveLength(0);
  });

  it('TS-2: inserts exactly one packet, second run in window skips insert but refreshes the review record', async () => {
    const record = vi.fn(async () => ({ recorded: true, id: 'pkt-1' }));

    const first = makeDb({ pending: [] });
    const r1 = await portfolioReviewHandler({
      supabase: first, deps: { loadStrategy: async () => STRATEGY, record },
    });
    expect(r1.insertedPacket).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][1].decisionType).toBe(PORTFOLIO_REVIEW_DECISION_TYPE);
    expect(record.mock.calls[0][1].blocking).toBe(false);

    const second = makeDb({ pending: [{ id: 'pkt-1' }] });
    const r2 = await portfolioReviewHandler({
      supabase: second, deps: { loadStrategy: async () => STRATEGY, record },
    });
    expect(r2.insertedPacket).toBe(false);
    expect(r2.packetId).toBe('pkt-1');
    expect(record).toHaveBeenCalledTimes(1); // no second insert
    expect(second.writes.upserts.filter(w => w.table === 'management_reviews')).toHaveLength(1);
  });

  it('TS-4: synthetic ventures are excluded from the packet inputs', async () => {
    const db = makeDb({ ventures: [REAL_VENTURE, { id: 'v2', name: 'Pipeline-Test-99', is_demo: false, current_lifecycle_stage: 1 }] });
    const result = await portfolioReviewHandler({
      dryRun: true, supabase: db, deps: { loadStrategy: async () => STRATEGY, record: vi.fn() },
    });
    expect(result.packet.sections.ventures).toHaveLength(1);
    expect(result.packet.sections.ventures[0].name).toBe('ApexNiche');
  });
});

describe('registerPortfolioReviewRound (TS-5)', () => {
  it('registers the weekly portfolio_review round on the scheduler', () => {
    const scheduler = { registerRound: vi.fn() };
    registerPortfolioReviewRound(scheduler);
    expect(scheduler.registerRound).toHaveBeenCalledWith('portfolio_review', expect.objectContaining({
      cadence: 'weekly',
      handler: expect.any(Function),
    }));
  });
});
