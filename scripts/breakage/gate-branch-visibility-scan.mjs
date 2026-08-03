#!/usr/bin/env node
/**
 * Gate branch-visibility scan — SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-6).
 *
 * Answers one question against live data: HOW MANY OPEN PRs CAN THE COMPLETION GATE NOT SEE?
 *
 * Why it exists. PR_MERGE_VERIFICATION used an anchored branch matcher that could not see a branch
 * carrying a suffix after the SD key. An OPEN PR was therefore invisible, the gate reported "No open
 * PRs found for this SD", and an SD completed with its deliverable unmerged (2026-08-03). Before the
 * fix, 6 of 10 key-carrying open PRs were invisible — and the gate FAILS OPEN, so invisible resolves
 * to the answer that permits completion.
 *
 * WHY THIS IMPORTS THE GATE'S OWN RESOLVER INSTEAD OF REIMPLEMENTING THE MATCH. A scan that carries
 * its own copy of the matching rule measures the copy, not the gate. It would keep reporting zero
 * while the gate drifted — which is the same one-representation failure the SD documents. The
 * prototype this replaces DID reimplement the regex, and that was tolerable only because it was
 * measuring a matcher it was trying to prove wrong.
 *
 * WHY IT IS COMMITTED. The prototype lived in .claude-work/, which is gitignored (.gitignore:444):
 * no other builder and no CI runner could execute it. A verification step only its author can run is
 * not a verification step.
 *
 * Usage:  node scripts/breakage/gate-branch-visibility-scan.mjs [--repo owner/name] [--json]
 * Exit:   0 always — this is a measurement, not a gate. It reports; it does not block.
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { resolveBranchOwner, loadKeySet, OWNER_REASON, BRANCH_TYPE_TOKENS } from '../../lib/git/branch-owner.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const repoArg = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : null;
const REPOS = repoArg ? [repoArg] : ['rickfelix/EHG_Engineer', 'rickfelix/ehg'];

/**
 * The gate's OWN loader, not a copy. The first draft of this scan had its own .select('sd_key'),
 * which PostgREST caps at 1000 rows — and that copy is what surfaced the same cap in the gate's
 * loader. Two implementations of one lookup is how a scan starts reporting a healthy number about
 * a mechanism that has drifted away from it. Importing means the scan cannot be right while the
 * gate is wrong.
 */
async function loadKeys() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const res = await loadKeySet(sb);
  if (!res.ok) {
    throw new Error(`key set unavailable (${res.error || res.reason}) — refusing to report, every branch would read as unmatched`);
  }
  return res.keys;
}

function openPrs(repo) {
  try {
    const raw = execSync(
      `gh pr list --repo ${repo} --state open --json number,headRefName,title --limit 200`,
      { encoding: 'utf8', timeout: 60000 },
    );
    return JSON.parse(raw || '[]').map((p) => ({ ...p, repo }));
  } catch (e) {
    // Reported, never swallowed: a repo we could not read is not a repo with nothing in it.
    return { error: e.message || String(e), repo };
  }
}

const keys = await loadKeys();
const buckets = { visible: [], invisible: [], unsupportedType: [], noKey: [] };
const repoErrors = [];

for (const repo of REPOS) {
  const prs = openPrs(repo);
  if (!Array.isArray(prs)) { repoErrors.push(prs); continue; }
  for (const pr of prs) {
    const r = resolveBranchOwner(pr.headRefName, keys);
    const entry = { number: pr.number, repo, branch: pr.headRefName, owner: r.owner, reason: r.reason };
    if (r.reason === OWNER_REASON.RESOLVED) buckets.visible.push(entry);
    else if (r.reason === OWNER_REASON.UNSUPPORTED_BRANCH_TYPE) buckets.unsupportedType.push(entry);
    else buckets.noKey.push(entry);
  }
}

// "Invisible" means: the branch names an SD/QF key the gate should associate, but resolution fails.
// A branch outside the supported token set is a KNOWN, ENUMERATED exclusion — kept in its own bucket
// so it can never be averaged into a headline number that looks like success.
const KEYISH = /(?:SD|QF)-[A-Za-z0-9-]*\d/;
buckets.invisible = buckets.noKey.filter((e) => KEYISH.test(e.branch));
buckets.noKey = buckets.noKey.filter((e) => !KEYISH.test(e.branch));

const keyCarrying = buckets.visible.length + buckets.invisible.length;
const summary = {
  measured_at: new Date().toISOString(),
  repos: REPOS,
  key_set_size: keys.size,
  supported_branch_types: BRANCH_TYPE_TOKENS,
  totals: {
    open_prs: buckets.visible.length + buckets.invisible.length + buckets.unsupportedType.length + buckets.noKey.length,
    visible_to_gate: buckets.visible.length,
    invisible_to_gate: buckets.invisible.length,
    unsupported_branch_type: buckets.unsupportedType.length,
    no_sd_key_in_branch: buckets.noKey.length,
  },
  invisible: buckets.invisible,
  unsupported_branch_type: buckets.unsupportedType,
  repo_errors: repoErrors,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('=== Gate branch-visibility scan ===');
  console.log(`  repos          : ${REPOS.join(', ')}`);
  console.log(`  key set        : ${keys.size} sd_keys`);
  console.log(`  supported types: ${BRANCH_TYPE_TOKENS.join('|')}`);
  console.log('');
  console.log(`  open PRs scanned          : ${summary.totals.open_prs}`);
  console.log(`  no SD/QF key in branch    : ${summary.totals.no_sd_key_in_branch}  (gate would not associate these anyway)`);
  console.log(`  VISIBLE to the gate       : ${summary.totals.visible_to_gate}`);
  console.log(`  INVISIBLE to the gate     : ${summary.totals.invisible_to_gate}   <- target 0`);
  console.log(`  unsupported branch type   : ${summary.totals.unsupported_branch_type}  (KNOWN exclusion, enumerated below — not counted as invisible)`);
  if (buckets.invisible.length) {
    console.log('\n  INVISIBLE — each is an SD that could complete with this PR open:');
    for (const e of buckets.invisible) console.log(`    #${e.number} [${e.repo}] ${e.branch}  (${e.reason})`);
  }
  if (buckets.unsupportedType.length) {
    console.log('\n  UNSUPPORTED BRANCH TYPE — deliberate, not a silent gap:');
    for (const e of buckets.unsupportedType) console.log(`    #${e.number} [${e.repo}] ${e.branch}`);
    console.log(`    Widening ${BRANCH_TYPE_TOKENS.join('|')} requires re-deriving the prefix-free property`);
    console.log('    that the tie-impossibility proof in lib/git/branch-owner.js depends on.');
  }
  for (const e of repoErrors) console.log(`\n  ⚠️  could not read ${e.repo}: ${e.error}`);
  console.log('');
  console.log(buckets.invisible.length === 0
    ? '  RESULT: 0 invisible for the covered token set. Exclusions above are enumerated, not averaged away.'
    : `  RESULT: ${buckets.invisible.length} invisible. The gate fails OPEN, so each is a completion that could pass with work outstanding.`);
}
