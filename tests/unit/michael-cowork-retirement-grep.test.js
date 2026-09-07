// Step 5 of the Dropbox _Cowork retirement (docs/michael/02-SPEC.md §8): "the retirement grep is
// clean" — SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I. Runs the corrected, repo-wide scan (see
// lib/michael/cowork-retirement-grep.mjs for why the spec's own literal predicate is unsatisfiable
// as written, and the allow-list rationale) against the live checkout.
import { describe, it, expect } from 'vitest';
import { scanForCoworkReferences } from '../../lib/michael/cowork-retirement-grep.mjs';

describe('Michael retirement acceptance — step 5 grep is clean', () => {
  it('every live reference to _Cowork is confined to the allow-listed Michael-cowork files', () => {
    const result = scanForCoworkReferences(process.cwd());
    if (result.violations.length) {
      const detail = result.violations.map((v) => `${v.file}:${v.line}: ${v.text}`).join('\n');
      throw new Error(`_Cowork reference(s) found outside the allow-list:\n${detail}`);
    }
    expect(result.violations).toEqual([]);
    // A scanner that silently found nothing anywhere would trivially pass the assertion above —
    // require real, allow-listed signal so this test can never become vacuous.
    expect(result.hits.length).toBeGreaterThan(0);
  });
});
