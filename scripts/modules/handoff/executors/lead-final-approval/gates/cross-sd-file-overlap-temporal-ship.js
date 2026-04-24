/**
 * CROSS_SD_FILE_OVERLAP_TEMPORAL_SHIP gate (FR-2b).
 * Runs at LEAD-FINAL-APPROVAL. Oracle = current SD's PR diff (via
 * SharedGitContext) vs each recently-shipped SD's merge-commit diff.
 *
 * Verdict tiers identical to the PLAN gate. See lib/cross-sd-overlap.js for
 * details. Part of SD-LEO-INFRA-CROSS-FILE-OVERLAP-001.
 */
import { execSync } from 'node:child_process';
import {
  appendOverlapMetadata,
  buildOverlapEntry,
  classifyOverlap,
  decideVerdict,
  getDiffForCommit,
  listRecentShippedSds,
  parseAckFlags,
} from '../../../../../../lib/cross-sd-overlap.js';
import { SharedGitContext, getMainRef } from '../../../shared-git-context.js';

const GATE_NAME = 'CROSS_SD_FILE_OVERLAP_TEMPORAL_SHIP';

function buildResult(verdict, entries) {
  const high = entries.filter(e => e.risk_tier === 'high');
  const medium = entries.filter(e => e.risk_tier === 'medium');
  const issues = [];
  const warnings = [];
  if (verdict === 'FAIL') {
    for (const e of high) {
      issues.push(
        `HIGH-RISK ship-overlap with ${e.colliding_sd_key} on file(s): ${e.overlapping_files.join(', ')} (no bypass available)`
      );
    }
  } else if (verdict === 'WARN') {
    for (const e of medium) {
      warnings.push(
        `Medium-risk ship-overlap with ${e.colliding_sd_key} on file(s): ${e.overlapping_files.join(', ')}. Re-run LEAD-FINAL with --acknowledge-cross-sd-overlap --ack-reason "<SD-/QF-/PAT-/#issue> <text>" to proceed.`
      );
    }
  } else if (verdict === 'PASS' && medium.length > 0) {
    warnings.push(`Acknowledged medium-risk overlap with ${medium.length} SD(s)`);
  }
  return {
    passed: verdict !== 'FAIL' && verdict !== 'WARN',
    score: verdict === 'PASS' ? 100 : verdict === 'WARN' ? 50 : 0,
    max_score: 100,
    issues,
    warnings,
    details: `Verdict ${verdict} from ${entries.length} colliding SD(s)`,
  };
}

/**
 * Resolve a recent SD's merge-commit SHA. Strategy:
 *  1. metadata.merge_commit_sha (if recorded by /ship)
 *  2. fallback: `git log` on origin/main filtering by sd_key in commit message
 */
function resolveMergeCommit(other, mainRef) {
  const fromMeta = other?.metadata?.merge_commit_sha || other?.metadata?.commit_sha;
  if (fromMeta && typeof fromMeta === 'string' && fromMeta.length >= 7) return fromMeta;
  try {
    const sha = execSync(
      `git log ${mainRef} --grep "${other.sd_key}" --pretty=format:%H -n 1`,
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return sha || null;
  } catch {
    return null;
  }
}

export function createCrossSdFileOverlapTemporalShipGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log(`\n🔍 GATE: ${GATE_NAME} (SHIP oracle)`);
      console.log('-'.repeat(50));

      const sd = ctx?.sd;
      const sdUuid = sd?.id;
      const handoffId = ctx?.handoff_id || ctx?.handoffId || null;
      const argv = ctx?.argv || process.argv.slice(2) || [];
      const ackState = parseAckFlags(argv);

      if (!sdUuid) {
        console.log('   ⚠️  No SD context — skipping');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No SD context'], details: 'skipped' };
      }

      const git = ctx?.gitCtx instanceof SharedGitContext ? ctx.gitCtx : new SharedGitContext();
      const myFiles = git.diffFiles;
      if (!myFiles || myFiles.length === 0) {
        console.log('   ℹ️  No PR diff vs main — gate trivially passes');
        const result = buildResult('PASS', []);
        await appendOverlapMetadata(supabase, handoffId, buildOverlapEntry({
          phase: 'LEAD-FINAL-APPROVAL', collidingSdKey: '(none)', overlappingFiles: [], riskTier: 'none', verdict: 'PASS',
        }));
        return result;
      }
      const myFileSet = new Set(myFiles);

      const recent = await listRecentShippedSds(supabase, sdUuid);
      console.log(`   📅 Comparing against ${recent.length} recently-shipped SD(s)`);

      const { ref: mainRef } = getMainRef({ skipFetch: true });
      const entries = [];
      for (const other of recent) {
        const sha = resolveMergeCommit(other, mainRef);
        if (!sha) {
          console.log(`   ℹ️  ${other.sd_key}: no merge commit resolvable — skipped`);
          continue;
        }
        const otherFiles = getDiffForCommit(sha);
        if (otherFiles.length === 0) continue;
        const overlap = otherFiles.filter(f => myFileSet.has(f));
        if (overlap.length === 0) continue;
        const { high, medium } = classifyOverlap(overlap);
        const riskTier = high.length > 0 ? 'high' : medium.length > 0 ? 'medium' : 'low';
        entries.push(buildOverlapEntry({
          phase: 'LEAD-FINAL-APPROVAL',
          collidingSdKey: other.sd_key || other.id,
          overlappingFiles: overlap,
          riskTier,
          verdict: 'PENDING',
          acknowledgedAt: ackState.acknowledged ? new Date().toISOString() : null,
          ackReason: ackState.reason || null,
        }));
        console.log(`   ⚠️  Ship-overlap with ${other.sd_key || other.id}: ${overlap.length} file(s) (${riskTier})`);
      }

      const decision = decideVerdict(entries, ackState);
      for (const e of entries) e.verdict = decision.verdict;
      const result = buildResult(decision.verdict, entries);

      if (entries.length === 0) {
        await appendOverlapMetadata(supabase, handoffId, buildOverlapEntry({
          phase: 'LEAD-FINAL-APPROVAL', collidingSdKey: '(none)', overlappingFiles: [], riskTier: 'none', verdict: 'PASS',
        }));
      } else {
        for (const e of entries) {
          await appendOverlapMetadata(supabase, handoffId, e);
        }
      }

      if (decision.verdict === 'FAIL') console.log(`   ❌ ${decision.verdict} — high-risk overlap`);
      else if (decision.verdict === 'WARN') console.log(`   ⚠️  ${decision.verdict} — medium-risk overlap, ack required`);
      else console.log(`   ✅ ${decision.verdict}`);
      return result;
    },
    required: false,
    remediation: 'For HIGH-risk ship-overlaps, wait for the window to expire or coordinate manually. For MEDIUM-risk, re-run LEAD-FINAL with --acknowledge-cross-sd-overlap --ack-reason "<ticket-ref> <reason>".',
  };
}

export default { createCrossSdFileOverlapTemporalShipGate };
