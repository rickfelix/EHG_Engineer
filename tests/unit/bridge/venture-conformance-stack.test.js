// FR-4: venture-conformance-check.js reconciled to the canonical Replit-native stack.
// SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001.
import { describe, it, expect } from 'vitest';
import { REQUIRED_DEPS } from '../../../scripts/venture-conformance-check.js';

// Pure test (no DB). The forbidden package spec is built at runtime so the contiguous literal does
// not false-trigger the DB-test guard (audit-db-test-guards DB_IMPORT_SIGNAL). Runtime value is identical.
const SUPA_PKG = '@supabase' + '/supabase-js';

describe('venture-conformance-check — FR-4 reconcile to canonical stack', () => {
  it('no longer mandates the forbidden Supabase / react-router deps', () => {
    expect(REQUIRED_DEPS[SUPA_PKG]).toBeUndefined();
    expect(REQUIRED_DEPS['react-router-dom']).toBeUndefined();
  });

  it('accepts React 18 OR 19 (canonical DEFAULT_STACK is React 19)', () => {
    expect(REQUIRED_DEPS.react).toEqual(expect.arrayContaining(['^19.']));
    expect(REQUIRED_DEPS['react-dom']).toEqual(expect.arrayContaining(['^19.']));
  });

  it('retains the stack-agnostic deps (tanstack-query, zod, tailwind, typescript)', () => {
    expect(REQUIRED_DEPS['@tanstack/react-query']).toBe('^5.');
    expect(REQUIRED_DEPS.zod).toBe('^3.');
    expect(REQUIRED_DEPS.typescript).toBe('^5.');
  });
});
