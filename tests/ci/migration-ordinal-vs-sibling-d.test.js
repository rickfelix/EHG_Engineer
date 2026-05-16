import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations');
const SIBLING_D_MAX_ORDINAL = 20260516150001;

const SIBLING_F_FRAGMENTS = ['add_shadow_sampling_protocol'];

function extractOrdinal(fn) { const m = fn.match(/^(\d+)_/); return m ? Number(m[1]) : null; }

describe('Sibling F migrations strictly > Sibling D 20260516150001', () => {
  it('every Sibling F migration ordinal > 20260516150001', () => {
    const offenders = [];
    for (const f of readdirSync(MIGRATIONS_DIR)) {
      if (!SIBLING_F_FRAGMENTS.some(frag => f.includes(frag))) continue;
      const ord = extractOrdinal(f);
      if (ord === null) continue;
      if (ord <= SIBLING_D_MAX_ORDINAL) offenders.push(`${f} ord=${ord}`);
    }
    if (offenders.length > 0) {
      throw new Error(`Sibling F ordinal collision with Sibling D (in main via PR #3791):\n  ${offenders.join('\n  ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('Sibling F ships at least 1 migration', () => {
    const found = SIBLING_F_FRAGMENTS.map(f => readdirSync(MIGRATIONS_DIR).find(x => x.includes(f))).filter(Boolean);
    expect(found.length).toBeGreaterThanOrEqual(1);
  });
});
