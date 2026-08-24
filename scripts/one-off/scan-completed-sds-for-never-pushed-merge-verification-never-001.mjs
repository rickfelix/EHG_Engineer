#!/usr/bin/env node
/**
 * scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs
 *
 * SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 / FR-4
 *
 * Retroactive census. Scans SDs marked status='completed' for the never-pushed signature this SD's
 * PR_MERGE_VERIFICATION gate fix now catches going forward: a code-implying sd_type (per the SAME
 * narrow exemption list the live gate uses — NOT isInfrastructureSDSync, see FR-2) with zero
 * evidence of any PR anywhere — not merely "no branch right now", since a legitimately-shipped SD's
 * branch is routinely deleted post-merge. Reuses the pure isNeverPushedSpecimen classifier
 * (gates.js, TR-8) so the live gate and this census can never define "specimen" differently.
 *
 * A completed SD's original branch may since have been deleted — merged-and-cleaned-up is
 * indistinguishable from never-pushed by branch presence alone. This scan checks THREE evidence
 * sources before flagging a specimen: ship_review_findings, SD metadata, and (the one that
 * actually matters — see below) local git history.
 *
 * MEASURED CORRECTION mid-EXEC (round 1): an earlier version of this script checked only
 * ship_review_findings + SD metadata and flagged 598/920 (65%) of completed SDs as specimens.
 * Spot check (SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001) proved that a false positive: `git log`
 * shows `feat(SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001): name workers on check-in arrival (#5302)`
 * — genuinely merged via PR #5302 — yet ship_review_findings has no row for it (that table only
 * has 505 rows total, earliest 2026-04-08) and its metadata carries no pr_number. Absence of a
 * DB record is not absence of a PR; this repo's own commit convention
 * (`<type>(<SD-KEY>): ... (#<PR>)`) makes local git history a far more reliable, zero-network
 * evidence source than either DB table.
 *
 * MEASURED CORRECTION mid-EXEC (round 2): checking git log ONLY in the CURRENT repo (this
 * worktree) dropped the flagged count to 46/920, but a spot check of the list showed most were
 * venture-app SDs (SD-ALTIFYAI-*, SD-APEXNICHE-AI-*, SD-MARKETLENS-*) whose code lives in a
 * SIBLING repo entirely (confirmed present on this machine: ../altifyai/, ../apexniche-ai/, etc.)
 * — not evidence of never-pushed, evidence of searching the wrong repo. Reuses
 * computeReposForSD(sd) (gates.js) — the SAME repo-resolution logic the live gate uses — to check
 * git history in the SD's ACTUAL target repo(s), not just this one. An SD whose resolved repo(s)
 * are not present on this machine is reported separately as unverifiable, never silently flagged.
 *
 * MEASURED FINDING (round 3, at --since 2026-07-01): dropped the count to 4/920. Manually
 * spot-checking those 4 found 2 (SD-LEO-FIX-ALTIFYAI-WIRE-CLERK-001, SD-LEO-FIX-ALTIFYAI-LIVE-SITE-001)
 * are ALSO false positives — a SEPARATE, genuine data-quality issue, not a never-pushed defect:
 * their DB row's target_application is recorded as 'EHG_Engineer' (confirmed via the
 * [GATE_PR_MERGE_REPO_SCOPE] log line computeReposForSD emits), so computeReposForSD resolves
 * ONLY the EHG_Engineer repo — but both SDs' real commits are in ../altifyai/ (confirmed present
 * and containing PR #42/#43 and #40/#41 respectively). Because the LIVE gate uses the exact same
 * resolver, this means the live gate itself would ALSO search the wrong repo for any SD whose
 * target_application is similarly misattributed — a related but DIFFERENT and out-of-scope defect
 * class (SD target_application accuracy, not PR_MERGE_VERIFICATION's evidence logic) worth a
 * separate follow-up SD, not silently absorbed into this one's "specimen" count. The remaining 2
 * (SD-LEO-INFRA-GATE-SIDE-BELT-001, SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B) are
 * genuinely EHG_Engineer-native infra work with no matching commit found in EHG_Engineer's full
 * history — plausible candidates, NOT auto-confirmed; this script does not attempt further
 * historical forensics (squash-merge commit message rewrites by GitHub, deleted PRs, etc.) and
 * intentionally stops at "flag for manual review," matching its own remediation text below.
 *
 * MEASURED CORRECTION mid-VERIFY (round 4, header/default staleness — VALIDATION sub-agent
 * finding): the round-3 "4/920" figure was measured at the NARROW window --since 2026-07-01, but
 * this script's DEFAULT was --since 2026-01-01 and its Usage block's first, undecorated example
 * invocation used that default — an operator following it gets 731/3910 specimens (~19%), not 4,
 * an order-of-magnitude divergence never disclosed. Spot-checked a sample of the pre-2026-07-01
 * specimens (SD-GENESIS-BOOTSTRAP-001, SD-FOUNDATION-OBS-001, several SD-VS- and SD-GENESIS-
 * prefixed rows, all completed 2026-01-01 through 2026-01-03, mostly sd_type='database'): zero
 * git-log matches despite EHG_Engineer's own history covering back to 2025-08-31 (well before
 * these completion dates) — i.e. NOT a git-history-coverage gap. Most plausible explanation, NOT
 * confirmed: these are early-project SDs predating this repo's commit-message convention that
 * embeds the SD key, making git-log-based verification systematically less reliable for that era
 * — a DIFFERENT
 * reliability regime than the post-2026-04 population this classifier was actually validated
 * against. Rather than assert either "these are real defects" or "these are all false positives"
 * without measuring further (out of scope for this SD), the DEFAULT window is narrowed to match
 * what was actually validated; a wider historical sweep remains available via an explicit --since
 * flag, with this caveat attached.
 *
 * Idempotency (mirrors scan-completed-sds-for-activation-gap.mjs):
 *   - dedupe key = (category='harness_backlog', title startsWith
 *     '[NEVER_PUSHED_SPECIMEN] SD-<KEY>', status NOT IN ('resolved','wont_fix','duplicate'))
 *   - SELECT-then-INSERT; UPDATE never overwrites resolved rows
 *   - Re-run is safe (no duplicate rows emitted)
 *
 * Defaults to --dry-run mode AND --since 2026-07-01 (the window this SD actually validated — see
 * round 4 above). Pass --commit to write feedback rows; pass --since to widen the scan, but read
 * the round-4 caveat first: an older window has a measured, much higher, NOT-yet-triaged specimen
 * rate (~19% vs ~0.4%) that may reflect a pre-PR-convention era rather than genuine defects.
 *
 * Usage:
 *   node scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs
 *   node scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs --commit
 *   node scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs --since 2026-01-01  # WIDER, less-validated window — see round 4
 *   node scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs --json
 */

