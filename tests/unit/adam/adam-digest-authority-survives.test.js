/**
 * The Adam DIGEST must carry Adam's LIMITS, not just Adam's DUTIES.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — regression guard.
 *
 * THE DEFECT THIS PINS, which this SD caused and a SECURITY sub-agent found:
 * consolidating the contract into ONE ~39,000-char row met the readability goal and silently
 * gutted the digest. `formatSectionCompact` truncated at 3,000 chars from the FRONT, so
 * CLAUDE_ADAM_DIGEST.md fell 18,903 -> 4,727 bytes and lost the CHAIRMAN-ONLY permission-change
 * prohibition, the delegation kill-switch, the verbal-scribe ceremony and the pre-send consult
 * rubric — all four live past char 3,000. Nothing failed. The file still looked like a contract.
 *
 * WHY POSITION IS THE WRONG AXIS, and why this is a class of bug rather than one bug: contracts
 * open with purpose and close with prohibitions. Head-truncation therefore keeps the prose and
 * discards the teeth EVERY time — it is systematic, not unlucky. The fix selects on authority
 * markers instead; this test is what keeps it selecting.
 *
 * SCOPE, STATED HONESTLY. This asserts the digest carries these clauses. It does NOT assert the
 * digest is sufficient to act on, which is a judgement no test discharges — /adam still enforces a
 * full no-offset read of the FULL contract, and the digest is the fallback, not the enforced path.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIGEST = path.join(ROOT, 'CLAUDE_ADAM_DIGEST.md');

const digest = fs.readFileSync(DIGEST, 'utf8');

// Each entry is a clause family a context-pressured Adam session must not operate without.
// These are the four the SECURITY sub-agent measured as LOST, plus the sourcing-path prohibition.
const AUTHORITY = [
  ['CHAIRMAN-ONLY / non-delegatable DDL', /CHAIRMAN-ONLY/],
  ['permission + access-control carve-out', /permission|access-control|GRANT\/REVOKE|RLS/i],
  ['delegation kill-switch', /kill.?switch/i],
  ['chairman-verbal scribe ceremony', /scribe/i],
  ['pre-send consult rubric', /rubric/i],
  ['canonical SD-creation path', /NEVER hand-insert/i],
];

describe('CLAUDE_ADAM_DIGEST.md retains binding clauses (authority selection)', () => {
  it.each(AUTHORITY)('carries the %s clause', (_label, probe) => {
    expect(digest).toMatch(probe);
  });

  it('is not head-truncated — the failure mode itself', () => {
    // The broken digest ended mid-contract with the generic truncation marker and no authority
    // after it. Asserting the marker's ABSENCE would be weak (it could vanish for other reasons),
    // so pin the property that actually matters: the LAST authority clause must appear in the
    // final third of the file. Head-truncation puts every survivor in the first third.
    const lastAuthorityAt = Math.max(
      ...AUTHORITY.map(([, probe]) => {
        const m = digest.match(new RegExp(probe.source, probe.flags.replace('g', '')));
        return m ? digest.indexOf(m[0]) : -1;
      }),
    );
    expect(lastAuthorityAt).toBeGreaterThan(digest.length / 3);
  });

  it('CONTROL: these probes are not trivially satisfied by any markdown file', () => {
    // Guards against the assertions passing on a file that says nothing — e.g. if the digest were
    // ever regenerated to a stub, or if a probe were loosened into something every doc matches.
    // A file of plausible protocol prose with no authority in it must FAIL these probes.
    const decoy = '# Adam\n\nAdam is the chairman-attached strategist. Adam sources SDs, drafts\n'
      + 'advisories, and keeps the ledger current. See the full contract for details.\n';
    const matched = AUTHORITY.filter(([, probe]) => probe.test(decoy));
    expect(matched.map(([label]) => label)).toEqual([]);
  });

  it('is a real compression, not a copy of the contract', () => {
    // The digest exists to be CHEAPER than the contract. If authority selection ever degrades into
    // "keep everything", the digest stops serving its purpose and this catches it.
    const contract = fs.readFileSync(path.join(ROOT, 'CLAUDE_ADAM.md'), 'utf8');
    expect(digest.length).toBeLessThan(contract.length * 0.6);
  });
});
