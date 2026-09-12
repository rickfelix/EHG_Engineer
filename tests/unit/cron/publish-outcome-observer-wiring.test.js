/**
 * SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 (FR-4) — static wiring proof, pattern
 * PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001 (exemplar
 * tests/unit/cron/venture-ops-actuals-wiring.test.js). These assertions fail CI the
 * moment any edge of workflow -> sweep script -> observer/recorder -> armed-registration
 * decays. No network or DB required.
 *
 * Also proves FR-1's "never called from publish() itself" constraint: publisher/index.js
 * must not import the observer module.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'publish-outcome-observer-cron.yml');
const SWEEP = path.join(repoRoot, 'scripts', 'cron', 'publish-outcome-observer.mjs');
const PUBLISHER_INDEX = path.join(repoRoot, 'lib', 'marketing', 'publisher', 'index.js');

describe('publish-outcome-observer machinery names its dispatcher', () => {
  it('the cron workflow exists and its run step invokes the observer script', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml, 'workflow no longer references scripts/cron/publish-outcome-observer.mjs').toMatch(
      /node\s+scripts\/cron\/publish-outcome-observer\.mjs\s+--once/
    );
    expect(yml, 'workflow lost its schedule trigger').toMatch(/schedule:/);
  });

  it('the observer script imports observeOutcome and recordPublishOutcome', () => {
    expect(fs.existsSync(SWEEP), `missing observer script: ${SWEEP}`).toBe(true);
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src, 'observer no longer imports observeOutcome').toMatch(
      /import\s*\{[^}]*observeOutcome[^}]*\}\s*from\s*['"][./]*\.\.\/\.\.\/lib\/marketing\/observer\/observe-outcome\.js['"]/
    );
    expect(src, 'observer no longer imports recordPublishOutcome').toMatch(
      /import\s*\{[^}]*recordPublishOutcome[^}]*\}\s*from\s*['"][./]*\.\.\/\.\.\/lib\/marketing\/autonomy-gate\.js['"]/
    );
  });

  it('the observer registers ARMED machinery with an activation trigger naming the workflow file', () => {
    const src = fs.readFileSync(SWEEP, 'utf8');
    expect(src, 'observer no longer calls registerArmedMachinery').toMatch(/registerArmedMachinery/);
    expect(src, 'ACTIVATION_TRIGGER no longer names the cron workflow').toMatch(
      /ACTIVATION_TRIGGER\s*=\s*['"]\.github\/workflows\/publish-outcome-observer-cron\.yml['"]/
    );
    expect(src, 'observer no longer stamps liveness via stampLastFired').toMatch(/stampLastFired/);
  });

  // FR-1's own rule (autonomy-gate.js docstring): recordPublishOutcome must be called
  // from a downstream observation step, NEVER from publish() itself. Comments legitimately
  // MENTION recordPublishOutcome (documenting the constraint) without violating it, so
  // strip line comments before checking for an actual import or invocation.
  it('publisher/index.js (publish()) never imports the observer module or invokes recordPublishOutcome as a caller of its own', () => {
    const src = fs.readFileSync(PUBLISHER_INDEX, 'utf8');
    const withoutLineComments = src
      .split('\n')
      .map(line => line.replace(/\/\/.*$/, ''))
      .join('\n');

    expect(src, 'publish() must never import lib/marketing/observer/observe-outcome.js').not.toMatch(
      /from\s*['"][^'"]*observer\/observe-outcome\.js['"]/
    );
    expect(withoutLineComments, 'publish() must never import recordPublishOutcome').not.toMatch(
      /import\s*\{[^}]*recordPublishOutcome[^}]*\}/
    );
    expect(withoutLineComments, 'publish() must never invoke recordPublishOutcome(...) directly').not.toMatch(
      /\brecordPublishOutcome\s*\(/
    );
  });
});
