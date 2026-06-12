/**
 * Static guard: no cross-sibling imports between handoff gate executors.
 * SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001 (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001)
 *
 * The writer/consumer asymmetry class: cross-gate policy (helpers, sentinels,
 * threshold rules) defined inside ONE executor's gate file and imported by a
 * SIBLING executor (e.g. plan-to-lead gates dynamic-importing
 * lead-to-plan/gates/vision-score.js). Shared policy belongs in lib/ (e.g.
 * lib/handoff/threshold-resolver.js) so sibling gates can never drift.
 *
 * Intentional, documented asymmetric consumption can opt out with an inline
 * pragma on the import line's preceding line: // sibling-import-allowed: <why>
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXECUTORS_DIR = path.resolve(__dirname, '../../scripts/modules/handoff/executors');

// Matches both static and dynamic imports whose path climbs out of the current
// executor into a sibling executor directory: ../../<executor>/gates/...
const CROSS_SIBLING = /(?:from\s*|import\s*\(\s*)['"](\.\.\/)+(?:[\w-]+)\/gates\//;

export function findViolations(executorsDir = EXECUTORS_DIR) {
  const violations = [];
  for (const executor of fs.readdirSync(executorsDir)) {
    const gatesDir = path.join(executorsDir, executor, 'gates');
    if (!fs.existsSync(gatesDir) || !fs.statSync(gatesDir).isDirectory()) continue;
    for (const file of fs.readdirSync(gatesDir).filter((f) => f.endsWith('.js'))) {
      const lines = fs.readFileSync(path.join(gatesDir, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!CROSS_SIBLING.test(line)) return;
        // Resolve the import target: only flag if it lands in a DIFFERENT executor.
        const m = line.match(/['"]((?:\.\.\/)+[^'"]+)['"]/);
        if (!m) return;
        const resolved = path.resolve(gatesDir, m[1]);
        const inExecutors = resolved.startsWith(executorsDir + path.sep);
        const sameExecutor = resolved.startsWith(path.join(executorsDir, executor) + path.sep);
        if (!inExecutors || sameExecutor) return;
        if ((lines[i - 1] || '').includes('sibling-import-allowed:')) return;
        violations.push(`${executor}/gates/${file}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  return violations;
}

describe('gate executor sibling-import guard', () => {
  it('no gate file imports from a sibling executor directory', () => {
    const violations = findViolations();
    expect(violations, `Cross-sibling gate imports found — move shared policy to lib/ (e.g. lib/handoff/threshold-resolver.js):\n${violations.join('\n')}`).toEqual([]);
  });

  it('detects a seeded cross-sibling import (proves the regex bites)', () => {
    const seededStatic = 'import { x } from \'../../lead-to-plan/gates/vision-score.js\';';
    const seededDynamic = 'const { y } = await import(\'../../lead-to-plan/gates/vision-score.js\');';
    const sameExecutor = 'import { z } from \'./gate-reason-codes.js\';';
    const libImport = 'import { t } from \'../../../../../../lib/handoff/threshold-resolver.js\';';
    expect(CROSS_SIBLING.test(seededStatic)).toBe(true);
    expect(CROSS_SIBLING.test(seededDynamic)).toBe(true);
    expect(CROSS_SIBLING.test(sameExecutor)).toBe(false);
    expect(CROSS_SIBLING.test(libImport)).toBe(false);
  });
});
