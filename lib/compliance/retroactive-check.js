/**
 * Retroactive Compliance Check for Stage 20
 * SD: SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-C
 *
 * Validates that sprint-built ventures (those that bypassed stages 0-17)
 * have minimum required governance artifacts before advancing past Stage 20.
 *
 * Required artifacts:
 *   - venture_briefs: At least one brief record
 *   - eva_vision_documents: At least one vision document
 *   - venture_fundamentals: A fundamentals record
 *
 * @example
 * // Integration with Stage 20 execution worker:
 * import { checkRetroactiveCompliance } from '../../lib/compliance/retroactive-check.js';
 *
 * const result = await checkRetroactiveCompliance(ventureId, supabase);
 * if (!result.compliant) {
 *   await supabase.from('stage_executions')
 *     .update({ stage_status: 'blocked', compliance_gaps: result.gaps })
 *     .eq('venture_id', ventureId).eq('stage_number', 20);
 * }
 *
 * @module compliance/retroactive-check
 */

const REQUIRED_ARTIFACTS = [
  {
    table: 'venture_briefs',
    column: 'venture_id',
    label: 'Venture Brief',
    description: 'At least one venture brief must exist',
  },
  {
    table: 'eva_vision_documents',
    column: 'venture_id',
    label: 'Vision Document',
    description: 'At least one EVA vision document must exist',
  },
  {
    table: 'venture_fundamentals',
    column: 'venture_id',
    label: 'Venture Fundamentals',
    description: 'A venture fundamentals record must exist',
  },
];

/**
 * Check if a venture has the minimum required governance artifacts.
 *
 * @param {string} ventureId - UUID of the venture to check
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} [options]
 * @param {boolean} [options.skipStage0Ventures=true] - Skip check for ventures created through Stage 0
 * @returns {Promise<{compliant: boolean, gaps: string[], checked: number, found: number}>}
 */
export async function checkRetroactiveCompliance(ventureId, supabase, options = {}) {
  const { skipStage0Ventures = true } = options;

  if (skipStage0Ventures) {
    const { data: venture } = await supabase
      .from('ventures')
      .select('origin_type, current_lifecycle_stage')
      .eq('id', ventureId)
      .single();

    // Ventures that entered through Stage 0 (origin_type not set or went through queue)
    // already have governance artifacts from the synthesis pipeline
    if (venture && venture.origin_type === 'stage0') {
      return { compliant: true, gaps: [], checked: 0, found: 0 };
    }
  }

  const gaps = [];
  let found = 0;

  for (const artifact of REQUIRED_ARTIFACTS) {
    const { count, error } = await supabase
      .from(artifact.table)
      .select('*', { count: 'exact', head: true })
      .eq(artifact.column, ventureId);

    if (error) {
      gaps.push(`${artifact.label}: query error (${error.message})`);
      continue;
    }

    if (count === 0) {
      gaps.push(`${artifact.label}: ${artifact.description}`);
    } else {
      found++;
    }
  }

  return {
    compliant: gaps.length === 0,
    gaps,
    checked: REQUIRED_ARTIFACTS.length,
    found,
  };
}
