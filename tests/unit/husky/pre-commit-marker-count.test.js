/**
 * SD-FDBK-INFRA-HUSKY-PRE-COMMIT-001
 * .husky/pre-commit line ~144 printed "[: 0 0: integer expression expected" (~28x) when
 * staging CLAUDE*.md files: `grep -c PATTERN file || echo 0` produced "0\n0" on no-match
 * (grep -c ALREADY prints "0" and exits 1, then `|| echo 0` appends a second "0"), which
 * `[ "$VAR" -eq 0 ]` cannot parse. Fixed to `|| true` + `:-0` so the marker-count is always
 * a single integer. This test pins the SHELL pattern (not the whole hook) via bash.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function bashAvailable() {
  const r = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

// Run a snippet under bash, returning { stdout, stderr, status }. spawnSync captures BOTH
// stdout and stderr regardless of exit code (execSync drops stderr on a 0 exit — and the
// broken pattern's `[` error is swallowed by the surrounding `if`, so the process exits 0).
function runBash(script) {
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? 1 };
}

const d = bashAvailable() ? describe : describe.skip;

d('husky pre-commit CLAUDE marker-count (grep -c quoting)', () => {
  const tmp = path.join(os.tmpdir(), `husky-marker-count-${process.pid}.txt`);

  function writeNoMarkers() { fs.writeFileSync(tmp, 'just some content with no markers\n'); }
  function cleanup() { try { fs.unlinkSync(tmp); } catch { /* noop */ } }

  it('the OLD `|| echo 0` pattern double-counts and breaks the integer test (regression proof)', () => {
    writeNoMarkers();
    const r = runBash(`
      HAS=$(grep -c "AUTO-GENERATED from the database" "${tmp}" 2>/dev/null || echo 0)
      if [ "$HAS" -eq 0 ]; then echo ok; fi
    `);
    cleanup();
    // The defect signature: "integer expression expected" on stderr.
    expect(r.stderr).toMatch(/integer expression expected/);
  });

  it('the FIXED pattern yields a single integer and NO error on no-match', () => {
    writeNoMarkers();
    const r = runBash(`
      HAS=$(grep -c "AUTO-GENERATED from the database" "${tmp}" 2>/dev/null || true); HAS=\${HAS:-0}
      printf 'value=[%s]' "$HAS"
      if [ "$HAS" -eq 0 ]; then echo " ok"; fi
    `);
    cleanup();
    expect(r.stderr).not.toMatch(/integer expression expected/);
    expect(r.stdout).toContain('value=[0]');
    expect(r.stdout).toContain('ok');
  });

  it('the FIXED pattern counts a present marker as a single integer (1)', () => {
    fs.writeFileSync(tmp, 'AUTO-GENERATED from the database\nLast Generated: now\n');
    const r = runBash(`
      HAS=$(grep -c "AUTO-GENERATED from the database" "${tmp}" 2>/dev/null || true); HAS=\${HAS:-0}
      printf 'value=[%s]' "$HAS"
      if [ "$HAS" -eq 0 ]; then echo " missing"; else echo " present"; fi
    `);
    cleanup();
    expect(r.stderr).not.toMatch(/integer expression expected/);
    expect(r.stdout).toContain('value=[1]');
    expect(r.stdout).toContain('present');
  });

  it('the FIXED pattern is safe when the file is unreadable (empty grep output → 0)', () => {
    const r = runBash(`
      HAS=$(grep -c "x" "/nonexistent-file-xyz-$$" 2>/dev/null || true); HAS=\${HAS:-0}
      printf 'value=[%s]' "$HAS"
      if [ "$HAS" -eq 0 ]; then echo " ok"; fi
    `);
    expect(r.stderr).not.toMatch(/integer expression expected/);
    expect(r.stdout).toContain('value=[0]');
    expect(r.stdout).toContain('ok');
  });

  it('the actual .husky/pre-commit no longer contains the `|| echo 0` marker-count antipattern', () => {
    const hook = fs.readFileSync(path.resolve(process.cwd(), '.husky/pre-commit'), 'utf8');
    // The two marker-count lines must use the robust form, not `grep -c ... || echo 0`.
    expect(hook).not.toMatch(/HAS_AUTO_GEN=\$\(grep -c[^\n]*\|\| echo 0\)/);
    expect(hook).not.toMatch(/HAS_TIMESTAMP=\$\(grep -c[^\n]*\|\| echo 0\)/);
    expect(hook).toMatch(/HAS_AUTO_GEN=\$\{HAS_AUTO_GEN:-0\}/);
    expect(hook).toMatch(/HAS_TIMESTAMP=\$\{HAS_TIMESTAMP:-0\}/);
  });
});
