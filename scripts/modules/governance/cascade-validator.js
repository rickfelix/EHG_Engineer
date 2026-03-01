/**
 * Strategic Governance Cascade Validator
 *
 * Validates the full 6-layer governance hierarchy:
 *   Mission → Constitution → Vision → Strategy → OKR → SD
 * Blocking mode — violations prevent SD creation and escalate to
 * chairman_decisions. Chairman can override with explicit reason.
 * Mandatory revision cycles enforced when alignment fails.
 *
 * Part of SD-MAN-ORCH-VISION-HEAL-GOVERNANCE-001-02
 * Enhanced by SD-MAN-GEN-CORRECTIVE-VISION-GAP-005:
 *   - Fixed AEGIS queries (is_active instead of status)
 *   - Added Mission layer validation
 *   - Extended bidirectional Strategy/Vision validation
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Validate cascade alignment for a new SD.
 *
 * @param {Object} options
 * @param {Object} options.sd - The SD being created (title, description, strategic_objectives, etc.)
 * @param {Object} [options.supabase] - Supabase client
 * @param {Object} [options.logger] - Logger
 * @param {boolean} [options.dryRun] - If true, report but don't escalate
 * @returns {Promise<{passed: boolean, violations: Array, warnings: Array, rulesChecked: number}>}
 */
