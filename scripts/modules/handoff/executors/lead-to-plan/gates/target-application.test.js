/**
 * Tests for Target Application Validation Gate (LEAD-TO-PLAN)
 * SD-LEO-INFRA-HANDOFF-VALIDATOR-REGISTRY-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../lib/venture-resolver.js', () => ({
  getCurrentVenture: vi.fn(() => 'EHG_Engineer'),
}));

import { validateTargetApplication, createTargetApplicationGate, detectFromKeyChanges, PATH_PATTERN_DICTIONARY } from './target-application.js';
import { createMockSD, createMockSupabase, assertValidatorResult } from '../../../../../../tests/factories/validator-context-factory.js';

describe('validateTargetApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass when target_application matches inferred target', async () => {
    const sd = createMockSD({
      target_application: 'EHG_Engineer',
      scope: 'scripts/modules/handoff/ — update LEO protocol gates',
      title: 'Improve handoff system validators',
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });

  it('should auto-set target_application when missing but inferable', async () => {
    const sd = createMockSD({
      target_application: null,
      scope: 'Update the LEO protocol handoff.js and phase-preflight scripts',
      title: 'Fix handoff system',
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(90);
    expect(result.warnings.some(w => w.includes('auto-set'))).toBe(true);
  });

  it('should auto-correct mismatch with high confidence', async () => {
    const sd = createMockSD({
      target_application: 'EHG',
      scope: 'Update sub-agent routing in LEO protocol and CLAUDE.md generation',
      title: 'Fix leo_protocol sub-agent routing',
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings.some(w => w.includes('corrected'))).toBe(true);
  });

  it('should pass when target is set and no inference conflict', async () => {
    const sd = createMockSD({
      target_application: 'EHG',
      scope: 'Update the venture stage UI component with React frontend changes',
      title: 'Fix venture stage display',
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });

  it('should default via venture-resolver when neither target nor inference available', async () => {
    const sd = createMockSD({
      target_application: null,
      scope: '',
      description: '',
      title: 'Miscellaneous update',
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(70);
    expect(result.warnings.some(w => w.includes('defaulted'))).toBe(true);
  });

  it('should fail when Supabase update errors on auto-set', async () => {
    const sd = createMockSD({
      target_application: null,
      scope: 'Update LEO protocol handoff.js',
      title: 'Fix handoff system',
    });
    const supabase = createMockSupabase({ updateError: { message: 'permission denied' } });

    const result = await validateTargetApplication(sd, supabase);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.some(i => i.includes('permission denied'))).toBe(true);
  });

  it('should infer EHG for application-focused SDs', async () => {
    const sd = createMockSD({
      target_application: 'EHG',
      scope: 'Add new venture stage UI component with React frontend',
      title: 'Stage venture dashboard',
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });

  // QF-20260509-986 (closes feedback ccc82ea6): respect explicit operator intent
  describe('explicit operator intent (target_application_explicit metadata)', () => {
    it('should NOT auto-correct EHG_Engineer→EHG when target was set explicitly at SD creation', async () => {
      // Mirror of ccc82ea6 witness: SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
      // (title contains "STAGE-EHG" → ehgPatterns match; SD is actually about
      //  EHG_Engineer enforcement of stage constraints — operator's explicit
      //  EHG_Engineer must survive the LEAD-TO-PLAN gate.)
      const sd = createMockSD({
        target_application: 'EHG_Engineer',
        scope: 'Constrain stage venture frontend React UI component routing rules',
        title: 'Constrain stage EHG enforcement (frontend stage rules)',
        metadata: { target_application_explicit: true },
      });
      const supabase = createMockSupabase();

      const result = await validateTargetApplication(sd, supabase);

      // score 100 with "preserved/explicit" warning means the auto-correction branch was skipped.
      // (score 80 would indicate the auto-correct UPDATE ran — the bug behavior.)
      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings.some(w => w.includes('preserved') && w.includes('explicit'))).toBe(true);
      expect(result.warnings.some(w => w.toLowerCase().includes('corrected'))).toBe(false);
    });

    it('should still auto-correct when metadata.target_application_explicit is false (inferred at creation)', async () => {
      const sd = createMockSD({
        target_application: 'EHG',
        scope: 'Update sub-agent routing in LEO protocol and CLAUDE.md generation',
        title: 'Fix leo_protocol sub-agent routing',
        metadata: { target_application_explicit: false },
      });
      const supabase = createMockSupabase();

      const result = await validateTargetApplication(sd, supabase);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(80);
      expect(result.warnings.some(w => w.includes('corrected'))).toBe(true);
    });

    it('should still auto-correct when metadata is missing entirely (legacy SDs created before flag)', async () => {
      const sd = createMockSD({
        target_application: 'EHG',
        scope: 'Update sub-agent routing in LEO protocol and CLAUDE.md generation',
        title: 'Fix leo_protocol sub-agent routing',
        // metadata omitted — pre-QF-986 SDs do not have the flag
      });
      delete sd.metadata;
      const supabase = createMockSupabase();

      const result = await validateTargetApplication(sd, supabase);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(80);
      expect(result.warnings.some(w => w.includes('corrected'))).toBe(true);
    });
  });
});

// SD-FDBK-FIX-TARGET-APPLICATION-VOCABULARY-001: corroboration-gated flip + C4 token drop.
// The flip of an already-set target_application now requires a CODE-PATH signal that AGREES
// with the prose-inferred target; otherwise it preserves + WARNs. And 'backend'/'venture'
// are removed from ehgPatterns (they false-signalled EHG for backend SDs).
describe('corroboration-gated target_application flip (SD-FDBK-FIX-TARGET-APPLICATION-VOCABULARY-001)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('C1: PRESERVES a set target when prose infers a mismatch but NO code-path signal corroborates', async () => {
    // EHG_Engineer target; scope carries genuine EHG vocabulary (infers EHG, high) but NO
    // code path (no src/components, scripts/, CLAUDE.md, etc.) → pathSignal=null → preserve.
    const sd = createMockSD({
      target_application: 'EHG_Engineer',
      scope: 'Rework the react frontend ui component user interface rendering rules',
      title: 'Rework rendering rules',
    });
    delete sd.key_changes; // ensure no path corroboration from key_changes
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(100); // 100 (preserved), NOT 80 (corrected)
    expect(result.warnings.some(w => w.includes('preserved') && w.toLowerCase().includes('no corroborating'))).toBe(true);
    expect(result.warnings.some(w => w.toLowerCase().includes('corrected'))).toBe(false);
  });

  it('C1: still FLIPS when the code-path signal AGREES with the inferred target (corroborated)', async () => {
    // Same EHG-inferring prose, but key_changes reference an EHG app path → pathSignal=EHG
    // agrees with inferred EHG → flip proceeds (score 80, corrected, "code-path corroborated").
    const sd = createMockSD({
      target_application: 'EHG_Engineer',
      scope: 'Rework the react frontend ui component user interface rendering rules',
      title: 'Rework rendering rules',
      key_changes: [{ type: 'feature', change: 'src/components/widgets/Renderer.tsx' }],
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings.some(w => w.includes('corrected') && w.includes('corroborated'))).toBe(true);
  });

  it('C4: a scope whose ONLY EHG signal was "backend"/"venture" no longer infers EHG (no flip)', async () => {
    // Post-C4, ehgPatterns has neither token → no EHG inference; the set EHG_Engineer target
    // is validated as-is (score 100, no "corrected" warning).
    const sd = createMockSD({
      target_application: 'EHG_Engineer',
      scope: 'Backend venture pipeline worker queue distillation engine',
      title: 'Backend venture engine worker',
    });
    delete sd.key_changes;
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings ? result.warnings.some(w => w.toLowerCase().includes('corrected')) : false).toBe(false);
  });

  it('C4: genuine EHG SDs still infer EHG via the 10 retained tokens', async () => {
    // No backend/venture, but react+frontend+ui component+user interface → still EHG.
    const sd = createMockSD({
      target_application: 'EHG',
      scope: 'Add a react frontend ui component and user interface for the dashboard',
      title: 'Dashboard UI',
    });
    const supabase = createMockSupabase();

    const result = await validateTargetApplication(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(100); // matches set EHG target, no flip needed
  });

  // Fail-safe note: C1 wraps detectPathSignalFromSd in try/catch and treats a throw as null
  // (→ preserve). detectPathSignalFromSd is provably null-returning on malformed input (see the
  // detectFromKeyChanges null-safety tests + detectPathSignalFromSd's guards), so the catch is
  // belt-and-suspenders; the null-path PRESERVE test above exercises the same preserve branch.
});

// SD-LEO-INFRA-SD-AUTHORING-TARGET-AUTODETECT-001
describe('detectFromKeyChanges', () => {
  it('returns "EHG" for all-frontend paths', () => {
    const result = detectFromKeyChanges([
      { type: 'feature', change: 'Modify /ehg/src/components/stage17/Stage17ReviewPanel.tsx' },
      { type: 'test', change: 'Add tests under src/pages/admin/' },
    ]);
    expect(result).toBe('EHG');
  });

  it('returns "EHG_Engineer" for all-backend paths', () => {
    const result = detectFromKeyChanges([
      { type: 'feature', change: 'Add scripts/modules/handoff/foo.js' },
      { type: 'test', change: 'Update lib/eva/bar.js' },
    ]);
    expect(result).toBe('EHG_Engineer');
  });

  it('returns null for empty array', () => {
    expect(detectFromKeyChanges([])).toBeNull();
  });

  it('returns null for non-array input without throwing', () => {
    expect(detectFromKeyChanges(undefined)).toBeNull();
    expect(detectFromKeyChanges(null)).toBeNull();
    expect(detectFromKeyChanges('not-an-array')).toBeNull();
    expect(detectFromKeyChanges({ change: '/ehg/' })).toBeNull();
  });

  it('returns null on tied EHG vs EHG_Engineer counts', () => {
    const result = detectFromKeyChanges([
      { type: 'feature', change: '/ehg/src/foo.tsx' },
      { type: 'feature', change: 'scripts/bar.js' },
    ]);
    expect(result).toBeNull();
  });

  it('returns null when no path patterns match', () => {
    const result = detectFromKeyChanges([
      { type: 'feature', change: 'docs/some-prose-only-change.md' },
      { type: 'bugfix', change: 'unrelated text with no path prefix' },
    ]);
    expect(result).toBeNull();
  });

  it('skips entries with missing or non-string change field without throwing', () => {
    const result = detectFromKeyChanges([
      { type: 'feature', change: '/ehg/src/foo.tsx' },
      { type: 'feature' },
      { type: 'test', change: null },
      'not-an-object',
      null,
      { type: 'feature', change: 'src/pages/bar.tsx' },
    ]);
    expect(result).toBe('EHG');
  });

  it('exports PATH_PATTERN_DICTIONARY with both application keys populated', () => {
    expect(Array.isArray(PATH_PATTERN_DICTIONARY.EHG)).toBe(true);
    expect(Array.isArray(PATH_PATTERN_DICTIONARY.EHG_Engineer)).toBe(true);
    expect(PATH_PATTERN_DICTIONARY.EHG.length).toBeGreaterThan(0);
    expect(PATH_PATTERN_DICTIONARY.EHG_Engineer.length).toBeGreaterThan(0);
  });
});

describe('createTargetApplicationGate', () => {
  it('should return a gate object with correct shape', () => {
    const supabase = createMockSupabase();
    const gate = createTargetApplicationGate(supabase);

    expect(gate.name).toBe('TARGET_APPLICATION_VALIDATION');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
    expect(typeof gate.remediation).toBe('string');
  });

  it('should invoke validateTargetApplication via the validator', async () => {
    const supabase = createMockSupabase();
    const gate = createTargetApplicationGate(supabase);
    const sd = createMockSD();
    const result = await gate.validator({ sd });

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
  });
});
