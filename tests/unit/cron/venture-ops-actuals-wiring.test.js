/**
 * SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 FR-2/FR-3/FR-4 — registered machinery must name its
 * dispatcher (pattern PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001, exemplar
 * tests/unit/cron/chairman-decision-sla-wiring.test.js).
 *
 * The defect class this SD retires: ops_product_health / ops_revenue_metrics collectors
 * (lib/eva/services/ops-health-monitor.js, ops-revenue-collector.js) sat fully BUILT with
 * ZERO production call sites — no scheduler ever invoked them, hence 0 rows. These static
 * assertions fail CI the moment any edge of the wiring decays: workflow → sweep script →
 * collectors/probe → armed-registration. No network or DB required.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'venture-ops-actuals-cron.yml');
const SWEEP = path.join(repoRoot, 'scripts', 'cron', 'venture-ops-actuals-sweep.mjs');

describe('venture ops-actuals machinery names its dispatcher', () => {
  it('the cron workflow exists and its run step invokes the sweep script', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml, 'workflow no longer references scripts/cron/venture-ops-actuals-sweep.mjs').toMatch(
      /node\s+scripts\/cron\/venture-ops-actuals-sweep\.mjs\s+--once/
    );
    expect(yml, 'workflow lost its schedule trigger').toMatch(/schedule:/);
  });

  it('the sweep script imports both collectors and the uptime probe', () => {
    expect(fs.existsSync(SWEEP), `missing sweep script: ${SWEEP}`).toBe(true);
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src, 'sweep no longer imports collectProductHealth').toMatch(
      /import\s*\{[^}]*collectProductHealth[^}]*\}\s*from\s*['"][./]*\.\.\/\.\.\/lib\/eva\/services\/ops-health-monitor\.js['"]/
    );
    expect(src, 'sweep no longer imports collectRevenueMetrics').toMatch(
      /import\s*\{[^}]*collectRevenueMetrics[^}]*\}\s*from\s*['"][./]*\.\.\/\.\.\/lib\/eva\/services\/ops-revenue-collector\.js['"]/
    );
    expect(src, 'sweep no longer imports runVentureUptimeProbe').toMatch(
      /import\s*\{[^}]*runVentureUptimeProbe[^}]*\}\s*from\s*['"][./]*\.\.\/\.\.\/lib\/ops\/venture-uptime-probe\.js['"]/
    );
  });

  it('the sweep registers ARMED machinery per job with an activation trigger naming the workflow file', () => {
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src, 'sweep no longer calls registerArmedMachinery').toMatch(/registerArmedMachinery/);
    expect(src, 'ACTIVATION_TRIGGER no longer names the cron workflow').toMatch(
      /ACTIVATION_TRIGGER\s*=\s*['"]\.github\/workflows\/venture-ops-actuals-cron\.yml['"]/
    );
    expect(src, 'each job no longer stamps liveness via stampLastFired').toMatch(/stampLastFired/);
  });

  it('each of the three jobs has a distinct owner-agent (TR-3: not a shared/anonymous cron)', () => {
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src).toMatch(/ops-product-health-collector/);
    expect(src).toMatch(/ops-revenue-metrics-collector/);
    expect(src).toMatch(/venture-uptime-probe/);
  });
});
