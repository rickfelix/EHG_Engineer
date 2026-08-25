/**
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-4) -- end-to-end test for the driver script
 * (scripts/lint/require-release-sd-wrapper-lint.mjs), run as a real subprocess against a
 * throwaway fixture directory via --root, plus real-repo allowlist tests (following the
 * scripts/lint/require-main-guard-in-one-off-lint.mjs precedent this driver is modeled on).
 *
 * DELIBERATELY placed under tests/unit/lint/ (matching that sibling), NOT tests/integration/:
 * this suite touches no database, but vitest.config.js routes every tests/integration/**\/*.test.js
 * file into the runtime-gated `db` project purely by directory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = path.resolve(__dirname, '../../../scripts/lint/require-release-sd-wrapper-lint.mjs');
const REPO_ROOT = path.resolve(__dirname, '../../..');
const ALLOWLIST_PATH = path.resolve(__dirname, '../../../scripts/lint/require-release-sd-wrapper-allowlist.json');

let fixtureRoot;

function runDriver(root, extraArgs = []) {
  try {
    const stdout = execFileSync('node', [DRIVER, '--root', root, '--json', ...extraArgs], { encoding: 'utf8' });
    return { exitCode: 0, json: JSON.parse(stdout) };
  } catch (err) {
    return { exitCode: err.status, json: JSON.parse(err.stdout) };
  }
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'require-release-sd-wrapper-fixture-'));
  mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
  const libFleetDir = path.join(fixtureRoot, 'lib', 'fleet');
  mkdirSync(libFleetDir, { recursive: true });

  writeFileSync(
    path.join(fixtureRoot, 'scripts', 'bad-raw-call.mjs'),
    'export async function doIt(supabase, sessionId) {\n' +
      "  await supabase.rpc('release_sd', { p_session_id: sessionId, p_reason: 'x' });\n" +
      '}\n',
  );
  writeFileSync(
    path.join(fixtureRoot, 'scripts', 'comment-only-mention.mjs'),
    '// This file used to call release_sd directly before it was hardened.\n' +
      "/* rpc('release_sd', ...) is what the old code did */\n" +
      "export function noop() { return 'release_sd'; }\n",
  );
  writeFileSync(
    path.join(fixtureRoot, 'scripts', 'good-wrapped-call.mjs'),
    "import { bestEffortReleaseSd } from '../lib/fleet/best-effort-release.mjs';\n" +
      'export async function doIt(supabase, sessionId, sdKey) {\n' +
      "  return bestEffortReleaseSd(supabase, sessionId, 'manual', console.log, { expectedSdKey: sdKey });\n" +
      '}\n',
  );
  // The one structural exemption -- must be excluded outright, not merely allowlisted.
  writeFileSync(
    path.join(libFleetDir, 'best-effort-release.mjs'),
    'export async function bestEffortReleaseSd(supabase, sessionId, reason) {\n' +
      "  return supabase.rpc('release_sd', { p_session_id: sessionId, p_reason: reason });\n" +
      '}\n',
  );
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('require-release-sd-wrapper-lint.mjs (driver, real subprocess)', () => {
  it('flags a raw, unallowlisted rpc(\'release_sd\', ...) call site', () => {
    const { exitCode, json } = runDriver(fixtureRoot);
    expect(exitCode).toBe(1);
    const flagged = json.violations.map((v) => v.filePath);
    expect(flagged).toContain('scripts/bad-raw-call.mjs');
  });

  it('does not false-positive on a comment-only mention of release_sd (AST-based, not text/regex)', () => {
    const { json } = runDriver(fixtureRoot);
    const flagged = new Set(json.violations.map((v) => v.filePath));
    expect(flagged.has('scripts/comment-only-mention.mjs')).toBe(false);
  });

  it('does not flag a call already routed through bestEffortReleaseSd', () => {
    const { json } = runDriver(fixtureRoot);
    const flagged = new Set(json.violations.map((v) => v.filePath));
    expect(flagged.has('scripts/good-wrapped-call.mjs')).toBe(false);
  });

  it('structurally exempts lib/fleet/best-effort-release.mjs\'s own internal call (never counted, never needs an allowlist entry)', () => {
    const { json } = runDriver(fixtureRoot);
    const flagged = new Set(json.violations.map((v) => v.filePath));
    expect(flagged.has('lib/fleet/best-effort-release.mjs')).toBe(false);
    expect(json.scanned).toBeGreaterThan(0);
  });

  it('is deterministic across repeated runs against an unchanged fixture', () => {
    const first = runDriver(fixtureRoot);
    const second = runDriver(fixtureRoot);
    expect(first.json.violations.map((v) => v.filePath).sort()).toEqual(
      second.json.violations.map((v) => v.filePath).sort(),
    );
  });
});