export async function validateCascade({
  sd,
  supabase: supabaseClient,
  logger = console,
  dryRun = false,
} = {}) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const violations = [];
  const warnings = [];
  let rulesChecked = 0;

  // Layer 1: Mission — validate active mission exists for the venture
  const ventureId = sd.venture_id || sd.metadata?.venture_id || null;
  if (ventureId) {
    const { data: missions, error: missionError } = await supabase
      .from('missions')
      .select('id, mission_text, status')
      .eq('venture_id', ventureId)
      .eq('status', 'active')
      .limit(1);

    if (missionError) {
      warnings.push({ layer: 'mission', reason: `Could not query missions: ${missionError.message}` });
    } else if (!missions || missions.length === 0) {
      violations.push({
        layer: 'mission',
        reason: `No active mission found for venture ${ventureId}. The Mission layer is required.`,
        enforcementLevel: 'blocking',
      });
    }
  } else {
    warnings.push({ layer: 'mission', reason: 'SD has no venture_id — mission layer not verifiable' });
  }

  // Layer 2: Constitution — load AEGIS constitutions using is_active (boolean)
  const { data: constitutions, error: constError } = await supabase
    .from('aegis_constitutions')
    .select('id, name, enforcement_mode')
    .eq('is_active', true);

  if (constError) {
    logger.warn(`Cascade validation: Could not load constitutions: ${constError.message}`);
    return { passed: true, violations, warnings: [...warnings, 'Could not load AEGIS constitutions'], rulesChecked: 0 };
  }

  if (!constitutions || constitutions.length === 0) {
    warnings.push({ layer: 'constitution', reason: 'No active AEGIS constitutions found' });
  }

  // Load AEGIS rules using is_active (boolean) — only if constitutions exist
  let rules = [];
  if (constitutions && constitutions.length > 0) {
    const constitutionIds = constitutions.map(c => c.id);
    const { data: rulesData, error: rulesError } = await supabase
      .from('aegis_rules')
      .select('id, constitution_id, category, rule_text, severity')
      .in('constitution_id', constitutionIds)
      .eq('is_active', true);

    if (rulesError) {
      logger.warn(`Cascade validation: Could not load rules: ${rulesError.message}`);
    } else {
      rules = rulesData || [];
    }
  }

  // Check SD text against each rule
  if (rules.length > 0) {
    const sdText = [
      sd.title || '',
      sd.description || '',
      ...(sd.strategic_objectives || []),
      ...(sd.key_changes || []).map(k => typeof k === 'string' ? k : k.change || ''),
    ].join(' ').toLowerCase();

    for (const rule of rules) {
      rulesChecked++;
      const ruleText = (rule.rule_text || '').toLowerCase();

      // Check for prohibition violations
      if (rule.category === 'prohibition' && ruleText) {
        const keywords = extractKeywords(ruleText);
        const matchedKeywords = keywords.filter(kw => sdText.includes(kw));

        if (matchedKeywords.length >= 2) {
          violations.push({
            ruleId: rule.id,
            constitutionId: rule.constitution_id,
            ruleType: rule.category,
            ruleText: rule.rule_text,
            enforcementLevel: rule.severity,
            matchedKeywords,
            sdTitle: sd.title,
          });
        }
      }

      // Check for requirement alignment
      if (rule.category === 'requirement' && ruleText) {
        const keywords = extractKeywords(ruleText);
        const matchedKeywords = keywords.filter(kw => sdText.includes(kw));

        if (matchedKeywords.length === 0 && rule.severity === 'critical') {
          warnings.push({
            ruleId: rule.id,
            ruleType: rule.category,
            ruleText: rule.rule_text,
            reason: 'SD does not reference required governance area',
          });
        }
      }
    }
  }

  // Layer 3: Vision — verify vision_key references real eva_vision_documents record
  const visionKey = sd.vision_key || sd.metadata?.vision_key || null;
  if (visionKey) {
    const { data: vision } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, dimensions')
      .eq('vision_key', visionKey)
      .single();

    if (!vision) {
      violations.push({
        layer: 'vision',
        reason: `Vision ${visionKey} not found in EVA registry`,
        enforcementLevel: 'blocking',
      });
    }
  } else {
    warnings.push({
      layer: 'vision',
      reason: 'SD has no vision_key — vision alignment not verifiable. Consider linking to a vision document.',
    });
  }

  // Layer 4: Strategy — bidirectional: check objectives AND active themes for current year
  const hasStrategicObjectives = sd.strategic_objectives && sd.strategic_objectives.length > 0;
  if (!hasStrategicObjectives) {
    warnings.push({
      layer: 'strategy',
      reason: 'SD has no strategic_objectives — strategy layer not linked',
    });
  } else {
    const currentYear = new Date().getFullYear();
    const { data: themes, error: themesError } = await supabase
      .from('strategic_themes')
      .select('id, theme_key, title')
      .eq('year', currentYear)
      .eq('status', 'active')
      .limit(5);

    if (themesError) {
      warnings.push({ layer: 'strategy', reason: `Could not query strategic_themes: ${themesError.message}` });
    } else if (!themes || themes.length === 0) {
      warnings.push({
        layer: 'strategy',
        reason: `SD has strategic_objectives but no active strategic themes found for ${currentYear}. Strategy alignment not verifiable.`,
      });
    }
  }

  // Layer 5: OKR — bidirectional validation
  const objectiveIds = sd.metadata?.objective_ids || [];
  if (objectiveIds.length === 0) {
    warnings.push({
      layer: 'okr',
      reason: 'SD has no linked OKR objectives — OKR layer not connected',
    });
  } else {
    const { data: objectives, error: objError } = await supabase
      .from('key_results')
      .select('id, objective_id')
      .in('objective_id', objectiveIds);

    if (objError) {
      warnings.push({
        layer: 'okr_reverse',
        reason: `Could not verify OKR objectives: ${objError.message}`,
      });
    } else {
      const foundObjectiveIds = new Set((objectives || []).map(o => o.objective_id));
      const orphanedIds = objectiveIds.filter(id => !foundObjectiveIds.has(id));

      if (orphanedIds.length > 0) {
        violations.push({
          layer: 'okr_reverse',
          reason: `SD references ${orphanedIds.length} non-existent OKR objective(s): ${orphanedIds.join(', ')}. Cascade link is broken.`,
          enforcementLevel: 'blocking',
          orphanedObjectiveIds: orphanedIds,
        });
      }
    }
  }

  // Layer 6: SD itself — already being validated

  const hasViolations = violations.length > 0;
  let blocked = hasViolations;
  let overrideDecision = null;

  // Check for chairman override, then escalate if still blocked
  if (hasViolations && !dryRun) {
    overrideDecision = await checkCascadeOverride(supabase, sd);

    if (overrideDecision) {
      blocked = false;
      logger.log(`Cascade validation: ${violations.length} violation(s) OVERRIDDEN by chairman decision ${overrideDecision.id}`);
    } else {
      try {
        await escalateToChairman(supabase, sd, violations);
        logger.log(`Cascade validation: ${violations.length} violation(s) BLOCKED — escalated to chairman for mandatory revision`);
      } catch (err) {
        logger.error(`Cascade validation: Escalation failed: ${err.message}`);
      }
    }
  }

  const passed = !blocked;

  logger.log(`Cascade validation: ${rulesChecked} rules checked, ${violations.length} violations, ${warnings.length} warnings, blocked=${blocked}`);

  return { passed, blocked, violations, warnings, rulesChecked, overrideDecision };
}

