/**
 * SD-LEO-INFRA-CLASS-LEVEL-PATTERN-001 — site-diversity class escalation.
 *
 * Precision backtest on the three known-good historical classes (each should
 * have escalated at the 3rd DISTINCT site) + false-positive negatives modeled
 * on the corrective-sd-generator failures (single-doc, zero site diversity).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  siteKeyFrom, mergeSite, shouldEscalate, buildClassSdInput,
  recordSiteAndMaybeEscalate, minSites, DEFAULT_MIN_SITES, MIN_SITES_FLOOR, SITES_CAP,
} from '../../../lib/learning/class-escalation.js';

const basePattern = (over = {}) => ({
  id: 'uuid-1', pattern_id: 'PAT-AUTO-test1234', status: 'active',
  data_quality_status: null, category: 'infrastructure', severity: 'high',
  issue_summary: 'artifact type mismatch on persist', occurrence_count: 1, metadata: {},
  ...over,
});

describe('siteKeyFrom — canonical site keys', () => {
  it('precedence: file > gate > stage > sd', () => {
    expect(siteKeyFrom({ file: 'lib/a.js', gate: 'G', stage: 21, sd_id: 'SD-1' })).toBe('file:lib/a.js');
    expect(siteKeyFrom({ gate: 'WIRE_CHECK', sd_id: 'SD-1' })).toBe('gate:wire_check');
    expect(siteKeyFrom({ stage: 21, sd_id: 'SD-1' })).toBe('stage:21');
    expect(siteKeyFrom({ sd_id: 'SD-ABC-001' })).toBe('sd:sd-abc-001');
  });
  it('path normalization: backslashes + case collapse to one site', () => {
    expect(siteKeyFrom({ file: 'lib\\eva\\Handler.js' })).toBe(siteKeyFrom({ file: 'lib/eva/handler.js' }));
  });
  it('no usable signal -> null', () => {
    expect(siteKeyFrom({})).toBeNull();
    expect(siteKeyFrom({ stage: '' })).toBeNull();
  });
});

describe('mergeSite — diversity ledger', () => {
  it('dedupes by canonical key; counts distinct sites', () => {
    let md = {};
    ({ metadata: md } = mergeSite(md, { file: 'a.js' }));
    ({ metadata: md } = mergeSite(md, { file: 'A.js' })); // same site (case)
    const r = mergeSite(md, { file: 'b.js' });
    expect(r.distinctCount).toBe(2);
    expect(r.added).toBe(true);
  });
  it('caps the ledger at SITES_CAP (FIFO)', () => {
    let md = {};
    for (let i = 0; i < SITES_CAP + 5; i++) ({ metadata: md } = mergeSite(md, { file: `f${i}.js` }));
    expect(md.sites.length).toBe(SITES_CAP);
  });
  it('signal-less site is a no-op', () => {
    const r = mergeSite({}, {});
    expect(r.added).toBe(false);
    expect(r.distinctCount).toBe(0);
  });
});

describe('minSites — threshold config', () => {
  it('default 3; env override; floor 2', () => {
    expect(minSites({})).toBe(DEFAULT_MIN_SITES);
    expect(minSites({ CLASS_ESCALATION_MIN_SITES: '5' })).toBe(5);
    expect(minSites({ CLASS_ESCALATION_MIN_SITES: '1' })).toBe(MIN_SITES_FLOOR);
  });
});

// ─── Historical backtest (the SD's named known-good classes) ───
const escalatesAtThirdSite = (sites) => {
  let md = {};
  const verdicts = [];
  for (const s of sites) {
    ({ metadata: md } = mergeSite(md, s));
    verdicts.push(shouldEscalate(basePattern({ metadata: md }), { env: {} }));
  }
  return verdicts;
};

describe('historical backtest — each class escalates at EXACTLY the 3rd distinct site', () => {
  it('artifact-type mismatches (S21/S22/S23 family -> contract registry)', () => {
    const v = escalatesAtThirdSite([
      { stage: 21, sd_id: 'SD-A' }, { stage: 22, sd_id: 'SD-B' }, { stage: 23, sd_id: 'SD-C' },
    ]);
    expect(v).toEqual([false, false, true]);
  });
  it('phantom-column writes (30 file sites -> schema lint)', () => {
    const v = escalatesAtThirdSite([
      { file: 'scripts/eva/srip/quality-checker.mjs' },
      { file: 'scripts/eva/srip/venture-integration.mjs' },
      { file: 'server/routes/stage24.js' },
    ]);
    expect(v).toEqual([false, false, true]);
  });
  it('process.exit-after-Supabase hangs (4+ CLIs -> exit-hang sweep)', () => {
    const v = escalatesAtThirdSite([
      { file: 'scripts/create-quick-fix.js' },
      { file: 'scripts/complete-quick-fix.js' },
      { file: 'scripts/worker-checkin.cjs' },
    ]);
    expect(v).toEqual([false, false, true]);
  });
});

describe('false-positive negatives (modeled on the 5/5-FP corrective findings)', () => {
  it('single-site repeated 5x never escalates (the corrective-FP shape)', () => {
    let md = {};
    for (let i = 0; i < 5; i++) ({ metadata: md } = mergeSite(md, { file: 'docs/some-vision-doc.md' }));
    expect(shouldEscalate(basePattern({ metadata: md, occurrence_count: 5 }), { env: {} })).toBe(false);
  });
  it('noise-flagged multi-site pattern never escalates', () => {
    let md = {};
    for (const f of ['a.js', 'b.js', 'c.js']) ({ metadata: md } = mergeSite(md, { file: f }));
    expect(shouldEscalate(basePattern({ metadata: md, data_quality_status: 'noise' }), { env: {} })).toBe(false);
  });
  it('non-active (resolved) pattern never escalates', () => {
    let md = {};
    for (const f of ['a.js', 'b.js', 'c.js']) ({ metadata: md } = mergeSite(md, { file: f }));
    expect(shouldEscalate(basePattern({ metadata: md, status: 'resolved' }), { env: {} })).toBe(false);
  });
  it('already-escalated pattern never re-escalates (exactly once)', () => {
    let md = { class_escalation: { sd_key: 'SD-CLASS-001' } };
    for (const f of ['a.js', 'b.js', 'c.js', 'd.js']) ({ metadata: md } = mergeSite(md, { file: f }));
    expect(shouldEscalate(basePattern({ metadata: md }), { env: {} })).toBe(false);
  });
});

describe('class-SD draft payload (propose-only)', () => {
  it('links every site + frames the structural fix + carries evidence', () => {
    let md = {};
    for (const f of ['lib/a.js', 'lib/b.js', 'lib/c.js']) ({ metadata: md } = mergeSite(md, { file: f }));
    const input = buildClassSdInput(basePattern({ metadata: md }));
    expect(input.title).toMatch(/^Class fix: infrastructure:/);
    expect(input.description).toMatch(/3 DISTINCT sites/);
    expect(input.description).toMatch(/file:lib\/a\.js/);
    expect(input.description).toMatch(/NORMAL LEAD gate/);
    expect(input.source).toBe('class_escalation');
  });
});

describe('recordSiteAndMaybeEscalate — seam contract (fail-soft)', () => {
  const mockSb = (updateError = null) => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: updateError })) })),
    })),
  });

  it('records the site and returns no escalation below threshold', async () => {
    const sb = mockSb();
    const r = await recordSiteAndMaybeEscalate(sb, basePattern(), { file: 'a.js' }, { env: {} });
    expect(r.distinctCount).toBe(1);
    expect(r.escalatedSdKey).toBeNull();
  });

  it('a failing site write is contained (no throw, no escalation)', async () => {
    const sb = mockSb({ message: 'boom' });
    const r = await recordSiteAndMaybeEscalate(sb, basePattern(), { file: 'a.js' }, { env: {} });
    expect(r.escalatedSdKey).toBeNull();
  });

  it('a null/invalid pattern is a safe no-op', async () => {
    const r = await recordSiteAndMaybeEscalate(mockSb(), null, { file: 'a.js' }, { env: {} });
    expect(r).toEqual({ distinctCount: 0, escalatedSdKey: null });
  });
});

describe('score-command gate (FR-3 static)', () => {
  it('the auto-finding call is gated behind CORRECTIVE_AUTO_FINDINGS (default off)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
    const src = readFileSync(resolve(root, 'scripts/eva/score-command.mjs'), 'utf8');
    expect(src).toMatch(/CORRECTIVE_AUTO_FINDINGS === 'on'/);
    expect(src).toMatch(/corrective auto-finding skipped/);
    // the generator module itself is untouched (narrow gate)
    const gen = readFileSync(resolve(root, 'scripts/eva/corrective-sd-generator.mjs'), 'utf8');
    expect(gen).not.toMatch(/CORRECTIVE_AUTO_FINDINGS/);
  });
});