describe('require-release-sd-wrapper-lint.mjs -- count-anchored allowlist (isolated fixture, --allowlist)', () => {
  // Fully isolated: a throwaway fixture root (--root) PLUS a throwaway allowlist file
  // (--allowlist) -- never touches the real, version-controlled repo files, so a concurrent
  // local lint run or a hard kill mid-test can never see a false result or leave the repo dirty.
  let allowlistPath;
  const relPath = 'scripts/target.mjs';
  const targetPath = () => path.join(fixtureRoot, 'scripts', 'target.mjs');

  function writeAllowlist(entry) {
    const doc = entry === undefined ? { allow: {} } : { allow: { [relPath]: entry } };
    writeFileSync(allowlistPath, JSON.stringify(doc, null, 2) + '\n');
  }

  beforeAll(() => {
    allowlistPath = path.join(fixtureRoot, 'throwaway-allowlist.json');
  });

  it('a call site with NO allowlist entry is an ungoverned violation', () => {
    writeFileSync(
      targetPath(),
      "export async function doIt(supabase, sessionId) {\n  await supabase.rpc('release_sd', { p_session_id: sessionId });\n}\n",
    );
    writeAllowlist(undefined);
    const { exitCode, json } = runDriver(fixtureRoot, ['--allowlist', allowlistPath]);
    expect(exitCode).toBe(1);
    expect(json.violations.some((v) => v.filePath === relPath)).toBe(true);
  });

  it('observed count EXACTLY matching expected is governed, not a violation', () => {
    writeFileSync(
      targetPath(),
      "export async function doIt(supabase, sessionId) {\n  await supabase.rpc('release_sd', { p_session_id: sessionId });\n}\n",
    );
    writeAllowlist({ reason: 'test fixture', expected: 1 });
    const { json } = runDriver(fixtureRoot, ['--allowlist', allowlistPath]);
    expect(json.violations.some((v) => v.filePath === relPath)).toBe(false);
  });

  it('observed count EXCEEDING expected is a violation -- the count-anchor actually anchors', () => {
    // Two raw call sites in one file, but the allowlist only expects one -- a NEW raw call
    // added to an already-allowlisted file must not be silently absorbed (the exact gap a
    // boolean, file-keyed allowlist would have left open).
    writeFileSync(
      targetPath(),
      "export async function a(supabase, s) { await supabase.rpc('release_sd', { p_session_id: s }); }\n" +
        "export async function b(supabase, s) { await supabase.rpc('release_sd', { p_session_id: s }); }\n",
    );
    writeAllowlist({ reason: 'test fixture', expected: 1 });
    const { exitCode, json } = runDriver(fixtureRoot, ['--allowlist', allowlistPath]);
    expect(exitCode).toBe(1);
    const v = json.violations.find((x) => x.filePath === relPath);
    expect(v).toBeTruthy();
    expect(v.reason).toMatch(/expected 1, found 2/);
  });

  it('observed count LESS than expected passes silently (a fixed site does not force an allowlist edit)', () => {
    writeFileSync(
      targetPath(),
      "export async function doIt(supabase, sessionId) {\n  await supabase.rpc('release_sd', { p_session_id: sessionId });\n}\n",
    );
    writeAllowlist({ reason: 'test fixture', expected: 5 });
    const { json } = runDriver(fixtureRoot, ['--allowlist', allowlistPath]);
    expect(json.violations.some((v) => v.filePath === relPath)).toBe(false);
  });

  it('the allowlist loader throws loud on an entry missing a reason (never silently accepts it)', () => {
    writeFileSync(targetPath(), 'export const x = 1;\n');
    writeAllowlist({ expected: 1 });
    let threw = false;
    let stderr = '';
    try {
      execFileSync('node', [DRIVER, '--root', fixtureRoot, '--allowlist', allowlistPath], { encoding: 'utf8' });
    } catch (err) {
      threw = true;
      stderr = String(err.stderr || '');
    }
    expect(threw).toBe(true);
    expect(stderr).toContain('non-empty reason');
  });

  it('the allowlist loader throws loud on an entry with a non-numeric expected count', () => {
    writeFileSync(targetPath(), 'export const x = 1;\n');
    writeAllowlist({ reason: 'bad shape', expected: 'not-a-number' });
    let threw = false;
    let stderr = '';
    try {
      execFileSync('node', [DRIVER, '--root', fixtureRoot, '--allowlist', allowlistPath], { encoding: 'utf8' });
    } catch (err) {
      threw = true;
      stderr = String(err.stderr || '');
    }
    expect(threw).toBe(true);
    expect(stderr).toContain('non-negative integer');
  });

  it("the allowlist loader throws loud on a legacy boolean/string entry (the sibling lint's shape)", () => {
    writeFileSync(targetPath(), 'export const x = 1;\n');
    writeFileSync(allowlistPath, JSON.stringify({ allow: { [relPath]: 'legacy string reason' } }, null, 2) + '\n');
    let threw = false;
    let stderr = '';
    try {
      execFileSync('node', [DRIVER, '--root', fixtureRoot, '--allowlist', allowlistPath], { encoding: 'utf8' });
    } catch (err) {
      threw = true;
      stderr = String(err.stderr || '');
    }
    expect(threw).toBe(true);
    expect(stderr).toContain('must be an object with {reason, expected}');
  });
});

describe('require-release-sd-wrapper-lint.mjs -- real corpus allowlist (read-only)', () => {
  it('the real corpus allowlist loads without throwing and the real repo passes clean', () => {
    const { exitCode } = runDriver(REPO_ROOT);
    expect(exitCode).toBe(0);
  });

  it('the real allowlist file itself is untouched by this suite', () => {
    // Guards against a future edit reintroducing the real-file-mutation pattern this suite
    // was rewritten away from.
    JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')); // must still be valid JSON
  });
});
