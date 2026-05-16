import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations');
const SIBLING_A_MAX_ORDINAL = 20260516130002;

const SIBLING_B_FRAGMENTS = ['add_goal_evaluator_verdicts', 'add_verdict_acted_as_column'];

function extractOrdinal(fn) { const m = fn.match(/^(\d+)_/); return m ? Number(m[1]) : null; }

describe('Sibling B migrations must be strictly > Sibling A 20260516130002', () => {
  it('every Sibling B migration ordinal > 20260516130002', () => {
    const offenders = [];
    for (const f of readdirSync(MIGRATIONS_DIR)) {
      if (!SIBLING_B_FRAGMENTS.some(frag => f.includes(frag))) continue;
      const ord = extractOrdinal(f);
      if (ord === null) continue;
      if (ord <= SIBLING_A_MAX_ORDINAL) offenders.push(`${f} ordinal=${ord}`);
    }
    if (offenders.length > 0) {
      throw new Error(`Sibling B migration ordinal collision with Sibling A:\n  ${offenders.join('\n  ')}\nFix: rename to ordinal > ${SIBLING_A_MAX_ORDINAL}.`);
    }
    expect(offenders).toEqual([]);
  });

  it('Sibling B ships at least 2 migrations (FR-B-4 + FR-B-5)', () => {
    const found = SIBLING_B_FRAGMENTS.map(frag => readdirSync(MIGRATIONS_DIR).find(f => f.includes(frag))).filter(Boolean);
    expect(found.length).toBeGreaterThanOrEqual(2);
  });
});
