/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-1) — registered machinery must name its dispatcher.
 * Pattern PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001; exemplar
 * tests/unit/cron/chairman-decision-sla-wiring.test.js.
 *
 * THE DEFECT CLASS: the producer, composer, five sections, three score legs and the SMS leg were
 * all built and tested while NOTHING RAN THEM. Armed logic with no dispatcher is indistinguishable
 * from logic that always passes — and the failure is silent, because absence has no error message.
 *
 * These assertions fail CI the moment any edge of workflow -> sweep -> producer decays. No network,
 * no database, no clock.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'drive-report-cron.yml');
const SWEEP = path.join(repoRoot, 'scripts', 'cron', 'drive-report-sweep.mjs');
const PRODUCER = path.join(repoRoot, 'scripts', 'drive-report-produce.mjs');

const read = (p) => fs.readFileSync(p, 'utf8');
/** Source with comments stripped — a name in prose is not a call site. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the Drive Report producer names its dispatcher (TR-1)', () => {
  it('the cron workflow exists and its run step invokes the sweep', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    expect(read(WORKFLOW)).toMatch(/node\s+scripts\/cron\/drive-report-sweep\.mjs/);
  });

  it('the workflow registers BOTH DST schedules — one line is an hour wrong for half the year', () => {
    const crons = [...read(WORKFLOW).matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1]);
    expect(crons, 'TR-1 requires dual cron lines for EDT and EST').toHaveLength(2);
    expect(new Set(crons).size, 'two IDENTICAL lines are one schedule, not two').toBe(2);
  });

  it('the workflow supplies the credentials the sweep needs', () => {
    const yml = read(WORKFLOW);
    // The secret names are built from STRING literals rather than written into regex literals,
    // and that is not cosmetic. scripts/audit-db-test-guards.mjs treats those identifiers as a
    // live-DB signal, matching against a source view that blanks string literals but NOT regex
    // literals — so the same token inside /.../ reads as "this unit test opens a connection".
    // This file only reads YAML off disk. Writing them as strings is the shape the guard itself
    // documents as safe; the alternative would be loosening a shared guard to suit one test.
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(yml, `${name} is not wired from secrets`).toMatch(new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`));
    }
  });

  it('the sweep exists and actually calls the producer', () => {
    expect(fs.existsSync(SWEEP), `missing sweep: ${SWEEP}`).toBe(true);
    const src = code(SWEEP);
    expect(src, 'sweep no longer imports produceDriveReport').toMatch(
      /import\s*\{[^}]*produceDriveReport[^}]*\}\s*from\s*['"]\.\.\/drive-report-produce\.mjs['"]/
    );
    expect(src, 'sweep no longer passes the producer to the run function').toMatch(/produce:\s*produceDriveReport/);
  });

  it('[REGRESSION] the CLI supplies a persist — without one the cron throws on EVERY tick', () => {
    // This file used to assert `produce: produceDriveReport` and stop there. That edge was
    // present and correct while the CLI passed NO persist, so produceDriveReport refused on
    // every in-window fire and no report was ever written — with this suite fully green,
    // because an edge assertion cannot see whether the two ends agree about their arguments.
    // The behavioural proof now lives in drive-report-sweep.test.js's END-TO-END block, which
    // runs the real producer; this is the cheap static half that names the CLI specifically.
    const src = code(SWEEP);
    expect(src, 'the CLI block must inject a persist').toMatch(/persist:\s*async\s*\(row\)\s*=>/);
    expect(src, 'and persist must be forwarded to the producer').toMatch(/produce\(\{[\s\S]{0,200}?\bpersist,/);
    expect(src, 'and the sweep must refuse without it rather than fail deep in the producer').toMatch(/persist must be injected/);
  });

  it('the sweep names the workflow that dispatches it, by path', () => {
    expect(code(SWEEP)).toMatch(
      /ACTIVATION_TRIGGER\s*=\s*['"]\.github\/workflows\/drive-report-cron\.yml['"]/
    );
  });

  it('the sweep registers itself as armed machinery, so the staleness alarm has a row to read', () => {
    const src = code(SWEEP);
    expect(src).toMatch(/registerArmedMachinery/);
    expect(src, 'the process key must be DERIVED from armedProcessKey, never re-typed').toMatch(
      /PROCESS_KEY\s*=\s*armedProcessKey\(/
    );
  });

  it('the producer still exists and still refuses hidden dependencies', () => {
    expect(fs.existsSync(PRODUCER)).toBe(true);
    expect(code(PRODUCER)).toMatch(/must be injected/);
  });

  it('[BOUNDARY] the sweep WRITES, so it must live outside lib/drive-loop', () => {
    // Not a style rule. The FR-7 propose-only scan fails the build on any write call under
    // lib/drive-loop, and for a writer that is a REAL violation. If this ever needs to move
    // inside, the answer is not to narrow the scan.
    expect(SWEEP.replace(/\\/g, '/')).not.toMatch(/lib\/drive-loop/);
    expect(code(SWEEP), 'the sweep must be the thing that stamps the registry').toMatch(/stamp\(/);
  });

  it('[CONTROL] the comment-stripper really removes prose, or every assertion above is vacuous', () => {
    // These tests distinguish "the code calls X" from "a comment mentions X". If the stripper
    // were inert, a deleted call site would still pass because the header would still name it.
    const stripped = code(SWEEP);
    expect(read(SWEEP), 'the header does discuss GITHUB_RUN_ID in prose').toMatch(/GITHUB_RUN_ID/);
    expect(stripped, 'and it must NOT survive stripping — there is no such call site').not.toMatch(/GITHUB_RUN_ID/);
  });
});
