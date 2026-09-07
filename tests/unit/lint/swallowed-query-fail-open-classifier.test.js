/**
 * Tests for the FR-2 fail-open classifier (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001).
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { classifyAll } from '../../../scripts/lint/swallowed-query-fail-open-classifier.mjs';

/** Write `src` as lib/gates/<name> under a fresh temp tree, classify it, and clean up. */
function classifyFixture(name, src) {
  const dir = mkdtempSync(join(tmpdir(), 'fail-open-classifier-'));
  try {
    const gatesDir = join(dir, 'lib', 'gates');
    mkdirSync(gatesDir, { recursive: true });
    writeFileSync(join(gatesDir, name), src);
    return classifyAll(dir).filter((r) => r.file.endsWith(name));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('swallowed-query-fail-open-classifier', () => {
  it('classifies a bare `return { passed: true }` catch as fail_open', () => {
    const found = classifyFixture('bare.js', `
export async function gate(supabase) {
  try {
    const { data } = await supabase.from('t').select('*');
    return { passed: !!data };
  } catch (e) {
    return { passed: true, score: 50 };
  }
}
`.trim());
    expect(found.length).toBe(1);
    expect(found[0].classification).toBe('fail_open');
  });

  it('classifies a helper-wrapped `return buildResult({ passed: true })` catch as fail_open', () => {
    const found = classifyFixture('wrapped.js', `
import { buildResult } from './helper.js';
export async function gate(supabase) {
  try {
    const { data } = await supabase.from('t').select('*');
    return buildResult({ passed: !!data });
  } catch (e) {
    return buildResult({ passed: true, score: 50, warnings: [e.message] });
  }
}
`.trim());
    expect(found.length).toBe(1);
    expect(found[0].classification).toBe('fail_open');
  });

  it('classifies a catch that returns passed:false as has_catch, not fail_open', () => {
    const found = classifyFixture('closed.js', `
export async function gate(supabase) {
  try {
    const { data } = await supabase.from('t').select('*');
    return { passed: !!data };
  } catch (e) {
    return { passed: false, error: e.message };
  }
}
`.trim());
    expect(found.length).toBe(1);
    expect(found[0].classification).toBe('has_catch');
  });

  it('classifies a hit with no enclosing try at all as no_catch', () => {
    const found = classifyFixture('none.js', `
export async function gate(supabase) {
  const { data } = await supabase.from('t').select('*');
  return { passed: !!data };
}
`.trim());
    expect(found.length).toBe(1);
    expect(found[0].classification).toBe('no_catch');
  });
});
