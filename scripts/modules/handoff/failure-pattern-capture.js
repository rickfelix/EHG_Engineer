/**
 * Failure Pattern Capture
 * SD-LEO-INFRA-ENHANCE-LEARN-SESSION-001 (US-002)
 *
 * Auto-captures handoff failure patterns as issue_patterns on retry success.
 * Called after a handoff succeeds when prior failures exist for the same gate.
 *
 * Rules:
 * - Minimum 2 failures on same gate before creating pattern (noise filter)
 * - Pattern creation is non-blocking (errors logged, not thrown)
 * - Category: handoff_failure
 */

import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabase = createSupabaseServiceClient();

const MIN_FAILURES_FOR_PATTERN = 2;

/**
 * Check for prior failures on the same gate and create an issue_pattern if threshold met.
 *
 * @param {string} sdId - UUID of the SD
 * @param {string} handoffType - e.g., 'PLAN-TO-EXEC', 'LEAD-TO-PLAN'
 * @param {Object} options
 * @param {Object} [options.supabaseClient] - Optional Supabase client override
 * @returns {Promise<{patternCreated: boolean, patternId?: string, failureCount?: number}>}
 */
export async function captureFailurePattern(sdId, handoffType, options = {}) {
  const sb = options.supabaseClient || supabase;

  try {
    // Query prior failures for this SD + handoff type
    const { data: failures, error } = await sb
      .from('sd_phase_handoffs')
      .select('id, handoff_type, validation_score, rejection_reason, validation_details, created_at')
      .eq('sd_id', sdId)
      .eq('handoff_type', handoffType)
      .eq('status', 'rejected')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`  [failure-capture] Query error: ${error.message}`);
      return { patternCreated: false };
    }

    const failureCount = (failures || []).length;

    if (failureCount < MIN_FAILURES_FOR_PATTERN) {
      return { patternCreated: false, failureCount };
    }

    // Extract failure context from most recent failures
    const recentFailures = failures.slice(0, 5);
    const rejectionReasons = recentFailures
      .map(f => f.rejection_reason)
      .filter(Boolean);

    const avgScore = Math.round(
      recentFailures.reduce((sum, f) => sum + (f.validation_score || 0), 0) / recentFailures.length
    );

    // Build pattern ID
    const patternId = `PAT-HF-${handoffType.replace(/-/g, '')}-${sdId.substring(0, 8)}`;

    // Check if pattern already exists (idempotent)
    const { data: existing } = await sb
      .from('issue_patterns')
      .select('pattern_id')
      .eq('pattern_id', patternId)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update occurrence count instead of creating duplicate
      await sb
        .from('issue_patterns')
        .update({
          occurrence_count: failureCount,
          updated_at: new Date().toISOString()
        })
        .eq('pattern_id', patternId);

      return { patternCreated: false, patternId, failureCount, updated: true };
    }

    // Create issue_pattern
    const { error: insertError } = await sb
      .from('issue_patterns')
      .insert({
        pattern_id: patternId,
        category: 'handoff_failure',
        severity: failureCount >= 4 ? 'high' : 'medium',
        issue_summary: `${handoffType} gate failed ${failureCount} times. Avg score: ${avgScore}%. Reasons: ${rejectionReasons.slice(0, 3).join('; ') || 'See gate_results'}`,
        occurrence_count: failureCount,
        first_seen_sd_id: sdId,
        last_seen_sd_id: sdId,
        trend: 'stable',
        status: 'active',
        metadata: {
          handoff_type: handoffType,
          sd_id: sdId,
          failure_count: failureCount,
          avg_score: avgScore,
          recent_reasons: rejectionReasons.slice(0, 5),
          captured_at: new Date().toISOString(),
          source: 'failure-pattern-capture'
        }
      })
      .select('pattern_id');

    if (insertError) {
      console.warn(`  [failure-capture] Insert error: ${insertError.message}`);
      return { patternCreated: false, failureCount };
    }

    console.log(`  [failure-capture] Created issue_pattern ${patternId} (${failureCount} failures on ${handoffType})`);
    return { patternCreated: true, patternId, failureCount };
  } catch (err) {
    // Non-blocking: log and continue
    console.warn(`  [failure-capture] Error: ${err.message}`);
    return { patternCreated: false };
  }
}

export default { captureFailurePattern };
