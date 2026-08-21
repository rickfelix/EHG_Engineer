/**
 * SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 — PR2 of 5
 * Unit tests for lib/eva/corrective-finding-recorder.js
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let recordCorrectiveFinding;
let computeDedupHash;

beforeAll(async () => {
  const mod = await import('../../../lib/eva/corrective-finding-recorder.js');
  recordCorrectiveFinding = mod.recordCorrectiveFinding;
  computeDedupHash = mod.computeDedupHash;
});

function mockSupabase({ existing = null, lookupErr = null, insertErr = null, insertedId = 'fb-uuid-1' } = {}) {
  let inserted = null;
  return {
    inserted: () => inserted,
    from(table) {
      if (table !== 'feedback') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: existing, error: lookupErr }),
                }),
              }),
            }),
          }),
        }),
        insert(row) {
          inserted = row;
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: insertErr ? null : { id: insertedId },
                error: insertErr,
              }),
            }),
          };
        },
      };
    },
  };
}

/**
 * Stateful mock: tracks inserted rows by dedup_hash across MULTIPLE
 * recordCorrectiveFinding calls, so a second call with the same natural key
 * (different gate_run_id) sees the first call's row as an existing match --
 * exactly what the real feedback table's dedup_hash lookup does. The mock
 * threads the actual queried dedup_hash value through .eq() so the lookup
 * responds to the CURRENT call's hash, not a captured prior-call value.
 */
function mockSupabaseStateful() {
  // A real array, like the actual feedback table -- multiple rows CAN share a
  // dedup_hash (e.g. one resolved, one a genuine later regression); a Map keyed
  // by hash would silently collapse them, which is not what the real table does.
  const rows = [];
  let nextId = 1;
  return {
    rowCount: () => rows.length,
    // Mirrors marking a row resolved in the real feedback table -- the OPEN-status
    // filter below must then stop treating it as an existing dedup match.
    resolve(id) {
      const row = rows.find((r) => r.id === id);
      if (row) row.status = 'resolved';
    },
    from(table) {
      if (table !== 'feedback') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col, hashValue) => ({
            eq: () => ({
              in: (_statusCol, openStatuses) => ({
                limit: () => ({
                  maybeSingle: () => {
                    const match = rows.find(
                      (r) => r.metadata.dedup_hash === hashValue && openStatuses.includes(r.status)
                    );
                    return Promise.resolve({ data: match ? { id: match.id } : null, error: null });
                  },
                }),
              }),
            }),
          }),
        }),
        insert(row) {
          const id = `fb-${nextId++}`;
          rows.push({ ...row, id, status: row.status ?? 'new' });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id }, error: null }),
            }),
          };
        },
      };
    },
  };
}

