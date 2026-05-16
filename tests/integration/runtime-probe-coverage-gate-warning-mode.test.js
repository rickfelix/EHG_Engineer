import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const GATE = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors', 'lead-final-approval', 'gates', 'runtime-probe-coverage-gate.js');

describe('runtime-probe-coverage-gate WARNING mode default (30-day soak)', () => {
  const src = readFileSync(GATE, 'utf8');

  it('default mode is WARNING (passed=true, score=80) when below threshold + enforce=false', () => {
    expect(src).toMatch(/score:\s*80/);
    expect(src).toContain('WARNING');
  });

  it('when enforce=true and below threshold: passed=false, score=0', () => {
    expect(src).toMatch(/passed:\s*false,\s*score:\s*0/);
    expect(src).toContain('BLOCKING');
  });

  it('above-threshold case returns score 100', () => {
    expect(src).toMatch(/score:\s*100,\s*max_score:\s*100/);
  });
});