/**
 * Escalate cascade violations to chairman_decisions queue.
 */
async function escalateToChairman(supabase, sd, violations) {
  const { error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: sd.venture_id || null,
      lifecycle_stage: 'sd_creation',
      decision_type: 'cascade_override',
      status: 'pending',
      blocking: true,
      summary: `Cascade validation: ${violations.length} violation(s) found for SD "${sd.title}"`,
      metadata: {
        sd_key: sd.sd_key || sd.id,
        sd_title: sd.title,
        violations,
        source: 'cascade-validator',
        auto_generated: true,
      },
    });

  if (error) throw new Error(error.message);
}

/**
 * Check if chairman has already approved a cascade override for this SD.
 */
async function checkCascadeOverride(supabase, sd) {
  const sdKey = sd.sd_key || sd.id;
  const { data } = await supabase
    .from('chairman_decisions')
    .select('id, status, metadata')
    .eq('decision_type', 'cascade_override')
    .eq('status', 'approved')
    .limit(50);

  if (data) {
    return data.find(d => d.metadata?.sd_key === sdKey) || null;
  }
  return null;
}

/**
 * Validate cascade alignment at handoff transitions for child SDs.
 * Runs lighter-weight checks than full creation-time validation,
 * focusing on parent-child alignment drift.
 *
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-008 (V09 enhancement)
 *
 * @param {Object} options
 * @param {Object} options.sd - The child SD being handed off
 * @param {string} options.handoffType - Type of handoff (e.g., PLAN-TO-EXEC)
 * @param {Object} [options.supabase] - Supabase client
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<{aligned: boolean, score: number, warnings: Array, violations: Array}>}
 */
export async function validateCascadeAtHandoff({
  sd,
  handoffType,
  supabase: supabaseClient,
  logger = console,
} = {}) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const warnings = [];
  const violations = [];
  let score = 100;

  const parentSdId = sd.parent_sd_id;

  // Only run for child SDs with a parent
  if (!parentSdId) {
    return { aligned: true, score: 100, warnings: [{ reason: 'Not a child SD — cascade check skipped' }], violations: [] };
  }

  try {
    // Fetch parent SD
    const { data: parent, error: parentError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, strategic_objectives, key_changes, status')
      .eq('id', parentSdId)
      .single();

    if (parentError || !parent) {
      warnings.push({ reason: `Could not load parent SD: ${parentError?.message || 'not found'}` });
      return { aligned: true, score: 80, warnings, violations };
    }

    // Check 1: Parent is not cancelled/abandoned
    if (parent.status === 'cancelled' || parent.status === 'abandoned') {
      violations.push({
        check: 'parent_status',
        reason: `Parent ${parent.sd_key} is ${parent.status} — child work may be orphaned`,
        severity: 'blocking',
      });
      score -= 30;
    }

    // Check 2: Child objectives should align with parent objectives
    const parentObjectives = parent.strategic_objectives || [];
    const childObjectives = sd.strategic_objectives || [];

    if (parentObjectives.length > 0 && childObjectives.length > 0) {
      const parentText = parentObjectives.join(' ').toLowerCase();
      const childText = childObjectives.join(' ').toLowerCase();

      // Extract parent keywords for alignment check
      const parentKeywords = extractKeywords(parentText);
      const matchCount = parentKeywords.filter(kw => childText.includes(kw)).length;
      const alignmentPercent = parentKeywords.length > 0
        ? Math.round((matchCount / parentKeywords.length) * 100)
        : 100;

      if (alignmentPercent < 20) {
        violations.push({
          check: 'objective_alignment',
          reason: `Child objectives have ${alignmentPercent}% keyword alignment with parent (threshold: 20%)`,
          severity: 'warning',
          parentSdKey: parent.sd_key,
          alignmentPercent,
        });
        score -= 15;
      } else if (alignmentPercent < 40) {
        warnings.push({
          check: 'objective_alignment',
          reason: `Low alignment (${alignmentPercent}%) between child and parent objectives`,
          parentSdKey: parent.sd_key,
        });
        score -= 5;
      }
    }

    // Check 3: Key changes scope containment
    const parentChanges = (parent.key_changes || []).map(k => typeof k === 'string' ? k : k.change || '').join(' ').toLowerCase();
    const childChanges = (sd.key_changes || []).map(k => typeof k === 'string' ? k : k.change || '').join(' ').toLowerCase();

    if (parentChanges && childChanges) {
      const parentChangeKeywords = extractKeywords(parentChanges);
      const childMatchCount = parentChangeKeywords.filter(kw => childChanges.includes(kw)).length;
      const scopeContainment = parentChangeKeywords.length > 0
        ? Math.round((childMatchCount / parentChangeKeywords.length) * 100)
        : 100;

      if (scopeContainment < 10) {
        warnings.push({
          check: 'scope_containment',
          reason: `Child key_changes have minimal overlap (${scopeContainment}%) with parent scope`,
          parentSdKey: parent.sd_key,
        });
        score -= 5;
      }
    }

    // Log cascade check to eva_event_log
    try {
      await supabase.from('eva_event_log').insert({
        event_type: 'cascade_alignment_check',
        event_data: {
          sd_key: sd.sd_key || sd.id,
          parent_sd_key: parent.sd_key,
          handoff_type: handoffType,
          score,
          aligned: violations.filter(v => v.severity === 'blocking').length === 0,
          violations_count: violations.length,
          warnings_count: warnings.length,
        },
        created_at: new Date().toISOString(),
      });
    } catch (logErr) {
      logger.warn(`[CascadeValidator] Event log failed: ${logErr.message}`);
    }

    const aligned = violations.filter(v => v.severity === 'blocking').length === 0;

    logger.log(`[CascadeValidator] Handoff cascade check for ${sd.sd_key || sd.id}: score=${score}, aligned=${aligned}, warnings=${warnings.length}`);

    return { aligned, score: Math.max(0, score), warnings, violations };
  } catch (err) {
    logger.warn(`[CascadeValidator] Error: ${err.message}`);
    return { aligned: true, score: 70, warnings: [{ reason: `Cascade check error: ${err.message}` }], violations: [] };
  }
}

