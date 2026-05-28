/**
 * CMO + CGO board seats — SD-LEO-INFRA-ADD-CMO-CHIEF-001
 *
 * The brainstorm board (specialist_registry, selected by panel-selector.selectPanel)
 * gains a marketing voice (CMO) and a revenue/growth voice (CGO = Chief Growth Officer)
 * so GTM-heavy venture topics get board-level scrutiny. CGO (not CRO) because CRO already
 * denotes Chief Risk Officer.
 *
 * Hermetic tests cover the two changes that live in code:
 *  - legacy BOARD_SEATS parity (getSeatByCode / getAllSeatCodes)
 *  - role-specific standing questions (extractStandingQuestion)
 * An env-gated live test confirms selectPanel surfaces CMO/CGO on a GTM topic
 * (selectPanel queries specialist_registry, so it needs Supabase creds).
 */
import { describe, it, expect } from 'vitest';
import { getSeatByCode, getAllSeatCodes } from '../../../lib/brainstorm/board-seats/index.js';
import { extractStandingQuestion, selectPanel } from '../../../lib/brainstorm/panel-selector.js';

const LIVE = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe('board-seats: CMO + CGO legacy parity', () => {
  it('getSeatByCode resolves CMO and CGO with a renderable systemPrompt fn', () => {
    const expectTitle = { CMO: /Marketing/, CGO: /Growth/ };
    for (const code of ['CMO', 'CGO']) {
      const seat = getSeatByCode(code);
      expect(seat, `${code} seat should exist`).toBeTruthy();
      expect(seat.code).toBe(code);
      expect(seat.title).toMatch(expectTitle[code]);
      expect(typeof seat.systemPrompt).toBe('function');
      const rendered = seat.systemPrompt({});
      expect(typeof rendered).toBe('string');
      expect(rendered.length).toBeGreaterThan(200);
      expect(rendered).toContain(seat.title);
    }
  });

  it('getAllSeatCodes is the original six plus CMO and CGO (8, no duplicates)', () => {
    const codes = getAllSeatCodes();
    for (const c of ['CSO', 'CRO', 'CTO', 'CISO', 'COO', 'CFO', 'CMO', 'CGO']) {
      expect(codes, `expected ${c}`).toContain(c);
    }
    expect(codes.length).toBe(8);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('CMO/CGO seats carry GTM perspectives (marketing vs revenue/growth)', () => {
    expect(getSeatByCode('CMO').perspective).toMatch(/marketing|demand|brand|positioning/i);
    expect(getSeatByCode('CGO').perspective).toMatch(/revenue|monetiz|growth|distribution/i);
  });
});

describe('extractStandingQuestion: CMO + CGO', () => {
  const generic = /expert assessment/i;

  it('returns role-specific questions for cmo and cgo (not the generic fallback)', () => {
    const cmoQ = extractStandingQuestion({ role: 'cmo', expertise: 'marketing' });
    const cgoQ = extractStandingQuestion({ role: 'cgo', expertise: 'growth' });
    expect(cmoQ).not.toMatch(generic);
    expect(cgoQ).not.toMatch(generic);
    expect(cmoQ).toMatch(/customer|reach/i);
    expect(cgoQ).toMatch(/revenue|adoption|compound/i);
  });

  it('lowercases role and still falls back for unknown roles', () => {
    expect(extractStandingQuestion({ role: 'CMO', expertise: 'x' })).toMatch(/customer|reach/i);
    expect(extractStandingQuestion({ role: 'CGO', expertise: 'x' })).toMatch(/revenue|adoption|compound/i);
    expect(extractStandingQuestion({ role: 'unknown-role', expertise: 'widgets' })).toMatch(generic);
  });

  it('does not disturb the existing six seats', () => {
    expect(extractStandingQuestion({ role: 'cso', expertise: 's' })).toMatch(/forward or sideways/i);
    expect(extractStandingQuestion({ role: 'cfo', expertise: 'f' })).toMatch(/cost|return/i);
  });
});

describe.runIf(LIVE)('selectPanel surfaces CMO/CGO on a GTM topic (live)', () => {
  it('includes CMO and/or CGO for a pricing + distribution topic, panel size unchanged', async () => {
    const panel = await selectPanel(
      'Pricing tiers and distribution channels for a freemium SaaS product launch',
      ['pricing', 'distribution', 'monetization', 'go-to-market', 'demand generation'],
      { maxSeats: 6 }
    );
    const codes = panel.map(p => p.code);
    expect(panel.length).toBeLessThanOrEqual(6);
    expect(codes.some(c => c === 'CMO' || c === 'CGO')).toBe(true);
  });
});
