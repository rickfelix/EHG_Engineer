// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A (FR-4/FR-5): the ratification writer verified a marker
// against the live rendered contract but REPORTED NOTHING about what it checked, and never asked
// whether that contract was stale.
//
// THE SCOPE MOVED DURING EXEC, deliberately. The SD said "convert the three fail-open paths to
// refusals". Reading lib/chairman/ratification-writer.mjs showed the fail-open is a REASONED
// decision (QF-20260901-107): it returns without throwing only when the validation infrastructure
// itself is unavailable, because "this is infra trouble, not a reason to block every future
// encode". That is right, and converting it would trade a silent-pass problem for a
// fleet-stopping one. The defect was never the fail-open — it was the SILENCE.
//
// Two things the tests below pin hardest, both learned the hard way in this file:
//  1. ORDER. The first draft ran the DB-dependent staleness probe BEFORE the file-only marker
//     check, so probe unavailability MASKED a genuinely absent marker. An existing test caught it.
//     A cheap always-available check must never sit behind an expensive one that can be down.
//  2. Staleness REFUSES while missing infra REPORTS. "Checked and it is wrong" and "could not
//     check" are different claims and must not collapse into the same outcome.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyMarkerAgainstLiveSection } from '../../../lib/chairman/ratification-writer.mjs';

const SECTION = { type: 'section_id', section_id: '611', manifest_hash: 'h' };
const MARKER = 'the ratified clause header';

/** Build a throwaway repo root with a manifest + rendered file. */
function makeRoot({ manifest = true, targetFile = 'CLAUDE_SOLOMON.md', content = `prefix ${MARKER} suffix`, writeFile = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ratif-'));
  if (manifest) {
    fs.writeFileSync(path.join(root, 'claude-generation-manifest.json'), JSON.stringify({
      section_digests: { meta: { 611: { target_file: targetFile } } }
    }));
  }
  if (writeFile) fs.writeFileSync(path.join(root, targetFile), content);
  return root;
}

const cleanProbe = async () => ({ drift: false, staleFiles: [] });
const staleProbe = async () => ({ drift: true, staleFiles: ['CLAUDE_SOLOMON.md'] });
const brokenProbe = async () => { throw new Error('supabase unreachable'); };

describe('verifyMarkerAgainstLiveSection — reports what it actually checked', () => {
  it('returns verified:true with stale_checked:true when the marker is present and the file is current', async () => {
    const r = await verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: makeRoot(), driftProbe: cleanProbe });
    expect(r.verified).toBe(true);
    expect(r.stale_checked).toBe(true);
    expect(r.target_file).toBe('CLAUDE_SOLOMON.md');
    expect(typeof r.checked_at).toBe('string');
  });

  it('REPORTS no_manifest instead of silently returning — the whole defect was the silence', async () => {
    const r = await verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: makeRoot({ manifest: false }), driftProbe: cleanProbe });
    expect(r).toMatchObject({ verified: false, reason: 'no_manifest' });
  });

  it('REPORTS unknown_section when the manifest has no meta for this section', async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'claude-generation-manifest.json'), JSON.stringify({ section_digests: { meta: {} } }));
    const r = await verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: root, driftProbe: cleanProbe });
    expect(r).toMatchObject({ verified: false, reason: 'unknown_section' });
  });

  it('REPORTS unreadable_file when the rendered contract is missing', async () => {
    const r = await verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: makeRoot({ writeFile: false }), driftProbe: cleanProbe });
    expect(r).toMatchObject({ verified: false, reason: 'unreadable_file', target_file: 'CLAUDE_SOLOMON.md' });
  });

  it('PRESERVES the fail-open contract: infra trouble never throws', async () => {
    // QF-20260901-107's reasoning, kept intact — missing infra must not block every future encode.
    for (const opts of [{ manifest: false }, { writeFile: false }]) {
      await expect(verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: makeRoot(opts), driftProbe: cleanProbe }))
        .resolves.toBeTruthy();
    }
  });
});

describe('verifyMarkerAgainstLiveSection — staleness REFUSES (measured), infra REPORTS (unmeasurable)', () => {
  it('THROWS when the marker is present but the rendered contract is STALE', async () => {
    // The case the old check could not see: a marker surviving in a stale render reads as
    // confirmation of content the database no longer contains.
    await expect(verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: makeRoot(), driftProbe: staleProbe }))
      .rejects.toThrow(/is STALE against leo_protocol_sections/);
  });

  it('names the section and the file in the stale refusal, so it is actionable', async () => {
    await expect(verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: makeRoot(), driftProbe: staleProbe }))
      .rejects.toThrow(/section 611.*CLAUDE_SOLOMON\.md/s);
  });

  it('does NOT throw when the probe is unavailable — that is infra, not a finding', async () => {
    const r = await verifyMarkerAgainstLiveSection(SECTION, MARKER, { repoRoot: makeRoot(), driftProbe: brokenProbe });
    expect(r.verified).toBe(true);          // the marker itself WAS checked
    expect(r.stale_checked).toBe(false);    // but staleness was not — recorded, not hidden
    expect(r.reason).toBe('drift_probe_unavailable');
  });
});

describe('ORDER: a cheap always-available check must not sit behind a DB-dependent one', () => {
  it('still throws marker-absent even when the drift probe is DOWN', async () => {
    // This is the regression an existing test caught in the first draft: running the probe first
    // meant probe failure returned early and NEVER reached the marker check, masking a real and
    // always-detectable failure behind unrelated infra trouble.
    await expect(verifyMarkerAgainstLiveSection(
      SECTION,
      'a marker that is nowhere in the file',
      { repoRoot: makeRoot(), driftProbe: brokenProbe }
    )).rejects.toThrow(/markerText is not present in the live content/);
  });

  it('still throws marker-absent even when the file is STALE', async () => {
    // Absent beats stale: both are real findings, but the marker check is the cheaper and more
    // specific one, so it reports first.
    await expect(verifyMarkerAgainstLiveSection(
      SECTION,
      'a marker that is nowhere in the file',
      { repoRoot: makeRoot(), driftProbe: staleProbe }
    )).rejects.toThrow(/markerText is not present in the live content/);
  });

  it('never calls the drift probe when the marker is absent (no wasted DB round trip)', async () => {
    let called = 0;
    const counting = async () => { called += 1; return { staleFiles: [] }; };
    await expect(verifyMarkerAgainstLiveSection(SECTION, 'absent', { repoRoot: makeRoot(), driftProbe: counting }))
      .rejects.toThrow();
    expect(called).toBe(0);
  });
});