describe('computeDedupHash', () => {
  it('produces stable hash for identical input (legacy gate_run_id-keyed usage)', () => {
    const a = computeDedupHash('SD-X', ['V01', 'V02'], 'run-1');
    const b = computeDedupHash('SD-X', ['V01', 'V02'], 'run-1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent for dimensions', () => {
    const a = computeDedupHash('SD-X', ['V02', 'V01'], 'run-1');
    const b = computeDedupHash('SD-X', ['V01', 'V02'], 'run-1');
    expect(a).toBe(b);
  });

  it('differs when source_sd_id differs', () => {
    const a = computeDedupHash('SD-X', ['V01'], 'run-1');
    const b = computeDedupHash('SD-Y', ['V01'], 'run-1');
    expect(a).not.toBe(b);
  });

  it('handles null source_sd_id and third component', () => {
    const h = computeDedupHash(null, ['V01'], null);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  // SD-LEO-INFRA-CORRECTIVE-FINDING-GENERATOR-001 (FR-3): recordCorrectiveFinding's
  // natural_key mode passes `tier` as this 3rd argument instead of gate_run_id, so two
  // calls sharing source_sd_id/dimensions/tier but DIFFERENT gate_run_id values must
  // produce the SAME hash (this is the fix -- the prior gate_run_id-keyed hash made
  // every scoring pass mint a fresh, non-deduping row).
  it('is stable when the 3rd component (tier, in natural_key mode) is identical across calls', () => {
    const a = computeDedupHash('SD-X', ['V01', 'V02'], 'gap-closure');
    const b = computeDedupHash('SD-X', ['V01', 'V02'], 'gap-closure');
    expect(a).toBe(b);
  });

  it('differs when tier differs', () => {
    const a = computeDedupHash('SD-X', ['V01'], 'gap-closure');
    const b = computeDedupHash('SD-X', ['V01'], 'escalation');
    expect(a).not.toBe(b);
  });
});

describe('recordCorrectiveFinding', () => {
  const baseFinding = {
    source_sd_id: 'SD-SOURCE-001',
    source_gate: 'eva_vision_score',
    gate_run_id: '11111111-1111-1111-1111-111111111111',
    corrective_class: 'vision_gap',
    dimensions: ['V03', 'V07'],
    tier: 'gap-closure',
    score: 72,
    title: 'Vision gap V03/V07 below threshold',
    description: 'Score 72 < 83 threshold for SD-SOURCE-001',
    metadata: { rubric_run: 'rb-1' },
  };

  it('inserts a new feedback row when no duplicate exists', async () => {
    const sb = mockSupabase({ existing: null, insertedId: 'fb-1' });
    const result = await recordCorrectiveFinding(sb, baseFinding);
    expect(result.recorded).toBe(true);
    expect(result.feedbackId).toBe('fb-1');
    expect(result.dedupHash).toMatch(/^[0-9a-f]{64}$/);

    const row = sb.inserted();
    expect(row).not.toBeNull();
    expect(row.category).toBe('corrective_finding');
    expect(row.status).toBe('new');
    expect(row.type).toBe('issue');
    expect(row.source_application).toBe('EHG_Engineer');
    expect(row.source_type).toBe('auto_capture');
    expect(row.feedback_type).toBe('sentry_error');
    expect(row.corrective_class).toBe('vision_gap');
    expect(row.source_gate).toBe('eva_vision_score');
    expect(row.gate_run_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(row.severity).toBe('medium');
    expect(row.metadata.dedup_hash).toBe(result.dedupHash);
    expect(row.metadata.dimensions).toEqual(['V03', 'V07']);
    expect(row.metadata.rubric_run).toBe('rb-1');
    expect(row.metadata.tier).toBe('gap-closure');
    expect(row.metadata.score).toBe(72);
  });

  it('returns existing feedbackId without inserting on dedup hit', async () => {
    const sb = mockSupabase({ existing: { id: 'fb-existing' } });
    const result = await recordCorrectiveFinding(sb, baseFinding);
    expect(result.recorded).toBe(false);
    expect(result.feedbackId).toBe('fb-existing');
    expect(sb.inserted()).toBeNull();
  });

  it('maps tier=escalation to severity=high', async () => {
    const sb = mockSupabase({ existing: null });
    await recordCorrectiveFinding(sb, { ...baseFinding, tier: 'escalation' });
    expect(sb.inserted().severity).toBe('high');
  });

  it('maps tier=minor to severity=low', async () => {
    const sb = mockSupabase({ existing: null });
    await recordCorrectiveFinding(sb, { ...baseFinding, tier: 'minor' });
    expect(sb.inserted().severity).toBe('low');
  });

  it('rejects when source_gate is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, source_gate: undefined }))
      .rejects.toThrow(/source_gate is required/);
  });

  it('rejects when corrective_class is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, corrective_class: undefined }))
      .rejects.toThrow(/corrective_class is required/);
  });

  it('rejects when title is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, title: undefined }))
      .rejects.toThrow(/title is required/);
  });

  it('rejects when tier is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, tier: undefined }))
      .rejects.toThrow(/tier is required/);
  });

  it('propagates insert errors', async () => {
    const sb = mockSupabase({ existing: null, insertErr: { message: 'CHECK violation' } });
    await expect(recordCorrectiveFinding(sb, baseFinding))
      .rejects.toThrow(/insert failed: CHECK violation/);
  });

  it('propagates lookup errors', async () => {
    const sb = mockSupabase({ lookupErr: { message: 'connection lost' } });
    await expect(recordCorrectiveFinding(sb, baseFinding))
      .rejects.toThrow(/dedup lookup failed: connection lost/);
  });
});

// SD-LEO-INFRA-CORRECTIVE-FINDING-GENERATOR-001 (FR-6): observational regression --
// proves the FIX behaviorally (only one row survives two scoring passes for the same
// recurring gap), not merely that the hash STRING shape changed.
describe('recordCorrectiveFinding — recurring-gap dedup (FR-6 observational)', () => {
  const baseFinding = {
    source_sd_id: 'SD-SOURCE-001',
    source_gate: 'eva_vision_score',
    corrective_class: 'vision_gap',
    dimensions: ['V03', 'V07'],
    tier: 'gap-closure',
    score: 72,
    title: 'Vision gap V03/V07 below threshold',
    description: 'Score 72 < 83 threshold for SD-SOURCE-001',
    // dedup_scope:'natural_key' is what the corrective-sd-generator opts into
    // (FR-3) -- every OTHER caller keeps the default gate_run-keyed hash.
    dedup_scope: 'natural_key',
  };

  it('two scoring passes for the same (source_sd_id, dimensions, tier) but DIFFERENT gate_run_id produce only ONE feedback row', async () => {
    const sb = mockSupabaseStateful();

    const first = await recordCorrectiveFinding(sb, {
      ...baseFinding,
      gate_run_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(first.recorded).toBe(true);

    const second = await recordCorrectiveFinding(sb, {
      ...baseFinding,
      gate_run_id: '22222222-2222-2222-2222-222222222222', // simulates a fresh scoring pass
    });
    expect(second.recorded).toBe(false);
    expect(second.feedbackId).toBe(first.feedbackId);
    expect(second.dedupHash).toBe(first.dedupHash);

    expect(sb.rowCount()).toBe(1);
  });

  it('a genuinely different tier (e.g. gap-closure -> escalation) still mints a fresh row', async () => {
    const sb = mockSupabaseStateful();

    await recordCorrectiveFinding(sb, { ...baseFinding, gate_run_id: 'run-a', tier: 'gap-closure', score: 72 });
    const worse = await recordCorrectiveFinding(sb, { ...baseFinding, gate_run_id: 'run-b', tier: 'escalation', score: 55 });

    expect(worse.recorded).toBe(true);
    expect(sb.rowCount()).toBe(2);
  });

  // Regression pin (caught by a TESTING sub-agent's prospective review before merge):
  // callers that do NOT opt into dedup_scope:'natural_key' -- lib/venture-deploy/promote.js
  // and lib/apa/standing-assessment-round.mjs (x2) -- pass source_sd_id=null with
  // empty/constant dimensions and rely on gate_run_id as their ONLY discriminator.
  // Dropping gate_run_id from the hash for them would collapse every distinct event
  // (every venture, every deploy) onto one suppressed row -- silently re-introducing
  // a defect an earlier adversarial review already caught and fixed. These tests pin
  // that the DEFAULT scope still discriminates on gate_run_id.
  it('DEFAULT scope (no dedup_scope) still discriminates by gate_run_id when source_sd_id is null and dimensions are empty (promote.js shape)', async () => {
    const sb = mockSupabaseStateful();
    const deployFinding = {
      source_sd_id: null,
      source_gate: 'deploy_pipeline',
      corrective_class: 'cli_validation',
      dimensions: [],
      tier: 'gap-closure',
      title: 'DEPLOY_UNREPRODUCIBLE: build failed for venture v-1',
      description: 'error',
    };

    const first = await recordCorrectiveFinding(sb, { ...deployFinding, gate_run_id: 'deploy-1' });
    const second = await recordCorrectiveFinding(sb, { ...deployFinding, gate_run_id: 'deploy-2' });

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(true); // NOT deduped -- a different venture/deploy
    expect(sb.rowCount()).toBe(2);
  });

  it('DEFAULT scope still discriminates by gate_run_id when dimensions are a constant string (APA standing-probe shape)', async () => {
    const sb = mockSupabaseStateful();
    const apaFinding = {
      source_sd_id: null,
      source_gate: 'apa_standing_probe',
      corrective_class: 'apa_probe_infra',
      dimensions: ['APA-ACQUISITION'],
      tier: 'minor',
      title: 'APA standing probe: acquisition failed',
      description: 'acquireLiveInstance failed',
    };

    const ventureA = await recordCorrectiveFinding(sb, { ...apaFinding, gate_run_id: 'row-venture-a' });
    const ventureB = await recordCorrectiveFinding(sb, { ...apaFinding, gate_run_id: 'row-venture-b' });

    expect(ventureA.recorded).toBe(true);
    expect(ventureB.recorded).toBe(true); // NOT deduped -- a different venture
    expect(sb.rowCount()).toBe(2);
  });

  it('a resolved finding does not permanently suppress a genuine later regression of the same natural key', async () => {
    const sb = mockSupabaseStateful();

    const first = await recordCorrectiveFinding(sb, { ...baseFinding, gate_run_id: 'run-a' });
    expect(first.recorded).toBe(true);
    sb.resolve(first.feedbackId);

    const regression = await recordCorrectiveFinding(sb, { ...baseFinding, gate_run_id: 'run-b' });
    expect(regression.recorded).toBe(true); // the OLD resolved row must not suppress this
    expect(sb.rowCount()).toBe(2);
  });
});
