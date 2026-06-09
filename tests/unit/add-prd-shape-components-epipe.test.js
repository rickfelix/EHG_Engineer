/**
 * SD-LEO-INFRA-HARDEN-ADD-PRD-001
 * Two robustness defects in the add-prd-to-database CLI:
 *  (1) validateContentPayloadShape did not recurse into system_architecture.components, so a
 *      non-array .components passed SHAPE-CHECK then crashed downstream (formatters.js
 *      arch.components.forEach is not a function).
 *  (2) No EPIPE-safe stdout handling — piping the ~180KB output through head/grep crashed the
 *      process (unhandled EPIPE) before the async DB insert on POSIX/CI.
 *
 * Behavioral coverage for (1) via the exported validateContentPayloadShape; static-guard pins for
 * the formatters Array.isArray hardening and the CLI EPIPE handler.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContentPayloadShape } from '../../scripts/add-prd-to-database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const base = () => ({ title: 'X', executive_summary: 'Y' });

describe('SD-LEO-INFRA-HARDEN-ADD-PRD-001: shape check recurses into system_architecture.components', () => {
  it('THROWS CONTENT_SHAPE_VIOLATION when .components is a string (the downstream-crash payload)', () => {
    let err;
    try {
      validateContentPayloadShape({ ...base(), system_architecture: { overview: 'o', components: 'not-an-array' } });
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe('CONTENT_SHAPE_VIOLATION');
    expect(err.message).toMatch(/system_architecture\.components/);
  });

  it('THROWS when .components is an object (also non-array)', () => {
    expect(() =>
      validateContentPayloadShape({ ...base(), system_architecture: { components: { a: 1 } } })
    ).toThrow(/CONTENT_SHAPE_VIOLATION|system_architecture\.components/);
  });

  it('PASSES when .components is an array', () => {
    expect(() =>
      validateContentPayloadShape({ ...base(), system_architecture: { components: [{ name: 'C' }] } })
    ).not.toThrow();
  });

  it('PASSES when system_architecture has no .components key (optional)', () => {
    expect(() =>
      validateContentPayloadShape({ ...base(), system_architecture: { overview: 'o' } })
    ).not.toThrow();
  });

  it('still rejects a non-object system_architecture (pre-existing behavior preserved)', () => {
    expect(() =>
      validateContentPayloadShape({ ...base(), system_architecture: 'a string' })
    ).toThrow(/CONTENT_SHAPE_VIOLATION|system_architecture/);
  });
});

describe('SD-LEO-INFRA-HARDEN-ADD-PRD-001: formatters.js guards components with Array.isArray', () => {
  const src = read('scripts/prd/formatters.js');
  it('guards arch.components with Array.isArray (no more bare .length/.forEach on a string)', () => {
    expect(src).toMatch(/Array\.isArray\(arch\.components\)/);
    expect(src).not.toMatch(/if \(arch\.components && arch\.components\.length/);
  });
  it('guards arch.integration_points with Array.isArray too', () => {
    expect(src).toMatch(/Array\.isArray\(arch\.integration_points\)/);
  });
});

describe('SD-LEO-INFRA-HARDEN-ADD-PRD-001: add-prd CLI has an EPIPE-tolerant stdout handler', () => {
  const src = read('scripts/add-prd-to-database.js');
  it('registers a process.stdout error handler', () => {
    expect(src).toMatch(/process\.stdout\.on\(\s*['"]error['"]/);
  });
  it('swallows EPIPE specifically (does not crash on a closed pipe)', () => {
    expect(src).toMatch(/EPIPE/);
  });
});
