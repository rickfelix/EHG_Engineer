/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B FR-4 (Q4 target-read verification, TS-5, TS-6).
 */
import { describe, it, expect } from 'vitest';
import { verifyRatificationTargetRead, DEFAULT_FETCHERS } from '../ratification-target-read-verifier.mjs';

describe('verifyRatificationTargetRead', () => {
  it('TS-6: a genuine ref whose target contains marker_text passes', async () => {
    const fetchers = { section_id: async () => 'preamble ... the ratified clause ... trailer' };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'the ratified clause' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(true);
  });

  it('TS-5: a fabricated ref (target exists but does not contain marker_text) fails', async () => {
    const fetchers = { section_id: async () => 'unrelated content entirely' };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'the ratified clause' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/does not contain marker_text/);
  });

  it('TS-5: a stale ref (target unreachable, e.g. deleted row) fails', async () => {
    const fetchers = { section_id: async () => null };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'x' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/unreachable/);
  });

  it('fails closed on a missing encoded_ref', async () => {
    const result = await verifyRatificationTargetRead({}, { encoded_ref: null, marker_text: 'x' });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/encoded_ref is missing/);
  });

  it('fails closed on empty marker_text', async () => {
    const result = await verifyRatificationTargetRead({}, { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: '' });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/marker_text is missing/);
  });

  it('fails closed on an unknown encoded_ref.type', async () => {
    const result = await verifyRatificationTargetRead({}, { encoded_ref: { type: 'bogus' }, marker_text: 'x' });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/no target-read fetcher/);
  });

  it('fails closed when the fetcher throws', async () => {
    const fetchers = { section_id: async () => { throw new Error('db down'); } };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'x' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/db down/);
  });

  // TESTING finding (evidence 21dc1450): every LIVE encoded row predates FR-3 and has no `type`
  // key -- must be treated as the implicit section_id shape, not fail closed as fabricated.
  it('a legacy (typeless) {section_id, manifest_hash} ref is verified via the section_id fetcher', async () => {
    const fetchers = { section_id: async () => 'the ratified clause' };
    const row = { encoded_ref: { section_id: '94', manifest_hash: 'abc' }, marker_text: 'the ratified clause' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(true);
  });

  it('exercises the sd_row, venture_metadata, and memory_marker fetchers with injected values', async () => {
    const fetchers = {
      sd_row: async () => 'the sd description text includes: the ratified clause',
      venture_metadata: async () => 'the ratified clause',
      memory_marker: async () => 'preamble the ratified clause trailer',
    };
    for (const type of ['sd_row', 'venture_metadata', 'memory_marker']) {
      const row = { encoded_ref: { type }, marker_text: 'the ratified clause' };
      const result = await verifyRatificationTargetRead({}, row, { fetchers });
      expect(result.verified).toBe(true);
    }
  });
});

// SECURITY finding (evidence 9d1bacee, SEC-1): a prototype-bearing lookup let {type:'toString'}
// resolve to Object.prototype.toString, faking verified:true with zero target ever fetched.
describe('SEC-1: prototype-pollution-shaped encoded_ref.type is never a valid fetcher lookup', () => {
  for (const evilType of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
    it(`rejects encoded_ref.type=${JSON.stringify(evilType)} against the real DEFAULT_FETCHERS map`, async () => {
      const row = { encoded_ref: { type: evilType }, marker_text: 'object' };
      const result = await verifyRatificationTargetRead({}, row);
      expect(result.verified).toBe(false);
      expect(result.reason).toMatch(/no target-read fetcher/);
    });
  }

  it('also rejects a prototype-shaped type against an injected plain-object fetchers map', async () => {
    const fetchers = { section_id: async () => 'x' }; // plain object literal, has Object.prototype
    const row = { encoded_ref: { type: 'toString' }, marker_text: 'object' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(false);
  });
});

describe('SEC-2: fetchMemoryMarkerTarget path containment', () => {
  it('rejects a traversal attempt (../) as unreachable rather than reading outside MEMORY_ROOT', async () => {
    const row = { encoded_ref: { type: 'memory_marker', memory_id: '../../../../Windows/win.ini' }, marker_text: 'anything' };
    const result = await verifyRatificationTargetRead({}, row); // uses the REAL DEFAULT_FETCHERS.memory_marker
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/unreachable/);
  });

  it('rejects an absolute path as unreachable', async () => {
    const row = { encoded_ref: { type: 'memory_marker', memory_id: 'C:/Windows/win.ini' }, marker_text: 'anything' };
    const result = await verifyRatificationTargetRead({}, row);
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/unreachable/);
  });

  it('DEFAULT_FETCHERS.memory_marker is exported and directly testable for containment', () => {
    expect(typeof DEFAULT_FETCHERS.memory_marker).toBe('function');
  });
});
