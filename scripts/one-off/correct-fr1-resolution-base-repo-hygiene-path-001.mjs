// Correct FR-1's stated resolution base in the PRD after an EXEC-phase finding: the PRD text
// said to resolve a relative local_path against path.dirname(ENGINEER_ROOT), but its own example
// values ("../ehg", "../commitcraft-ai") are only arithmetically correct when resolved against
// ENGINEER_ROOT itself. Resolving "../ehg" against path.dirname(ENGINEER_ROOT) (already the
// parent directory) walks up TWO levels instead of one, landing in the grandparent -- verified
// live against the real main checkout (path.resolve(ENGINEER_ROOT, '../ehg') = the correct
// sibling _EHG/ehg, matching lib/repo-paths.js's own pre-existing FALLBACK_REPOS.ehg convention:
// path.resolve(ENGINEER_ROOT, '..', 'ehg')). Implemented resolveLocalPath() resolves against
// ENGINEER_ROOT directly (with the stored value carrying its own explicit "../" prefix), which
// is the design that actually satisfies FR-1's own acceptance criterion 2 ("resolveRepoPath('ehg')
// returns the correct absolute path in a fresh checkout").

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

async function run() {
  const dotenv = await import('dotenv');
  dotenv.config();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const PRD_ID = 'PRD-SD-LEO-INFRA-REPO-HYGIENE-PATH-001';

  const { data: prd, error: readErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, risks')
    .eq('id', PRD_ID)
    .maybeSingle();
  if (readErr) throw readErr;

  const frs = prd.functional_requirements.map((fr) => {
    if (fr.id !== 'FR-1') return fr;
    return {
      ...fr,
      description:
        fr.description +
        '\n\nCORRECTED during EXEC: the resolution base is ENGINEER_ROOT itself, not ' +
        'path.dirname(ENGINEER_ROOT) as originally stated. resolveLocalPath(localPath) does ' +
        "path.resolve(ENGINEER_ROOT, localPath) for a non-absolute value, and registry.json's " +
        'relative entries carry their own explicit "../" prefix (e.g. "../ehg", exactly as the ' +
        "PRD's own example text already showed) -- resolving that value against " +
        'path.dirname(ENGINEER_ROOT) (already one level up) would walk up a SECOND level and land ' +
        "in the grandparent, which is wrong. Verified against lib/repo-paths.js's own pre-existing " +
        "FALLBACK_REPOS.ehg entry (path.resolve(ENGINEER_ROOT, '..', 'ehg')), which uses the same " +
        'ENGINEER_ROOT-relative-with-embedded-.. convention. This correction is what actually makes ' +
        "acceptance criterion 2 (resolveRepoPath('ehg') returns the correct path) true.",
      acceptance_criteria: fr.acceptance_criteria.map((c) =>
        c.startsWith('loadValidatedRegistry() resolves a relative local_path')
          ? "loadValidatedRegistry() resolves a relative local_path (via resolveLocalPath()) against ENGINEER_ROOT -- corrected from the originally-stated path.dirname(ENGINEER_ROOT), which was arithmetically inconsistent with the PRD's own '../ehg' example value (see corrected description above); an absolute local_path (drive-letter or leading slash) still resolves exactly as before (no regression for an explicit override)"
          : c
      ),
    };
  });

  const risks = [
    ...(prd.risks || []),
    {
      risk: "FR-1's originally-stated resolution base (path.dirname(ENGINEER_ROOT)) was arithmetically inconsistent with its own example registry values (\"../ehg\") -- implementing it literally as written would have resolved every venture repo to the wrong (grandparent) directory",
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'Caught via functional testing against the live resolver before merge (not assumed correct from the PRD text alone); resolveLocalPath() resolves against ENGINEER_ROOT directly, matching the pre-existing FALLBACK_REPOS.ehg convention. Documented here and in the resolveLocalPath() doc comment in lib/repo-paths.js.',
      rollback_plan: 'N/A -- caught and corrected pre-merge, not a shipped defect',
    },
  ];

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: frs, risks })
    .eq('id', PRD_ID);
  if (updErr) throw updErr;

  console.log('Corrected FR-1 resolution-base scope in', PRD_ID);
}
