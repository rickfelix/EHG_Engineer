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
