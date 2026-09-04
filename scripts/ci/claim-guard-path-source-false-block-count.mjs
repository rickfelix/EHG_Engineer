#!/usr/bin/env node
// claim-guard-path-source-false-block-count.mjs — FR-5a of
// SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 (ratification 49656c8c).
//
// Asserts zero PAT-CLMMULTI-002 blocks whose derived key came from the path (directory-name)
// source while the tree's branch actually named the session's own claim -- the preventive
// exit predicate for the false-block class this SD retires.
//
// Only rows carrying the FR-1 audit enrichment (metadata.source/branch, added by this SD) can
// answer the predicate; pre-fix rows have {worktreeSdKey, claimedSdKey} only. A zero-denominator
// window (no enriched rows yet) prints INSUFFICIENT_DATA rather than a bare PASS, since "no
// data" and "zero defects" are different claims (C6, prospective TESTING sub-agent finding).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mirrors scripts/hooks/worktree-claim-decision.cjs's BRANCH_KEY_PATTERN exactly -- the CI
// re-derivation must use the SAME anchored, slug-stopping rule the guard itself uses, or the
// predicate answers a different question than the one it claims to.
const QF_KEY_PATTERN = 'QF-\\d{8}-\\d+';
const SD_KEY_PATTERN = 'SD-[A-Z0-9]+(?:-[A-Z0-9]+)*';
const BRANCH_KEY_PATTERN = new RegExp(`^(${QF_KEY_PATTERN}|${SD_KEY_PATTERN})(?=-[a-z]|$)`);

export function deriveKeyFromBranch(branch) {
  if (!branch || typeof branch !== 'string') return null;
  const afterSlash = branch.includes('/') ? branch.slice(branch.lastIndexOf('/') + 1) : branch;
  const m = afterSlash.match(BRANCH_KEY_PATTERN);
  return m ? m[1] : null;
}

const PREDICATE = "PAT-CLMMULTI-002 block rows with metadata.source='path' whose metadata.branch re-derives (anchored) to metadata.claimedSdKey";

function parseArgs(argv) {
  const out = { sinceIso: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') out.sinceIso = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceIso = args.sinceIso || process.env.CLAIM_GUARD_MERGE_COMMIT_ISO;
  if (!sinceIso) {
    console.error(JSON.stringify({ status: 'error', error: 'missing --since <ISO timestamp of the merge commit> (or CLAIM_GUARD_MERGE_COMMIT_ISO env var)' }));
    process.exitCode = 1;
    return;
  }

  // fetchAllPaginated (not a bare .select) is required: a bulk audit-forensics read that
  // silently truncates at PostgREST's 1000-row cap would undercount exactly the offenders
  // this predicate exists to catch -- the same failure class count-truncation-diff-lint
  // guards against fleet-wide (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001).
  let rows;
  try {
    rows = await fetchAllPaginated(() =>
      supabase
        .from('permission_audit_log')
        .select('id, created_at, metadata')
        .eq('rule_code', 'PAT-CLMMULTI-002')
        .eq('outcome', 'block')
        .gte('created_at', sinceIso)
    );
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
    return;
  }

  const enrichedRows = (rows || []).filter((r) => r.metadata && typeof r.metadata.source === 'string');
  const denominator = enrichedRows.length;

  if (denominator === 0) {
    const insufficient = {
      status: 'INSUFFICIENT_DATA',
      denominator: 0,
      count: 0,
      since: sinceIso,
      predicate: PREDICATE,
      note: 'Zero qualifying (FR-1-enriched) audit rows since the given timestamp -- this is NOT the same as zero defects. Re-run once real traffic has landed rows carrying metadata.source.',
    };
    console.log(JSON.stringify(insufficient, null, 2));
    return; // advisory: insufficient data is not a hard failure, but it is not a verified pass — default exit 0
  }

  const offenders = enrichedRows.filter((r) => {
    const m = r.metadata;
    if (m.source !== 'path') return false;
    const rederived = deriveKeyFromBranch(m.branch);
    return rederived !== null && rederived === m.claimedSdKey;
  });

  const result = {
    status: offenders.length === 0 ? 'PASS' : 'FAIL',
    denominator,
    count: offenders.length,
    since: sinceIso,
    predicate: PREDICATE,
    offending_row_ids: offenders.map((r) => r.id),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] && /claim-guard-path-source-false-block-count\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}
