// TS-2 hostile fixture — SD-LEO-INFRA-VITEST-TIER-REAL-001 AC-2.
//
// Reproduces the MEASURED bypass exactly: dotenv.config({ override: true }) at module scope
// restores the real SUPABASE_URL over the forced sentinel, then a supabase call fires from
// beforeAll — the hook that executes under every viable skip mechanism. Without the fetch
// guard this issued live production traffic while every test reported skipped.
//
// Named .canaryspec.mjs DELIBERATELY: outside the **/*.test.js include globs (so DB_INCLUDE and
// the membership guard's .test/.spec population never collect it — an unmembered *test* file is
// a blocking guard failure by design) and reachable only through the throwaway config the spawn
// harness builds. Renaming it .test.js would make it a permanent tier member that fails every
// designated run on purpose. (Line comments here on purpose: a glob like the one above contains
// the star-slash sequence that terminates a block comment mid-file.)
//
// Expected under the gate, undesignated: the beforeAll supabase call is REFUSED
// (DB_TIER_BLOCKED naming the URL), tests report skipped, ZERO live requests. The file itself
// FAILS (a hook that demands a DB is unrunnable here, and green-over-broken would be the
// silent-vanish defect one layer down) — the spawn harness asserts exactly that shape.
import { config } from 'dotenv';
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// The measured bypass: override:true beats any forced sentinel value.
config({ path: '.env', override: true });

describe('bypass attempt: module-scope env restore + hook-level DB call', () => {
  beforeAll(async () => {
    const client = createClient(
      process.env.SUPABASE_URL || 'http://127.0.0.1:1',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'not-real'
    );
    // supabase-js swallows the guard's throw into result.error rather than rejecting, so surface
    // it to STDERR ourselves — otherwise a refused call and a completed one look identical to the
    // spawn harness parsing child output. This is the observable proof the guard fired.
    const { error } = await client.from('ventures').select('id').limit(1);
    if (error) process.stderr.write(`HOOK_DB_RESULT: ${error.message}\n`);
    // A hook that demands a DB is unrunnable under an undesignated target: fail LOUDLY rather
    // than let the file pass green (the silent-vanish defect one layer down).
    if (error && /DB_TIER_BLOCKED/.test(error.message)) {
      throw new Error('DB tier blocked this hook — the fixture cannot run undesignated (expected).');
    }
  });

  it('never executes under an undesignated target', () => {
    expect(true).toBe(true);
  });
});
