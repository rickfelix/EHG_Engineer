import { describe, it, expect } from 'vitest';
import { enrichEvidenceWithLiveProbe, enrichAllWithLiveProbe } from '../../../lib/audits/live-probe-enrichment.js';

// SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-5. Turns buildEvidence's hardcoded live:{probed:false} into
// a real reading — without ever asserting an observation that was not made.
const baseEvidence = (path = 'database/migrations/x.sql') => ({
  approval: { namesObjects: true, identifiers: ['p_read'], provenanceIndependent: false },
  artifact: { present: Boolean(path), path },
  live: { probed: false },
  secondaryArtifactSearchDone: false,
  secondaryArtifactFound: false,
});

const OBJECTS = [{ kind: 'POLICY', schema: 'public', name: 'p_read', table: 'ventures' }];
const okResolve = () => ({
  resolved: true, path: '/repo/database/migrations/x.sql', content: 'sql',
  contentHash: 'a'.repeat(64), objects: OBJECTS, provenanceIndependent: true,
});

describe('FR-5 live probe enrichment', () => {
  // DEFAULT-OFF is a safety property, not a convenience: flipping live.probed activates three
  // verdict branches that have never executed in production.
  it('no client -> exact no-op, evidence returned unchanged', async () => {
    const e = baseEvidence();
    const out = await enrichEvidenceWithLiveProbe(e, { repoRoot: '/repo' });
    expect(out).toBe(e);
    expect(out.live.probed).toBe(false);
  });

  it('client but no capture function -> still a no-op', async () => {
    const e = baseEvidence();
    expect(await enrichEvidenceWithLiveProbe(e, { client: {}, repoRoot: '/repo' })).toBe(e);
  });

  it('probes and reports observed objects when resolution succeeds', async () => {
    const out = await enrichEvidenceWithLiveProbe(baseEvidence(), {
      client: {}, repoRoot: '/repo', resolve: okResolve,
      captureObjectDefinitions: async () => [{ ...OBJECTS[0], definition: 'POLICY p_read ON public.ventures ...' }],
    });
    expect(out.live.probed).toBe(true);
    expect(out.live.declared).toBe(1);
    expect(out.live.observed).toBe(1);
    expect(out.live.absent).toEqual([]);
    expect(out.approval.provenanceIndependent).toBe(true);
  });

  // The NOT-APPLIED signal: declared by the approval, absent from the database. Distinguishing
  // this from "we could not look" is the distinction the sweep has never had.
  it('an object the approval declares but the DB lacks is reported ABSENT, still probed', async () => {
    const out = await enrichEvidenceWithLiveProbe(baseEvidence(), {
      client: {}, repoRoot: '/repo', resolve: okResolve,
      captureObjectDefinitions: async () => [{ ...OBJECTS[0], definition: null }],
    });
    expect(out.live.probed).toBe(true);
    expect(out.live.observed).toBe(0);
    expect(out.live.absent).toEqual(['POLICY:public.ventures.p_read']);
  });

  it('unresolvable artifact -> probed STAYS false, with the reason reported', async () => {
    const out = await enrichEvidenceWithLiveProbe(baseEvidence(null), {
      client: {}, repoRoot: '/repo',
      resolve: () => ({ resolved: false, reason: 'artifact_file_not_found' }),
      captureObjectDefinitions: async () => { throw new Error('must not be called'); },
    });
    expect(out.live.probed).toBe(false);
    expect(out.live.unresolved_reason).toBe('artifact_file_not_found');
  });

  // A probe that THREW observed nothing. Reporting probed:true here would assert an observation
  // never made — the precise shape of every fail-open in this area.
  it('a probe that throws does NOT claim probed:true', async () => {
    const out = await enrichEvidenceWithLiveProbe(baseEvidence(), {
      client: {}, repoRoot: '/repo', resolve: okResolve,
      captureObjectDefinitions: async () => { throw new Error('connection reset'); },
    });
    expect(out.live.probed).toBe(false);
    expect(out.live.probe_error).toContain('connection reset');
  });

  // provenanceIndependent must come from the RESOLVER, never be assumed by the prober —
  // collectors:199-205 warns 21 rows would otherwise pass with provenance never established.
  it('never upgrades provenanceIndependent on its own', async () => {
    const out = await enrichEvidenceWithLiveProbe(baseEvidence(), {
      client: {}, repoRoot: '/repo',
      resolve: () => ({ ...okResolve(), provenanceIndependent: false }),
      captureObjectDefinitions: async () => [{ ...OBJECTS[0], definition: 'x' }],
    });
    expect(out.approval.provenanceIndependent).toBe(false);
  });

  it('does not mutate the input evidence', async () => {
    const e = baseEvidence();
    await enrichEvidenceWithLiveProbe(e, {
      client: {}, repoRoot: '/repo', resolve: okResolve,
      captureObjectDefinitions: async () => [{ ...OBJECTS[0], definition: 'x' }],
    });
    expect(e.live.probed).toBe(false);
    expect(e.approval.provenanceIndependent).toBe(false);
  });

  it('enrichAllWithLiveProbe processes every item', async () => {
    const out = await enrichAllWithLiveProbe([baseEvidence(), baseEvidence()], {
      client: {}, repoRoot: '/repo', resolve: okResolve,
      captureObjectDefinitions: async () => [{ ...OBJECTS[0], definition: 'x' }],
    });
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.live.probed === true)).toBe(true);
  });
});
