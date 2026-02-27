/**
 * Lead Evaluation Check Gate
 * Part of SD-MAN-ORCH-IMPROVE-STEP-LEAD-002-A, extended by 002-D
 *
 * Checks whether an SD has a lead_evaluations record.
 * Detects scope drift when baseline_snapshot is present.
 * WARNING only (not blocking) for backward compatibility.
 */

export async function validateLeadEvaluation(supabase, sdId, sdKey) {
  const result = {
    passed: true,
    score: 100,
    maxScore: 100,
    warnings: [],
    details: {},
  };

  try {
    const { data, error } = await supabase
      .from('lead_evaluations')
      .select('id, final_decision, confidence_score, evaluated_at, baseline_snapshot, scope_exclusions')
      .eq('sd_id', sdId)
      .order('evaluated_at', { ascending: false })
      .limit(1);

    if (error) {
      result.warnings.push(`Lead evaluation query error: ${error.message}`);
      result.score = 80;
      return result;
    }

    if (!data || data.length === 0) {
      result.warnings.push(
        'No lead_evaluations record found for this SD. ' +
        'Run `npm run lead:dossier -- ' + (sdKey || sdId) + '` to generate one.'
      );
      result.score = 70;
      result.details.evaluation_present = false;
    } else {
      const eval_ = data[0];
      result.details.evaluation_present = true;
      result.details.decision = eval_.final_decision;
      result.details.confidence = eval_.confidence_score;
      result.details.evaluated_at = eval_.evaluated_at;

      if (eval_.confidence_score < 40) {
        result.warnings.push(
          `Lead evaluation confidence is low (${eval_.confidence_score}%). Consider enriching SD metadata.`
        );
        result.score = 80;
      }

      // Scope drift detection (SD-MAN-ORCH-IMPROVE-STEP-LEAD-002-D)
      if (eval_.baseline_snapshot && Object.keys(eval_.baseline_snapshot).length > 0) {
        const drift = await detectScopeDrift(supabase, sdId, eval_.baseline_snapshot);
        result.details.scope_drift = drift;
        if (drift.drifted) {
          result.warnings.push(
            `Scope drift detected since LEAD evaluation: ${drift.changes.join('; ')}`
          );
          result.score = Math.min(result.score, 85);
        }
      }

      // Surface scope exclusions
      if (Array.isArray(eval_.scope_exclusions) && eval_.scope_exclusions.length > 0) {
        result.details.scope_exclusions = eval_.scope_exclusions;
      }
    }
  } catch (err) {
    result.warnings.push(`Lead evaluation check error: ${err.message}`);
    result.score = 80;
  }

  return result;
}

/**
 * Compare current SD state against baseline snapshot from LEAD evaluation.
 * Returns { drifted: boolean, changes: string[] }
 */
async function detectScopeDrift(supabase, sdId, baseline) {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('title, description, key_changes, success_criteria')
    .eq('id', sdId)
    .single();

  if (!sd) return { drifted: false, changes: [] };

  const changes = [];
  if (baseline.title && sd.title !== baseline.title) {
    changes.push('title changed');
  }
  if (baseline.description && sd.description !== baseline.description) {
    changes.push('description changed');
  }
  if (baseline.key_changes && JSON.stringify(sd.key_changes) !== JSON.stringify(baseline.key_changes)) {
    changes.push('key_changes modified');
  }
  if (baseline.success_criteria && JSON.stringify(sd.success_criteria) !== JSON.stringify(baseline.success_criteria)) {
    changes.push('success_criteria modified');
  }

  return { drifted: changes.length > 0, changes };
}

export function createLeadEvaluationGate(supabase) {
  return {
    name: 'GATE_LEAD_EVALUATION_CHECK',
    validator: async (ctx) => validateLeadEvaluation(supabase, ctx.sd?.id, ctx.sd?.sd_key),
    required: false, // Warning-only for backward compatibility
    remediation: 'Run `npm run lead:dossier -- <SD-KEY>` to generate a structured evaluation.',
  };
}
