/**
 * Vitest coverage for per-finding SD generator (SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C).
 */

import { describe, it, expect } from 'vitest';
import {
  TIER_MAP,
  resolveTier,
  tierToSdType,
  findExistingRemediation,
  buildCreateSdArgs,
  generateRemediationSD,
  generateBatch,
} from '../../../../lib/eva/quality-findings/sd-generator.js';
import { computeFindingHash, FINDING_CATEGORIES } from '../../../../lib/eva/quality-findings/finding-shape.js';

const validFinding = (overrides = {}) => ({
  venture_id: 'v-test-001',
  stage_number: 20,
  finding_category: 'lint',
  severity: 'medium',
  finding_hash: computeFindingHash({
    venture_id: 'v-test-001',
    stage_number: 20,
    finding_category: 'lint',
    finding_signature: 'no-unused-vars:src/foo.js:42',
  }),
  evidence_pointer: { file: 'src/foo.js' },
  ...overrides,
});

function makeMockSupabase(existingFindings = new Set()) {
  return {
    from() {
      return {
        select() {
          return {
            filter(_col, _op, val) {
              return {
                limit() {
                  return {
                    maybeSingle: async () => ({
                      data: existingFindings.has(val) ? { sd_key: 'SD-EXISTING-001' } : null,
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('TIER_MAP', () => {
  it('covers all 10 finding categories', () => {
    for (const cat of FINDING_CATEGORIES) {
      expect(TIER_MAP[cat]).toBeDefined();
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(TIER_MAP)).toBe(true);
  });
});

describe('resolveTier', () => {
  it('critical+secrets → Tier 3 (security keyword forces high tier)', () => {
    expect(resolveTier('secrets', 'critical')).toBe(3);
  });

  it('medium+lint → Tier 1 (auto-approve QF)', () => {
    expect(resolveTier('lint', 'medium')).toBe(1);
  });

  it('low+npm_audit → Tier 1', () => {
    expect(resolveTier('npm_audit', 'low')).toBe(1);
  });

  it('uat_signoff always ≥ Tier 2 (chairman-facing)', () => {
    expect(resolveTier('uat_signoff', 'low')).toBe(2);
    expect(resolveTier('uat_signoff', 'medium')).toBe(3);
  });

  it('unknown category defaults to Tier 2', () => {
    expect(resolveTier('invented_category', 'medium')).toBe(2);
  });
});

describe('tierToSdType', () => {
  it('Tier 3 + security categories → security type', () => {
    expect(tierToSdType(3, 'secrets')).toBe('security');
    expect(tierToSdType(3, 'capability')).toBe('security');
  });

  it('Tier 3 + test categories → bugfix', () => {
    expect(tierToSdType(3, 'unit_test')).toBe('bugfix');
    expect(tierToSdType(3, 'e2e_test')).toBe('bugfix');
    expect(tierToSdType(3, 'bug_report')).toBe('bugfix');
  });

  it('Tier 1/2 → fix', () => {
    expect(tierToSdType(1, 'lint')).toBe('fix');
    expect(tierToSdType(2, 'lint')).toBe('fix');
  });
});

describe('findExistingRemediation (idempotency check)', () => {
  it('returns exists=true when finding_hash already linked to an SD', async () => {
    const supabase = makeMockSupabase(new Set(['hash-existing']));
    const r = await findExistingRemediation(supabase, 'hash-existing');
    expect(r.exists).toBe(true);
    expect(r.sd_key).toBe('SD-EXISTING-001');
  });

  it('returns exists=false when finding_hash is novel', async () => {
    const supabase = makeMockSupabase(new Set());
    const r = await findExistingRemediation(supabase, 'hash-novel');
    expect(r.exists).toBe(false);
  });

  it('rejects missing args', async () => {
    const supabase = makeMockSupabase();
    await expect(findExistingRemediation(null, 'h')).rejects.toThrow();
    await expect(findExistingRemediation(supabase, null)).rejects.toThrow();
  });
});

describe('buildCreateSdArgs', () => {
  it('builds args + metadata for a valid finding', () => {
    const r = buildCreateSdArgs(validFinding());
    expect(r.tier).toBe(1);
    expect(r.type).toBe('fix');
    expect(r.args[0]).toBe('LEO');
    expect(r.args[1]).toBe('fix');
    expect(r.args[2]).toMatch(/Remediation: lint/);
    expect(r.metadata.parent_finding_hash).toBe(validFinding().finding_hash);
    expect(r.metadata.parent_orchestrator).toBe('SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001');
    expect(r.metadata.source_stage_number).toBe(20);
  });

  it('routes critical+secrets to Tier 3 + security type', () => {
    const r = buildCreateSdArgs(validFinding({ finding_category: 'secrets', severity: 'critical' }));
    expect(r.tier).toBe(3);
    expect(r.type).toBe('security');
  });

  it('rejects invalid finding shape', () => {
    expect(() => buildCreateSdArgs(validFinding({ finding_category: 'invalid' }))).toThrow();
  });
});

describe('generateRemediationSD (dryRun)', () => {
  it('skips creation if existing remediation found (idempotency)', async () => {
    const f = validFinding();
    const supabase = makeMockSupabase(new Set([f.finding_hash]));
    const r = await generateRemediationSD({ supabase, finding: f });
    expect(r.created).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('duplicate_finding_hash');
    expect(r.sd_key).toBe('SD-EXISTING-001');
  });

  it('returns dry-run result without spawning leo-create-sd.js', async () => {
    const supabase = makeMockSupabase();
    const r = await generateRemediationSD({ supabase, finding: validFinding(), dryRun: true });
    expect(r.created).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('dry_run');
    expect(r.tier).toBe(1);
    expect(r.type).toBe('fix');
  });
});

describe('generateBatch', () => {
  it('aggregates created + skipped + errors per finding', async () => {
    const f1 = validFinding({ finding_category: 'lint' });
    const f2 = validFinding({ finding_category: 'secrets', severity: 'critical' });
    const f3 = validFinding({ finding_category: 'invalid_category' });
    const supabase = makeMockSupabase();
    const r = await generateBatch({ supabase, findings: [f1, f2, f3], dryRun: true });
    expect(r.skipped.length).toBe(2);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].error).toMatch(/Invalid finding/);
  });

  it('handles empty findings array', async () => {
    const supabase = makeMockSupabase();
    const r = await generateBatch({ supabase, findings: [], dryRun: true });
    expect(r.created).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});
