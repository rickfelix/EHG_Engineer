/**
 * SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-5.
 *
 * This guard survived mutation TWICE in the EXEC adversarial review — both the refusal and the
 * --reason requirement could be deleted with the whole suite still green — because it lived
 * inline in roadmap-generate.js main(), which self-invokes at module load and therefore cannot be
 * imported by a test. Extracting the predicate is what makes these assertions possible at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateFullCreate,
  roadmapsToArchive,
  REFUSE_EXISTING,
  REFUSE_REASON_REQUIRED,
  AUDIT_SEVERITY,
  VALID_AUDIT_SEVERITIES,
} from '../../../lib/roadmap/full-create-guard.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const draft = { id: 'rm-draft', title: 'EVA Intake Roadmap', status: 'draft' };
const active = { id: 'rm-active', title: 'LEO Roadmap', status: 'active' };

describe('FR-5: --full may bootstrap, but may not fork', () => {
  it('allows creation when nothing non-archived exists (the bootstrap case)', () => {
    expect(evaluateFullCreate([], {})).toMatchObject({ allow: true });
  });

  it('REFUSES when a DRAFT roadmap already exists — the actual 2026-07-17 incident shape', () => {
    // My first version of this guard asked "does an ACTIVE roadmap exist". createRoadmap()
    // inserts status:'draft' and only approveSequence flips it to 'active', so that guard could
    // never have fired on the duplicate DRAFT rows (a89b078b, 8ffa7fdf) it was written to prevent.
    // If this assertion ever flips to allow:true, that regression is back.
    const v = evaluateFullCreate([draft], {});
    expect(v.allow).toBe(false);
    expect(v.refusal).toBe(REFUSE_EXISTING);
  });

  it('REFUSES when an ACTIVE roadmap already exists', () => {
    expect(evaluateFullCreate([active], {})).toMatchObject({ allow: false, refusal: REFUSE_EXISTING });
  });

  it('archived roadmaps do not block — they are not passed in, and an empty live set allows', () => {
    // The caller filters with .neq('status','archived'); this documents the contract that the
    // predicate sees only live rows, so archiving is genuinely the way to unblock --full.
    expect(evaluateFullCreate([], { }).allow).toBe(true);
  });
});

describe('FR-5: the override is explicit, reasoned, and total', () => {
  it('--replace-active WITHOUT a reason is refused, not silently allowed', () => {
    const v = evaluateFullCreate([active], { replaceActive: true });
    expect(v.allow).toBe(false);
    expect(v.refusal).toBe(REFUSE_REASON_REQUIRED);
  });

  it('a whitespace-only reason is not a reason', () => {
    // An unaudited override that logs "" is the failure this is guarding, not a formatting nit.
    expect(evaluateFullCreate([active], { replaceActive: true, replaceReason: '   ' }))
      .toMatchObject({ allow: false, refusal: REFUSE_REASON_REQUIRED });
  });

  it('--replace-active WITH a reason allows, and flags itself as an override', () => {
    const v = evaluateFullCreate([active], { replaceActive: true, replaceReason: 'reclustering after Q3 reset' });
    expect(v).toMatchObject({ allow: true, override: true });
    expect(v.existing).toHaveLength(1);
  });

  it('an override must archive EVERY live roadmap, not just the first', () => {
    // Replacing one of two leaves the duplicate state the guard exists to prevent. An override
    // named "replace" that half-replaces is worse than none, because the operator believes the
    // old one is gone.
    expect(roadmapsToArchive([active, draft])).toEqual(['rm-active', 'rm-draft']);
  });

  it('tolerates malformed input rather than throwing mid-create', () => {
    expect(evaluateFullCreate(null, {}).allow).toBe(true);
    expect(roadmapsToArchive(null)).toEqual([]);
    expect(roadmapsToArchive([{ title: 'no id' }])).toEqual([]);
  });

  it('a bare --reason that swallowed the NEXT flag is not a reason', () => {
    // SEC-4 from the EXEC security review: `--reason --force-reassign` set
    // reason="--force-reassign", which sailed through a plain trim check and archived. Argv
    // parsing cannot tell a missing value from the next flag, so the guard has to.
    for (const swallowed of ['--force-reassign', '--dry-run', '--full']) {
      expect(evaluateFullCreate([active], { replaceActive: true, replaceReason: swallowed }))
        .toMatchObject({ allow: false, refusal: REFUSE_REASON_REQUIRED });
    }
    // A legitimate reason that merely CONTAINS a dash is still fine.
    expect(evaluateFullCreate([active], { replaceActive: true, replaceReason: 'post-Q3 re-cluster' }).allow).toBe(true);
  });
});

describe('FR-5: the audit severity value is CHECK-constrained — assert it, do not re-guess it', () => {
  // *** THIS TEST EXISTS BECAUSE ITS ABSENCE LET A BROKEN DESTRUCTIVE PATH SHIP 37/37 GREEN. ***
  // The EXEC security review's closing note was that full-create-guard.test.js covered the
  // predicate thoroughly and asserted NOTHING about the insert payload. I had shipped
  // severity:'high', which audit_log_severity_check REJECTS (probed live: 23514) — and because
  // supabase-js RETURNS {error} rather than throwing, the surrounding try/catch was dead code and
  // the override wrote no audit row at all while printing "Archived N roadmap(s)".
  it('is one of the values the live CHECK constraint accepts', () => {
    expect(VALID_AUDIT_SEVERITIES).toContain(AUDIT_SEVERITY);
  });

  it('is NOT one of the plausible-looking values the constraint rejects', () => {
    // 'high' is the one I actually shipped; the others are the same mistake one keystroke away.
    for (const bad of ['high', 'low', 'medium', 'HIGH', 'Critical', '']) {
      expect(VALID_AUDIT_SEVERITIES).not.toContain(bad);
    }
  });

  it('the generator imports the shared constant rather than inlining a literal severity', () => {
    // A second copy of this value is a second chance to get it wrong, and the failure mode is
    // silent.
    const src = readFileSync(path.join(ROOT, 'scripts/roadmap-generate.js'), 'utf8');
    expect(src).toContain('AUDIT_SEVERITY');
    expect(src).not.toMatch(/severity:\s*['"]high['"]/);
  });

  it('the generator CREATES before it ARCHIVES, and gates the archive on the audit row', () => {
    // SEC-2 was a data-loss path, not an ordering preference: runFull() calls process.exit(0)
    // when the classified-intake queue is empty (a normal state), so archiving first destroyed
    // the plan of record and created nothing. There is no transaction available here, so
    // ordering IS the atomicity. Asserted on source because main() self-invokes and cannot be
    // imported; the ordering is the property that matters and it is not otherwise observable.
    const src = readFileSync(path.join(ROOT, 'scripts/roadmap-generate.js'), 'utf8');
    const runFullAt = src.indexOf('await runFull(');
    const archiveAt = src.indexOf("update({ status: 'archived' })");
    const auditAt = src.indexOf("event_type: 'ROADMAP_FULL_REPLACE_ACTIVE'");
    expect(runFullAt).toBeGreaterThan(-1);
    expect(archiveAt).toBeGreaterThan(runFullAt);   // create first
    expect(auditAt).toBeLessThan(archiveAt);        // audit gates the destructive write
    expect(src).toContain('REFUSING to archive: the audit row could not be written');
  });
});
