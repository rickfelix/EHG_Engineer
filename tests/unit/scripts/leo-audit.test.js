/**
 * LEO Audit Script Tests
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-E
 *
 * Tests the leo-audit.js script by running it as a child process.
 * Verifies output formatting, exit codes, and flag handling.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'leo-audit.js');

// CLI integration tests need a live Supabase connection. In CI runs without
// secrets the synthetic sentinel from tests/setup.js is in scope; detect and
// skip rather than spawn a child that exits 1 from unresolvable URL.
const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

function runScript(args = '') {
  const cmd = `node ${SCRIPT} ${args}`;
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
}

describe.skipIf(!HAS_REAL_DB)('leo-audit.js', () => {
  test('exits with code 0 and displays report header', () => {
    const output = runScript();
    expect(output).toContain('LEO AUDIT DISCOVERY REPORT');
  });

  test('displays all three sections', () => {
    const output = runScript();
    expect(output).toContain('ISSUE PATTERNS');
    expect(output).toContain('COMPLIANCE ALERTS');
    expect(output).toContain('RETROSPECTIVE INSIGHTS');
  });

  test('shows pattern counts', () => {
    const output = runScript();
    // Should contain "Active: X  |  Resolved: Y" pattern
    expect(output).toMatch(/Active:\s+\d+\s+\|\s+Resolved:\s+\d+/);
  });

  test('--verbose flag shows additional detail', () => {
    const output = runScript('--verbose');
    expect(output).toContain('LEO AUDIT DISCOVERY REPORT');
    // Verbose should show more retrospectives (up to 10 vs 5)
    expect(output).toContain('RETROSPECTIVE INSIGHTS');
  });

  test('--format json outputs valid JSON', () => {
    const output = runScript('--format json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('patterns');
    expect(parsed).toHaveProperty('alerts');
    expect(parsed).toHaveProperty('retros');
    expect(Array.isArray(parsed.patterns)).toBe(true);
    expect(Array.isArray(parsed.alerts)).toBe(true);
    expect(Array.isArray(parsed.retros)).toBe(true);
  });

  test('JSON output contains expected fields in patterns', () => {
    const output = runScript('--format json');
    const parsed = JSON.parse(output);
    if (parsed.patterns.length > 0) {
      const p = parsed.patterns[0];
      expect(p).toHaveProperty('pattern_id');
      expect(p).toHaveProperty('severity');
      expect(p).toHaveProperty('occurrence_count');
    }
  });

  test('footer shows usage hints', () => {
    const output = runScript();
    expect(output).toContain('--verbose');
    expect(output).toContain('--format json');
  });
});
