// Unit pins for wall-clock-test-lint.mjs — SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (d).
// A test-hygiene tool shipping with zero tests is the same blind-guard class this SD exists to
// close (prospective TESTING review, 2026-09-13) — this file is the required coverage.
import { describe, it, expect } from 'vitest';
import {
  isViolation, TIME_SENSITIVE_ENTRY_POINTS, parseRenameMap, runDiffMode,
} from './wall-clock-test-lint.mjs';

describe('isViolation (pure)', () => {
  it('flags a file calling an entry point with no fake-clock token anywhere', () => {
    expect(isViolation('await reconcileOutboundSms(sb, { provider });')).toBe(true);
  });
  it('clears when a now: option is present anywhere in the file', () => {
    expect(isViolation('await reconcileOutboundSms(sb, { provider, now: Date.now() });')).toBe(false);
  });
  it('clears on DAY_NOW / FAKE_NOW / useFakeTimers tokens', () => {
    expect(isViolation('const x = DAY_NOW; isInQuietHours(sb, id, x);')).toBe(false);
    expect(isViolation('const x = FAKE_NOW; isInQuietHours(sb, id, x);')).toBe(false);
    expect(isViolation('vi.useFakeTimers(); isInQuietHours(sb, id);')).toBe(false);
  });
  it('clears on a literal new Date(...) construction anywhere in the file (positional-now pins)', () => {
    expect(isViolation("smsQuietWindowReleaseIso(new Date('2026-01-16T03:00:00.000Z'))")).toBe(false);
    expect(isViolation('resolveChairmanZone(new Date(1700000000000))')).toBe(false);
  });
  it('does NOT clear on new Date() with no literal argument (the real-clock-dependent shape)', () => {
    expect(isViolation('const t = new Date().toISOString(); reconcileOutboundSms(sb, { provider: t });')).toBe(true);
  });
  it('never counts "name: stub" (DI / vi.mock factory keys) as a real call', () => {
    expect(isViolation("vi.mock('x', () => ({ resolveChairmanZone: vi.fn() }));")).toBe(false);
    expect(isViolation('const opts = { resolveChairmanZone: zoneStub, sender };')).toBe(false);
  });
  it('the pragma always wins when it carries a reason, even with a real violation present', () => {
    expect(isViolation('// wall-clock-test-lint-disable-file: mocked via vi.mock in a sibling file\nawait reconcileOutboundSms(sb, {});')).toBe(false);
  });
  it('a bare pragma with no reason does NOT clear a violation (an unexplained opt-out is a bypass)', () => {
    expect(isViolation('// wall-clock-test-lint-disable-file\nawait reconcileOutboundSms(sb, {});')).toBe(true);
  });
  it('a file with no entry-point reference at all is never a violation', () => {
    expect(isViolation('describe("unrelated", () => { it("x", () => expect(1).toBe(1)); });')).toBe(false);
  });
  it('every declared entry point is individually detectable', () => {
    for (const name of TIME_SENSITIVE_ENTRY_POINTS) {
      expect(isViolation(`${name}(sb, {});`)).toBe(true);
    }
  });
});

describe('parseRenameMap', () => {
  it('maps new path -> old path for R-status lines, ignoring other statuses', () => {
    const nameStatus = 'M\ttests/a.test.js\nR100\ttests/old-name.test.js\ttests/new-name.test.js\nA\ttests/b.test.js';
    const renames = parseRenameMap(nameStatus);
    expect(renames.get('tests/new-name.test.js')).toBe('tests/old-name.test.js');
    expect(renames.has('tests/a.test.js')).toBe(false);
  });
});

/** Injected fake git runner: canned answers per argv shape, mirrors shell-injection-argv-lint.test.js's convention. */
function fakeRun({ mergeBase = 'deadbeef', nameStatus = '', mergeBaseBlobs = {} }) {
  return (args) => {
    if (args[0] === 'merge-base') return mergeBase;
    if (args[0] === 'diff' && args.includes('--name-status')) return nameStatus;
    if (args[0] === 'show') {
      const spec = args[1]; // "<sha>:<path>"
      const p = spec.slice(spec.indexOf(':') + 1);
      if (Object.prototype.hasOwnProperty.call(mergeBaseBlobs, p)) {
        return { status: 0, stdout: mergeBaseBlobs[p] };
      }
      return { status: 128, stdout: '' };
    }
    throw new Error(`unexpected git args: ${JSON.stringify(args)}`);
  };
}

const VIOLATING = 'await reconcileOutboundSms(sb, { provider: stubProvider });';
const CLEAN = 'await reconcileOutboundSms(sb, { provider: stubProvider, now: Date.now() });';

describe('runDiffMode', () => {
  it('a newly-added violating file (absent at the merge base) is NEW (blocking)', () => {
    const run = fakeRun({ nameStatus: 'A\ttests/new.test.js', mergeBaseBlobs: {} });
    const result = runDiffMode('origin/main', { run, readCurrentFile: () => VIOLATING });
    expect(result.newViolations).toEqual(['tests/new.test.js']);
    expect(result.preExisting).toEqual([]);
  });

  it('a file already violating at the merge base is pre-existing (reported, not blocking)', () => {
    const run = fakeRun({
      nameStatus: 'M\ttests/existing.test.js',
      mergeBaseBlobs: { 'tests/existing.test.js': VIOLATING },
    });
    const result = runDiffMode('origin/main', { run, readCurrentFile: () => VIOLATING });
    expect(result.preExisting).toEqual(['tests/existing.test.js']);
    expect(result.newViolations).toEqual([]);
  });

  it('a file that GAINED a violation since the merge base (was clean, now is not) is NEW', () => {
    const run = fakeRun({
      nameStatus: 'M\ttests/regressed.test.js',
      mergeBaseBlobs: { 'tests/regressed.test.js': CLEAN },
    });
    const result = runDiffMode('origin/main', { run, readCurrentFile: () => VIOLATING });
    expect(result.newViolations).toEqual(['tests/regressed.test.js']);
  });

  it('a currently-clean file is never reported, regardless of merge-base state', () => {
    const run = fakeRun({ nameStatus: 'M\ttests/clean.test.js', mergeBaseBlobs: { 'tests/clean.test.js': VIOLATING } });
    const result = runDiffMode('origin/main', { run, readCurrentFile: () => CLEAN });
    expect(result.newViolations).toEqual([]);
    expect(result.preExisting).toEqual([]);
  });

  it('a RENAMED file already violating at its OLD path is pre-existing, not a false "new" (the rename bug this SD fixes)', () => {
    const run = fakeRun({
      nameStatus: 'R100\ttests/old-name.test.js\ttests/new-name.test.js',
      mergeBaseBlobs: { 'tests/old-name.test.js': VIOLATING }, // only the OLD path exists at merge base
    });
    const result = runDiffMode('origin/main', { run, readCurrentFile: () => VIOLATING });
    expect(result.preExisting).toEqual(['tests/new-name.test.js']);
    expect(result.newViolations).toEqual([]);
  });

  it('degrades cleanly (never throws) when the merge-base ref cannot be resolved', () => {
    const run = () => { throw new Error('fatal: not a valid object name'); };
    const result = runDiffMode('origin/main', { run });
    expect(result.mode).toBe('diff (degraded)');
    expect(result.newViolations).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.degradedReason).toContain('fatal');
  });
});
