/**
 * SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-E (FR-1, FR-2 / AC-3) — the reaper must be DISPATCHED, and
 * dispatching it must not be a no-op. Exemplar: tests/unit/cron/divergence-fence-wiring.test.js.
 *
 * THE DEFECT CLASS THIS PINS: scripts/reap-e2e-liveness-fixtures.mjs was fully built, correct, and
 * NEVER INVOKED — measured at LEAD as 3 references repo-wide (the script, its own predicate test,
 * and a prose comment), zero in package.json, zero across .github/workflows/, and no
 * periodic_process_registry row. Its own tests were its only callers.
 *
 * THE SECOND, SHARPER DEFECT — and the reason this file asserts more than "a workflow exists":
 * THE REAPER DEFAULTS TO DRY RUN. A workflow that schedules it without deciding --apply is green,
 * exit-0, and writes NOTHING, forever. That satisfies "it is scheduled" while leaving the control
 * exactly as inert as it was, which is this SD's own defect reproduced one layer up. So the
 * assertions below pin BOTH halves: that it is dispatched, and that dispatch can actually reap.
 *
 * Pure fs reads — no DB, no network, no clock — and typed as a UNIT test DELIBERATELY:
 * tests/integration/** resolves to ZERO FILES in this repo (the vitest db project is disabled with
 * no designated non-production target), so an integration-typed wiring test would SKIP AND REPORT
 * GREEN, which is the same false assurance this SD exists to abolish.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const WORKFLOW_REL = '.github/workflows/e2e-fixture-reap.yml';
const SCRIPT_REL = 'scripts/reap-e2e-liveness-fixtures.mjs';
const WORKFLOW = path.join(repoRoot, WORKFLOW_REL);
const SCRIPT = path.join(repoRoot, SCRIPT_REL);

const read = (p) => fs.readFileSync(p, 'utf8');

describe('the e2e fixture reaper names its dispatcher', () => {
  it('the reaper script it dispatches actually exists', () => {
    // Guards the inverse mistake: a workflow pointing at a path that was renamed or never landed
    // would still satisfy the regex below while dispatching nothing.
    expect(fs.existsSync(SCRIPT), `missing reaper script: ${SCRIPT}`).toBe(true);
  });

  it('the workflow exists and its run step invokes the reaper', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    expect(read(WORKFLOW)).toMatch(/node\s+scripts\/reap-e2e-liveness-fixtures\.mjs/);
  });

  it('[SCHEDULE] it is on a SCHEDULE, not workflow_dispatch alone', () => {
    const yml = read(WORKFLOW);
    expect(yml, 'a manually-triggered-only workflow does not end dormancy').toMatch(/^\s*schedule:/m);
    expect([...yml.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].length).toBeGreaterThanOrEqual(1);
  });

  it('[NOT-DRY-RUN-FOREVER] some step invokes the reaper with --apply', () => {
    // THE ASSERTION THAT PINS THE REAL FIX. Without it, every other test here passes against a
    // workflow that runs the reaper in its DEFAULT dry-run mode on a schedule — scheduled, green,
    // and writing nothing, which is the defect wearing the fix's clothes.
    const yml = read(WORKFLOW);
    expect(
      yml,
      'the workflow schedules the reaper but never passes --apply: it would be green, exit-0 and zero-write forever'
    ).toMatch(/reap-e2e-liveness-fixtures\.mjs\s+--apply/);
  });

  it('[AUTHORIZATION] the --apply step is gated, because the script says it is not authorized', () => {
    // reap-e2e-liveness-fixtures.mjs's own header states the specifying QF does NOT authorize
    // production deletes and that --apply requires authorization obtained separately. An ungated
    // scheduled --apply would BE that authorization, granted by omission. So the apply step must
    // carry an `if:` condition rather than running unconditionally.
    const yml = read(WORKFLOW);
    const applyLine = yml.split('\n').findIndex((l) => /reap-e2e-liveness-fixtures\.mjs\s+--apply/.test(l));
    expect(applyLine, 'no --apply step found').toBeGreaterThan(-1);
    // Look back over the step for its guard — a step is a handful of lines, so a small window.
    const stepWindow = yml.split('\n').slice(Math.max(0, applyLine - 4), applyLine + 1).join('\n');
    expect(
      stepWindow,
      'the --apply step runs unconditionally; it must be gated on an authorization flag'
    ).toMatch(/^\s*if:\s/m);
  });

  it('[OBSERVABLE-WHEN-OFF] a dry-run step runs unconditionally, so the disabled state is not silent', () => {
    // Without this the shipped default (flag absent) is a job that does nothing and says nothing,
    // which is indistinguishable from a broken one. The unconditional dry run is what makes
    // "disabled" a reported state rather than an absence.
    const yml = read(WORKFLOW);
    const lines = yml.split('\n');
    const dryRunIdx = lines.findIndex((l) =>
      /node\s+scripts\/reap-e2e-liveness-fixtures\.mjs\s*$/.test(l)
    );
    expect(dryRunIdx, 'no unconditional (no-flag) reaper invocation found').toBeGreaterThan(-1);
    const stepWindow = lines.slice(Math.max(0, dryRunIdx - 4), dryRunIdx + 1).join('\n');
    expect(stepWindow, 'the dry-run step must NOT be conditional — it is the always-on observability').not.toMatch(/^\s*if:\s/m);
  });

  it('[SECRETS] every secret the job reads is wired in env', () => {
    const yml = read(WORKFLOW);
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(yml, `${key} is not wired from secrets`).toMatch(
        new RegExp(`${key}:\\s*\\$\\{\\{\\s*secrets\\.${key}\\s*\\}\\}`)
      );
    }
  });

  it('[INSTALL] the install step disables lifecycle scripts', () => {
    // --omit=dev alone fires `prepare`, which runs husky and dies "husky: not found" exit 127
    // (PAT-CI-WORKFLOW-LIFECYCLE-001, documented at orphan-qf-reaper.yml:52-56).
    expect(read(WORKFLOW)).toMatch(/npm\s+ci[^\n]*--ignore-scripts/);
  });

  it('[NO-COLLISION] its cron does not collide with the neighbouring cleanup jobs', () => {
    // Sharing a minute with venture-fixture-sweep (Sat 04:23) or canary-venture-probe (Sun 06:17)
    // would stack service-role DB load; the repo's convention is deliberate offset.
    const crons = [...read(WORKFLOW).matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1]);
    expect(crons.length).toBeGreaterThanOrEqual(1);
    for (const c of crons) {
      expect(c, 'collides with venture-fixture-sweep').not.toBe('23 4 * * 6');
      expect(c, 'collides with canary-venture-probe').not.toBe('17 6 * * 0');
      expect(c, 'top-of-the-hour crons pile into the :00 crowd').not.toMatch(/^0\s/);
    }
  });
});
