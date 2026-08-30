// QF-20260830-086 — honest per-stage OKR-automation health + KR-GOV-3.3 recompute.
// ANTI-INFLATION property mirrors cascade-layer-health.js: a stage only counts as "running" when
// a REAL artifact row exists within that stage's own cadence window. A scheduler job_last_runs
// stamp advancing under observe_only=true (with no handler ever called) must never be treated as
// evidence — this module deliberately reads the downstream artifact tables instead of that stamp.
import { describe, it, expect } from 'vitest';
import {
  computeOkrStageHealth,
  recomputeKrGov33,
  buildKrGov33Description,
  OKR_STAGES,
  KR_CODE,
  RECOMPUTE_WRITER,
} from '../../lib/governance/okr-automation-stage-health.js';

const NOW = new Date('2026-08-30T00:00:00Z');

// Mock supabase: each stage's table query resolves to `rows[table]` (array of {[timestampCol]: iso}
// or []). key_results read returns krBefore; update captures the payload.
function mockSb({ rows = {}, krBefore = 0, updateError = null, onUpdate } = {}) {
  return {
    from(table) {
      return {
        select() {
          const builder = {
            in() { return builder; },
            eq() { return builder; },
            order() { return builder; },
            limit() { return builder; },
            maybeSingle: () => Promise.resolve({ data: krBefore === null ? null : { current_value: krBefore }, error: null }),
            then(resolve) {
              const r = rows[table];
              resolve(r === 'ERR' ? { data: null, error: { message: 'boom' } } : { data: r || [], error: null });
            },
          };
          return builder;
        },
        update(payload) {
          return { eq(col, val) { if (onUpdate) onUpdate({ payload, col, val }); return Promise.resolve({ error: updateError }); } };
        },
      };
    },
  };
}

// All 3 stages fresh (well within their own cadence).
const FRESH_ROWS = {
  okr_generation_log: [{ created_at: '2026-08-20T00:00:00Z' }],        // 10d old, cadence 30d
  eva_scheduler_metrics: [{ occurred_at: '2026-08-25T00:00:00Z' }],    // 5d old, cadence 15d
  chairman_decisions: [{ created_at: '2026-08-29T00:00:00Z' }],        // 1d old, cadence 30d
};

describe('computeOkrStageHealth — all 3 stages running', () => {
  it('passingCount = 3 when every stage has a fresh artifact within its cadence', async () => {
    const { stages, passingCount } = await computeOkrStageHealth({ supabase: mockSb({ rows: FRESH_ROWS }), now: NOW });
    expect(passingCount).toBe(3);
    expect(stages.every((s) => s.running)).toBe(true);
    expect(stages.map((s) => s.stage)).toEqual(['draft_generation', 'chairman_review', 'day28_hardstop']);
  });
});

describe('ANTI-INFLATION — a stale or absent artifact fails its stage, never credited from code presence alone', () => {
  it('a row older than its own cadence FAILS the stage (the real specimen: 81d-old generation, 30d cadence)', async () => {
    const rows = { ...FRESH_ROWS, okr_generation_log: [{ created_at: '2026-06-10T11:42:45Z' }] }; // ~81d old
    const { stages, passingCount } = await computeOkrStageHealth({ supabase: mockSb({ rows }), now: NOW });
    expect(passingCount).toBe(2);
    const draft = stages.find((s) => s.stage === 'draft_generation');
    expect(draft.running).toBe(false);
    expect(draft.ageDays).toBeGreaterThan(30);
  });

  it('zero rows ever (the real day-28 specimen) FAILS the stage — never fired', async () => {
    const rows = { ...FRESH_ROWS, chairman_decisions: [] };
    const { stages, passingCount } = await computeOkrStageHealth({ supabase: mockSb({ rows }), now: NOW });
    expect(passingCount).toBe(2);
    const day28 = stages.find((s) => s.stage === 'day28_hardstop');
    expect(day28.running).toBe(false);
    expect(day28.lastAt).toBeNull();
  });

  it('a query ERROR fails its stage (conservative, never inflates)', async () => {
    const rows = { ...FRESH_ROWS, eva_scheduler_metrics: 'ERR' };
    const { passingCount } = await computeOkrStageHealth({ supabase: mockSb({ rows }), now: NOW });
    expect(passingCount).toBe(2);
  });

  it('the real fleet specimen — all three stages stale/absent — measures 0/3, matching current DB value', async () => {
    const rows = {
      okr_generation_log: [{ created_at: '2026-06-10T11:42:45Z' }],
      eva_scheduler_metrics: [{ occurred_at: '2026-07-19T23:27:19Z' }],
      chairman_decisions: [],
    };
    const { passingCount } = await computeOkrStageHealth({ supabase: mockSb({ rows }), now: NOW });
    expect(passingCount).toBe(0);
  });
});

