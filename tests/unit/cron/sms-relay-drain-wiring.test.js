/**
 * SD-LEO-FEAT-WIRE-DRAINSMSRELAYSTAGING-SCHEDULED-001 — the drain must NAME its dispatcher
 * (pattern PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001). The defect class this retires:
 * drainSmsRelayStaging() sat with ZERO production call sites (armed function, no dispatcher).
 * These static assertions fail CI the moment the wiring decays (workflow → runner → drain fn);
 * the enable-gate assertions pin FR-2. No network or DB required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Pure static/unit test — never reaches a live client. Mock guards the transitive supabase require.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('unit test must not reach a live supabase client'); },
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'sms-relay-drain-cron.yml');
const RUNNER = path.join(repoRoot, 'scripts', 'sms-relay-drain.cjs');
const require = createRequire(import.meta.url);

describe('SMS relay-drain machinery names its dispatcher', () => {
  it('the cron workflow exists, is scheduled, and its run step invokes the runner', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml, 'workflow no longer runs scripts/sms-relay-drain.cjs').toMatch(/node\s+scripts\/sms-relay-drain\.cjs/);
    expect(yml, 'workflow lost its schedule trigger').toMatch(/schedule:/);
  });

  it('the runner exists and dispatches drainSmsRelayStaging from lib/chairman/sms-bridge.js', () => {
    expect(fs.existsSync(RUNNER), `missing runner: ${RUNNER}`).toBe(true);
    const src = fs.readFileSync(RUNNER, 'utf8');
    expect(src, 'runner no longer references lib/chairman/sms-bridge.js').toMatch(
      /import\(\s*['"][./]*\.\.\/lib\/chairman\/sms-bridge\.js['"]\s*\)/,
    );
    expect(src, 'runner no longer calls drainSmsRelayStaging').toMatch(/drainSmsRelayStaging\s*\(/);
  });
});

describe('sms-relay-drain FR-2 enable gate', () => {
  const saved = process.env.SMS_RELAY_DRAIN_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.SMS_RELAY_DRAIN_ENABLED;
    else process.env.SMS_RELAY_DRAIN_ENABLED = saved;
  });
  const { isDrainEnabled } = require('../../../scripts/sms-relay-drain.cjs');

  it('is inert (false) when the flag is unset or falsey — stays pre-cutover no-op', () => {
    delete process.env.SMS_RELAY_DRAIN_ENABLED;
    expect(isDrainEnabled()).toBe(false);
    for (const v of ['false', '0', 'off', '']) {
      process.env.SMS_RELAY_DRAIN_ENABLED = v;
      expect(isDrainEnabled(), `expected "${v}" => inert`).toBe(false);
    }
  });

  it('is enabled (true) only for explicit truthy flag values', () => {
    for (const v of ['1', 'true', 'on', 'yes', 'TRUE']) {
      process.env.SMS_RELAY_DRAIN_ENABLED = v;
      expect(isDrainEnabled(), `expected "${v}" => enabled`).toBe(true);
    }
  });
});
