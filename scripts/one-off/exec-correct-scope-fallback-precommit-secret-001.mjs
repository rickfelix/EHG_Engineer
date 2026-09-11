#!/usr/bin/env node
// EXEC-phase correction to SD-LEO-FIX-PRE-COMMIT-SECRET-001's scope text: TDD falsified the
// "empty MERGE_HEAD-basis set triggers fallback" claim (see
// scripts/one-off/exec-correct-fallback-precommit-secret-001.mjs for the full record).
// Worker Golf, session 81425e08-c5b5-4fde-bafc-f0b9d5e9c349.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-PRE-COMMIT-SECRET-001';

const OLD = `A
MANDATORY non-empty-fallback guards every degraded/empty case: if the MERGE_HEAD-derived added-line
set is empty OR \`git rev-parse\` errors OR the intersection primitive errors, fall back to the
existing HEAD-only basis rather than silently scanning nothing (measured: an empty second operand
returns empty from both \`grep -Fxf\` and \`comm -12\` alike -- fail-open by construction unless
the fallback is explicit, not incidental).`;

const NEW = `A fallback guards the HEAD-only basis being abandoned on a genuine failure: if the MERGE_HEAD-basis
diff command itself errors (nonzero exit -- a real git failure, e.g. an invalid ref), fall back to
the HEAD-only basis rather than trusting the failed command's output. CORRECTED AT EXEC (TDD via
tests/unit/husky/pre-commit-merge-basis.test.js T2/T7 falsified the LEAD-phase claim below): the
fallback MUST be gated on the diff command's real exit status, NEVER merely on the MERGE_HEAD-basis
result (or the intersection) being empty -- an empty MERGE_HEAD-basis result is the NORMAL, CORRECT
outcome of a clean non-conflicting merge (nothing the other parent brought in is genuinely new
relative to itself), and a naive "empty means fall back" rule silently reintroduces the exact
false-positive bug this SD exists to fix (T2 measured this directly: it failed under the original
emptiness-gated design and passed once gated on exit status instead).`;

async function main() {
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('scope')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw fetchErr;
  if (!current.scope.includes(OLD)) {
    throw new Error('OLD text not found verbatim in current scope -- aborting to avoid a silent no-op or partial match.');
  }
  const scope = current.scope.replace(OLD, NEW);

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ scope })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK corrected scope fallback claim for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
