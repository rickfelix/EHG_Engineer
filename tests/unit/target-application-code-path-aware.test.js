/**
 * SD-LEO-INFRA-CODE-PATH-AWARE-001
 * Code-path-aware target_application classification: the LEAD-TO-PLAN gate must
 * not downgrade EHG_Engineer->EHG via scope-vocabulary inference when the SD's
 * deliverables reference EHG_Engineer code paths. Plus the path-dictionary
 * (database/migrations/) and creation-time crosscheck enhancements.
 *
 * Deterministic/offline — fake supabase, no network.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  detectPathSignalFromSd,
  detectFromKeyChanges,
  validateTargetApplication as gateValidate,
  PATH_PATTERN_DICTIONARY,
} from '../../scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js';
import { validateTargetApplication as crosscheck } from '../../scripts/modules/sd-validation/target-application-crosscheck.js';

// Fake supabase that records .update() payloads so we can assert flips.
function makeFakeSupabase() {
  const updates = [];
  return {
    _updates: updates,
    from: () => ({ update: (vals) => { updates.push(vals); return { eq: async () => ({ error: null }) }; } }),
  };
}

// A scope with HIGH ehg-vocabulary confidence (so the gate's inference is EHG, high)
const HIGH_EHG_VOCAB = 'Marketing landing page and dashboard for the venture stage; frontend react user interface.';

describe('detectPathSignalFromSd', () => {
  it('returns EHG_Engineer for EHG_Engineer-only paths', () => {
    expect(detectPathSignalFromSd({ scope: 'work in lib/eva/ and scripts/' })).toBe('EHG_Engineer');
  });
  it('returns EHG for ehg-app-only paths', () => {
    expect(detectPathSignalFromSd({ scope: 'work in src/components/ and src/pages/' })).toBe('EHG');
  });
  it('returns mixed when both repos referenced', () => {
    expect(detectPathSignalFromSd({ scope: 'lib/eva/ and src/components/' })).toBe('mixed');
  });
  it('returns null with no recognizable code paths', () => {
    expect(detectPathSignalFromSd({ scope: 'just marketing vocabulary, no paths' })).toBeNull();
  });
  it('reads key_changes[].change as well as scope', () => {
    expect(detectPathSignalFromSd({ key_changes: [{ change: 'Modify database/migrations/x.sql' }] })).toBe('EHG_Engineer');
  });
});

describe('detectFromKeyChanges — database/migrations/ vote (TS-2)', () => {
  it('votes EHG_Engineer for a migrations-only key_changes set', () => {
    expect(detectFromKeyChanges([{ change: 'Add database/migrations/20260520_foo.sql' }])).toBe('EHG_Engineer');
  });
  it('PATH_PATTERN_DICTIONARY.EHG_Engineer includes database/migrations/', () => {
    expect(PATH_PATTERN_DICTIONARY.EHG_Engineer).toContain('database/migrations/');
  });
});

describe('LEAD-TO-PLAN gate — code-path suppression', () => {
  it('TS-1: does NOT flip EHG_Engineer->EHG when EHG_Engineer paths present (marketing vocab)', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-1', target_application: 'EHG_Engineer', metadata: {},
      title: 'Surface-aware wireframe', scope: `${HIGH_EHG_VOCAB} Deliverables in lib/eva/stage-templates/ and scripts/.`,
      key_changes: [{ change: 'Modify lib/eva/stage-templates/foo.js' }],
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0); // no flip
    expect(res.warnings?.join(' ')).toMatch(/code path|code-path/i);
  });

  it('TS-4: mixed-repo scope yields no auto-correction', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-2', target_application: 'EHG_Engineer', metadata: {},
      title: 'x', scope: `${HIGH_EHG_VOCAB} Touches lib/eva/ and src/components/.`,
      key_changes: [{ change: 'lib/eva/a.js' }, { change: 'src/components/B.tsx' }],
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0);
  });

  it('TS-3 (negative control): STILL flips EHG_Engineer->EHG when only ehg-app paths present', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-3', target_application: 'EHG_Engineer', metadata: {},
      title: 'x', scope: `${HIGH_EHG_VOCAB} Deliverables in src/components/ and src/pages/.`,
      key_changes: [{ change: 'Modify src/components/Foo.tsx' }],
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].target_application).toBe('EHG'); // suppression is path-gated, not blanket-off
  });

  it('TS-5: explicit operator intent (target_application_explicit) short-circuits before suppression', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-5', target_application: 'EHG_Engineer', metadata: { target_application_explicit: true },
      title: 'x', scope: `${HIGH_EHG_VOCAB} src/components/ only.`,
      key_changes: [{ change: 'src/components/X.tsx' }],
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0);
    expect(res.warnings?.join(' ')).toMatch(/explicit/i);
  });
});

describe('creation-time crosscheck — code-path mismatch (TS-6)', () => {
  it('flags EHG_Engineer code paths + marketing vocab with target_application=EHG', () => {
    const r = crosscheck({ scope: 'Marketing dashboard wireframe implemented in lib/eva/ and scripts/', target_application: 'EHG' });
    expect(r.verdict).not.toBe('PASS');
    expect(r.reasons.join(' ')).toMatch(/code path|EHG_Engineer code paths/i);
  });
  it('flags ehg-app code paths with target_application=EHG_Engineer (inverse)', () => {
    const r = crosscheck({ scope: 'work in src/components/ dashboard', target_application: 'EHG_Engineer' });
    expect(r.verdict).not.toBe('PASS');
  });
  it('preserves explicit phrase detection (no regression): "frontend only" + EHG_Engineer', () => {
    const r = crosscheck({ scope: 'frontend only feature', target_application: 'EHG_Engineer' });
    expect(r.verdict).not.toBe('PASS');
  });
  it('passes a clean EHG_Engineer SD (engineer paths + EHG_Engineer target)', () => {
    const r = crosscheck({ scope: 'backend work in lib/eva/ and scripts/', target_application: 'EHG_Engineer' });
    expect(r.verdict).toBe('PASS');
  });
  it('passes mixed-repo scope regardless of target', () => {
    const r = crosscheck({ scope: 'cross-repo work in lib/eva/ and src/components/', target_application: 'EHG' });
    expect(r.verdict).toBe('PASS');
  });
});

describe('FR-2 metadata.qf_target_application re-derivation (SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001-B)', () => {
  // Reachability matrix: the same fixed SD (target_application='EHG_Engineer',
  // metadata.qf_target_application='altifyai') crossed with 4 prose shapes that
  // testing-agent's mutation testing (evidence c636ba21) proved would bypass an
  // end-placed check via unrelated early-return branches -- one of which
  // (react+ui-component+src/components/) actively WRITES target_application to a
  // wrong platform value pre-fix. See the M2 regression test below for that specific case.
  const PROSE_SHAPES = [
    { label: 'terse / no vocabulary', title: 'x', scope: 'small fix' },
    { label: 'react + frontend', title: 'x', scope: 'react frontend work' },
    { label: 'react + ui component + src/components/', title: 'x', scope: 'react ui component work in src/components/Foo.tsx' },
    { label: 'api endpoint + database table', title: 'x', scope: 'api endpoint touching a database table' },
  ];

  it.each(PROSE_SHAPES)('correction fires before prose-vocabulary inference: $label', async ({ title, scope }) => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-qf-1', target_application: 'EHG_Engineer',
      metadata: { qf_target_application: 'altifyai' },
      title, scope,
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].target_application).toBe('altifyai');
  });

  // Excludes the 'react + ui component + src/components/' shape: that prose shape
  // independently triggers the PRE-EXISTING, unrelated path-corroborated correction
  // mechanism (covered by this file's own 'TS-3 (negative control)' test above) regardless
  // of what qf_target_application holds -- proving FR-2 stays out of the way there requires
  // a different assertion, not "zero updates" (see the M2 test below, which uses this exact
  // shape WITH venture metadata to prove FR-2 intercepts it FIRST when it should).
  const PLATFORM_SAFE_PROSE_SHAPES = PROSE_SHAPES.filter(s => s.label !== 'react + ui component + src/components/');

  it.each(PLATFORM_SAFE_PROSE_SHAPES)('no false-positive correction for platform-shaped metadata: $label', async ({ title, scope }) => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-qf-2', target_application: 'EHG_Engineer',
      metadata: { qf_target_application: 'EHG_Engineer' },
      title, scope,
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0);
  });

  it('M2 regression: a venture-QF SD is never actively mis-routed to EHG by an unrelated prose-vocabulary branch', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-qf-3', target_application: 'EHG_Engineer',
      metadata: { qf_target_application: 'altifyai' },
      title: 'x', scope: 'react ui component work in src/components/Foo.tsx',
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].target_application).toBe('altifyai');
    expect(sb._updates[0].target_application).not.toBe('EHG');
  });

  it('explicit-flag guard still respected under the new first-position placement', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-qf-4', target_application: 'EHG_Engineer',
      metadata: { qf_target_application: 'altifyai', target_application_explicit: true },
      title: 'x', scope: 'small fix',
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0);
  });

  it('typeof guard (G3): a non-string qf_target_application does not throw and does not correct', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-qf-5', target_application: 'EHG_Engineer',
      metadata: { qf_target_application: 12345 },
      title: 'x', scope: 'small fix',
    };
    await expect(gateValidate(sd, sb)).resolves.toMatchObject({ pass: true });
    expect(sb._updates).toHaveLength(0);
  });

  it('no metadata.qf_target_application key present -- no-op, falls through to existing logic unchanged', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-qf-6', target_application: 'EHG_Engineer', metadata: {},
      title: 'x', scope: 'small fix',
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0);
  });

  // testing-agent evidence ce10a1bd (follow-up verification pass): an earlier version of
  // this check inlined `qfTargetApp !== sd.target_application` instead of calling
  // isQfFallbackEligible, which diverges from the shared predicate on exactly this input --
  // target_application already resolved to a DIFFERENT venture than the QF's origin. That
  // inline predicate would have fired here and silently reverted 'marketlens' back to
  // 'altifyai'. isQfFallbackEligible's !isVentureRepo(current) guard means it never touches
  // a target_application already on any venture, same or different -- only a platform default.
  it('current target already resolved to a DIFFERENT venture than the QF origin -- no-op, never reverted', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'sd-qf-7', target_application: 'marketlens',
      metadata: { qf_target_application: 'altifyai' },
      title: 'x', scope: 'small fix',
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0);
  });
});

describe('witness replay (TS-7)', () => {
  it('SD-ACTIVATE-style scope (marketing vocab + lib/eva paths) is preserved as EHG_Engineer', async () => {
    const sb = makeFakeSupabase();
    const sd = {
      id: 'activate', target_application: 'EHG_Engineer', metadata: {},
      title: 'Activate Surface-Aware Wireframe pipeline',
      scope: 'Wire stage15WireframeData into analyzeStage18MarketingCopy; marketing landing page wireframe dashboard for the venture stage (frontend ui component). Files in lib/eva/stage-templates/ and database/migrations/.',
      key_changes: [{ change: 'lib/eva/stage-templates/stage-18.js' }, { change: 'database/migrations/20260520_x.sql' }],
    };
    const res = await gateValidate(sd, sb);
    expect(res.pass).toBe(true);
    expect(sb._updates).toHaveLength(0);
  });
});
