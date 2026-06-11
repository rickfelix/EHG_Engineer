/**
 * SD-LEO-INFRA-FACTORY-COST-UNIT-001 — pricing, rollup, and email-panel units.
 * Pure-lib tests: no DB access.
 */

import { describe, it, expect } from 'vitest';
import { PRICING, priceFor, rowCost, COST_CAVEAT } from '../../../lib/cost/llm-pricing.js';
import { rollup, UNATTRIBUTED } from '../../../lib/cost/usage-rollup.js';
import { computeCostPanel, formatCostPanel } from '../../../lib/cost/email-cost-panel.js';

// ── FR-1: pricing resolver covers the live model-name families ────────────────
describe('priceFor — live model name families (TS-1)', () => {
  it.each([
    ['gemini-2.5-flash', PRICING['gemini-2.5-flash']],
    ['gemini-2.5-flash-lite', PRICING['gemini-2.5-flash-lite']],
    ['gemini-2.5-pro', PRICING['gemini-2.5-pro']],
    ['gemini-embedding-001', PRICING['gemini-embedding-001']],
    ['Opus 4.8', PRICING['claude-opus']],
    ['Opus 4.8 (1M context)', PRICING['claude-opus']],
    ['claude-opus-4-8[1m]', PRICING['claude-opus']],
    ['claude-sonnet-4-6', PRICING['claude-sonnet']],
    ['claude-haiku-4-5-20251001', PRICING['claude-haiku']],
    ['qwen3-coder:30b', PRICING.local],
    ['ollama/llama3', PRICING.local],
    ['gpt-5.5', PRICING['gpt-5.5']],
    ['gpt-5.4-mini', PRICING['gpt-5.4-mini']],
    ['gpt-5.4-nano', PRICING['gpt-5.4-nano']],
    ['gpt-5.4', PRICING['gpt-5.4']],
  ])('%s → expected tier', (name, tier) => {
    expect(priceFor(name)).toBe(tier);
  });

  it('unknown model → null (counted in tokens, $0 estimate)', () => {
    expect(priceFor('mystery-model-9000')).toBeNull();
    expect(priceFor(null)).toBeNull();
    expect(priceFor('')).toBeNull();
  });
});

describe('rowCost', () => {
  it('prices a known-model row from metadata tokens', () => {
    const r = { reported_model_name: 'gemini-2.5-flash', metadata: { input_tokens: 1_000_000, output_tokens: 1_000_000 } };
    const c = rowCost(r);
    expect(c.known).toBe(true);
    expect(c.usd).toBeCloseTo(0.30 + 2.50, 6);
  });

  it('unknown model → $0 but tokens still counted', () => {
    const c = rowCost({ reported_model_name: 'mystery', metadata: { input_tokens: 5, output_tokens: 7 } });
    expect(c).toMatchObject({ usd: 0, inT: 5, outT: 7, known: false });
  });

  it('tolerates missing metadata', () => {
    expect(rowCost({ reported_model_name: 'gemini-2.5-flash' }).usd).toBe(0);
    expect(rowCost(null).usd).toBe(0);
  });
});

