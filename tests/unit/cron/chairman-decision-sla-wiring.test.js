/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-4 — registered machinery must name its
 * dispatcher (pattern PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001, exemplar
 * tests/unit/adam/adam-machinery-consumer-invariant.test.js).
 *
 * The defect class this SD retires: chairman-decision-timeout.js + chairman-sla-enforcer.js
 * sat with ZERO production call sites — armed logic, no dispatcher. These static assertions
 * fail CI the moment any edge of the wiring decays: workflow → sweep script → enforcer →
 * armed-registration. No network or DB required.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'chairman-decision-sla-cron.yml');
const SWEEP = path.join(repoRoot, 'scripts', 'cron', 'chairman-decision-sla-sweep.mjs');

describe('chairman-decision SLA machinery names its dispatcher (FR-4)', () => {
  it('the cron workflow exists and its run step invokes the sweep script', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml, 'workflow no longer references scripts/cron/chairman-decision-sla-sweep.mjs').toMatch(
      /node\s+scripts\/cron\/chairman-decision-sla-sweep\.mjs\s+--once/
    );
    expect(yml, 'workflow lost its schedule trigger').toMatch(/schedule:/);
  });

  it('the sweep script exists and imports enforceDecisionSLAs from the SLA enforcer', () => {
    expect(fs.existsSync(SWEEP), `missing sweep script: ${SWEEP}`).toBe(true);
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src, 'sweep no longer imports enforceDecisionSLAs from lib/eva/chairman-sla-enforcer.js').toMatch(
      /import\s*\{[^}]*enforceDecisionSLAs[^}]*\}\s*from\s*['"][./]*\.\.\/\.\.\/lib\/eva\/chairman-sla-enforcer\.js['"]/
    );
    expect(src, 'sweep no longer delivers through the escalateChairmanDecision seam').toMatch(/escalateChairmanDecision/);
  });

  it('the sweep registers ARMED machinery with an activation trigger naming the workflow file', () => {
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src, 'sweep no longer calls registerArmedMachinery').toMatch(/registerArmedMachinery/);
    expect(src, 'ACTIVATION_TRIGGER no longer names the cron workflow').toMatch(
      /ACTIVATION_TRIGGER\s*=\s*['"]\.github\/workflows\/chairman-decision-sla-cron\.yml['"]/
    );
  });

  it('the sweep pins notify-only mode (blockOnViolation:false) — the V02 mass-mutation guard', () => {
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src, 'sweep lost the blockOnViolation:false pin — first live run would mass-set blocking=true').toMatch(
      /blockOnViolation:\s*false/
    );
  });

  it('the superseded timeout module is NOT dispatched by the workflow or the sweep', () => {
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    const src = fs.readFileSync(SWEEP, 'utf8');
    // History comments may NAME the module; what must never exist is an invocation or import.
    expect(/node\s+[^\n]*chairman-decision-timeout/.test(yml), 'workflow must not invoke the superseded timeout module').toBe(false);
    expect(/from\s*['"][^'"]*chairman-decision-timeout/.test(src), 'sweep must not import the superseded timeout module').toBe(false);
  });
});
