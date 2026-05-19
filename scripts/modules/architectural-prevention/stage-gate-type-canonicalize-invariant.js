/**
 * SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-5
 *
 * INVARIANT detector for the stage_config.gate_type canonicalization rule.
 *
 * Rule: writers MUST derive decision classification from
 * lifecycle_stage_config.work_type (canonical), NOT stage_config.gate_type
 * (lossy mirror). This module:
 *
 *   1. Scans codebase for known writer patterns reading stage_config.gate_type
 *      without joining lifecycle_stage_config.work_type
 *   2. WARNING mode: logs violations to feedback table (category=harness_backlog)
 *   3. BLOCKING mode: throws on detection; graduated per app_config rubric
 *
 * Graduation: 14-day soak from PR merge. Promotes to BLOCKING when:
 *   - canonical-writer adoption >= 80%
 *   - zero fallback hits in last 14 days
 *   - zero --bypass-validation uses
 *
 * Configuration: app_config key='stage_config_gate_type_canonicalization'.
 */

const INVARIANT_CODE = 'STAGE_GATE_TYPE_CANONICALIZE_INVARIANT';
const CONFIG_KEY = 'stage_config_gate_type_canonicalization';

/**
 * Load the current invariant mode from app_config.
 * Returns {mode, graduation_date, rubric} or null if config row missing.
 */
export async function loadInvariantConfig(supabase) {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return null;
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch {
    return null;
  }
}

/**
 * Check if a source-code excerpt violates the canonical rule.
 * Heuristic: file reads stage_config.gate_type (or destructures it from a
 * select() result) without also reading lifecycle_stage_config.work_type.
 *
 * Used in code-scan or CI lint mode.
 *
 * @param {string} sourceText
 * @returns {{violation: boolean, reasons: string[]}}
 */
export function scanSourceForViolation(sourceText) {
  const reasons = [];
  const readsStageConfigGateType =
    /\.from\(['"]stage_config['"]\)/i.test(sourceText) &&
    /gate_type/i.test(sourceText);
  const readsLifecycleWorkType =
    /\.from\(['"]lifecycle_stage_config['"]\)/i.test(sourceText) ||
    /work_type/i.test(sourceText) ||
    /gate_type_canonical/i.test(sourceText);

  if (readsStageConfigGateType && !readsLifecycleWorkType) {
    reasons.push('Reads stage_config.gate_type without joining lifecycle_stage_config.work_type or gate_type_canonical');
  }
  return { violation: reasons.length > 0, reasons };
}

/**
 * Emit a violation finding. WARNING mode writes to feedback; BLOCKING throws.
 *
 * @param {object} ctx
 * @param {object} ctx.supabase
 * @param {string} ctx.filePath
 * @param {string[]} ctx.reasons
 */
export async function emitViolation(ctx) {
  const config = await loadInvariantConfig(ctx.supabase);
  const mode = config?.mode || 'WARNING';

  if (mode === 'BLOCKING') {
    throw new Error(
      `[${INVARIANT_CODE}] BLOCKING violation in ${ctx.filePath}: ${ctx.reasons.join('; ')}`
    );
  }

  // WARNING mode: write to feedback
  const { error } = await ctx.supabase.from('feedback').insert({
    category: 'harness_backlog',
    priority: 'P3',
    title: `[${INVARIANT_CODE}] WARNING in ${ctx.filePath}`,
    description: ctx.reasons.join('; '),
    status: 'new',
    metadata: {
      invariant: INVARIANT_CODE,
      file_path: ctx.filePath,
      sd_key: 'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001',
    },
  });
  if (error) {
    console.warn(`[${INVARIANT_CODE}] Failed to log WARNING:`, error.message);
  }
  return { mode, recorded: !error };
}

/**
 * Check if the invariant has graduated to BLOCKING.
 * Returns true if all 3 rubric criteria are met OR graduation_date is past.
 */
export async function isReadyForGraduation(supabase, telemetry = {}) {
  const config = await loadInvariantConfig(supabase);
  if (!config) return false;
  if (config.mode === 'BLOCKING') return true; // already graduated

  const today = new Date();
  const graduationDate = new Date(config.graduation_date);
  const dateReady = today >= graduationDate;

  const rubric = config.rubric || {};
  const adoptionReady = (telemetry.writer_adoption_pct ?? 0) >= (rubric.writer_adoption_pct_min ?? 80);
  const fallbackReady = (telemetry.fallback_hit_count_14d ?? Infinity) <= (rubric.fallback_hit_count_14d_max ?? 0);
  const dryrunReady = (telemetry.block_dryrun_violations ?? Infinity) <= (rubric.block_dryrun_violations_max ?? 0);

  return dateReady && adoptionReady && fallbackReady && dryrunReady;
}

export const meta = {
  invariant_code: INVARIANT_CODE,
  config_key: CONFIG_KEY,
  sd_key: 'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001',
  pattern_witness: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001',
};
