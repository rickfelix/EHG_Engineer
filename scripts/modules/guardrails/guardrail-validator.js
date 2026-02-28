/**
 * Governance Guardrails Validator
 *
 * Validates the 7 named governance guardrails against AEGIS constitution
 * rules. Blocking mode — violations prevent SD creation and escalate to
 * chairman_decisions. Chairman can override with explicit reason.
 *
 * The 7 guardrails:
 *   1. No autonomous spending above threshold
 *   2. No external communication without approval
 *   3. No data deletion without backup
 *   4. No production deployment without testing
 *   5. No schema migration without review
 *   6. No security bypass without escalation
 *   7. No scope change without LEAD approval
 *
 * Part of SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-01-A
 */

import { createClient } from '@supabase/supabase-js';

const GUARDRAIL_DEFINITIONS = [
  { id: 'GR-001', name: 'spending_threshold', keywords: ['spend', 'cost', 'budget', 'payment', 'purchase', 'billing'] },
  { id: 'GR-002', name: 'external_communication', keywords: ['email', 'notification', 'external', 'communication', 'message', 'slack'] },
  { id: 'GR-003', name: 'data_deletion', keywords: ['delete', 'remove', 'drop', 'truncate', 'purge', 'destroy'] },
  { id: 'GR-004', name: 'production_deployment', keywords: ['deploy', 'production', 'release', 'publish', 'live'] },
  { id: 'GR-005', name: 'schema_migration', keywords: ['migration', 'schema', 'alter', 'column', 'table', 'index'] },
  { id: 'GR-006', name: 'security_bypass', keywords: ['security', 'bypass', 'override', 'credential', 'token', 'auth'] },
  { id: 'GR-007', name: 'scope_change', keywords: ['scope', 'requirement', 'change', 'modify', 'expand', 'add feature'] },
];

/**
 * Validate governance guardrails for an SD or operation.
 *
 * @param {Object} options
 * @param {Object} options.sd - The SD or operation context (title, description, key_changes, etc.)
 * @param {Object} [options.supabase] - Supabase client
 * @param {Object} [options.logger] - Logger
 * @param {boolean} [options.dryRun] - If true, report but don't escalate
 * @returns {Promise<{passed: boolean, violations: Array, warnings: Array, guardrailsChecked: number}>}
 */
export async function validateGuardrails({
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
  let guardrailsChecked = 0;

  // Load AEGIS constitution rules
  const { data: rules, error: rulesError } = await supabase
    .from('aegis_rules')
    .select('id, constitution_id, rule_type, rule_text, enforcement_level')
    .eq('status', 'active');

  if (rulesError) {
    logger.warn(`Guardrail validation: Could not load AEGIS rules: ${rulesError.message}`);
    return { passed: true, violations: [], warnings: ['Could not load AEGIS rules'], guardrailsChecked: 0 };
  }

  if (!rules || rules.length === 0) {
    logger.log('Guardrail validation: No active AEGIS rules — skipping');
    return { passed: true, violations: [], warnings: ['No active AEGIS rules'], guardrailsChecked: 0 };
  }

  // Build SD text for matching
  const sdText = [
    sd.title || '',
    sd.description || '',
    ...(sd.strategic_objectives || []),
    ...(sd.key_changes || []).map(k => typeof k === 'string' ? k : k.change || ''),
  ].join(' ').toLowerCase();

  // Check each guardrail
  for (const guardrail of GUARDRAIL_DEFINITIONS) {
    guardrailsChecked++;

    // Find AEGIS rules that relate to this guardrail
    const relatedRules = rules.filter(r => {
      const ruleText = (r.rule_text || '').toLowerCase();
      return guardrail.keywords.some(kw => ruleText.includes(kw));
    });

    if (relatedRules.length === 0) {
      warnings.push({
        guardrailId: guardrail.id,
        guardrailName: guardrail.name,
        reason: `No AEGIS rules mapped to guardrail ${guardrail.name}`,
      });
      continue;
    }

    // Check if SD text triggers any guardrail-related rules
    const sdMatchesGuardrail = guardrail.keywords.some(kw => sdText.includes(kw));

    if (sdMatchesGuardrail) {
      // SD touches this guardrail area — check for prohibition rules
      const prohibitions = relatedRules.filter(r => r.rule_type === 'prohibition');

      for (const rule of prohibitions) {
        const ruleKeywords = extractKeywords(rule.rule_text || '');
        const matched = ruleKeywords.filter(kw => sdText.includes(kw));

        if (matched.length >= 2) {
          violations.push({
            guardrailId: guardrail.id,
            guardrailName: guardrail.name,
            ruleId: rule.id,
            ruleText: rule.rule_text,
            enforcementLevel: rule.enforcement_level,
            matchedKeywords: matched,
            sdTitle: sd.title,
          });
        }
      }
    }
  }

  const hasViolations = violations.length > 0;
  let blocked = hasViolations;
  let overrideDecision = null;

  if (hasViolations && !dryRun) {
    // Check for existing chairman override
    overrideDecision = await checkChairmanOverride(supabase, sd);

    if (overrideDecision) {
      blocked = false;
      logger.log(`Guardrail validation: ${violations.length} violation(s) OVERRIDDEN by chairman decision ${overrideDecision.id}`);
    } else {
      // Escalate as blocking — chairman must approve to proceed
      try {
        await escalateGuardrailViolations(supabase, sd, violations);
        logger.log(`Guardrail validation: ${violations.length} violation(s) BLOCKED — escalated to chairman`);
      } catch (err) {
        logger.error(`Guardrail validation: Escalation failed: ${err.message}`);
      }
    }
  }

  const passed = !blocked;

  logger.log(`Guardrail validation: ${guardrailsChecked} guardrails checked, ${violations.length} violations, ${warnings.length} warnings, blocked=${blocked}`);

  return { passed, blocked, violations, warnings, guardrailsChecked, overrideDecision };
}

/**
 * Escalate guardrail violations to chairman_decisions queue.
 */
async function escalateGuardrailViolations(supabase, sd, violations) {
  const { error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: sd.venture_id || null,
      lifecycle_stage: 'guardrail_check',
      decision_type: 'guardrail_override',
      status: 'pending',
      blocking: true,
      summary: `Guardrail validation: ${violations.length} violation(s) for SD "${sd.title}"`,
      metadata: {
        sd_key: sd.sd_key || sd.id,
        sd_title: sd.title,
        violations,
        source: 'guardrail-validator',
        auto_generated: true,
      },
    });

  if (error) throw new Error(error.message);
}

/**
 * Check if chairman has already approved an override for this SD's guardrail violations.
 */
async function checkChairmanOverride(supabase, sd) {
  const sdKey = sd.sd_key || sd.id;
  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('id, status, metadata')
    .eq('decision_type', 'guardrail_override')
    .eq('status', 'approved')
    .containedBy('metadata', { sd_key: sdKey })
    .limit(1);

  if (error || !data || data.length === 0) {
    // Try alternate match via metadata->>sd_key
    const { data: data2 } = await supabase
      .from('chairman_decisions')
      .select('id, status, metadata')
      .eq('decision_type', 'guardrail_override')
      .eq('status', 'approved')
      .limit(50);

    if (data2) {
      return data2.find(d => d.metadata?.sd_key === sdKey) || null;
    }
    return null;
  }

  return data[0] || null;
}

/**
 * Extract meaningful keywords from text.
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

  return text.toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 3 && !stopWords.has(w));
}
