import { describe, it, expect } from 'vitest';
import { resolveApprovedArtifact, UNRESOLVED } from '../../../lib/audits/approval-artifact-resolver.js';

// SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-5. Implements the FR-1 contract
// (docs/reference/ddl-approval-record-definition.md): approval identity from the approval record,
// approved CONTENT from the file on disk, object identity from PARSING that file.
const REPO = process.platform === 'win32' ? 'C:\\repo' : '/repo';

/** @param {Record<string,string>} files */
const fakeFs = (files) => ({
  existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
  readFileSync: (p) => {
    if (!Object.prototype.hasOwnProperty.call(files, p)) throw new Error('ENOENT');
    if (files[p] === null) throw new Error('EACCES');
    return files[p];
  },
});

const POLICY_SQL = 'CREATE POLICY p_read ON public.ventures FOR SELECT USING (true);\n';
const abs = (rel) => (process.platform === 'win32' ? `${REPO}\\${rel.replace(/\//g, '\\')}` : `${REPO}/${rel}`);

describe('FR-5 approval artifact resolution', () => {
  it('resolves a real artifact and reports provenanceIndependent', () => {
    const p = 'database/migrations/20260101_policy.sql';
    const r = resolveApprovedArtifact({ artifactPath: p, repoRoot: REPO }, { fs: fakeFs({ [abs(p)]: POLICY_SQL }) });
    expect(r.resolved).toBe(true);
    expect(r.objects).toContainEqual({ kind: 'POLICY', schema: 'public', name: 'p_read', table: 'ventures' });
    expect(r.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.provenanceIndependent).toBe(true);
  });

  // THE POINT OF THE WHOLE MODULE. collectors:199-205 warns that 21 rows would reach hasApproval
  // with provenance never established once a prober lands, because the approval text and artifact
  // path share one origin. provenanceIndependent may be asserted ONLY when content came from the
  // filesystem — a second origin. It must never be true on a failed resolution.
  it('NEVER claims provenanceIndependent when resolution failed', () => {
    const cases = [
      { artifactPath: null },
      { artifactPath: 'database/migrations/absent.sql' },
      { artifactPath: '../../etc/passwd' },
    ];
    for (const c of cases) {
      const r = resolveApprovedArtifact({ ...c, repoRoot: REPO }, { fs: fakeFs({}) });
      expect(r.resolved).toBe(false);
      expect(r.provenanceIndependent).toBeUndefined();
    }
  });

  it('no path in the approval -> NO_PATH, not a guess', () => {
    const r = resolveApprovedArtifact({ artifactPath: null, repoRoot: REPO }, { fs: fakeFs({}) });
    expect(r.reason).toBe(UNRESOLVED.NO_PATH);
  });

  // The historically-fabricated case: an approval naming a file that does not exist. "Absent" is a
  // real, reportable answer; inventing content for it is how the earlier bugs happened.
  it('named-but-absent artifact -> MISSING, no content invented', () => {
    const r = resolveApprovedArtifact({ artifactPath: 'database/migrations/nope.sql', repoRoot: REPO }, { fs: fakeFs({}) });
    expect(r.reason).toBe(UNRESOLVED.MISSING);
    expect(r.content).toBeUndefined();
    expect(r.objects).toBeUndefined();
  });

  it('a path escaping the repo root is REFUSED — an approval is not arbitrary read authority', () => {
    const r = resolveApprovedArtifact({ artifactPath: '../../../etc/passwd', repoRoot: REPO }, { fs: fakeFs({}) });
    expect(r.reason).toBe(UNRESOLVED.OUTSIDE_REPO);
  });

  it('unreadable file -> UNREADABLE rather than throwing into the sweep', () => {
    const p = 'database/migrations/locked.sql';
    const r = resolveApprovedArtifact({ artifactPath: p, repoRoot: REPO }, { fs: fakeFs({ [abs(p)]: null }) });
    expect(r.reason).toBe(UNRESOLVED.UNREADABLE);
  });

  it('a file declaring nothing probeable -> NO_OBJECTS, never APPLIED-by-default', () => {
    const p = 'database/migrations/comment-only.sql';
    const r = resolveApprovedArtifact({ artifactPath: p, repoRoot: REPO }, { fs: fakeFs({ [abs(p)]: '-- just a comment\nSELECT 1;\n' }) });
    expect(r.reason).toBe(UNRESOLVED.NO_OBJECTS);
    expect(r.resolved).toBe(false);
  });

  // FR-6 interlock: the digest is LF-normalised, so a CRLF checkout of the same approved file must
  // not read as a different artifact.
  it('CRLF and LF copies of one artifact produce the SAME contentHash', () => {
    const p = 'database/migrations/x.sql';
    const lf = resolveApprovedArtifact({ artifactPath: p, repoRoot: REPO }, { fs: fakeFs({ [abs(p)]: POLICY_SQL }) });
    const crlf = resolveApprovedArtifact({ artifactPath: p, repoRoot: REPO }, { fs: fakeFs({ [abs(p)]: POLICY_SQL.replace(/\n/g, '\r\n') }) });
    expect(crlf.contentHash).toBe(lf.contentHash);
  });
});
