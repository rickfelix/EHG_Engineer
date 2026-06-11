/**
 * Session Retrospective Analyzer
 * SD-LEO-INFRA-ENHANCE-LEARN-SESSION-001 (US-003)
 *
 * Analyzes all handoff rejections for an SD at completion (LEAD-FINAL-APPROVAL)
 * and extracts recurring failure patterns into issue_patterns.
 *
 * Rules:
 * - Only gates with 2+ rejections generate patterns
 * - Non-blocking: if analysis fails, SD completion continues
 * - Results logged for audit trail
 */

import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabase = createSupabaseServiceClient();

const MIN_REJECTIONS_FOR_PATTERN = 2;

/**
 * SD-PAT-FIX-PLAN-EXEC-REJECTED-001: designed fast-fail rejection classes that
 * must NOT feed pattern math. Their validation_score is 0 BY CONSTRUCTION
 * (they fail before any gate scoring runs), so counting them produces
 * alarmist "rejected N times, avg 0%" HIGH patterns from cheap guidance
 * fails — pattern PAT-RETRO-PLANTOEXEC-3741735a (11 "rejections" = ONE
 * April SD: 3 prerequisite fast-fails + 4 claim-mechanics fails + 1 real
 * quality failure) auto-escalated into an SD this way.
 *
 * Matched against validation_details.reason AND rejection_reason text:
 *  - PREREQUISITE_PREFLIGHT_FAILED: pre-pipeline guidance (PRD/stories not
 *    yet created) — the fast-fail IS the designed remediation surface.
 *  - ARTIFACT_PREFLIGHT_FAILED: deterministic artifact-shape fast-fail
 *    (SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-A) — same pre-pipeline class.
 *  - GATE_CLAIM_VALIDITY: multi-session claim mechanics
 *    (no_deterministic_identity / foreign_claim), not artifact quality.
 * Excluded rows are still COUNTED and surfaced via metadata.excluded_fast_fails
 * when a pattern is created from the remaining genuine failures.
 */
export const FAST_FAIL_EXCLUDED_REASONS = [
  'PREREQUISITE_PREFLIGHT_FAILED',
  'ARTIFACT_PREFLIGHT_FAILED',
  'GATE_CLAIM_VALIDITY',
];

/** True when a rejection row is a designed fast-fail (excluded from pattern math). */
export function isFastFailRejection(rejection) {
  const reason = rejection?.validation_details?.reason || '';
  const text = rejection?.rejection_reason || '';
  return FAST_FAIL_EXCLUDED_REASONS.some(code => reason.includes(code) || text.includes(code));
}

/**
 * Analyze all rejections for an SD and create issue_patterns for recurring failures.
 *
 * @param {string} sdId - UUID of the SD
 * @param {Object} options
 * @param {Object} [options.supabaseClient] - Optional Supabase client override
 * @returns {Promise<{analyzed: boolean, patternsCreated: number, gates: Object}>}
 */
