/**
 * SD-LEO-INFRA-BIND-OBSERVE-ONLY-001, FR-6/TS-7.
 *
 * Static source check only -- no DB access, deliberately NOT named *.db.test.js so it runs as
 * part of the default `unit` vitest project (vitest.config.js routes **\/*.db.test.js into the
 * DB-gated `db` project, which skips every test on an undesignated target regardless of whether
 * the individual test touches the network -- a plain read-only fs check placed there would skip
 * silently rather than actually running in CI's default `npm run test:unit`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

describe('scripts/eva/check-bind-criteria.mjs is provably read-only', () => {
  it('contains zero .update(/.insert(/.upsert(/.delete( calls', () => {
    const cliPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../scripts/eva/check-bind-criteria.mjs'
    );
    const source = readFileSync(cliPath, 'utf8');
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.upsert\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
  });

  it('imports its query/evaluator functions from the checker module rather than reimplementing them', () => {
    const cliPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../scripts/eva/check-bind-criteria.mjs'
    );
    const source = readFileSync(cliPath, 'utf8');
    expect(source).toMatch(/from ['"]\.\.\/\.\.\/lib\/eva\/lifecycle\/bind-criterion-checker\.js['"]/);
  });
});