describe('buildKrGov33Description — the number and the prose can never disagree', () => {
  it('lists running stages and omits a stale note when all 3 run', async () => {
    const { stages } = await computeOkrStageHealth({ supabase: mockSb({ rows: FRESH_ROWS }), now: NOW });
    const desc = buildKrGov33Description(stages, 3);
    expect(desc).toContain('Currently 3 of 3 automation stages running');
    expect(desc).not.toContain('stale');
  });

  it('names the stale stage with its age when one lags', async () => {
    const rows = { ...FRESH_ROWS, okr_generation_log: [{ created_at: '2026-06-10T11:42:45Z' }] };
    const { stages } = await computeOkrStageHealth({ supabase: mockSb({ rows }), now: NOW });
    const desc = buildKrGov33Description(stages, 2);
    expect(desc).toContain('Currently 2 of 3 automation stages running');
    expect(desc).toMatch(/stale: draft OKR generation \(last 2026-06-10, [\d.]+d ago\)/);
  });

  it('marks a never-fired stage as "(never)" rather than a fabricated age', async () => {
    const rows = { ...FRESH_ROWS, chairman_decisions: [] };
    const { stages } = await computeOkrStageHealth({ supabase: mockSb({ rows }), now: NOW });
    const desc = buildKrGov33Description(stages, 2);
    expect(desc).toContain('day-28 hard-stop (never)');
  });
});

describe('recomputeKrGov33 — write semantics', () => {
  it('apply=false (dry-run): NO write, returns the would-be value', async () => {
    let wrote = false;
    const supabase = mockSb({ rows: FRESH_ROWS, krBefore: 0, onUpdate: () => { wrote = true; } });
    const r = await recomputeKrGov33({ supabase, apply: false, now: '2026-08-30T00:00:00Z' });
    expect(wrote).toBe(false);
    expect(r.wrote).toBe(false);
    expect(r.passingCount).toBe(3);
    expect(r.before).toBe(0);
  });

  it('apply=true: writes current_value=passingCount and a matching description with last_updated_by set', async () => {
    let captured = null;
    const supabase = mockSb({ rows: FRESH_ROWS, krBefore: 0, onUpdate: (u) => { captured = u; } });
    const r = await recomputeKrGov33({ supabase, apply: true, now: '2026-08-30T00:00:00Z' });
    expect(r.wrote).toBe(true);
    expect(captured.col).toBe('code');
    expect(captured.val).toBe(KR_CODE);
    expect(captured.payload.current_value).toBe(3);
    expect(captured.payload.status).toBe('achieved');
    expect(captured.payload.last_updated_by).toBe(RECOMPUTE_WRITER);
    expect(captured.payload.description).toContain('Currently 3 of 3 automation stages running');
  });

  it('the real fleet specimen: apply=true with all stages stale writes 0 and status at_risk — TWO-SIDED, unchanged from the existing 0', async () => {
    let captured = null;
    const rows = {
      okr_generation_log: [{ created_at: '2026-06-10T11:42:45Z' }],
      eva_scheduler_metrics: [{ occurred_at: '2026-07-19T23:27:19Z' }],
      chairman_decisions: [],
    };
    const supabase = mockSb({ rows, krBefore: 0, onUpdate: (u) => { captured = u; } });
    const r = await recomputeKrGov33({ supabase, apply: true, now: '2026-08-30T00:00:00Z' });
    expect(r.before).toBe(0);
    expect(r.passingCount).toBe(0);
    expect(captured.payload.current_value).toBe(0);
    expect(captured.payload.status).toBe('at_risk');
  });
});

describe('OKR_STAGES — target count matches the KR (3)', () => {
  it('exactly 3 stages registered', () => {
    expect(OKR_STAGES).toHaveLength(3);
  });
});
