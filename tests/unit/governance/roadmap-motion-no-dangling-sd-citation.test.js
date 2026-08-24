/**
 * SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 (FR-3) — TS-5a / TS-5b.
 *
 * TESTING sub-agent finding C2 (evidence 80e4d285): a DB-backed "does this citation resolve to a
 * real SD" assertion is dead-by-construction in BOTH the `unit` vitest project (which blanks
 * every Supabase env var, per vitest.config.js) and the `db` project (which skips by default,
 * per tests/helpers/db-target.js's empty DESIGNATED_NON_PROD_REFS). TS-5a is therefore a pure
 * source-text scan with no DB dependency, so it genuinely runs in the default unit tier. TS-5b is
 * an explicit-opt-in live cross-check, default-skipped and NOT counted toward coverage.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(import.meta.dirname, '../../../lib/governance/drive-state/axes/roadmap-motion.cjs');
const SD_KEY_RE = /SD-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}/g;
// Legitimate, verified-real citations already present in this file:
//   SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001 -- the axis's own authoring SD (line 2), confirmed a
//   real, completed row in strategic_directives_v2 (checked live 2026-08-24, not assumed).
// Any OTHER SD-key-shaped string appearing here is either this fix's own citation or unexpected.
const ALLOWED_KEYS = new Set([
  'SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001',
  'SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001',
]);

describe('TS-5a: roadmap-motion.cjs cites no dangling SD key (pure source-text scan, no DB)', () => {
  it('the file no longer names a specific unblocking-child SD key at all (the one it named was never created)', () => {
    const src = readFileSync(FILE, 'utf8');
    expect(src).not.toMatch(/SD-FDBK-INFRA-ROADMAP-COMMITMENT-CLOCK-001/);
  });

  it('every SD-key-shaped string in the file is an already-verified-real citation', () => {
    const src = readFileSync(FILE, 'utf8');
    const matches = [...src.matchAll(SD_KEY_RE)].map((m) => m[0]);
    const unexpected = matches.filter((k) => !ALLOWED_KEYS.has(k));
    expect(unexpected, `Found unexpected SD-key citation(s): ${unexpected.join(', ')}`).toEqual([]);
  });
});

// TS-5b: OPTIONAL live cross-check, default-skip, not required for CI green (TESTING finding C2).
// Enable locally with: SOURCING_CONSUMPTION_LIVE_SD_CHECK=1 npx vitest run --project unit <this file>
describe.skipIf(!process.env.SOURCING_CONSUMPTION_LIVE_SD_CHECK)('TS-5b: OPTIONAL live cross-check (default-skip)', () => {
  it('any SD key cited in roadmap-motion.cjs resolves to a real strategic_directives_v2 row', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const src = readFileSync(FILE, 'utf8');
    const keys = [...new Set([...src.matchAll(SD_KEY_RE)].map((m) => m[0]))];
    for (const key of keys) {
      const { data } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', key).maybeSingle();
      expect(data, `${key} does not resolve to a real SD`).toBeTruthy();
    }
  });
});
