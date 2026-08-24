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

describe('SMS status-drain machinery names its dispatcher', () => {
  it('the cron workflow exists, is scheduled, and its run step invokes the runner', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml, 'workflow no longer runs scripts/sms-status-relay-drain.cjs').toMatch(/node\s+scripts\/sms-status-relay-drain\.cjs/);
    expect(yml, 'workflow lost its schedule trigger').toMatch(/schedule:/);
  });

  it('the runner exists and dispatches drainSmsStatusStaging from lib/chairman/sms-bridge.js', () => {
    expect(fs.existsSync(RUNNER), `missing runner: ${RUNNER}`).toBe(true);
    const src = fs.readFileSync(RUNNER, 'utf8');
    expect(src, 'runner no longer references lib/chairman/sms-bridge.js').toMatch(
      /import\(\s*['"][./]*\.\.\/lib\/chairman\/sms-bridge\.js['"]\s*\)/,
    );
    expect(src, 'runner no longer calls drainSmsStatusStaging').toMatch(/drainSmsStatusStaging\s*\(/);
  });

  it('the runner stamps standard_loop:sms-status-relay-drain on every successful tick', () => {
    const src = fs.readFileSync(RUNNER, 'utf8');
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
