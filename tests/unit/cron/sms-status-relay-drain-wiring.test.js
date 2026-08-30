/**
 * SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-6 — mirrors tests/unit/cron/sms-relay-drain-wiring.test.js
 * exactly, one drain over. Pins the wiring so drainSmsStatusStaging() cannot decay into an
 * armed-but-never-dispatched function the way the inbound relay's own drain originally did.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Pure static/unit test — never reaches a live client. Mock guards the transitive supabase require.
import { vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('unit test must not reach a live supabase client'); },
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'sms-status-relay-drain-cron.yml');
const RUNNER = path.join(repoRoot, 'scripts', 'sms-status-relay-drain.cjs');
const require = createRequire(import.meta.url);

// TESTING mutation finding M11: a bare regex on the raw file text is satisfied by this file's
// OWN docstring mentioning the function name — it would still "pass" with every real call site
// deleted. Strip comments first so the assertion can only be satisfied by executable code.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('SMS status-drain machinery names its dispatcher', () => {
  it('the cron workflow exists, is scheduled, and its run step invokes the runner', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    // QF-20260830-922: the runner is invoked through run-with-exit-witness.cjs so a native
    // abort at teardown is still observed from the parent side -- assert the target script is
    // still named as the run step's argument, whether direct or wrapped.
    expect(yml, 'workflow no longer references scripts/sms-status-relay-drain.cjs').toMatch(/scripts\/sms-status-relay-drain\.cjs/);
    expect(yml, 'workflow no longer runs its step through node').toMatch(/run:\s*node\s+/);
    expect(yml, 'workflow lost its schedule trigger').toMatch(/schedule:/);
  });

  it('QF-20260830-922: the run step is wrapped through run-with-exit-witness.cjs', () => {
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml, 'run step must invoke scripts/run-with-exit-witness.cjs with the drain script as its argument')
      .toMatch(/run:\s*node\s+scripts\/run-with-exit-witness\.cjs\s+scripts\/sms-status-relay-drain\.cjs/);
  });

  it('the runner exists and dispatches drainSmsStatusStaging from lib/chairman/sms-bridge.js', () => {
    expect(fs.existsSync(RUNNER), `missing runner: ${RUNNER}`).toBe(true);
    const src = stripComments(fs.readFileSync(RUNNER, 'utf8'));
    expect(src, 'runner no longer references lib/chairman/sms-bridge.js').toMatch(
      /import\(\s*['"][./]*\.\.\/lib\/chairman\/sms-bridge\.js['"]\s*\)/,
    );
    expect(src, 'runner no longer calls drainSmsStatusStaging').toMatch(/drainSmsStatusStaging\s*\(/);
  });

  it('the runner stamps standard_loop:sms-status-relay-drain on every successful tick', () => {
    const src = stripComments(fs.readFileSync(RUNNER, 'utf8'));
    expect(src, 'runner no longer references lib/periodic-liveness/stamp-last-fired.js').toMatch(
      /import\(\s*['"][./]*\.\.\/lib\/periodic-liveness\/stamp-last-fired\.js['"]\s*\)/,
    );
    expect(src, 'runner no longer calls stampLastFired').toMatch(/stampLastFired\s*\(/);
    expect(src, "runner uses a different process_key than the registered 'standard_loop:sms-status-relay-drain' row")
      .toMatch(/stampLastFired\(\s*getSupabase\(\)\s*,\s*['"]standard_loop:sms-status-relay-drain['"]\s*\)/);
  });

  it('the recurring-tick exemption entry exists and carries no CAVEAT (compensating control wired from day one)', () => {
    const exemptionsPath = path.join(repoRoot, 'scripts', 'hooks', 'recurring-tick-exemptions.json');
    const exemptions = JSON.parse(fs.readFileSync(exemptionsPath, 'utf8'));
    const entry = exemptions.exempt_scripts.find((e) => e.script === 'sms-status-relay-drain.cjs');
    expect(entry, 'sms-status-relay-drain.cjs exemption entry missing').toBeTruthy();
    expect(entry.reason).not.toMatch(/CAVEAT/);
    expect(entry.reason).not.toMatch(/never leaves UNVERIFIED/);
  });
});

describe('sms-status-relay-drain FR-6 enable gate', () => {
  const saved = process.env.SMS_STATUS_RELAY_DRAIN_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.SMS_STATUS_RELAY_DRAIN_ENABLED;
    else process.env.SMS_STATUS_RELAY_DRAIN_ENABLED = saved;
  });
  const { isDrainEnabled } = require('../../../scripts/sms-status-relay-drain.cjs');

  it('is inert (false) when the flag is unset or falsey — stays pre-cutover no-op', () => {
    delete process.env.SMS_STATUS_RELAY_DRAIN_ENABLED;
    expect(isDrainEnabled()).toBe(false);
    for (const v of ['false', '0', 'off', '']) {
      process.env.SMS_STATUS_RELAY_DRAIN_ENABLED = v;
      expect(isDrainEnabled(), `expected "${v}" => inert`).toBe(false);
    }
  });

  it('is enabled (true) only for explicit truthy flag values', () => {
    for (const v of ['1', 'true', 'on', 'yes', 'TRUE']) {
      process.env.SMS_STATUS_RELAY_DRAIN_ENABLED = v;
      expect(isDrainEnabled(), `expected "${v}" => enabled`).toBe(true);
    }
  });
});

// QF-20260830-603: intermittent native libuv abort (win32 UV_HANDLE_CLOSING) observed even on
// INERT ticks (drain disabled) -- i.e. before getSupabase() is ever reached. Two-sided fix:
// (1) lazy-require supabase-js so the ~100% common inert path never touches it; (2) a local-file
// abnormal-exit witness so a future abort (inert or live) is logged loudly, not silently retried.
describe('QF-20260830-603: lazy supabase-js require', () => {
  it('the top-level module scope never requires @supabase/supabase-js -- only getSupabase() does', () => {
    const src = stripComments(fs.readFileSync(RUNNER, 'utf8'));
    const topLevelRequire = /^const\s*\{\s*createClient\s*\}\s*=\s*require\(\s*['"]@supabase\/supabase-js['"]\s*\)/m;
    expect(src, 'supabase-js require must be lazy (inside getSupabase), not top-level').not.toMatch(topLevelRequire);
    expect(src, 'getSupabase() must still require it when actually called').toMatch(
      /function getSupabase\s*\([^)]*\)\s*\{[\s\S]*?require\(\s*['"]@supabase\/supabase-js['"]\s*\)/,
    );
  });
});

describe('QF-20260830-603: abnormal-exit witness', () => {
  const { TICK_MARKER_PATH, checkAbnormalExitWitness, markTickStarted, markTickFinished } =
    require('../../../scripts/sms-status-relay-drain.cjs');

  afterEach(() => {
    try { fs.rmSync(TICK_MARKER_PATH, { force: true }); } catch { /* best-effort cleanup */ }
  });

  it('markTickStarted writes a marker, markTickFinished removes it -- a clean tick leaves no trace', () => {
    expect(fs.existsSync(TICK_MARKER_PATH)).toBe(false);
    markTickStarted();
    expect(fs.existsSync(TICK_MARKER_PATH)).toBe(true);
    markTickFinished();
    expect(fs.existsSync(TICK_MARKER_PATH)).toBe(false);
  });

  it('a marker left over from a prior (never-finished) tick is detected and logged loudly', () => {
    markTickStarted(); // simulates a tick that started but was killed before markTickFinished()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkAbnormalExitWitness();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/ABNORMAL EXIT DETECTED/));
    warnSpy.mockRestore();
  });

  it('no stale marker means no warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkAbnormalExitWitness();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
