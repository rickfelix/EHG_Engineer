/**
 * QF-20260807-201 — §H10 mandates that verifier disagreement is journaled and never silently
 * resolved, but the journal schema could not express one. On run s2026-alpha4-0807 two
 * fresh-context verifiers disputed the runner's own summary and both verdicts had to be demoted
 * to `lifecycle`, where they are indistinguishable from run narration. BETA's §4 grading reads
 * this record, so a disagreement not findable by kind never reaches the grader.
 *
 * The acceptance case named in the QF is the LAST test here: replay that real disagreement and
 * find it by kind.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunJournal, EVENT_KINDS, DISAGREEMENT_RULES } from '../../../lib/harness/run-journal.mjs';

let baseDir;
const j = (runId = 'qf201') => new RunJournal(runId, { baseDir, clock: () => '2026-08-07T13:00:00Z' });
const VALID = { claim: 'positive=7/9', counter_claim: '6 CANNOT_DRIVE across O3,O5,O6,O7,O8', governing_rule: 'owner_recount' };

beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'qf201-')); });
afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

describe('QF-20260807-201: verifier_disagreement is a first-class journal kind', () => {
  it('is an allowed kind — the demotion path to lifecycle is gone', () => {
    expect(EVENT_KINDS).toContain('verifier_disagreement');
    expect(() => j().append({ kind: 'verifier_disagreement', event: 'e', ...VALID })).not.toThrow();
  });

  it('PERSISTS both verdicts and the governing rule — validating then dropping them is the bug', () => {
    const row = j().append({ kind: 'verifier_disagreement', event: 'coverage lens disputes summary', ...VALID });
    // Read back from disk, not the return value: the record is what the grader sees.
    const [onDisk] = j().readAll();
    for (const r of [row, onDisk]) {
      expect(r.claim).toBe(VALID.claim);
      expect(r.counter_claim).toBe(VALID.counter_claim);
      expect(r.governing_rule).toBe('owner_recount');
    }
  });

  it('rejects a half-record: a disagreement missing either verdict', () => {
    expect(() => j().append({ kind: 'verifier_disagreement', event: 'e', counter_claim: 'x', governing_rule: 'owner_recount' }))
      .toThrow(/requires both claim/);
    expect(() => j().append({ kind: 'verifier_disagreement', event: 'e', claim: 'x', governing_rule: 'owner_recount' }))
      .toThrow(/requires both claim/);
  });

  it('rejects a disagreement with no governing rule — silent resolution is what H10 forbids', () => {
    expect(() => j().append({ kind: 'verifier_disagreement', event: 'e', claim: 'a', counter_claim: 'b' }))
      .toThrow(/governing_rule/);
    expect(() => j().append({ kind: 'verifier_disagreement', event: 'e', claim: 'a', counter_claim: 'b', governing_rule: 'vibes' }))
      .toThrow(/governing_rule/);
    expect(DISAGREEMENT_RULES).toEqual(['owner_recount', 'verifier_majority', 'unresolved']);
  });

  it('the verifierDisagreement() convenience writes the same record as a raw append', () => {
    const a = j('conv-a').verifierDisagreement('e', VALID);
    const b = j('conv-b').append({ kind: 'verifier_disagreement', event: 'e', ...VALID });
    const strip = (r) => ({ ...r, run_id: undefined });
    expect(strip(a)).toEqual(strip(b));
  });

  it('does not disturb the other kinds — findings still require a finding_type', () => {
    expect(() => j().finding('CANNOT_DRIVE', 'still works')).not.toThrow();
    expect(() => j().append({ kind: 'finding', event: 'no type' })).toThrow(/finding_type/);
    expect(() => j().append({ kind: 'not_a_kind', event: 'e' })).toThrow(/unknown journal kind/);
  });

  // THE QF'S STATED ACCEPTANCE: replay the real s2026-alpha4-0807 disagreement and find it BY KIND.
  it('replaying the s2026-alpha4-0807 disagreement yields entries a reader finds by kind', () => {
    const journal = j('s2026-alpha4-0807-replay');
    journal.append({ kind: 'lifecycle', event: 'run arc started' });
    journal.verifierDisagreement('H10 verifier A (coverage lens) disputes the runner summary', {
      claim: 'positive=7/9 mapping_covered=9/9 O10=pass, CANNOT_DRIVE: O5,O6',
      counter_claim: '6 CANNOT_DRIVE spanning O3,O5,O6,O7,O8; O4 substantively empty; O10 self-graded',
      governing_rule: 'owner_recount',
    });
    journal.verifierDisagreement('H10 verifier B (fence lens) — H6 residue assertion-list inversion', {
      claim: 'containment sweep complete',
      counter_claim: 'sweep asserted only untouched tables; 59 rows of residue sat in the four written ones',
      governing_rule: 'owner_recount',
    });

    const found = journal.readAll().filter((e) => e.kind === 'verifier_disagreement');
    expect(found).toHaveLength(2);
    // Both verdicts survive the round-trip, so the grader can see WHAT diverged...
    expect(found[0].claim).toContain('7/9');
    expect(found[0].counter_claim).toContain('O3');
    expect(found[1].counter_claim).toContain('59 rows');
    // ...and which one governs, so nothing is left silently resolved.
    expect(found.every((e) => e.governing_rule === 'owner_recount')).toBe(true);
    // The regression that motivated the QF: these must NOT be lifecycle rows.
    expect(journal.readAll().filter((e) => e.kind === 'lifecycle')).toHaveLength(1);
  });
});