import 'dotenv/config';
import fs from 'fs';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { isNeverPushedSpecimen, computeReposForSD } from '../modules/handoff/executors/lead-final-approval/gates.js';

/**
 * Local git history evidence — see the file-header notes (rounds 1 and 2) on why this is the
 * primary check and why it must resolve the SD's ACTUAL repo(s), not just the current one.
 * Per-repo git-log dumps are cached (one `git log --all` call per distinct localPath, not per SD)
 * — spawning a subprocess per SD (~920 of them) timed out at 5 minutes on the first attempt.
 */
const repoLogCache = new Map();
const unresolvableRepos = new Set();

function loadRepoLog(localPath) {
  if (repoLogCache.has(localPath)) return repoLogCache.get(localPath);
  let log = '';
  if (localPath && fs.existsSync(localPath)) {
    try {
      log = execSync('git log --all --format=%s', {
        encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024, cwd: localPath,
      });
    } catch (_e) {
      // git itself failing (not "repo absent" — checked above) is not evidence of absence.
      log = null; // null (not '') distinguishes "tried and failed" from "repo not present"
    }
  } else {
    unresolvableRepos.add(localPath || '(no local path resolved)');
  }
  repoLogCache.set(localPath, log);
  return log;
}

/**
 * @returns {{hasEvidence: boolean, unverifiable: boolean}} unverifiable=true means NONE of the
 * SD's resolved repos are present on this machine — the SD is reported separately, never silently
 * flagged as a specimen on the strength of a search that couldn't actually run.
 */
