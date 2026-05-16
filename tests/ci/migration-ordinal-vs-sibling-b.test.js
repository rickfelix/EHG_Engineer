import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations');
const SIBLING_B_MAX_ORDINAL = 20260516140001;

const SIBLING_D_FRAGMENTS = ['add_contract_chain_links', 'add_d_app_feature_flag'];

function extractOrdinal(fn) { const m = fn.match(/^(\d+)_/); return m ? Number(m[1]) : null; }

describe('Sibling D migrations strictly > Sibling B 20260516140001', () => {
  it('every Sibling D migration ordinal > 20260516140001', () => {
    const offenders = [];
    for (const f of readdirSync(MIGRATIONS_DIR)) {
      if (!SIBLING_D_FRAGMENTS.some(frag => f.includes(frag))) continue;
      const ord = extractOrdinal(f);
      if (ord === null) continue;
      if (ord <= SIBLING_B_MAX_ORDINAL) offenders.push(`${f} ord=${ord}`);
    }
    if (offenders.length > 0) {
      throw new Error(`Sibling D ordinal collision with Sibling B (in main via PR #3789):\n  ${offenders.join('\n  ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('Sibling D ships at least 2 migrations', () => {
    const found = SIBLING_D_FRAGMENTS.map(f => readdirSync(MIGRATIONS_DIR).find(x => x.includes(f))).filter(Boolean);
    expect(found.length).toBeGreaterThanOrEqual(2);
  });
});
