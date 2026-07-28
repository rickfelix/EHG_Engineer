/**
 * SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A FR-6 / TS-9 — bidirectional drift detection.
 *
 * The SD originally asserted this could only work one way ("a hidden window cannot be
 * re-enumerated"). Measured false: 348 top-level windows on this host, 36 visible, 312 hidden AND
 * ENUMERABLE — hidden ones are excluded by exactly one predicate in this repo's own enumeration
 * command. So the second direction is tested as a first-class case, not as an aspiration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildObservedMap,
  reconcileWindowVisibility,
  summarizeDrift,
  DRIFT_RECORDED_HIDDEN_BUT_VISIBLE,
  DRIFT_RECORDED_VISIBLE_BUT_HIDDEN,
} from '../../../lib/fleet/window-reconcile.js';

const sess = (id, window_visible, window_handle) => ({ session_id: id, metadata: { window_visible, window_handle } });

describe('FR-6 / TS-9: BOTH drift directions are detected', () => {
  it('detects recorded-hidden-but-actually-visible', () => {
    const observed = buildObservedMap([{ handle: 100, visible: true }]);
    const r = reconcileWindowVisibility([sess('s1', false, 100)], observed);
    expect(r.drift).toHaveLength(1);
    expect(r.drift[0]).toMatchObject({ session_id: 's1', recorded: false, actual: true, direction: DRIFT_RECORDED_HIDDEN_BUT_VISIBLE });
  });

  it('detects recorded-visible-but-actually-hidden — the direction the SD called impossible', () => {
    // This is the whole correction. Had the false premise survived, this case would have been
    // designed out, and every wrongly-hidden seat would sit unreported while the operator was told
    // everything matched.
    const observed = buildObservedMap([{ handle: 200, visible: false }]);
    const r = reconcileWindowVisibility([sess('s2', true, 200)], observed);
    expect(r.drift).toHaveLength(1);
    expect(r.drift[0]).toMatchObject({ session_id: 's2', recorded: true, actual: false, direction: DRIFT_RECORDED_VISIBLE_BUT_HIDDEN });
  });

  it('finds BOTH in one pass — neither direction shadows the other', () => {
    const observed = buildObservedMap([{ handle: 100, visible: true }, { handle: 200, visible: false }]);
    const r = reconcileWindowVisibility([sess('s1', false, 100), sess('s2', true, 200)], observed);
    const dirs = r.drift.map((d) => d.direction).sort();
    expect(dirs).toEqual([DRIFT_RECORDED_HIDDEN_BUT_VISIBLE, DRIFT_RECORDED_VISIBLE_BUT_HIDDEN].sort());
    expect(r.checked).toBe(2);
  });

  it('reports NO drift when record and reality agree, in both states', () => {
    const observed = buildObservedMap([{ handle: 100, visible: true }, { handle: 200, visible: false }]);
    const r = reconcileWindowVisibility([sess('s1', true, 100), sess('s2', false, 200)], observed);
    expect(r.drift).toHaveLength(0);
    expect(r.checked).toBe(2);
  });
});

describe('FR-6: what is SKIPPED is not silently counted as agreement', () => {
  it.each([
    ['no recorded visibility', { session_id: 'x', metadata: { window_handle: 100 } }, 'no_recorded_visibility'],
    ['no usable handle', { session_id: 'x', metadata: { window_visible: true } }, 'no_usable_handle'],
    ['handle null', { session_id: 'x', metadata: { window_visible: true, window_handle: null } }, 'no_usable_handle'],
  ])('%s is skipped with a reason, not scored', (_label, session, reason) => {
    const r = reconcileWindowVisibility([session], buildObservedMap([{ handle: 100, visible: true }]));
    expect(r.drift).toHaveLength(0);
    expect(r.checked).toBe(0);
    expect(r.skipped[0]).toMatchObject({ reason });
  });

  it('a window that is GONE is skipped, not reported as drift', () => {
    // A closed window is not a visibility disagreement. Reporting it as drift would manufacture
    // alarms on every retired seat and bury the real ones.
    const r = reconcileWindowVisibility([sess('s1', true, 999)], buildObservedMap([{ handle: 100, visible: true }]));
    expect(r.drift).toHaveLength(0);
    expect(r.skipped[0]).toMatchObject({ reason: 'window_absent' });
  });
});

describe('FR-6: the summary states BOTH counts, including zeros', () => {
  it('names the recorded_visible_but_hidden count even when it is zero', () => {
    // An operator who never sees this line cannot tell "checked and clean" from "never checked".
    // That ambiguity is how a one-directional reconciler would quietly come back.
    const observed = buildObservedMap([{ handle: 100, visible: true }]);
    const s = summarizeDrift(reconcileWindowVisibility([sess('s1', true, 100)], observed));
    expect(s).toContain(`${DRIFT_RECORDED_VISIBLE_BUT_HIDDEN}=0`);
    expect(s).toContain(`${DRIFT_RECORDED_HIDDEN_BUT_VISIBLE}=0`);
  });

  it('is total — never throws on an empty or malformed result', () => {
    for (const v of [undefined, null, {}, { drift: null }]) expect(() => summarizeDrift(v)).not.toThrow();
  });
});

describe('FR-6: the retracted claim does not survive anywhere in the artifact', () => {
  // The PRD requires that no code comment, response, or doc still asserts the converse is
  // undetectable. A false premise left in prose is how the next author re-derives the same blind
  // spot after the code has already been fixed.
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  it.each([
    'lib/fleet/window-reconcile.js',
    'lib/fleet/window-visibility-writer.js',
    'lib/fleet/window-handle.js',
    'scripts/fleet-restore-windows.mjs',
  ])('%s does not claim a hidden window cannot be enumerated', (rel) => {
    const src = fs.readFileSync(root + rel, 'utf8');
    // Match the CLAIM, not the retraction: the files legitimately quote the false premise while
    // labelling it false, so only an unqualified assertion should fail here.
    const lines = src.split('\n').filter((l) => /cannot be (re-)?enumerated/i.test(l));
    for (const line of lines) {
      expect(line, `unqualified claim survives: ${line.trim()}`).toMatch(/measured false|was false|FALSE|originally|retract/i);
    }
  });
});
