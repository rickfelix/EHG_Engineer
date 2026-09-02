import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001';

// LEAD phase: re-key the generator-template success_criteria with the SD's real,
// measured scope. Per the row's own coordinator_clear_note: "success_criteria on
// this row are the generator template ([UNPOPULATED] measures) -- LEAD MUST re-key
// them from source QF-20260807-845 ... BEFORE LEAD-TO-PLAN; a handoff on template
// criteria is a fabricated scope."
//
// PRE-HANDOFF CENSUS (measured against current main, worktree HEAD at claim time):
//   - git grep across ALL tracked *.js/*.cjs/*.mjs for `import { createServiceClient }
//     from '.../supabase-client.js'` (the wrong-named-export theory): 0 matches.
//   - git grep for a bare default import `import X from '.../supabase-client.js'`
//     (any local name): 0 matches anywhere in the tracked repo.
//   - The 11 files that DO define/use an identifier named createServiceClient all
//     define a LOCAL, self-contained function using SUPABASE_SERVICE_ROLE_KEY
//     correctly -- not an import of the shared factory, not the described bug.
//   - The REAL landmine: lib/supabase-client.js:186 `export default
//     createSupabaseClient` (the ANON client) is exported as the file's default
//     export. A caller who default-imports this module and locally names the
//     binding `createServiceClient` (a highly plausible mistake) would silently
//     receive the ANON client -- exactly the "RLS-filtered empty, no error" shape
//     described. This mechanism EXISTS on current main but has ZERO current
//     exploiting call sites (774 total import lines reference the file; all are
//     named imports of the correct exports).
//   - lib/supabase-client.cjs has no default export (module.exports is a named
//     object) -- the CJS sibling is not affected.
//   - No duplicate/overlapping open SD found (SD-LEO-REFAC-SUPABASE-CLIENT-FACTORY-001
//     is completed, different scope: migrating raw createClient() calls TO the
//     factory, not this default-export naming trap).
const success_criteria = [
  {
    criterion: 'Census of every call site importing lib/supabase-client.js (or .cjs) via a wrong-named or default import is a recorded, auditable deliverable',
    measure: 'A committed artifact (doc or code comment at the fix site) lists the census method and result: 0 call sites currently exploit the default-export/wrong-name path (verified via git grep across all tracked *.js/*.cjs/*.mjs for both the named-wrong-import and bare-default-import shapes)',
  },
  {
    criterion: 'The default-export landmine (lib/supabase-client.js exporting the ANON client as `export default`) is closed: a caller who default-imports the module can no longer silently receive an anon client under a name that implies service-role access',
    measure: 'Either the default export is removed entirely (import fails loud -- a build/runtime error, not a silent anon client) or the default export is changed to the service client (so a wrong-named default import still gets real service-role access). Choice is made against the census: since 0 callers currently use the default export, removing it is the zero-regression-risk option.',
    status: 'DEFERRED_TO_PLAN_MEASURE',
    note: 'Exact mechanism (remove vs. re-point) is a PLAN-phase decision per coordinator_clear_note: PLAN re-measures the premise on main before EXEC. This success_criterion records the acceptance shape, not the pre-chosen implementation.',
  },
  {
    criterion: 'A regression test proves the closed landmine: simulating the exact incident shape (a wrong-name/default-import caller reading an RLS-protected table) either fails loud at import or returns the TRUE row count, never a silent 0-with-no-error',
    measure: 'New unit test asserts the fixed behavior; before-fix, the same test would reproduce the witnessed incident (leo_feature_flags probe reading 0 against a 23-row table with no error)',
  },
  {
    criterion: 'All 774 existing named-import call sites of createSupabaseServiceClient/createSupabaseClient/lazyServiceClient are byte-identical after the fix (no behavior change for correct-name callers)',
    measure: 'Full unit test suite green, 0 regressions; the fix touches only the default-export declaration, not any named export',
  },
];

const { data: sd, error: fetchErr } = await sb.from('strategic_directives_v2').select('id, description').eq('sd_key', SD_KEY).single();
if (fetchErr) throw fetchErr;

const description =
  sd.description +
  '\n\nLEAD CENSUS UPDATE (measured against main at claim time, ' + new Date().toISOString() + '): ' +
  'git grep across all tracked *.js/*.cjs/*.mjs found ZERO call sites currently exploiting the ' +
  'described wrong-name-import fallback. The real, currently-present mechanism is ' +
  'lib/supabase-client.js:186 (`export default createSupabaseClient`, the ANON client) -- a ' +
  'default-import landmine, not a named-import fallback as originally described. 0 current callers ' +
  'use the default export (774 import lines checked, all named). Fix scope: close the landmine ' +
  '(remove or re-point the default export) + add a regression test proving the closed shape, since ' +
  'there is no LIVE silently-broken call site to repair -- this is preventative, not corrective, per ' +
  'the measured premise.';

const { error: updateErr } = await sb
  .from('strategic_directives_v2')
  .update({ success_criteria, description })
  .eq('id', sd.id);
if (updateErr) throw updateErr;

console.log('Re-keyed success_criteria (4 items) and appended LEAD census update to description.');
