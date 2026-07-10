// SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001 FR-1: leo-create-sd.js --from-feedback re-verifies
// a feedback row's premise before materializing an SD. createFromFeedback() is not
// exported (module-level supabase singleton, matching the file's existing convention —
// see premise-liveness.test.js which tests the sibling --from-proposal path the same way
// via ingestProposalObject rather than by mocking createSD internals), so this is a
// static-pattern assertion, mirroring create-quick-fix-liveness-gate.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// SD-ARCH-HOTSPOT-LEO-CREATE-001: code moved verbatim to lib/sd-creation/source-adapters/feedback.js —
// pin follows the code (the CLI keeps the --force-liveness argv wiring; the lane body lives in the
// adapter, so the pinned source is the concatenation of both files).
const PINNED = [
  path.resolve(__dirname, '../../scripts/leo-create-sd.js'),
  path.resolve(__dirname, '../../lib/sd-creation/source-adapters/feedback.js'),
];

describe('SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001: leo-create-sd.js --from-feedback STALE_PREMISE gate', () => {
  const code = PINNED.map(p => fs.readFileSync(p, 'utf8')).join('\n');

  // createFromFeedback() is one of several functions with a `const sd = await createSD(`
  // call site — scope all ordering assertions to THIS function's body, not the whole file.
  const fnStart = code.indexOf('async function createFromFeedback(');
  const fnEnd = code.indexOf('\nasync function ', fnStart + 1);
  const fnBody = code.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);

  const CREATE_SD_CALL_RE = /const\s+sd\s*=\s*await\s+createSD\(/;
  const STALE_GATE_RE = /\[STALE_PREMISE\]\s+feedback/;
  const GAP008_GUARD_RE = /GAP-008.*duplicate guard/s;

  it('imports the shared checkFeedbackPremiseLiveness helper (reuse, not reinvention)', () => {
    // Permissive on co-imported names (e.g. logForceLivenessOverride) — the assertion is
    // that checkFeedbackPremiseLiveness is reused from the shared adapter, not reinvented.
    expect(code).toMatch(/import\s*\{[^}]*\bcheckFeedbackPremiseLiveness\b[^}]*\}\s*from\s*['"].*feedback-premise-adapter\.js['"]/);
  });

  it('locates createFromFeedback() as a distinct function body', () => {
    expect(fnStart).toBeGreaterThanOrEqual(0);
    expect(fnBody.length).toBeGreaterThan(500);
  });

  it('[STALE_PREMISE] check runs after the GAP-008 duplicate guard and before createSD(), within createFromFeedback()', () => {
    const guardM = fnBody.match(GAP008_GUARD_RE);
    const gateM = fnBody.match(STALE_GATE_RE);
    const createM = fnBody.match(CREATE_SD_CALL_RE);
    expect(guardM?.index).toBeGreaterThanOrEqual(0);
    expect(gateM?.index).toBeGreaterThanOrEqual(0);
    expect(createM?.index).toBeGreaterThanOrEqual(0);
    expect(guardM.index).toBeLessThan(gateM.index);
    expect(gateM.index).toBeLessThan(createM.index);
  });

  it('returns a skipped-stale-premise action without throwing (fail-visible, not fail-crash)', () => {
    expect(code).toMatch(/action:\s*['"]skipped-stale-premise['"]/);
  });

  it('--force-liveness override is wired through --from-feedback argv parsing', () => {
    expect(code).toMatch(/fbForceLivenessIdx/);
    expect(code).toMatch(/forceLiveness:\s*fbForceLivenessIdx/);
  });
});
