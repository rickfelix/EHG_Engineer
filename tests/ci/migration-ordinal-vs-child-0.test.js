import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations');

// Child 0 highest ordinal in main (verified 2026-05-16T11:55Z, PR #3785).
const CHILD_0_MAX_ORDINAL = 20260516120001;

// Sibling A migration prefix substrings. Test only flags Sibling A own files.
const SIBLING_A_FILE_FRAGMENTS = [
  'add_scope_completion_chain',
  'add_bypass_ledger',
  'add_witnesses_view',
];

function extractOrdinal(filename) {
  const m = filename.match(/^(\d+)_/);
  return m ? Number(m[1]) : null;
}

describe('Sibling A migration ordinal must be strictly > Child 0 ordinals (in main)', () => {
  it('every Sibling A migration ordinal > 20260516120001', () => {
    const files = readdirSync(MIGRATIONS_DIR);
    const offenders = [];
    for (const f of files) {
      if (!SIBLING_A_FILE_FRAGMENTS.some(frag => f.includes(frag))) continue;
      const ord = extractOrdinal(f);
      if (ord === null) continue;
      if (ord <= CHILD_0_MAX_ORDINAL) {
        offenders.push({ file: f, ordinal: ord, min_required: CHILD_0_MAX_ORDINAL + 1 });
      }
    }
    if (offenders.length > 0) {
      const msg = offenders.map(o => `  ${o.file} ordinal=${o.ordinal} (must be > ${CHILD_0_MAX_ORDINAL})`).join('\n');
      throw new Error(`Sibling A migration ordinal collision with Child 0 (PR #3785 in main):\n${msg}\n\nFix: rename migration files to use ordinal > ${CHILD_0_MAX_ORDINAL}.`);
    }
    expect(offenders).toEqual([]);
  });

  it('Sibling A ships at least 3 migrations (FR-A-1, FR-A-2, FR-A-3)', () => {
    const files = readdirSync(MIGRATIONS_DIR);
    const found = SIBLING_A_FILE_FRAGMENTS.map(frag => files.find(f => f.includes(frag))).filter(Boolean);
    expect(found.length).toBeGreaterThanOrEqual(3);
  });
});
