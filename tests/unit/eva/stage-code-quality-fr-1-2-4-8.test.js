/**
 * Vitest coverage for SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-1, FR-2, FR-4, FR-8.
 * FR-7 mandates these tests cover dispatch wiring, sync sd-generator, BLOCKED
 * verdict on missing precondition, and target_application derivation.
 *
 * @module tests/unit/eva/stage-code-quality-fr-1-2-4-8
 */

import { describe, it, expect, beforeEach } from 'vitest';

// FR-1: dispatch + canonical analyzer wiring
import { getAnalysisStep } from '../../../lib/eva/stage-templates/analysis-steps/index.js';
import { analyzeStage20CodeQuality } from '../../../lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js';

// FR-2: writer sync sd-generator path
import { writeFinding, writeFindingsBatch, __fr2 } from '../../../lib/eva/quality-findings/writer.js';
import { computeFindingHash } from '../../../lib/eva/quality-findings/finding-shape.js';

// FR-8: target_application derivation
import { deriveTargetApplication } from '../../../lib/eva/quality-findings/sd-generator.js';

// ─────────────────────────────────────────────────────────────────────────────
// FR-1: dispatch table maps stage 20 to canonical Code Quality Gate analyzer
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-1 — analysis-steps dispatcher routes stage 20 to canonical analyzer', () => {
  it('getAnalysisStep(20) returns the canonical analyzeStage20CodeQuality function', async () => {
    const fn = await getAnalysisStep(20);
    expect(typeof fn).toBe('function');
    expect(fn).toBe(analyzeStage20CodeQuality);
  });

  it('getAnalysisStep(20) does NOT return the legacy build-execution analyzer', async () => {
    const fn = await getAnalysisStep(20);
    // Legacy module exports `analyzeStage20`; canonical exports `analyzeStage20CodeQuality`.
    // We assert the function name is the canonical one, defensively.
    expect(fn.name).toBe('analyzeStage20CodeQuality');
  });

  it('canonical analyzer is callable with no-supabase / no-venture (returns BLOCKED report)', async () => {
    // No supabase + no stage19Data → no repo URL → buildNoRepoReport() path.
    const result = await analyzeStage20CodeQuality({
      stage19Data: null,
      ventureName: 'TestVenture',
      ventureId: null,
      supabase: null,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].check).toBe('precondition');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-4: missing-github-repo emits verdict=BLOCKED (not FAIL)
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-4 — missing precondition emits verdict=BLOCKED', () => {
  it('verdict is BLOCKED, not FAIL, when no github_repo registered', async () => {
    const result = await analyzeStage20CodeQuality({
      stage19Data: null,
      ventureName: 'NoRepoVenture',
      ventureId: 'abc-123',
      supabase: null, // signals "cannot look up venture_resources"
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.verdict).not.toBe('FAIL');
    expect(result.blocked_reason).toBe('missing_github_repo_precondition');
  });

  it('BLOCKED report carries finding_category=precondition (NOT repo_access)', async () => {
    const result = await analyzeStage20CodeQuality({
      stage19Data: null,
      ventureName: 'NoRepoVenture2',
      ventureId: null,
      supabase: null,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(result.findings[0].check).toBe('precondition');
    // BLOCKED finding still surfaces severity=critical so operators see it,
    // but advance-writer must distinguish via verdict (BLOCKED vs FAIL).
    expect(result.findings[0].severity).toBe('critical');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-2: writer.js synchronously invokes sd-generator for high/critical findings
// ─────────────────────────────────────────────────────────────────────────────

function makeMockSupabaseRecording() {
  const rows = new Map(); // venture_id|finding_hash → row
  const calls = [];

  const noopFilterChain = () => ({
    eq() { return this; },
    in() { return this; },
    is() { return Promise.resolve({ error: null, count: 0 }); },
    select() { return this; },
    order() { return this; },
    limit() { return this; },
    single() { return Promise.resolve({ data: null, error: null }); },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
  });

  const builderFor = (table) => ({
    upsert(payload, opts) {
      calls.push({ op: 'upsert', table, payload, opts });
      const key = `${payload.venture_id}|${payload.finding_hash}`;
      const id = rows.has(key) ? rows.get(key).id : `mock-${rows.size + 1}`;
      rows.set(key, { ...payload, id });
      return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
    },
    insert(payload) {
      calls.push({ op: 'insert', table, payload });
      // sd-generator inserts → strategic_directives_v2 / audit_log;
      // simulate an SD-row return so insertDraftRemediationSd can resolve.
      const id = `mock-sd-${calls.length}`;
      const sd_key = payload?.sd_key || `MOCK-SD-${calls.length}`;
      return { select: () => ({ single: async () => ({ data: { id, sd_key }, error: null }) }) };
    },
    update(payload) {
      calls.push({ op: 'update', table, payload });
      return noopFilterChain();
    },
    select() { return noopFilterChain(); },
    eq() { return noopFilterChain(); },
    in() { return noopFilterChain(); },
  });

  return {
    from(table) { return builderFor(table); },
    _rows: rows,
    _calls: calls,
  };
}

const validFinding = (overrides = {}) => ({
  venture_id: 'venture-x',
  stage_number: 20,
  finding_category: 'lint',
  severity: 'medium',
  finding_hash: computeFindingHash({
    venture_id: 'venture-x',
    stage_number: 20,
    finding_category: 'lint',
    finding_signature: 'no-unused-vars:src/foo.js:42',
  }),
  evidence_pointer: { file: 'src/foo.js' },
  ...overrides,
});

describe('FR-2 — sync sd-generator path', () => {
  let supabase;
  beforeEach(() => {
    supabase = makeMockSupabaseRecording();
    // Force kill switch ON regardless of host env.
    delete process.env.LEO_FR_C_SYNC_GENERATION_ENABLED;
  });

  it('severity=medium does NOT invoke sd-generator (severity floor)', async () => {
    const r = await writeFinding(supabase, validFinding({ severity: 'medium' }));
    expect(r.sd_generation?.skipped_reason).toBe('severity_floor');
    expect(r.sd_generation?.generated).toBe(false);
  });

  it('severity=critical invokes sd-generator (severity floor passes)', async () => {
    const r = await writeFinding(supabase, validFinding({
      severity: 'critical',
      finding_hash: computeFindingHash({
        venture_id: 'venture-x',
        stage_number: 20,
        finding_category: 'secrets',
        finding_signature: 'aws-key:src/config.js',
      }),
      finding_category: 'secrets',
    }));
    // Path either generates a fresh SD or falls into dedupe/threw branch — but the floor must NOT skip.
    expect(r.sd_generation?.skipped_reason).not.toBe('severity_floor');
  });

  it('severity=low does NOT invoke sd-generator', async () => {
    const r = await writeFinding(supabase, validFinding({ severity: 'low' }));
    expect(r.sd_generation?.skipped_reason).toBe('severity_floor');
  });

  it('LEO_FR_C_SYNC_GENERATION_ENABLED=off disables sync path even for critical', async () => {
    process.env.LEO_FR_C_SYNC_GENERATION_ENABLED = 'off';
    try {
      const r = await writeFinding(supabase, validFinding({ severity: 'critical', finding_category: 'secrets' }));
      expect(r.sd_generation?.skipped_reason).toBe('kill_switch_off');
    } finally {
      delete process.env.LEO_FR_C_SYNC_GENERATION_ENABLED;
    }
  });

  it('LEO_FR_C_SYNC_GENERATION_ENABLED accepts on/off variants case-insensitively', () => {
    process.env.LEO_FR_C_SYNC_GENERATION_ENABLED = 'OFF';
    expect(__fr2.isSyncSdGenerationEnabled()).toBe(false);
    process.env.LEO_FR_C_SYNC_GENERATION_ENABLED = 'False';
    expect(__fr2.isSyncSdGenerationEnabled()).toBe(false);
    process.env.LEO_FR_C_SYNC_GENERATION_ENABLED = '0';
    expect(__fr2.isSyncSdGenerationEnabled()).toBe(false);
    process.env.LEO_FR_C_SYNC_GENERATION_ENABLED = 'on';
    expect(__fr2.isSyncSdGenerationEnabled()).toBe(true);
    delete process.env.LEO_FR_C_SYNC_GENERATION_ENABLED;
    expect(__fr2.isSyncSdGenerationEnabled()).toBe(true); // default ON
  });

  it('SEVERITIES_REQUIRING_SYNC_SD_GENERATION includes critical and high only', () => {
    expect(__fr2.SEVERITIES_REQUIRING_SYNC_SD_GENERATION.has('critical')).toBe(true);
    expect(__fr2.SEVERITIES_REQUIRING_SYNC_SD_GENERATION.has('high')).toBe(true);
    expect(__fr2.SEVERITIES_REQUIRING_SYNC_SD_GENERATION.has('medium')).toBe(false);
    expect(__fr2.SEVERITIES_REQUIRING_SYNC_SD_GENERATION.has('low')).toBe(false);
    expect(__fr2.SEVERITIES_REQUIRING_SYNC_SD_GENERATION.has('info')).toBe(false);
  });

  it('writeFindingsBatch returns sd_generated and sd_dedupe_hit counters', async () => {
    const r = await writeFindingsBatch(supabase, [
      validFinding({ severity: 'medium' }),
      validFinding({
        severity: 'critical',
        finding_category: 'secrets',
        finding_hash: computeFindingHash({
          venture_id: 'venture-x',
          stage_number: 20,
          finding_category: 'secrets',
          finding_signature: 'aws-key:src/y.js',
        }),
      }),
    ]);
    expect(r).toHaveProperty('sd_generated');
    expect(r).toHaveProperty('sd_dedupe_hit');
    expect(typeof r.sd_generated).toBe('number');
    expect(r.written).toBeGreaterThanOrEqual(1);
  });

  it('finding without venture_id or finding_category skips sync path with reason', async () => {
    const r = await __fr2.maybeGenerateSdForFinding(supabase, { severity: 'critical' }, 'mock-id');
    expect(r.skipped_reason).toBe('missing_required_fields');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-8: target_application derivation
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-8 — sd-generator derives target_application from venture context', () => {
  it('explicit sampleFinding.target_application=EHG is honored', async () => {
    const t = await deriveTargetApplication(null, 'venture-1', { target_application: 'EHG' });
    expect(t).toBe('EHG');
  });

  it('explicit sampleFinding.target_application=EHG_Engineer is honored', async () => {
    const t = await deriveTargetApplication(null, 'venture-1', { target_application: 'EHG_Engineer' });
    expect(t).toBe('EHG_Engineer');
  });

  it('invalid explicit target_application falls through to default', async () => {
    const t = await deriveTargetApplication(null, 'venture-1', { target_application: 'Mars' });
    expect(t).toBe('EHG');
  });

  it('venture metadata.stage_zero.target_platform=ehg_engineer maps to EHG_Engineer', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { metadata: { stage_zero: { target_platform: 'ehg_engineer' } } },
              error: null,
            }),
          }),
        }),
      }),
    };
    const t = await deriveTargetApplication(supabase, 'venture-1', {});
    expect(t).toBe('EHG_Engineer');
  });

  it('venture metadata.stage_zero.target_platform=platform maps to EHG', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { metadata: { stage_zero: { target_platform: 'platform' } } },
              error: null,
            }),
          }),
        }),
      }),
    };
    const t = await deriveTargetApplication(supabase, 'venture-1', {});
    expect(t).toBe('EHG');
  });

  it('no venture metadata → default EHG (NOT EHG_Engineer hardcode)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    const t = await deriveTargetApplication(supabase, 'venture-1', {});
    expect(t).toBe('EHG');
  });

  it('null supabase + no explicit override → default EHG', async () => {
    const t = await deriveTargetApplication(null, 'venture-1', {});
    expect(t).toBe('EHG');
  });

  it('lookup error swallowed; falls through to default EHG', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => { throw new Error('connection lost'); },
          }),
        }),
      }),
    };
    const t = await deriveTargetApplication(supabase, 'venture-1', {});
    expect(t).toBe('EHG');
  });
});
