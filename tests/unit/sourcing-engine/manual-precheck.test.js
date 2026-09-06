/**
 * SD-LEO-INFRA-KILL-DUPLICATE-WORK-001 (LEG B) — checkAlreadyBuilt() regression tests.
 *
 * The dry-run replay named in the SD's own success criteria: given the exact 2026-08-29
 * distance-to-broke ask, checkAlreadyBuilt must return ALREADY-BUILT citing
 * SD-EHG-COCKPIT-DTB-BUILD-001 — the class of re-mint this SD exists to prevent.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/vision/vdr-registry.js', () => ({
  computeBuildGauge: vi.fn(async () => ({
    components: [{ capability: 'See distance-to-broke', status: 'built' }],
  })),
}));

import { checkAlreadyBuilt } from '../../../lib/sourcing-engine/manual-precheck.js';

function makeSupabaseMock(sds, qfs = []) {
  const from = (table) => {
    const b = {
      select() { return b; },
      order() { return b; },
      range() { return b; },
      then(resolve, reject) {
        let data = [];
        if (table === 'strategic_directives_v2') data = sds;
        else if (table === 'quick_fixes') data = qfs;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return b;
  };
  return { from };
}

describe('checkAlreadyBuilt', () => {
  it('replays the 2026-08-29 distance-to-broke ask: returns ALREADY-BUILT citing SD-EHG-COCKPIT-DTB-BUILD-001', async () => {
    const supabase = makeSupabaseMock([
      {
        sd_key: 'SD-EHG-COCKPIT-DTB-BUILD-001',
        title: 'Realize the distance-to-broke read: cash burn survivability cockpit',
        status: 'completed',
        metadata: { delivers_capabilities: ['See distance-to-broke'] },
      },
    ]);

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Realize the distance-to-broke read: from code-presence to a rendered cockpit survivability tile',
      description: 'Build the distance-to-broke cash burn survivability cockpit read',
    });

    expect(result.predicate).toBe('was-this-built');
    expect(result.result).toBe('ALREADY-BUILT');
    expect(result.citedSdKey).toBe('SD-EHG-COCKPIT-DTB-BUILD-001');
    expect(result.re_emit).toBe(false);
  });

  it('returns NOT-FOUND when no existing SD matches (genuinely unbuilt)', async () => {
    const supabase = makeSupabaseMock([
      { sd_key: 'SD-UNRELATED-001', title: 'Something totally different', status: 'completed', metadata: {} },
    ]);

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Build a brand new capability nobody has touched',
      description: 'Genuinely novel work',
    });

    expect(result.result).toBe('NOT-FOUND');
    expect(result.citedSdKey).toBeNull();
  });

  it('shipped-but-outcome-unrealized: NOT-FOUND (do not hard-block), but flags re_emit and cites the SD', async () => {
    const supabase = makeSupabaseMock([
      {
        sd_key: 'SD-EHG-COCKPIT-VENTPERF-BUILD-001',
        title: 'Venture performance read cockpit surface',
        status: 'completed',
        metadata: { delivers_capabilities: ['Venture-performance read'] },
      },
    ]);

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Venture performance read cockpit surface',
      description: 'Reconcile the venture performance read',
    });

    // Capability 'Venture-performance read' has no gauge entry in this test's mocked
    // computeBuildGauge (only 'See distance-to-broke' is 'built') -- so it is NOT realized.
    expect(result.result).toBe('NOT-FOUND');
    expect(result.re_emit).toBe(true);
    expect(result.citedSdKey).toBe('SD-EHG-COCKPIT-VENTPERF-BUILD-001');
  });
});

describe('checkAlreadyBuilt — QF-20260903-254: predicate 2 also reads the quick-fix lane', () => {
  // The QF-20260902-724 case named in this QF's own success criteria: SD-LEO-ORCH-CAPA-RECORD-
  // TRUTH-001-B was authored naming the two phantom-column claim detectors as broken, unaware
  // QF-20260902-724 had already repaired both 8.5h earlier (real title, verbatim from the DB).
  const QF_724_TITLE = 'One claim truth, the small high-yield slice: fix the two phantom-column claim detectors (the claim-focus-mismatch join on id instead of session_id — 0 of 13,156 rows can ever match — and the ownership read of a phantom last_heartbeat that makes every SD read unclaimed) with a fake-client regression test where id ≠ session_id, plus a 5-minute sweep that nulls claiming_session_id where the holder’s sd_key IS DISTINCT FROM the SD and stamps claim_focus_mismatch — so the T1 predicate (claimant live and focused elsewhere) returns 0 rows';
  const CANDIDATE_TITLE = 'Fix the two phantom-column claim detectors: the claim-focus-mismatch join on id instead of session_id, and the ownership read of a phantom last_heartbeat column';
  const CANDIDATE_DESC = 'The claim-focus-mismatch detector and the ownership last_heartbeat read are both phantom-column claim detectors that never fire; repair both and add a sweep that stamps claim_focus_mismatch when claiming_session_id disagrees with the holder sd_key.';

  it('replays the QF-20260902-724 case: returns ALREADY-BUILT citing the quick-fix, not a fresh SD', async () => {
    const supabase = makeSupabaseMock(
      [], // no SD matches this title -- the whole point of the defect
      [{ id: 'QF-20260902-724', title: QF_724_TITLE, status: 'completed' }],
    );

    const result = await checkAlreadyBuilt({ supabase, io: {}, title: CANDIDATE_TITLE, description: CANDIDATE_DESC });

    expect(result.predicate).toBe('was-this-built');
    expect(result.result).toBe('ALREADY-BUILT');
    expect(result.citedSdKey).toBeNull();
    expect(result.citedQfKey).toBe('QF-20260902-724');
    expect(result.re_emit).toBe(false);
  });

  it('a matching but NOT-YET-completed quick fix stays silent on predicate 2 (symmetric with an in-flight SD)', async () => {
    const supabase = makeSupabaseMock(
      [],
      [{ id: 'QF-20260902-724', title: QF_724_TITLE, status: 'in_progress' }],
    );

    const result = await checkAlreadyBuilt({ supabase, io: {}, title: CANDIDATE_TITLE, description: CANDIDATE_DESC });

    expect(result.result).toBe('NOT-FOUND');
    expect(result.citedQfKey).toBeNull();
  });

  it('a completed SD match still wins over a completed QF match (SD lane takes priority, unchanged)', async () => {
    const supabase = makeSupabaseMock(
      [{
        sd_key: 'SD-EHG-COCKPIT-DTB-BUILD-001',
        title: 'Realize the distance-to-broke read: cash burn survivability cockpit',
        status: 'completed',
        metadata: { delivers_capabilities: ['See distance-to-broke'] },
      }],
      [{ id: 'QF-UNRELATED-000', title: 'Some other quick fix entirely', status: 'completed' }],
    );

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Realize the distance-to-broke read: from code-presence to a rendered cockpit survivability tile',
      description: 'Build the distance-to-broke cash burn survivability cockpit read',
    });

    expect(result.result).toBe('ALREADY-BUILT');
    expect(result.citedSdKey).toBe('SD-EHG-COCKPIT-DTB-BUILD-001');
    expect(result.citedQfKey).toBeNull();
  });

  it('genuinely novel work matches neither lane: NOT-FOUND with both cited keys null', async () => {
    const supabase = makeSupabaseMock(
      [{ sd_key: 'SD-UNRELATED-001', title: 'Something totally different', status: 'completed', metadata: {} }],
      [{ id: 'QF-UNRELATED-000', title: 'Some other quick fix entirely', status: 'completed' }],
    );

    const result = await checkAlreadyBuilt({
      supabase, io: {}, title: 'Build a brand new capability nobody has touched', description: 'Genuinely novel work',
    });

    expect(result.result).toBe('NOT-FOUND');
    expect(result.citedSdKey).toBeNull();
    expect(result.citedQfKey).toBeNull();
  });

  // Adversarial review (post-merge) of this QF: without quick_fixes.description, the semantic
  // matcher's overlap-coefficient denominator min(myKey, eKey) collapsed to the short QF title's
  // tiny token count, letting a few shared generic engineering tokens ('user','data','system',
  // 'process') falsely match a verbose, topically-unrelated candidate. Measured 190/641 (29.6%)
  // false ALREADY-BUILT vetoes on a real-corpus replay. Including description restores precision.
  it('does NOT falsely match a topically-unrelated completed QF that merely shares a few generic tokens in its (short) title', async () => {
    const supabase = makeSupabaseMock(
      [],
      [{
        id: 'QF-UNRELATED-000',
        title: 'User Data Process System Audit Log Fix',
        description: 'The audit log writer silently dropped entries when the queue backed up past 500 rows; add a bounded retry and an alert instead of a silent drop.',
        status: 'completed',
      }],
    );

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Implement User Data Export System for venture cockpit reporting',
      description: 'Add a process that lets a venture owner export their user data as CSV or JSON from the cockpit reporting dashboard.',
    });

    expect(result.result).toBe('NOT-FOUND');
    expect(result.citedQfKey).toBeNull();
  });

  // MEDIUM finding (same adversarial review): the QF-ALREADY-BUILT branch used to hardcode
  // citedSdKey:null even when the SD lane had a genuine re_emit signal for the same candidate,
  // discarding the related-SD reference. It must now be preserved (informational) alongside the
  // QF citation, without changing the decision itself (still ALREADY-BUILT via the QF).
  it('preserves the SD lane\'s citedSdKey (informational) when a completed QF ALSO matches, instead of discarding it', async () => {
    const supabase = makeSupabaseMock(
      [{
        sd_key: 'SD-EHG-COCKPIT-VENTPERF-BUILD-001',
        title: 'Venture performance read cockpit surface',
        status: 'completed',
        metadata: { delivers_capabilities: ['Venture-performance read'] }, // not realized by this test's mocked gauge
      }],
      [{ id: 'QF-UNRELATED-000', title: 'Venture performance read cockpit surface', status: 'completed' }], // exact_title match
    );

    const result = await checkAlreadyBuilt({
      supabase,
      io: {},
      title: 'Venture performance read cockpit surface',
      description: 'Reconcile the venture performance read',
    });

    expect(result.result).toBe('ALREADY-BUILT');
    expect(result.citedQfKey).toBe('QF-UNRELATED-000');
    expect(result.citedSdKey).toBe('SD-EHG-COCKPIT-VENTPERF-BUILD-001');
  });

  it('a quick_fixes read failure is FAIL-LOUD -- never silently returns a clean NOT-FOUND', async () => {
    const okChain = () => { const b = { select: () => b, order: () => b, range: () => Promise.resolve({ data: [], error: null }) }; return b; };
    const failChain = () => { const b = { select: () => b, order: () => b, range: () => Promise.resolve({ data: null, error: { message: 'connection refused' } }) }; return b; };
    const supabase = { from: (table) => (table === 'quick_fixes' ? failChain() : okChain()) };

    await expect(checkAlreadyBuilt({ supabase, io: {}, title: CANDIDATE_TITLE, description: CANDIDATE_DESC }))
      .rejects.toThrow(/load quick_fixes failed/);
  });
});
