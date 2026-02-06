/**
 * LEO Analytics Script Tests
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-E
 *
 * Tests the leo-analytics.js script by running it as a child process.
 * Verifies output formatting, exit codes, and flag handling.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'leo-analytics.js');

function runScript(args = '') {
  const cmd = `node ${SCRIPT} ${args}`;
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
}

describe('leo-analytics.js', () => {
  test('exits with code 0 and displays dashboard header', () => {
    const output = runScript();
    expect(output).toContain('LEO SELF-IMPROVEMENT ANALYTICS DASHBOARD');
  });

  test('displays all four metric sections', () => {
    const output = runScript();
    expect(output).toContain('FEEDBACK PIPELINE');
    expect(output).toContain('ENHANCEMENT OUTCOMES');
    expect(output).toContain('PATTERN RESOLUTION');
    expect(output).toContain('VETTING COVERAGE');
  });

  test('shows numeric metrics', () => {
    const output = runScript();
    // Should contain "Total Items:" or similar metric labels
    expect(output).toMatch(/Total Items:\s+\d+/);
    expect(output).toMatch(/Resolution Rate:\s+\d+\.\d+%/);
    expect(output).toMatch(/Total Patterns:\s+\d+/);
    expect(output).toMatch(/Proposals Vetted:\s+\d+/);
  });

  test('shows enhancement pipeline metrics', () => {
    const output = runScript();
    expect(output).toMatch(/Proposals Created:\s+\d+/);
    expect(output).toMatch(/Approval Rate:\s+\d+\.\d+%/);
    expect(output).toMatch(/Implementation Rate:\s+\d+\.\d+%/);
  });

  test('--verbose flag shows additional breakdowns', () => {
    const output = runScript('--verbose');
    expect(output).toContain('LEO SELF-IMPROVEMENT ANALYTICS DASHBOARD');
  });

  test('--format json outputs valid JSON', () => {
    const output = runScript('--format json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('feedback');
    expect(parsed).toHaveProperty('enhancements');
    expect(parsed).toHaveProperty('patterns');
    expect(parsed).toHaveProperty('vetting');
  });

  test('JSON output has correct metric structure', () => {
    const output = runScript('--format json');
    const parsed = JSON.parse(output);

    // Feedback
    expect(parsed.feedback).toHaveProperty('total');
    expect(parsed.feedback).toHaveProperty('processed');
    expect(parsed.feedback).toHaveProperty('resolutionRate');

    // Enhancements
    expect(parsed.enhancements).toHaveProperty('total');
    expect(parsed.enhancements).toHaveProperty('approvalRate');
    expect(parsed.enhancements).toHaveProperty('implementationRate');

    // Patterns
    expect(parsed.patterns).toHaveProperty('total');
    expect(parsed.patterns).toHaveProperty('resolved');
    expect(parsed.patterns).toHaveProperty('active');
    expect(parsed.patterns).toHaveProperty('recurring');
    expect(parsed.patterns).toHaveProperty('bySeverity');

    // Vetting
    expect(parsed.vetting).toHaveProperty('total');
    expect(parsed.vetting).toHaveProperty('avgRubricScore');
    expect(parsed.vetting).toHaveProperty('approvalRate');
  });

  test('pattern metrics are internally consistent', () => {
    const output = runScript('--format json');
    const parsed = JSON.parse(output);
    const p = parsed.patterns;
    expect(p.total).toBe(p.resolved + p.active);
    expect(typeof p.recurring).toBe('number');
    expect(p.recurring).toBeLessThanOrEqual(p.total);
  });

  test('footer shows usage hints', () => {
    const output = runScript();
    expect(output).toContain('--verbose');
    expect(output).toContain('--format json');
  });
});
