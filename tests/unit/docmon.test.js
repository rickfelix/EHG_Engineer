/**
 * DOCMON Test Suite
 * Tests Strunkian Writing Rules validation
 */

import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const FIXTURES_DIR = path.join(process.cwd(), 'tests/fixtures/strunkian');

function runDocmon(file) {
  try {
    const result = execSync(
      `node scripts/docmon.js --file "${file}" --json`,
      { encoding: 'utf-8' }
    );
    return { success: true, output: JSON.parse(result) };
  } catch (error) {
    try {
      return { success: false, output: JSON.parse(error.stdout) };
    } catch {
      return { success: false, output: null, error: error.message };
    }
  }
}

describe('DOCMON Blacklist Validation', () => {
  test('detects blacklisted words in positive cases', () => {
    const result = runDocmon(path.join(FIXTURES_DIR, 'blacklist-positive.md'));

    // Should have violations
    expect(result.output.summary.blacklistViolations).toBeGreaterThan(0);

    // Should detect all 5 blacklisted words
    const violations = result.output.results[0].violations;
    const words = violations.map(v => v.word.toLowerCase());
    expect(words).toContain('leverage');
    expect(words).toContain('robust');
    expect(words).toContain('seamless');
    expect(words).toContain('pivotal');
    expect(words).toContain('crucial');
  });

  test('passes on negative cases (no blacklist violations)', () => {
    const result = runDocmon(path.join(FIXTURES_DIR, 'blacklist-negative.md'));

    expect(result.output.summary.blacklistViolations).toBe(0);
  });
});

describe('DOCMON Passive Voice Detection', () => {
  test('detects passive voice in positive cases', () => {
    const result = runDocmon(path.join(FIXTURES_DIR, 'passive-voice-positive.md'));

    // Should have passive voice warnings
    expect(result.output.summary.passiveViolations).toBeGreaterThan(0);
  });

  test('passes on negative cases (active voice)', () => {
    const result = runDocmon(path.join(FIXTURES_DIR, 'passive-voice-negative.md'));

    // Should have zero passive voice warnings
    expect(result.output.summary.passiveViolations).toBe(0);
  });
});

describe('DOCMON Verbosity Detection', () => {
  test('detects verbose phrases in positive cases', () => {
    const result = runDocmon(path.join(FIXTURES_DIR, 'verbosity-positive.md'));

    // Should have verbosity warnings
    expect(result.output.summary.verbosityViolations).toBeGreaterThan(0);
  });

  test('passes on negative cases (concise writing)', () => {
    const result = runDocmon(path.join(FIXTURES_DIR, 'verbosity-negative.md'));

    // Should have zero verbosity warnings
    expect(result.output.summary.verbosityViolations).toBe(0);
  });
});

describe('DOCMON Efficiency Score', () => {
  test('calculates word counts excluding code blocks', () => {
    const result = runDocmon(path.join(FIXTURES_DIR, 'blacklist-negative.md'));

    // Should have efficiency score
    expect(result.output.results[0].efficiencyScore).toBeDefined();
    expect(result.output.results[0].efficiencyScore.afterWords).toBeGreaterThan(0);
  });
});