export async function analyzeSDRejections(sdId, options = {}) {
  const sb = options.supabaseClient || supabase;

  try {
    // Get all rejected handoffs for this SD
    const { data: rejections, error } = await sb
      .from('sd_phase_handoffs')
      .select('id, handoff_type, validation_score, rejection_reason, validation_details, created_at')
      .eq('sd_id', sdId)
      .eq('status', 'rejected')
      .order('created_at', { ascending: true });

    if (error) {
      console.warn(`  [session-retro] Query error: ${error.message}`);
      return { analyzed: false, patternsCreated: 0, gates: {} };
    }

    if (!rejections || rejections.length === 0) {
      console.log('  [session-retro] No rejections found — clean SD lifecycle');
      return { analyzed: true, patternsCreated: 0, gates: {} };
    }

    // SD-PAT-FIX-PLAN-EXEC-REJECTED-001: segment out designed fast-fails BEFORE
    // pattern math (see FAST_FAIL_EXCLUDED_REASONS above). They are counted per
    // gate so a created pattern still surfaces them as metadata, never as
    // occurrence_count / avg-score signal.
    const excludedByGate = {};
    let excludedTotal = 0;
    const qualityRejections = rejections.filter((rejection) => {
      if (isFastFailRejection(rejection)) {
        const gate = rejection.handoff_type;
        excludedByGate[gate] = (excludedByGate[gate] || 0) + 1;
        excludedTotal++;
        return false;
      }
      return true;
    });

    if (excludedTotal > 0) {
      console.log(`  [session-retro] Excluded ${excludedTotal} designed fast-fail rejection(s) from pattern math (${Object.entries(excludedByGate).map(([g, n]) => `${g}:${n}`).join(', ')})`);
    }

    if (qualityRejections.length === 0) {
      console.log('  [session-retro] All rejections were designed fast-fails — no quality signal');
      return { analyzed: true, patternsCreated: 0, gates: {}, excludedFastFails: excludedTotal };
    }

    // Group rejections by handoff_type (gate)
    const byGate = {};
    for (const rejection of qualityRejections) {
      const gate = rejection.handoff_type;
      if (!byGate[gate]) {
        byGate[gate] = [];
      }
      byGate[gate].push(rejection);
    }

    console.log(`  [session-retro] Analyzing ${qualityRejections.length} rejection(s) across ${Object.keys(byGate).length} gate(s)`);

    let patternsCreated = 0;

    for (const [gate, gateRejections] of Object.entries(byGate)) {
      if (gateRejections.length < MIN_REJECTIONS_FOR_PATTERN) {
        continue;
      }

      // Build pattern ID for this gate + SD
      const patternId = `PAT-RETRO-${gate.replace(/-/g, '')}-${sdId.substring(0, 8)}`;

      // Check if pattern already exists
      const { data: existing } = await sb
        .from('issue_patterns')
        .select('pattern_id')
        .eq('pattern_id', patternId)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`  [session-retro] Pattern ${patternId} already exists, skipping`);
        continue;
      }

      // Extract rejection context
      const reasons = gateRejections
        .map(r => r.rejection_reason)
        .filter(Boolean);

      const avgScore = Math.round(
        gateRejections.reduce((sum, r) => sum + (r.validation_score || 0), 0) / gateRejections.length
      );

      // Create issue_pattern
      const { error: insertError } = await sb
        .from('issue_patterns')
        .insert({
          pattern_id: patternId,
          category: 'session_retrospective',
          severity: gateRejections.length >= 4 ? 'high' : 'medium',
          issue_summary: `${gate} rejected ${gateRejections.length} times during SD lifecycle. Avg score: ${avgScore}%. Common reasons: ${reasons.slice(0, 3).join('; ') || 'See gate_results'}`,
          occurrence_count: gateRejections.length,
          first_seen_sd_id: sdId,
          last_seen_sd_id: sdId,
          trend: 'stable',
          status: 'active',
          metadata: {
            source: 'session-retrospective',
            gate: gate,
            sd_id: sdId,
            rejection_count: gateRejections.length,
            avg_score: avgScore,
            reasons: reasons.slice(0, 10),
            // SD-PAT-FIX-PLAN-EXEC-REJECTED-001: fast-fails segmented, not hidden.
            excluded_fast_fails: excludedByGate[gate] || 0,
            analyzed_at: new Date().toISOString()
          }
        });

      if (insertError) {
        console.warn(`  [session-retro] Insert error for ${patternId}: ${insertError.message}`);
      } else {
        patternsCreated++;
        console.log(`  [session-retro] Created pattern ${patternId} (${gateRejections.length} rejections on ${gate})`);
      }
    }

    console.log(`  [session-retro] Analysis complete: ${patternsCreated} pattern(s) created from ${qualityRejections.length} quality rejection(s) (${excludedTotal} fast-fail(s) excluded)`);

    return {
      analyzed: true,
      patternsCreated,
      excludedFastFails: excludedTotal,
      gates: Object.fromEntries(
        Object.entries(byGate).map(([gate, rejs]) => [gate, rejs.length])
      )
    };
  } catch (err) {
    // Non-blocking: log and return
    console.warn(`  [session-retro] Error: ${err.message}`);
    return { analyzed: false, patternsCreated: 0, gates: {} };
  }
}

export default { analyzeSDRejections };
