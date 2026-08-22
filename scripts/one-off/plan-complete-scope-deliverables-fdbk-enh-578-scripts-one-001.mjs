#!/usr/bin/env node
// PLAN-phase verification: mark 5 remaining sd_scope_deliverables rows 'completed'.
// SCOPE_AUDIT gate (PLAN-TO-LEAD) reported 17% (1/6) -- the 5 'pending' rows were never picked up
// by the auto-completion trigger the 6th (the ESLint rule itself) got. Also, this SD's canonical
// auto-sync tool (scripts/sync-deliverables-from-git.js) is non-functional on Windows in this
// session (POSIX-only execSync syntax mangled by cmd.exe; logged as harness bug
// feedback row daa402cf-05b3-4637-83bd-878228a62707, not fixed here -- out of this SD's scope
// per [MODE: product]), so these are marked directly with the same evidence that tool would have
// derived from git, independently verified by direct execution/inspection before writing.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '6c9682cf-d210-4f50-88a2-c0e348c538fd';

const updates = [
  {
    id: '2210a297-a439-414c-9b8c-21389e8e8387', // allowlist
    completion_evidence: 'scripts/lint/require-main-guard-in-one-off-allowlist.json -- directly inspected: 144 entries, every entry a non-empty reason string; loadAllowlist() throws loud on any entry missing one (verified via a deliberately-malformed fixture in tests/unit/lint/require-main-guard-in-one-off-lint.test.js). Landed across commits f87c9293df1 (original 143), 1e846827e95 (+1 for a new drift file), and net-neutral across the retrofit commits (entries removed as files were retrofitted instead of grandfathered).',
    completion_notes: 'Matches the described shape exactly: {_doc, allow: {<path>: <reason>}}.',
  },
  {
    id: 'aa46ff51-d6da-421f-9d63-81a139f35963', // standalone driver
    completion_evidence: 'scripts/lint/require-main-guard-in-one-off-lint.mjs -- directly executed: `node scripts/lint/require-main-guard-in-one-off-lint.mjs` reports "0 ungoverned violations across 608 file(s) scanned (scripts/one-off/**/*.{mjs,cjs,js}); 144 grandfathered." Loads eslint-rules/require-main-guard-in-one-off.js via ESLint\'s Linter API (not eslint.config.js registration, matching ismainmodule-classguard-lint.mjs\'s established pattern); excludes node_modules/.git/.worktrees/archive/_deprecated and .test./.spec. files (EXCLUDE_DIR_SEGMENTS / EXCLUDE_FILE_RE constants).',
    completion_notes: 'TESTING + SECURITY sub-agents independently re-verified during EXEC-TO-PLAN review (evidence rows 376e5994-b723-48ec-833a-87cc335e450f, 06092da7-8fbc-4ab1-9d17-8a6126f65a88) and found + this SD fixed 2 real detection gaps plus a .js extension bypass before this deliverable was considered done.',
  },
  {
    id: 'b7b38d9b-1635-4592-b663-878b664821e9', // GH Actions workflow
    completion_evidence: '.github/workflows/require-main-guard-in-one-off-lint.yml -- directly inspected: triggers on pull_request, genuinely blocking (no continue-on-error, per the workflow\'s own header comment). Ran and PASSED on PR #7376 across every push in this session (e.g. GitHub Actions run 32572518685, job require-main-guard-in-one-off-lint) -- and correctly FAILED (exit 1) on an earlier push when real violations existed, proving it blocks for real, not just observe-only.',
    completion_notes: 'Shipped already-blocking rather than the described observe-only-first rollout, because Phase 2 verification (the seed-test proof + the corpus scan) completed within this same SD rather than as a follow-up.',
  },
  {
    id: 'd2381943-4db3-44a5-b2e9-3860c586a4a0', // package.json script
    completion_evidence: 'package.json:124 -- directly inspected: "lint:main-guard-one-off": "node scripts/lint/require-main-guard-in-one-off-lint.mjs", matching the ~15 sibling npm-script convention (e.g. lint:ismainmodule-classguard).',
    completion_notes: null,
  },
  {
    id: 'd907ff27-c078-4848-998d-77d0b967bfb5', // retrofit blast-radius files
    completion_evidence: '14 blast-radius-ordered mass-mutation files retrofitted with isMainModule(import.meta.url) guards across this branch (git diff main...HEAD, scripts/one-off/): annotate-stale-venture-status-prose.mjs, backfill-eager-synthesis-vision-dims.mjs, backfill-unreadable-work-assignments.mjs, backfill-venture-gvos-profile.mjs, fix-sms-relay-story-evidence.mjs (original commit f87c9293df1); _enhance-retrospective-sd-leo-infra-correction-delivery-path-001-e.mjs, encode-classify-weakest-layer-rule.mjs, insert-prd-sd-leo-fix-stage18-fallback.mjs, fix-fleet-down-alert-sd-scope[-v2].mjs, fix-prd-fleet-down-alert-v2.mjs, fix-user-stories-fleet-down-alert-v2.mjs, insert-prd-fleet-down-alert-v2.mjs, insert-user-stories-fleet-down-alert-v2.mjs (commits 1e846827e95, c0dee7a1bc8 -- files that landed on origin/main after this branch\'s base and were caught live by the lint driver as new, real violations, all holding SUPABASE_SERVICE_ROLE_KEY or an equivalent service client). Verified via `node --check` on every retrofitted file plus the full lint corpus scan reporting 0 violations.',
    completion_notes: 'Scope grew beyond the originally-flagged corpus because the branch went stale (49, then 5, commits behind origin/main) while its PR sat open -- each merge surfaced newly-landed files matching this exact retrofit criterion, which were retrofitted rather than grandfathered for consistency.',
  },
];

async function main() {
  for (const u of updates) {
    const { error } = await supabase
      .from('sd_scope_deliverables')
      .update({
        completion_status: 'completed',
        completion_evidence: u.completion_evidence,
        completion_notes: u.completion_notes,
        verified_by: 'PLAN',
        verified_at: new Date().toISOString(),
      })
      .eq('id', u.id)
      .eq('sd_id', SD_ID);
    if (error) { console.error('UPDATE ERR', u.id, error.message); process.exit(1); }
    console.log('completed:', u.id);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
