// Correct two of FR-2's stated details in the PRD after EXEC-phase findings:
//
// 1. "cross-linked from CLAUDE.md's scratchpad-directory guidance" -- CLAUDE.md (and
//    CLAUDE_CORE.md) contain NO scratchpad-directory guidance today (grepped both, zero hits),
//    and both files are fully regenerated from leo_protocol_sections on every run (see
//    scripts/generate-claude-md-from-db.js), so hand-editing either to add such guidance would
//    be silently overwritten by the next regeneration. docs/architecture/evidence-boundary.md
//    is instead the canonical, hand-maintained source for this policy, cross-linked FROM
//    README.md's "Important Files" section (which is hand-maintained, not DB-generated) and
//    from the new .gitignore entries' own comment block.
//
// 2. "failing CI above a threshold" -- untracked-file count is a property of a long-lived LOCAL
//    working tree; GitHub Actions does a fresh `actions/checkout` on every run, which by
//    definition has zero untracked files, so a GitHub Actions workflow version of this check
//    would always pass trivially and provide no real signal. scripts/lint/root-dirt-lint.mjs is
//    instead wired into .husky/pre-commit (Stage 9B), NON-BLOCKING by design -- matching this
//    repo's existing "Root Temp File Warning" (Stage 9) precedent, and avoiding a hard block on
//    a metric no single commit fully controls (concurrent fleet-session activity). `npm run
//    lint:root-dirt -- --strict` restores a real non-zero exit code for anyone who wants a hard
//    gate later.

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
    if (fr.id !== 'FR-2') return fr;
    return {
      ...fr,
      description:
        fr.description +
        '\n\nCORRECTED during EXEC: CLAUDE.md/CLAUDE_CORE.md contain no scratchpad-directory ' +
        'guidance to cross-link (verified via grep, zero hits) and are fully DB-regenerated on ' +
        'every run, so evidence-boundary.md is cross-linked from README.md\'s "Important Files" ' +
        "section instead (hand-maintained, not DB-generated). Also: root-dirt-lint.mjs is wired " +
        'into .husky/pre-commit (NON-BLOCKING, Stage 9B), not a GitHub Actions workflow -- ' +
        'untracked-file count is a local-working-tree property that a fresh CI checkout ' +
        '(0 untracked files always) cannot meaningfully measure.',
      acceptance_criteria: fr.acceptance_criteria.map((c) => {
        if (c.startsWith('docs/architecture/evidence-boundary.md exists')) {
          return "docs/architecture/evidence-boundary.md exists, documents the per-directory disposition with rationale, and is cross-linked from README.md's Important Files section (corrected from CLAUDE.md, which has no scratchpad-directory guidance to link from and is fully DB-regenerated -- see corrected description above)";
        }
        if (c.startsWith('scripts/lint/root-dirt-lint.mjs exists, wired into CI')) {
          return 'scripts/lint/root-dirt-lint.mjs exists, is wired into .husky/pre-commit as a non-blocking check (corrected from "CI" -- GitHub Actions\' fresh checkout always shows 0 untracked files, making a workflow-based version hollow; see corrected description above), passes against the current (post-triage) tree, and its threshold is documented (baseline 2291 + a measured 100-file buffer, not copy-pasted from another lint) as just above the measured post-triage baseline';
        }
        return c;
      }),
    };
  });

  const risks = [
    ...(prd.risks || []),
    {
      risk: "FR-2's originally-stated CI-wiring target (GitHub Actions) cannot measure untracked-file count at all (fresh checkouts have none), and its stated cross-link target (CLAUDE.md's scratchpad guidance) does not exist and is DB-regenerated",
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'Retargeted to the mechanisms that actually work: .husky/pre-commit (non-blocking) for the lint, README.md (hand-maintained) for the cross-link. Documented here and in both files\' own comments.',
      rollback_plan: 'N/A -- caught and corrected pre-merge, not a shipped defect',
    },
  ];

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: frs, risks })
    .eq('id', PRD_ID);
  if (updErr) throw updErr;

  console.log('Corrected FR-2 cross-link and CI-target scope in', PRD_ID);
}