// ── FR-2: pure rollup (TS-2) ──────────────────────────────────────────────────
describe('rollup — bySd/byPhase/coverage (TS-2)', () => {
  const flash = (sd, phase, inT, outT, extra = {}) => ({
    sd_id: sd, phase, reported_model_name: 'gemini-2.5-flash',
    metadata: { input_tokens: inT, output_tokens: outT, ...extra },
  });

  it('aggregates by SD with null sd_id in UNATTRIBUTED (never dropped)', () => {
    const r = rollup([
      flash('SD-A', 'EXEC', 1_000_000, 0),
      flash('SD-A', 'LEAD', 0, 1_000_000),
      flash(null, 'EXEC', 2_000_000, 0),
    ]);
    expect(r.bySd['SD-A'].calls).toBe(2);
    expect(r.bySd['SD-A'].usd).toBeCloseTo(0.30 + 2.50, 6);
    expect(r.bySd[UNATTRIBUTED].calls).toBe(1);
    expect(r.bySd[UNATTRIBUTED].usd).toBeCloseTo(0.60, 6);
    expect(r.totals.calls).toBe(3);
    expect(r.totals.usd).toBeCloseTo(0.30 + 2.50 + 0.60, 6);
  });

  it('aggregates by phase and by sd|phase', () => {
    const r = rollup([flash('SD-A', 'EXEC', 1_000_000, 0), flash('SD-B', 'EXEC', 1_000_000, 0)]);
    expect(r.byPhase.EXEC.calls).toBe(2);
    expect(r.bySdPhase['SD-A|EXEC'].calls).toBe(1);
    expect(r.bySdPhase['SD-B|EXEC'].calls).toBe(1);
  });

  it('coverage % = attributed / total', () => {
    const r = rollup([flash('SD-A', 'EXEC', 0, 0), flash(null, 'EXEC', 0, 0), flash(null, 'EXEC', 0, 0), flash(null, 'EXEC', 0, 0)]);
    expect(r.coverage).toMatchObject({ attributedCalls: 1, totalCalls: 4, pct: 25 });
  });

  it('counts cache hits and handles empty input', () => {
    const r = rollup([flash('SD-A', 'EXEC', 0, 0, { cache_hit: true })]);
    expect(r.bySd['SD-A'].cacheHits).toBe(1);
    expect(rollup([]).coverage.pct).toBe(0);
    expect(rollup().totals.calls).toBe(0);
  });
});

// ── FR-5: email cost panel (TS-4) ─────────────────────────────────────────────
describe('email cost panel (TS-4)', () => {
  const NOW = new Date('2026-06-10T12:00:00Z').getTime();
  const at = (iso, usdTokens = 1_000_000) => ({
    reported_model_name: 'gemini-2.5-flash',
    captured_at: iso,
    metadata: { input_tokens: 0, output_tokens: usdTokens }, // 1M out = $2.50 flash
  });

  it('computes last-24h spend, trailing avg, window spend, top models', () => {
    const rows = [
      at('2026-06-03T12:00:00Z'), // complete day, in trailing avg
      at('2026-06-09T13:00:00Z'), // complete day + ALSO within last 24h of NOW (>= 06-09T12:00Z)
      at('2026-06-10T11:00:00Z'), // today, within last 24h
    ];
    const p = computeCostPanel(rows, { sinceTs: new Date('2026-06-10T00:00:00Z').getTime(), now: NOW });
    expect(p.dayUsd).toBeCloseTo(5.0, 6);          // 2 rows in 24h window
    expect(p.windowUsd).toBeCloseTo(2.5, 6);       // 1 row since last email
    expect(p.windowCalls).toBe(1);
    expect(p.avgDailyUsd).toBeGreaterThan(0);
    expect(p.topModels[0][0]).toBe('gemini-2.5-flash');
  });

  it('renders html+text with the hard-coded caveat', () => {
    const out = formatCostPanel({ windowUsd: 1.5, windowCalls: 3, dayUsd: 4.2, avgDailyUsd: 2.0, topModels: [['m1', 4.2]], trend: 2.1 });
    expect(out.html).toContain('$4.20');
    expect(out.html).toContain(COST_CAVEAT);
    expect(out.html).toContain('⚠ 2.1x');
    expect(out.text).toContain('$4.20');
    expect(out.text).toContain(COST_CAVEAT);
  });

  it('handles empty rows (no trend, $0)', () => {
    const p = computeCostPanel([], { sinceTs: null, now: NOW });
    expect(p.dayUsd).toBe(0);
    expect(p.trend).toBeNull();
    const out = formatCostPanel(p);
    expect(out.text).toContain('$0.00');
  });
});
