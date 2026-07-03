// SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001 FR-1: create-quick-fix.js re-verifies a feedback
// row's premise before filing a QF. Static-pattern assertions, same convention as
// create-quick-fix-dedup-gate.test.js (avoids mocking the full Supabase chain).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');

describe('SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001: create-quick-fix.js STALE_PREMISE gate runs before INSERT', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  const QF_INSERT_RE = /\.from\(\s*['"]quick_fixes['"]\s*\)\s*\r?\n?\s*\.insert\(/;
  const STALE_GATE_RE = /\[STALE_PREMISE\]\s+feedback/;
  const FORCE_LIVENESS_FLAG_RE = /arg\s*===\s*['"]--force-liveness['"]/;

  it('imports the shared checkFeedbackPremiseLiveness helper (reuse, not reinvention)', () => {
    // Permissive on co-imported names (e.g. logForceLivenessOverride) — the assertion is
    // that checkFeedbackPremiseLiveness is reused from the shared adapter, not reinvented.
    expect(code).toMatch(/import\s*\{[^}]*\bcheckFeedbackPremiseLiveness\b[^}]*\}\s*from\s*['"].*feedback-premise-adapter\.js['"]/);
  });

  it('[STALE_PREMISE] marker is present and precedes the quick_fixes insert', () => {
    const gateM = code.match(STALE_GATE_RE);
    const insertM = code.match(QF_INSERT_RE);
    expect(gateM?.index).toBeGreaterThanOrEqual(0);
    expect(insertM?.index).toBeGreaterThanOrEqual(0);
    expect(gateM.index).toBeLessThan(insertM.index);
  });

  it('--force-liveness argv flag is parsed and requires a non-empty reason', () => {
    expect(code).toMatch(FORCE_LIVENESS_FLAG_RE);
    expect(code).toMatch(/options\.forceLiveness/);
    expect(code).toMatch(/--force-liveness requires a non-empty reason/);
  });

  it('the liveness gate only runs inside the --feedback-id branch (fetches by resolvedFeedbackIds)', () => {
    const gateM = code.match(STALE_GATE_RE);
    const idsM = code.match(/resolvedFeedbackIds/g) || [];
    expect(gateM?.index).toBeGreaterThanOrEqual(0);
    // resolvedFeedbackIds is referenced at least twice: the initial resolve + the liveness re-fetch.
    expect(idsM.length).toBeGreaterThanOrEqual(2);
  });
});
