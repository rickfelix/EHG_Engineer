/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-7) — SEC-40/SEC-47/SEC-54.
 *
 * ROUND-9 REWRITE (EXEC-TO-PLAN TESTING + SECURITY, both independently
 * converging on "fix the test to read the source, never hand-edit the doc
 * to match a hard-coded test string"): the original version of this file
 * asserted a HARD-CODED literal string while its own docstring claimed the
 * value was "sourced from strategic_directives_v2.metadata" -- it read no
 * DB, and the hard-coded literal was itself the DRIFTED (em-dash, added
 * backticks) text. A green test therefore cemented drift as canonical.
 *
 * NOT fixed with a live DB call: vitest's `unit` project deliberately
 * neuters Supabase env vars (see tests/helpers/db-available.js's own
 * extensive rationale -- no non-production Supabase target is provisioned,
 * so a DB-gated unit test would either always-skip or, the actual
 * historical incident that policy exists to prevent, run against
 * production). Instead: the byte-fidelity-critical values live in a
 * committed, machine-GENERATED fixture (tests/fixtures/
 * fr7-synthetic-actors-source-material.json, produced by a script reading
 * the DB directly, never hand-typed) that this test compares the doc
 * against. scripts/regen-fr7-source-material-fixture.mjs is the OTHER half
 * of this two-tier design -- run periodically with real credentials,
 * OUTSIDE the vitest sandbox, to confirm the fixture itself hasn't gone
 * stale relative to the live SD row.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const doc = readFileSync(join(root, 'docs', '03_protocols_and_standards', 'venture-hosting-standard.md'), 'utf8');
const sourceMaterial = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'fr7-synthetic-actors-source-material.json'), 'utf8'));

describe('venture-hosting-standard.md — fenced synthetic-actor section', () => {
  it('has the RPC-path coverage-gap disclosure verbatim (SEC-40)', () => {
    expect(doc).toContain(
      "this guard covers `_advanceStage()` callers only; the `fn_advance_venture_stage` RPC and the `EHG` frontend's `advance_venture_stage` RPC bypass it and are not yet fenced.",
    );
  });

  it('states the future-endpoint predicate-consumption constraint', () => {
    expect(doc).toMatch(/MUST consume that predicate before shipping/);
  });

  // SEC-47/SEC-54: byte-for-byte against the machine-generated fixture, not
  // a hand-typed literal or a loose substring match.
  it('has the verbatim "USER stand-in, NEVER a chairman stand-in" sentence, byte-for-byte against the source-material fixture', () => {
    expect(doc).toContain(sourceMaterial.verbatim_sentence_must_survive_unchanged);
  });

  it('names all three exclusion classes byte-for-byte against the source-material fixture', () => {
    expect(sourceMaterial.exclusion_classes_THREE_not_two).toHaveLength(3); // pins the fixture's own shape too
    for (const cls of sourceMaterial.exclusion_classes_THREE_not_two) {
      expect(doc).toContain(cls);
    }
  });

  it('never reintroduces the drifted em-dash variant of the verbatim sentence', () => {
    expect(doc).not.toContain('chairman stand-in — no test identity'); // em-dash, not the fixture's "--"
  });
});
