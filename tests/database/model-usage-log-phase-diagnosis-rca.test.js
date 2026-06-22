/**
 * model_usage_log_phase_check DIAGNOSIS/RCA expansion regression test
 * SD-REFILL-00WV9A45
 *
 * Issue: lib/llm/usage-logger.js writes caller-supplied phase RAW
 *   (`phase: phase || 'UNKNOWN'`, NO normalizePhase), so a github-agent/rca-agent
 *   diagnostic run inserting phase='DIAGNOSIS' violated model_usage_log_phase_check
 *   (23514) and the non-blocking logger silently dropped the row → telemetry hole.
 *
 * Fix (6th expansion of this CHECK):
 *   - database/migrations/20260622_fix_model_usage_log_phase_diagnosis_rca.sql adds
 *     'DIAGNOSIS' and 'RCA' to the constraint.
 *   - scripts/track-model-usage.js ALLOWED_PHASES mirrors them so normalizePhase()
 *     passes them through (tracked distinctly) instead of coercing to UNKNOWN.
 *
 * This test is intentionally LIVE-PROBE-FREE: the constraint migration is applied by
 * the pipeline/chairman (MCP apply_migration is read-only in worker sessions), so a
 * live INSERT probe of 'DIAGNOSIS' would fail until the migration lands. Instead it
 * pins (1) the pure normalizePhase pass-through and (2) the migration + ALLOWED_PHASES
 * source contract — both revert-proof without depending on deploy timing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePhase } from '../../scripts/track-model-usage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../scripts/track-model-usage.js'), 'utf8');
const MIGRATION = readFileSync(
  resolve(__dirname, '../../database/migrations/20260622_fix_model_usage_log_phase_diagnosis_rca.sql'),
  'utf8'
);

describe('normalizePhase() passes DIAGNOSIS/RCA through (SD-REFILL-00WV9A45)', () => {
  it("treats 'DIAGNOSIS' as an allowed phase (no longer coerced to UNKNOWN)", () => {
    expect(normalizePhase('DIAGNOSIS')).toBe('DIAGNOSIS');
  });
  it("treats 'RCA' as an allowed phase", () => {
    expect(normalizePhase('RCA')).toBe('RCA');
  });
  it('still falls back to UNKNOWN for genuinely unrecognized phases (no over-widening)', () => {
    expect(normalizePhase('TOTALLY_BOGUS')).toBe('UNKNOWN');
    expect(normalizePhase(undefined)).toBe('UNKNOWN');
  });
  it('still maps the canonical synonym PLAN_VERIFICATION → PLAN_VERIFY (no regression)', () => {
    expect(normalizePhase('PLAN_VERIFICATION')).toBe('PLAN_VERIFY');
  });
});

describe('source contract: constraint + ALLOWED_PHASES carry DIAGNOSIS/RCA', () => {
  it('the migration adds both DIAGNOSIS and RCA to model_usage_log_phase_check', () => {
    expect(MIGRATION).toMatch(/model_usage_log_phase_check/);
    expect(MIGRATION).toMatch(/'DIAGNOSIS'/);
    expect(MIGRATION).toMatch(/'RCA'/);
    // The new values are inside the ADD CONSTRAINT ... CHECK (...) block.
    const addIdx = MIGRATION.indexOf('ADD CONSTRAINT');
    expect(addIdx).toBeGreaterThan(-1);
    expect(MIGRATION.indexOf("'DIAGNOSIS'", addIdx)).toBeGreaterThan(addIdx);
  });
  it('ALLOWED_PHASES in track-model-usage.js mirrors the two new values', () => {
    expect(SRC).toMatch(/'DIAGNOSIS',\s*'RCA'/);
  });
});
