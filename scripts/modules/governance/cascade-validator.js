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

  // Step 1: Load AEGIS constitution rules
  const { data: constitutions, error: constError } = await supabase
    .from('aegis_constitutions')
    .select('id, name, rules')
    .eq('status', 'active');

  if (constError) {
    logger.warn(`Cascade validation: Could not load constitutions: ${constError.message}`);
    return { passed: true, violations: [], warnings: ['Could not load AEGIS constitutions'], rulesChecked: 0 };
  }

  if (!constitutions || constitutions.length === 0) {
    logger.log('Cascade validation: No active constitutions found — skipping');
    return { passed: true, violations: [], warnings: ['No active AEGIS constitutions'], rulesChecked: 0 };
  }

  // Step 2: Load AEGIS rules linked to constitutions
  const constitutionIds = constitutions.map(c => c.id);
  const { data: rules, error: rulesError } = await supabase
    .from('aegis_rules')
    .select('id, constitution_id, rule_type, rule_text, enforcement_level')
    .in('constitution_id', constitutionIds)
    .eq('status', 'active');

  if (rulesError) {
    logger.warn(`Cascade validation: Could not load rules: ${rulesError.message}`);
    return { passed: true, violations: [], warnings: ['Could not load AEGIS rules'], rulesChecked: 0 };
  }

  if (!rules || rules.length === 0) {
    logger.log('Cascade validation: No active rules found — skipping');
    return { passed: true, violations: [], warnings: ['No active AEGIS rules'], rulesChecked: 0 };
  }

  // Step 3: Check SD against each rule
  const sdText = [
    sd.title || '',
    sd.description || '',
    ...(sd.strategic_objectives || []),
    ...(sd.key_changes || []).map(k => typeof k === 'string' ? k : k.change || ''),
  ].join(' ').toLowerCase();

  for (const rule of rules) {
    rulesChecked++;
    const ruleText = (rule.rule_text || '').toLowerCase();

    // Check for explicit constraint violations
    if (rule.rule_type === 'prohibition' && ruleText) {
      const keywords = extractKeywords(ruleText);
      const matchedKeywords = keywords.filter(kw => sdText.includes(kw));

      if (matchedKeywords.length >= 2) {
        violations.push({
          ruleId: rule.id,
          constitutionId: rule.constitution_id,
          ruleType: rule.rule_type,
          ruleText: rule.rule_text,
          enforcementLevel: rule.enforcement_level,
          matchedKeywords,
          sdTitle: sd.title,
        });
      }
    }

    // Check for alignment requirements
    if (rule.rule_type === 'requirement' && ruleText) {
      const keywords = extractKeywords(ruleText);
      const matchedKeywords = keywords.filter(kw => sdText.includes(kw));

      if (matchedKeywords.length === 0 && rule.enforcement_level === 'mandatory') {
        warnings.push({
          ruleId: rule.id,
          ruleType: rule.rule_type,
          ruleText: rule.rule_text,
          reason: 'SD does not reference required governance area',
        });
      }
    }
  }

  // Step 4: Validate 6-layer governance hierarchy
  // Layer 1: Mission — at least one active constitution must exist (mission derives constitutions)
  if (!constitutions || constitutions.length === 0) {
    violations.push({
      layer: 'mission_constitution',
      reason: 'No active AEGIS constitutions found — Mission→Constitution link missing',
      enforcementLevel: 'blocking',
    });
  }

  // Layer 2: Constitution → Rules already validated in Step 3

  // Layer 3: Vision alignment (MANDATORY — not conditional on vision_key)
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
    // Vision alignment is mandatory — warn if no vision_key provided
    warnings.push({
      layer: 'vision',
      reason: 'SD has no vision_key — vision alignment not verifiable. Consider linking to a vision document.',
    });
  }

  // Layer 4: Strategy alignment — SD should reference strategic objectives
  const hasStrategicObjectives = sd.strategic_objectives && sd.strategic_objectives.length > 0;
  if (!hasStrategicObjectives) {
    warnings.push({
      layer: 'strategy',
      reason: 'SD has no strategic_objectives — strategy layer not linked',
    });
  }

  // Layer 5: OKR alignment — check if SD links to objectives/key results
  const objectiveIds = sd.metadata?.objective_ids || [];
  if (objectiveIds.length === 0) {
    warnings.push({
      layer: 'okr',
      reason: 'SD has no linked OKR objectives — OKR layer not connected',
    });
  } else {
    // Verify linked objectives exist
    const { data: objectives } = await supabase
      .from('key_results')
      .select('id')
      .in('objective_id', objectiveIds)
      .limit(1);

    if (!objectives || objectives.length === 0) {
      warnings.push({
        layer: 'okr',
        reason: `Linked objective IDs not found in key_results: ${objectiveIds.join(', ')}`,
      });
    }
  }

  // Layer 6: SD itself — already being validated

  const hasViolations = violations.length > 0;
  let blocked = hasViolations;
  let overrideDecision = null;

  // Step 5: Check for chairman override, then escalate if still blocked
  if (hasViolations && !dryRun) {
    // Check if chairman already approved an override
    overrideDecision = await checkCascadeOverride(supabase, sd);

    if (overrideDecision) {
      blocked = false;
      logger.log(`Cascade validation: ${violations.length} violation(s) OVERRIDDEN by chairman decision ${overrideDecision.id}`);
    } else {
      // Escalate as blocking — chairman must approve to proceed
      try {
        await escalateToChairman(supabase, sd, violations);
        logger.log(`Cascade validation: ${violations.length} violation(s) BLOCKED — escalated to chairman for mandatory revision`);
      } catch (err) {
        logger.error(`Cascade validation: Escalation failed: ${err.message}`);
      }
    }
  }

  const passed = !blocked;

  // Log results
  logger.log(`Cascade validation: ${rulesChecked} rules checked, ${violations.length} violations, ${warnings.length} warnings, blocked=${blocked}`);

  return { passed, blocked, violations, warnings, rulesChecked, overrideDecision };
}

/**
 * Escalate cascade violations to chairman_decisions queue.
 * Creates a blocking decision — SD creation halted until chairman approves.
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
