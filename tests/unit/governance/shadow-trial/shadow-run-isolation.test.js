/**
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C (TS-4) — static isolation witness
 * for the shadow-run engine core, reusing golden-reference-isolation's scanContent
 * primitive with a C-SPECIFIC allowlist (VALIDATION binding condition 3: the engine
 * legitimately imports pure repo modules, so the golden-reference builtins-only law
 * does not apply; instead the witness pins EXACTLY which imports are permitted).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanContent } from '../../../../lib/governance/golden-reference-isolation.js';

const ENGINE = resolve(process.cwd(), 'lib/governance/shadow-trial/shadow-run.mjs');
const FIXTURE = resolve(process.cwd(), 'tests/fixtures/shadow-trial/planted-violation.mjs');

/**
 * The engine core's permitted import surface — pure modules only. Anything else
 * (supabase, chairman writers, fs, proposal-writer, node:*) is a violation.
 */
const ENGINE_ALLOWED_SPECIFIERS = new Set([
  '../../loop-governance/closure-engine.js',
  '../../eval/eval-set-fixtures.mjs',
]);

/**
 * C-specific STRICT classifier: every literal import specifier outside the
 * allowlist is a violation — including npm packages the golden-reference
 * ALLOWED_NPM would admit (supabase is legal in golden references but NEVER in
 * the shadow-run engine core). scanContent still contributes its fail-closed
 * non-literal-import detection.
 */
const IMPORT_SPEC = /(?:import\s[^'"]*from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
function engineViolations(content, filePath) {
  const violations = scanContent(content, filePath).filter((v) => v.kind === 'violation:non_literal_import');
  IMPORT_SPEC.lastIndex = 0;
  let m;
  while ((m = IMPORT_SPEC.exec(content)) !== null) {
    if (!ENGINE_ALLOWED_SPECIFIERS.has(m[1])) violations.push({ file: filePath, specifier: m[1], kind: 'violation:outside_engine_allowlist' });
  }
  return violations;
}

describe('shadow-run isolation witness (TS-4)', () => {
  it('the engine core has ZERO non-allowlisted imports', () => {
    const violations = engineViolations(readFileSync(ENGINE, 'utf-8'), 'shadow-run.mjs');
    expect(violations).toEqual([]);
  });

  it('the engine core imports exactly the two permitted pure modules (allowlist is tight)', () => {
    const content = readFileSync(ENGINE, 'utf-8');
    for (const spec of ENGINE_ALLOWED_SPECIFIERS) {
      expect(content.includes(`'${spec}'`), spec).toBe(true);
    }
    // No supabase, no chairman writers, no fs, no dynamic import anywhere.
    expect(content).not.toMatch(/@supabase|record-pending-decision|proposal-writer|node:fs|import\(/);
  });

  it('NEGATIVE: the planted-violation fixture IS flagged (witness has teeth)', () => {
    const violations = engineViolations(readFileSync(FIXTURE, 'utf-8'), 'planted-violation.mjs');
    const specifiers = violations.map((v) => v.specifier);
    expect(specifiers).toContain('@supabase/supabase-js');
    expect(specifiers.some((s) => s.includes('record-pending-decision'))).toBe(true);
  });
});
