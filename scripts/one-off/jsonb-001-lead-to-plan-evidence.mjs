#!/usr/bin/env node
/**
 * SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001 — Explore + Validation evidence at LEAD-TO-PLAN.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const exploreResults = {
    verdict: 'PASS',
    confidence: 93,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Thoroughly mapped the real scope. mergeMetadataKeys() actually has 28 production call sites across 17 files (not the SD's stated 9 -- that number is a stale QF-20260902-928-era measurement baked into the helper's own docblock). removeMetadataKey has 1 call site, removeMetadataKeyIfClaimedBy has 1. Confirmed scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs matches the SD's claims exactly (excludes scripts/one-off/, requires a literal '...' spread within an 800-char window, so a no-spread full-blob replace is not flagged). Confirmed .artifacts/rca-jsonb-merge-detector.mjs (cited in the SD's original description as an RCA prototype) does not exist anywhere in the repo, on any branch, or in git history -- 4 independent searches, all negative, with positive controls proving the search tooling itself works. Confirmed only 1 of 3 exported functions (mergeMetadataKeys) has real unit test coverage; the other 2 appear only as mocks in unrelated consumer tests. Confirmed product_requirements_v2's schema live: PK=id (varchar PRD-SD-XXX, not UUID), metadata jsonb nullable default '{}'::jsonb, with an unconditional AFTER-trigger audit path (governance_audit_trigger). Confirmed SD-LEARN-FIX-ADDRESS-PAT-LES-012 (the motivating incident) is NOT YET merged to main -- its product_requirements_v2 backfill scripts don't exist on origin/main today, so this SD's scope (generalize + regression-test existing callers + design-validate against a second table's schema) does not require that branch to merge first.",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'LOW',
        issue: "The SD's original description cited two stale/nonexistent facts (call-site count, RCA prototype file path). Corrected via a Verified Finding addendum to the SD description; the core premise and scope remain valid.",
      }
    ],
    recommendations: [
      'Use the corrected 28-call-site (17-file) enumeration as the regression-test surface, not the stale "9".',
      'Design the generalized helper as a thin-wrapper refactor (new generic core, existing 3 exports delegate to it with zero external signature/behavior change) to minimize blast radius across 28+ real call sites.',
    ],
    detailed_analysis: {
      commands_run: [
        'git grep -n "mergeMetadataKeys" (repo-wide, excluding tests/ and scripts/one-off/) -> 28 call sites, 17 files',
        'Read scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs in full',
        '4 independent searches for .artifacts/rca-jsonb-merge-detector.mjs (Glob, grep, git log --all --diff-filter=A) -> all negative',
        'Live DB schema query on product_requirements_v2 (information_schema.columns, pg_trigger)',
        'git merge-base --is-ancestor origin/feat/SD-LEARN-FIX-ADDRESS-PAT-LES-012 origin/main -> false',
      ],
    },
    metadata: { independent_verification: true },
  };

  const validationResults = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently re-derived every claim from scratch rather than trusting the Explore summary. Re-ran the full repo grep myself (excluding tests/, scripts/one-off/, resolving 20 of 28 call sites through injection-seam aliases a naive grep would miss) and confirmed 28 call sites / 17 files exactly, with one correction to Explore's own arithmetic (chairman-gated-decision-row-guard.mjs has 6 call sites, not the '4' Explore's prose stated -- the underlying line list was already correct, only a summary number was off). Confirmed removeMetadataKey/removeMetadataKeyIfClaimedBy call-site counts exactly. Independently re-searched and confirmed the RCA prototype file genuinely does not exist (ran my own 5 searches, 2 with positive controls proving the tooling isn't the problem). Read the lint script myself and confirmed the claims plus found two additional limits Explore missed: the lint is hard-gated to files literally mentioning 'strategic_directives_v2' (line 52), making it blind to the exact product_requirements_v2-class defect that caused the incident, and the sweep is scoped to only lib/ and scripts/ (lines 103, 148-149). Confirmed test-coverage gap. Queried the LIVE DB directly (not the possibly-stale docs/reference/schema/*.md file) for product_requirements_v2's schema and found 7 triggers total (Explore's summary named only 1), 4 of which fire on a metadata-only UPDATE -- de-risked by confirming sync_prd_sd_linking() is idempotent/non-destructive and enforce_doctrine_of_constraint() already fires on every existing update path today. Independently confirmed the unmerged-branch finding via git rev-list --left-right --count (39 main-only, 7 branch-only commits) and confirmed via git cat-file -e that none of the 3 backfill scripts exist on origin/main. Ran a mandatory duplicate-implementation sweep (not requested by Explore) and found lib/fleet/qf-metadata-merge.mjs -- a PRIOR, INDEPENDENT generalization attempt for the quick_fixes table, whose own header states 'lib/coordinator/safe-metadata-merge.mjs is strategic_directives_v2-only by design' -- someone already hit this exact wall and forked rather than generalized. Also found a 29th logical call site: scripts/coordinator-backlog-rank.mjs:180 writes the identical COALESCE(metadata,'{}')||patch SQL inline, bypassing the helper's decider-pairing guard and audit path entirely -- not caught by the lint (no .update(, no spread).",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'LOW',
        issue: "Explore's trigger-surface count for product_requirements_v2 was incomplete (named 1 of 7 live triggers). Corrected in the SD description addendum and will inform the PRD's risk section (4 of the 7 fire on a metadata-only UPDATE).",
        evidence: 'Live pg_trigger query on product_requirements_v2 returned 7 triggers.',
      },
      {
        id: 'VAL-2',
        severity: 'MEDIUM',
        issue: 'lib/fleet/qf-metadata-merge.mjs is a prior fork of the same problem for a different table (quick_fixes). The PRD must explicitly decide whether to reconcile/consolidate it or document it as an intentionally out-of-scope follow-up -- silently ignoring it would let a third parallel implementation exist after this SD ships.',
        evidence: 'lib/fleet/qf-metadata-merge.mjs:15 docblock references safe-metadata-merge.mjs directly.',
      },
    ],
    recommendations: [
      'PRD should explicitly scope out reconciling qf-metadata-merge.mjs (different CAS semantics, separate migration effort) rather than silently omitting it.',
      'PRD should note the coordinator-backlog-rank.mjs:180 inline-bypass finding for awareness, without expanding scope to fix it (retrofitting existing instances is explicitly out of scope per the SD).',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent git grep re-derivation of all 28 call sites, alias-resolved',
        '5 independent searches for the RCA prototype file, 2 with positive controls',
        'Live DB pg_trigger query on product_requirements_v2 (7 triggers found, not 1)',
        'git rev-list --left-right --count origin/main...origin/feat/SD-LEARN-FIX-ADDRESS-PAT-LES-012',
        'git cat-file -e origin/main:<path> for all 3 cited backfill scripts -> absent',
        'Mandatory duplicate-implementation sweep: git grep -ln "COALESCE(metadata" -- lib/ scripts/ -> found qf-metadata-merge.mjs, attention-flag-writer.js, window-visibility-writer.js, sd-park.js, clear-coordinator-review.js, and the coordinator-backlog-rank.mjs inline bypass',
      ],
    },
    metadata: { independent_verification: true },
  };

  for (const [code, name, results] of [['EXPLORE', 'Explore', exploreResults], ['VALIDATION', 'Validation', validationResults]]) {
    const resolution = await resolveSubAgentRepo({
      sdId: sdRow.id,
      targetApplication: 'EHG_Engineer',
      subAgentCode: code,
      probeExistsRelative: 'scripts/one-off/jsonb-001-lead-to-plan-evidence.mjs',
      supabase,
    });
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
    const stored = await storeSubAgentResults(code, sdRow.id, { code, name }, results, { sdKey: SD_KEY, phase: 'LEAD' });
    console.log('STORED:', code, JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
