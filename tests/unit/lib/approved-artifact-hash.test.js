import { describe, it, expect } from 'vitest';
import { approvedArtifactHash, normaliseLineEndings, compareArtifacts } from '../../../scripts/lib/approved-artifact-hash.js';

// SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-6 / parent FR-5.
describe('FR-6 LF-normalised artifact hash', () => {
  const sql = 'CREATE POLICY p ON t\nUSING (true);\n';

  // Parent FR-5 AC-2, verbatim: "A byte-identical file differing only in line endings compares
  // EQUAL, asserted by test." This is the case schema_migrations_applied.migration_sha256 gets
  // wrong, since it digests raw bytes.
  it('AC-2: CRLF and LF versions of the same content hash EQUAL', () => {
    const crlf = sql.replace(/\n/g, '\r\n');
    expect(crlf).not.toBe(sql);                       // genuinely different bytes
    expect(approvedArtifactHash(crlf)).toBe(approvedArtifactHash(sql));
  });

  it('lone CR is normalised too', () => {
    expect(approvedArtifactHash(sql.replace(/\n/g, '\r'))).toBe(approvedArtifactHash(sql));
  });

  // The guard that keeps this honest. A digest that normalised MORE would hide real divergence —
  // the false-APPLIED direction docs/reference/ddl-approval-record-definition.md forbids, and the
  // specific reason computePlanContentHash was not imported (it strips trailing whitespace).
  it('does NOT normalise anything else — trailing whitespace still changes the hash', () => {
    expect(approvedArtifactHash('SELECT 1;  \n')).not.toBe(approvedArtifactHash('SELECT 1;\n'));
  });

  it('a real body difference still diverges', () => {
    expect(approvedArtifactHash('USING (true)')).not.toBe(approvedArtifactHash('USING (false)'));
  });

  it('normaliseLineEndings handles null/undefined without throwing', () => {
    expect(normaliseLineEndings(null)).toBe('');
    expect(normaliseLineEndings(undefined)).toBe('');
  });

  it('compareArtifacts reports equal across line-ending differences and surfaces both digests', () => {
    const r = compareArtifacts(sql, sql.replace(/\n/g, '\r\n'));
    expect(r.equal).toBe(true);
    expect(r.approvedHash).toBe(r.liveHash);
    expect(r.approvedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compareArtifacts reports unequal on a genuine difference', () => {
    expect(compareArtifacts('USING (true)', 'USING (false)').equal).toBe(false);
  });
});
