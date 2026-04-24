/**
 * CROSS_SD_FILE_OVERLAP_TEMPORAL_PLAN gate (FR-2a).
 * Runs at PLAN-TO-EXEC. Oracle = current SD's PRD target_files vs each
 * recently-shipped SD's PRD target_files (no PR exists yet at this phase).
 *
 * Verdict tiers (see decideVerdict in lib/cross-sd-overlap.js):
 *   - high-risk overlap        -> FAIL (no bypass; FR-4)
 *   - medium-risk + ack flag   -> PASS (FR-3)
 *   - medium-risk no ack       -> WARN (blocks until --acknowledge-... provided with ticketed --ack-reason)
 *   - no overlap               -> PASS
 *
 * Part of SD-LEO-INFRA-CROSS-FILE-OVERLAP-001.
 */
import {
  appendOverlapMetadata,
  buildOverlapEntry,
  classifyOverlap,
  decideVerdict,
  extractTargetFiles,
  listRecentShippedSds,
  parseAckFlags,
  validatePrdShape,
} from '../../../../../../lib/cross-sd-overlap.js';

const GATE_NAME = 'CROSS_SD_FILE_OVERLAP_TEMPORAL_PLAN';

/**
 * Build the gate result object that handoff.js consumes.
 * @param {string} verdict
 * @param {Array} entries
 * @param {string} [extraDetail]
 */
function buildResult(verdict, entries, extraDetail = '') {
  const high = entries.filter(e => e.risk_tier === 'high');
  const medium = entries.filter(e => e.risk_tier === 'medium');
  const issues = [];
  const warnings = [];

  if (verdict === 'FAIL') {
    for (const e of high) {
      issues.push(
        `HIGH-RISK overlap with ${e.colliding_sd_key} on file(s): ${e.overlapping_files.join(', ')} (no bypass available — wait for window expiry or coordinate manually)`
      );
    }
  } else if (verdict === 'WARN') {
    for (const e of medium) {
      warnings.push(
        `Medium-risk overlap with ${e.colliding_sd_key} on file(s): ${e.overlapping_files.join(', ')}. Re-run with --acknowledge-cross-sd-overlap --ack-reason "<SD-/QF-/PAT-/#issue> <text>" to proceed.`
      );
    }
  } else if (verdict === 'PASS' && medium.length > 0) {
    warnings.push(`Acknowledged medium-risk overlap with ${medium.length} SD(s): ${medium.map(e => e.colliding_sd_key).join(', ')}`);
  }

  return {
    passed: verdict !== 'FAIL' && verdict !== 'WARN',
    score: verdict === 'PASS' ? 100 : verdict === 'WARN' ? 50 : 0,
    max_score: 100,
    issues,
    warnings,
    details: extraDetail || `Verdict ${verdict} from ${entries.length} colliding SD(s)`,
  };
}

export function createCrossSdFileOverlapTemporalGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log(`\n🔍 GATE: ${GATE_NAME} (PLAN oracle)`);
      console.log('-'.repeat(50));

      const sd = ctx?.sd;
      const sdUuid = sd?.id;
      const sdKey = sd?.sd_key || sdUuid;
      const handoffId = ctx?.handoff_id || ctx?.handoffId || null;
      const argv = ctx?.argv || process.argv.slice(2) || [];
      const ackState = parseAckFlags(argv);

      if (!sdUuid) {
        console.log('   ⚠️  No SD context available — skipping');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No SD context'], details: 'skipped' };
      }

      // Pull current SD's PRD
      const { data: currentPRD } = await supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('sd_id', sdUuid)
        .single();

      const prdShape = validatePrdShape(currentPRD);
      if (!prdShape.valid) {
        console.log(`   ⚠️  Current PRD invalid: ${prdShape.reason} — skipping (advisory)`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`Skipped: ${prdShape.reason}`], details: 'skipped' };
      }
      const currentFiles = extractTargetFiles(currentPRD);
      if (currentFiles.size === 0) {
        console.log('   ℹ️  Current PRD declares no target files — gate trivially passes');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: 'No target files in PRD' };
      }

      const recent = await listRecentShippedSds(supabase, sdUuid);
      console.log(`   📅 Comparing against ${recent.length} recently-shipped SD(s)`);
      if (recent.length === 0) {
        const result = buildResult('PASS', [], 'No recent shipped SDs in window');
        await appendOverlapMetadata(supabase, handoffId, buildOverlapEntry({
          phase: 'PLAN-TO-EXEC', collidingSdKey: '(none)', overlappingFiles: [], riskTier: 'none', verdict: 'PASS',
        }));
        return result;
      }

      const entries = [];
      for (const other of recent) {
        const { data: otherPRD } = await supabase
          .from('product_requirements_v2')
          .select('*')
          .eq('sd_id', other.id)
          .single();
        if (!otherPRD) continue;
        const otherFiles = extractTargetFiles(otherPRD);
        const overlap = [...currentFiles].filter(f => otherFiles.has(f));
        if (overlap.length === 0) continue;
        const { high, medium } = classifyOverlap(overlap);
        const riskTier = high.length > 0 ? 'high' : medium.length > 0 ? 'medium' : 'low';
        entries.push(buildOverlapEntry({
          phase: 'PLAN-TO-EXEC',
          collidingSdKey: other.sd_key || other.id,
          overlappingFiles: overlap,
          riskTier,
          verdict: 'PENDING',
          acknowledgedAt: ackState.acknowledged ? new Date().toISOString() : null,
          ackReason: ackState.reason || null,
        }));
        console.log(`   ⚠️  Overlap with ${other.sd_key || other.id}: ${overlap.length} file(s) (${riskTier})`);
      }

      const decision = decideVerdict(entries, ackState);
      for (const e of entries) e.verdict = decision.verdict;
      const result = buildResult(decision.verdict, entries);

      // Persist FR-5 metadata for every detected overlap (one row per collider)
      // plus a summary row when entries is empty.
      if (entries.length === 0) {
        await appendOverlapMetadata(supabase, handoffId, buildOverlapEntry({
          phase: 'PLAN-TO-EXEC', collidingSdKey: '(none)', overlappingFiles: [], riskTier: 'none', verdict: 'PASS',
        }));
      } else {
        for (const e of entries) {
          await appendOverlapMetadata(supabase, handoffId, e);
        }
      }

      if (decision.verdict === 'FAIL') {
        console.log(`   ❌ ${decision.verdict} — high-risk overlap`);
      } else if (decision.verdict === 'WARN') {
        console.log(`   ⚠️  ${decision.verdict} — medium-risk overlap, ack required`);
      } else {
        console.log(`   ✅ ${decision.verdict}`);
      }
      return result;
    },
    required: false,
    remediation: `For HIGH-risk overlaps, wait for the ${process.env.CROSS_SD_WINDOW_HOURS || 48}h window to expire OR coordinate manually with the colliding SD. For MEDIUM-risk, re-run with --acknowledge-cross-sd-overlap --ack-reason "<SD-/QF-/PAT-/#issue> <reason>".`,
  };
}

export default { createCrossSdFileOverlapTemporalGate };
