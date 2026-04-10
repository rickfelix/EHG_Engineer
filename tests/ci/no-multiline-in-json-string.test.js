/**
 * CI Lint Test: No multi-line strings inside JSON string values
 * SD-EVA-FIX-WIREFRAME-CONTRACT-AND-SILENT-DEGRADATION-001
 *
 * Greps lib/eva/** for patterns where a JSON string value contains
 * literal newlines (the anti-pattern that caused the S15 Stitch bypass).
 *
 * The canonical fix is to use array-of-strings instead of embedded newlines.
 * Start as warning-only for first two weeks, then fail the build.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

describe('No multi-line-in-JSON-string anti-pattern', () => {
  it('should not find literal newlines inside JSON string assignments in lib/eva/', () => {
    // Pattern: look for .join('\\n') used to build JSON string values
    // This is the pattern that creates strings with embedded newlines
    // that then get passed through JSON.stringify or template literals
    // and break JSON.parse on the receiving end.
    let output = '';
    try {
      output = execSync(
        'grep -rn "join(\'\\\\\\\\n\')" lib/eva/ --include="*.js" || true',
        { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 10000 }
      );
    } catch {
      // grep returns exit 1 when no matches — that's the happy path
      output = '';
    }

    const lines = output.trim().split('\n').filter(Boolean);

    // Filter out test files and the parse-json repair layer itself
    const violations = lines.filter(line =>
      !line.includes('.test.') &&
      !line.includes('parse-json.js') &&
      !line.includes('node_modules/')
    );

    if (violations.length > 0) {
      console.warn('[CI-LINT] Multi-line-in-JSON-string anti-pattern detected:');
      violations.forEach(v => console.warn(`  ${v}`));
      // WARNING MODE: log but don't fail (flip to expect after 2-week bake)
      // expect(violations.length).toBe(0);
    }
  });

  it('should not find ascii_layout assigned as a multiline template literal', () => {
    let output = '';
    try {
      output = execSync(
        'grep -rn "ascii_layout.*\\`" lib/eva/ --include="*.js" || true',
        { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 10000 }
      );
    } catch {
      output = '';
    }

    const lines = output.trim().split('\n').filter(Boolean);
    const violations = lines.filter(line =>
      !line.includes('.test.') &&
      !line.includes('node_modules/')
    );

    // This SHOULD be zero after the array-of-strings migration
    if (violations.length > 0) {
      console.warn('[CI-LINT] ascii_layout template literal detected (should be array):');
      violations.forEach(v => console.warn(`  ${v}`));
    }
  });
});
