/**
 * Unit tests for the shared venture_artifacts provenance grading model.
 *
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (FR-5, FR-6)
 *
 * @module tests/unit/eva/venture-artifact-provenance.test
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  gradeVentureArtifactProvenance,
  hasVentureArtifactProvenance,
  buildMachineProvenance,
  VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT,
} from '../../../lib/eva/venture-artifact-provenance.js';

function sha256(payload) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return createHash('sha256').update(serialized).digest('hex');
}

const PRE_CUTOVER = new Date(Date.parse(VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT) - 60_000).toISOString();
const POST_CUTOVER = new Date(Date.parse(VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT) + 60_000).toISOString();

describe('gradeVentureArtifactProvenance()', () => {
  it('grades a pre-cutover row leniently even with zero provenance (the 7972-row legacy corpus)', () => {
    const row = { created_at: PRE_CUTOVER, metadata: null, content: 'x', artifact_data: null };
    const result = gradeVentureArtifactProvenance(row);
    expect(result.absent).toBe(false);
    expect(result.preCutover).toBe(true);
  });

  it('grades a post-cutover row with no metadata as absent', () => {
    const row = { created_at: POST_CUTOVER, metadata: null, content: 'x', artifact_data: null };
    const result = gradeVentureArtifactProvenance(row);
    expect(result.absent).toBe(true);
    expect(result.missingField).toBe('machine_provenance');
  });

  it('grades a post-cutover row with a genuine, verifiable stamp as present', () => {
    const content = JSON.stringify({ a: 1 });
    const stamp = buildMachineProvenance({ source: 'stage-23-dedicated-venture-uat', content, artifactData: { a: 1 } });
    const row = { created_at: POST_CUTOVER, metadata: { machine_provenance: stamp }, content, artifact_data: { a: 1 } };
    const result = gradeVentureArtifactProvenance(row);
    expect(result.absent).toBe(false);
  });

  it('grades a post-cutover row whose stamped hash does not verify against current content as absent (tampered or stale)', () => {
    const row = {
      created_at: POST_CUTOVER,
      metadata: { machine_provenance: { producer: 'x', run_id: 'y', content_hash: 'stale-hash', hash_source: 'content' } },
      content: 'genuinely different content now',
      artifact_data: null,
    };
    const result = gradeVentureArtifactProvenance(row);
    expect(result.absent).toBe(true);
    expect(result.missingField).toBe('content_hash_mismatch');
  });

  it('verifies against artifact_data when hash_source=artifact_data', () => {
    const artifactData = { screenshots: ['a.png'] };
    const stamp = {
      producer: 'stage-21-visual-assets',
      run_id: 'run-1',
      content_hash: sha256(artifactData),
      hash_source: 'artifact_data',
    };
    const row = { created_at: POST_CUTOVER, metadata: { machine_provenance: stamp }, content: null, artifact_data: artifactData };
    expect(gradeVentureArtifactProvenance(row).absent).toBe(false);
  });

  it('grades a post-cutover row missing any single stamp field as absent', () => {
    const withoutRunId = { created_at: POST_CUTOVER, metadata: { machine_provenance: { producer: 'x', content_hash: 'h', hash_source: 'content' } }, content: 'x' };
    expect(gradeVentureArtifactProvenance(withoutRunId).missingField).toBe('machine_provenance.run_id');
  });
});

describe('hasVentureArtifactProvenance()', () => {
  it('is a pass/fail convenience wrapper around gradeVentureArtifactProvenance()', () => {
    expect(hasVentureArtifactProvenance({ created_at: PRE_CUTOVER })).toBe(true);
    expect(hasVentureArtifactProvenance({ created_at: POST_CUTOVER, metadata: null })).toBe(false);
  });
});