/**
 * Get cascade alignment summary across all parent-child relationships.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {string} [options.orchestratorId] - Filter by specific orchestrator
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<{alignments: Array, overallScore: number, error?: string}>}
 */
export async function getCascadeAlignmentSummary(supabase, options = {}) {
  const { orchestratorId = null, logger = console } = options;

  if (!supabase) {
    return { alignments: [], overallScore: 0, error: 'No supabase client' };
  }

  try {
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, parent_sd_id, strategic_objectives, status')
      .not('parent_sd_id', 'is', null)
      .in('status', ['draft', 'planning', 'in_progress', 'blocked']);

    if (orchestratorId) {
      query = query.eq('parent_sd_id', orchestratorId);
    }

    const { data: children, error: childError } = await query.limit(100);

    if (childError) {
      return { alignments: [], overallScore: 0, error: childError.message };
    }

    if (!children || children.length === 0) {
      return { alignments: [], overallScore: 100 };
    }

    // Fetch all referenced parents
    const parentIds = [...new Set(children.map(c => c.parent_sd_id))];
    const { data: parents } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, strategic_objectives')
      .in('id', parentIds);

    const parentMap = new Map((parents || []).map(p => [p.id, p]));

    const alignments = children.map(function(child) {
      const parent = parentMap.get(child.parent_sd_id);
      if (!parent) return { childKey: child.sd_key, parentKey: 'unknown', score: 50, reason: 'Parent not found' };

      const parentText = (parent.strategic_objectives || []).join(' ').toLowerCase();
      const childText = (child.strategic_objectives || []).join(' ').toLowerCase();
      const parentKeywords = extractKeywords(parentText);
      const matchCount = parentKeywords.filter(kw => childText.includes(kw)).length;
      const alignmentScore = parentKeywords.length > 0 ? Math.round((matchCount / parentKeywords.length) * 100) : 100;

      return {
        childKey: child.sd_key,
        parentKey: parent.sd_key,
        score: alignmentScore,
        status: child.status,
      };
    });

    const overallScore = alignments.length > 0
      ? Math.round(alignments.reduce((sum, a) => sum + a.score, 0) / alignments.length)
      : 100;

    return { alignments, overallScore };
  } catch (err) {
    logger.warn(`[CascadeValidator] Summary error: ${err.message}`);
    return { alignments: [], overallScore: 0, error: err.message };
  }
}

/**
 * Extract meaningful keywords from rule text for matching.
 */
function extractKeywords(text) {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'and', 'but', 'or', 'if', 'while', 'that', 'this', 'it', 'its']);

  return text
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 3 && !stopWords.has(w));
}
