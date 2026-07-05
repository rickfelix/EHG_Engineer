/**
 * QF-20260704-434 — analyzeSubAgents() in generate-comprehensive-retrospective.js queried
 * the legacy `sub_agent_executions` table (128 total rows, keyed by prd_id, no sd_id
 * column, unpopulated by current tooling) instead of the actively-written
 * `sub_agent_execution_results` table. Every auto-generated retrospective got
 * sub_agents_involved:[] regardless of real evidence. Discovered while generating the
 * retrospective for SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (16 real rows existed,
 * verified live -- the fix returns them; confidence_score also didn't exist on the
 * correct table, real column is `confidence`).
 *
 * The script's `main()` runs unconditionally at import time (no import.meta.url guard,
 * reads process.argv[2]) so it cannot be safely imported in a test -- static-source-pin
 * pattern, per tests/unit/sd-start-human-action-gate.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '..', '..', 'scripts/generate-comprehensive-retrospective.js'), 'utf8');

describe('QF-20260704-434: analyzeSubAgents queries sub_agent_execution_results', () => {
  const fnStart = src.indexOf('async function analyzeSubAgents');
  const fnBody = src.slice(fnStart, fnStart + 900);

  it('queries the live sub_agent_execution_results table, not the legacy sub_agent_executions', () => {
    expect(fnStart).toBeGreaterThan(0);
    expect(fnBody).toMatch(/\.from\('sub_agent_execution_results'\)/);
    expect(fnBody).not.toMatch(/\.from\('sub_agent_executions'\)/);
  });

  it('reads the real confidence column, not the nonexistent confidence_score', () => {
    expect(fnBody).toMatch(/confidence:\s*e\.confidence\b/);
    expect(fnBody).not.toMatch(/e\.confidence_score/);
  });

  it('still maps sub_agent_code and verdict (consumer shape unchanged)', () => {
    expect(fnBody).toMatch(/agent:\s*e\.sub_agent_code/);
    expect(fnBody).toMatch(/verdict:\s*e\.verdict/);
  });

  it('still filters by sd_id and returns {consulted:0, verdicts:[]} on no rows', () => {
    expect(fnBody).toMatch(/\.eq\('sd_id', sdId\)/);
    expect(fnBody).toMatch(/consulted:\s*0,\s*verdicts:\s*\[\]/);
  });
});
