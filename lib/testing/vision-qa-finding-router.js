/**
 * Vision QA Finding Router
 * SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001 (US-004)
 *
 * Routes Vision QA findings into:
 *   (a) Inline quick-fix loop for critical high-confidence bugs (max 2 cycles)
 *   (b) UAT debt registry for everything else
 *
 * Deduplicates by issue_signature to avoid creating duplicate quick-fixes.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const MAX_QUICKFIX_CYCLES = 2;
const CRITICAL_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Generate a deterministic issue signature for deduplication.
 *
 * @param {Object} finding - A Vision QA finding
 * @returns {string} Hex hash of category + normalized description
 */
export function generateIssueSignature(finding) {
  const raw = `${finding.category || 'bug'}:${(finding.description || '').toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Classify a finding as quick-fixable or debt-bound.
 *
 * @param {Object} finding - Vision QA finding
 * @returns {{ route: 'quickfix' | 'debt', reason: string }}
 */
export function classifyFinding(finding) {
  const severity = (finding.severity || '').toLowerCase();
  const confidence = finding.confidence ?? 0;

  if (severity === 'critical' && confidence >= CRITICAL_CONFIDENCE_THRESHOLD) {
    return { route: 'quickfix', reason: `critical severity with confidence ${confidence}` };
  }

  if (severity === 'critical' && confidence < CRITICAL_CONFIDENCE_THRESHOLD) {
    return { route: 'debt', reason: `critical but low confidence (${confidence} < ${CRITICAL_CONFIDENCE_THRESHOLD})` };
  }

  return { route: 'debt', reason: `non-critical severity: ${severity}` };
}

/**
 * Route all findings from a Vision QA run.
 *
 * @param {Object} visionQAResult - Complete Vision QA result
 * @param {Object} context - SD context
 * @param {string} context.sdId - SD UUID
 * @param {string} context.sessionId - Vision QA session UUID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{ quickfix_items: Object[], debt_items: Object[], cycle_count: number }>}
 */
export async function routeFindings(visionQAResult, context, supabase = null) {
  const client = supabase || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const findings = visionQAResult.bugs || visionQAResult.findings || [];
  const quickfixItems = [];
  const debtItems = [];

  for (const finding of findings) {
    const classification = classifyFinding(finding);
    const signature = generateIssueSignature(finding);

    if (classification.route === 'quickfix') {
      // Check for existing open quick-fix with same signature
      const existing = await checkExistingQuickFix(client, context.sdId, signature);

      if (existing) {
        // Reuse existing - send to debt instead of creating duplicate
        debtItems.push({
          ...finding,
          issue_signature: signature,
          route_reason: `duplicate of existing quick-fix: ${existing.id}`,
          linked_quickfix_id: existing.id
        });
      } else {
        quickfixItems.push({
          ...finding,
          issue_signature: signature,
          route_reason: classification.reason
        });
      }
    } else {
      debtItems.push({
        ...finding,
        issue_signature: signature,
        route_reason: classification.reason
      });
    }
  }

  // Also route a11y violations and performance issues to debt
  const a11yViolations = visionQAResult.accessibilityViolations || [];
  for (const violation of a11yViolations) {
    debtItems.push({
      category: 'accessibility',
      severity: violation.impact || 'medium',
      confidence: 0.9,
      description: `${violation.id}: ${violation.description || violation.help}`,
      issue_signature: generateIssueSignature({ category: 'accessibility', description: violation.id }),
      evidence: { nodes: violation.nodes, helpUrl: violation.helpUrl }
    });
  }

  const perfMetrics = visionQAResult.performanceMetrics || {};
  if (perfMetrics.lcp > 2500 || perfMetrics.fcp > 1800) {
    debtItems.push({
      category: 'performance',
      severity: perfMetrics.lcp > 4000 ? 'high' : 'medium',
      confidence: 0.95,
      description: `Performance regression: LCP=${perfMetrics.lcp}ms, FCP=${perfMetrics.fcp}ms`,
      issue_signature: generateIssueSignature({ category: 'performance', description: 'lcp-fcp-regression' }),
      evidence: perfMetrics
    });
  }

  // Insert debt items into uat_debt_registry
  if (debtItems.length > 0) {
    await insertDebtItems(client, debtItems, context);
  }

  return {
    quickfix_items: quickfixItems,
    debt_items: debtItems,
    cycle_count: 0,
    total_findings: findings.length + a11yViolations.length
  };
}

/**
 * Insert items into the UAT debt registry.
 */
async function insertDebtItems(supabase, items, context) {
  const rows = items.map(item => ({
    sd_id: context.sdId,
    source: 'vision_qa',
    category: mapCategory(item.category),
    severity: mapSeverity(item.severity),
    confidence: item.confidence ?? null,
    description: item.description || 'Vision QA finding',
    evidence: {
      route_reason: item.route_reason,
      linked_quickfix_id: item.linked_quickfix_id,
      original_finding: item,
      ...(item.evidence || {})
    },
    vision_qa_session_id: context.sessionId || null,
    status: 'pending',
    area: item.area || item.page || null,
    issue_signature: item.issue_signature
  }));

  const { error } = await supabase.from('uat_debt_registry').insert(rows);
  if (error) {
    console.error('Error inserting debt items:', error.message);
  } else {
    console.log(`   Registered ${rows.length} item(s) in UAT debt registry`);
  }
}

/**
 * Register a skip/timeout/no-goals entry in the debt registry.
 */
export async function registerSkipEntry(supabase, sdId, reason, details = {}) {
  const { error } = await supabase.from('uat_debt_registry').insert({
    sd_id: sdId,
    source: 'skip',
    category: 'untested',
    severity: 'medium',
    confidence: null,
    description: `Vision QA skipped: ${reason}`,
    evidence: { reason, ...details },
    status: 'pending',
    area: null,
    issue_signature: generateIssueSignature({ category: 'untested', description: reason })
  });

  if (error) {
    console.error('Error registering skip entry:', error.message);
  }
}

/**
 * Check for existing open quick-fix with same issue signature.
 */
async function checkExistingQuickFix(supabase, sdId, signature) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('parent_sd_id', sdId)
    .eq('source', 'quick-fix')
    .not('status', 'in', '("completed","cancelled")')
    .limit(10);

  if (!data || data.length === 0) return null;

  // Check if any quick-fix matches the signature (stored in metadata)
  for (const qf of data) {
    if (qf.metadata?.issue_signature === signature) {
      return qf;
    }
  }
  return null;
}

/**
 * Map various category strings to valid enum values.
 */
function mapCategory(cat) {
  const normalized = (cat || '').toLowerCase();
  const mapping = {
    'bug': 'bug',
    'visual': 'bug',
    'functional': 'bug',
    'accessibility': 'accessibility',
    'a11y': 'accessibility',
    'performance': 'performance',
    'perf': 'performance',
    'ux': 'ux_judgment',
    'ux_judgment': 'ux_judgment',
    'untested': 'untested'
  };
  return mapping[normalized] || 'bug';
}

/**
 * Map various severity strings to valid enum values.
 */
function mapSeverity(sev) {
  const normalized = (sev || '').toLowerCase();
  const mapping = {
    'critical': 'critical',
    'serious': 'high',
    'high': 'high',
    'moderate': 'medium',
    'medium': 'medium',
    'minor': 'low',
    'low': 'low'
  };
  return mapping[normalized] || 'medium';
}

export { MAX_QUICKFIX_CYCLES, CRITICAL_CONFIDENCE_THRESHOLD };

export default {
  routeFindings,
  classifyFinding,
  generateIssueSignature,
  registerSkipEntry,
  MAX_QUICKFIX_CYCLES,
  CRITICAL_CONFIDENCE_THRESHOLD
};