function checkGitHistoryEvidence(sd) {
  const repos = computeReposForSD(sd);
  let anyRepoChecked = false;
  for (const { localPath } of repos) {
    const log = loadRepoLog(localPath);
    if (log === null) continue; // git failed for this repo — try the next one, if any
    anyRepoChecked = true;
    if (log.includes(sd.sd_key)) return { hasEvidence: true, unverifiable: false };
  }
  if (!anyRepoChecked) return { hasEvidence: false, unverifiable: true };
  return { hasEvidence: false, unverifiable: false };
}

function parseArgs(argv) {
  // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (VALIDATION VERIFY finding, round 4): defaults to
  // the window this SD actually validated (round 3) — see the file header. --since 2026-01-01
  // measured 731/3910 (~19%) specimens vs this default's 4/920 (~0.4%), an undisclosed order of
  // magnitude an operator following the old default-invocation Usage example would not expect.
  const args = { dryRun: true, since: '2026-07-01', json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') args.dryRun = false;
    else if (a === '--json') args.json = true;
    else if (a === '--since' && argv[i + 1]) { args.since = argv[++i]; }
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

async function findExistingFeedbackRow(supabase, sdKey) {
  const titlePrefix = `[NEVER_PUSHED_SPECIMEN] SD-${sdKey}`;
  const { data } = await supabase
    .from('feedback')
    .select('id, status, title')
    .ilike('title', `${titlePrefix}%`)
    .not('status', 'in', '(resolved,wont_fix,duplicate)')
    .limit(1);
  return data && data.length > 0 ? data[0] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs [--commit] [--since YYYY-MM-DD] [--json]');
    process.exit(0);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }
  const supabase = createClient(url, key);

  console.log(`[NEVER_PUSHED_SCAN] mode=${args.dryRun ? 'DRY-RUN' : 'COMMIT'} since=${args.since}`);
  console.log('─'.repeat(72));

  const PAGE_SIZE = 200;
  let offset = 0;
  let totalScanned = 0;
  let specimenCount = 0;
  let unverifiableCount = 0;
  const specimens = [];
  const unverifiable = [];

  for (;;) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, sd_type, title, status, metadata, target_application, completion_date, created_at')
      .eq('status', 'completed')
      .gte('completion_date', args.since)
      .order('completion_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('Page query failed:', error.message);
      process.exit(2);
    }
    if (!data || data.length === 0) break;

    for (const sd of data) {
      totalScanned++;

      const { data: findings, error: findingsErr } = await supabase
        .from('ship_review_findings')
        .select('id, pr_number, sd_key')
        .eq('sd_key', sd.sd_key)
        .limit(5);
      if (findingsErr) {
        // A findings-lookup failure is not evidence of absence — skip this SD rather than risk a
        // false-positive specimen (same fail-closed posture the live gate takes on repo scan
        // errors, gates.js:730-746).
        if (!args.json) console.log(`  ⚠ ${sd.sd_key} — ship_review_findings lookup failed (${findingsErr.message}), skipping`);
        continue;
      }

      const md = sd.metadata || {};
      const dbEvidence = Boolean(md.pr_number || md.pr_url || md.merged_pr_url);
      // computeReposForSD(sd) needs target_application/metadata.target_repos — the same shape the
      // live gate consumes. Skip the (comparatively expensive) repo resolution + git log entirely
      // when DB metadata already proves evidence, or when isNeverPushedSpecimen's own exemption
      // would short-circuit anyway.
      let gitCheck = { hasEvidence: false, unverifiable: false };
      if (!dbEvidence) {
        gitCheck = checkGitHistoryEvidence({ sd_key: sd.sd_key, target_application: sd.target_application, metadata: md });
      }

      if (gitCheck.unverifiable) {
        unverifiableCount++;
        unverifiable.push({ sd_key: sd.sd_key, sd_type: sd.sd_type, reason: 'no resolved repo present on this machine' });
        continue; // never flag on the strength of a search that couldn't actually run
      }

      const isSpecimen = isNeverPushedSpecimen({
        sd: { sd_type: sd.sd_type },
        shipReviewFindings: findings || [],
        metadata: {
          openPRs: md.pr_number || md.pr_url ? 1 : 0,
          mergedPRs: 0,
          hasMergeEvidence: dbEvidence || gitCheck.hasEvidence,
          unmergedBranches: 0,
        },
      });
      if (!isSpecimen) continue;

      specimenCount++;
      const specimenEntry = { sd_key: sd.sd_key, sd_type: sd.sd_type, completion_date: sd.completion_date };
      specimens.push(specimenEntry);

      const titlePrefix = `[NEVER_PUSHED_SPECIMEN] SD-${sd.sd_key}`;
      const title = `${titlePrefix} (${sd.sd_type})`;
      const body = [
        '```json',
        JSON.stringify({ sd_key: sd.sd_key, sd_id: sd.id, sd_type: sd.sd_type, completion_date: sd.completion_date }, null, 2),
        '```',
        '',
        'Detected by retroactive census from SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 / FR-4.',
        'No PR evidence found in ship_review_findings or SD metadata for a code-implying sd_type.',
        'Remediation: manually verify whether this SD genuinely shipped code (check git log/gh for the era) before concluding it is a real specimen — this census does not re-run live git/gh scans against historical branches.',
      ].join('\n');

      const existing = await findExistingFeedbackRow(supabase, sd.sd_key);
      if (existing) {
        specimenEntry.action = 'skipped_existing';
        specimenEntry.existing_id = existing.id;
        if (!args.json) console.log(`  ⊙ ${sd.sd_key} — existing row ${existing.id}`);
        continue;
      }

      if (args.dryRun) {
        specimenEntry.action = 'dry_run_would_insert';
        if (!args.json) console.log(`  ◇ ${sd.sd_key} (${sd.sd_type}) — would INSERT`);
      } else {
        const { data: ins, error: insErr } = await supabase
          .from('feedback')
          .insert({
            title,
            description: body,
            category: 'harness_backlog',
            severity: 'medium',
            status: 'new',
            source: 'scan-completed-sds-for-never-pushed-merge-verification-never-001',
            metadata: {
              sd_key: sd.sd_key,
              sd_id: sd.id,
              sd_type: sd.sd_type,
              detected_by_sd: 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001',
            },
          })
          .select('id')
          .single();
        if (insErr) {
          specimenEntry.action = 'insert_error';
          specimenEntry.error = insErr.message;
          if (!args.json) console.log(`  ✗ ${sd.sd_key} — INSERT failed: ${insErr.message}`);
        } else {
          specimenEntry.action = 'inserted';
          specimenEntry.feedback_id = ins.id;
          if (!args.json) console.log(`  ✓ ${sd.sd_key} — feedback ${ins.id}`);
        }
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const summary = {
    mode: args.dryRun ? 'dry_run' : 'commit',
    since: args.since,
    scanned: totalScanned,
    specimen_count: specimenCount,
    unverifiable_count: unverifiableCount,
    unresolvable_repo_paths: [...unresolvableRepos],
    specimens,
    unverifiable,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('─'.repeat(72));
    console.log(`Scanned ${totalScanned} completed SDs since ${args.since}; ${specimenCount} never-pushed specimen(s) found; ${unverifiableCount} unverifiable (no resolved repo present locally, NOT flagged)`);
    console.log(args.dryRun ? '(dry-run — no writes performed; re-run with --commit to emit feedback rows)' : '(commit mode — feedback rows emitted as listed above)');
  }
  process.exit(0);
}

main().catch(err => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(2);
});
