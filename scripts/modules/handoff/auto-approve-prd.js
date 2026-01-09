/**
 * Auto-Approve PRD Module
 * LEO Protocol v4.4 - Automation Enhancement
 *
 * PURPOSE: Automatically approves PRDs that meet minimum quality thresholds
 * TRIGGER: Called after PRD creation or during LEAD-TO-PLAN completion
 *
 * User Request: "I want automation" - bypasses manual review for qualified PRDs
 */

import { createClient } from '@supabase/supabase-js';
import { validatePRDForHandoff } from '../prd-quality-validation.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Configuration for auto-approval thresholds
 * These can be adjusted per SD type
 */
const AUTO_APPROVE_CONFIG = {
  // Minimum PRD quality score for auto-approval (0-100)
  minimumScore: 50, // Lowered for automation - manual review skipped

  // SD types that allow auto-approval (all types for full automation)
  allowedSdTypes: [
    'feature',
    'infrastructure',
    'documentation',
    'testing',
    'refactor',
    'bugfix',
    'database',
    'security',
    'qa',
    'quality'
  ],

  // Fields that must be present (non-empty) for auto-approval
  requiredFields: [
    'executive_summary',
    'functional_requirements',
    'acceptance_criteria'
  ],

  // Skip fields for specific SD types
  skipFieldsForTypes: {
    documentation: ['test_scenarios', 'api_specifications'],
    infrastructure: ['ui_ux_requirements']
  }
};

/**
 * Auto-approve a PRD if it meets quality thresholds
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {object} options - Optional configuration
 * @returns {Promise<{approved: boolean, reason: string, score?: number}>}
 */
export async function autoApprovePRD(sdId, options = {}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const config = { ...AUTO_APPROVE_CONFIG, ...options };

  console.log(`\n🤖 AUTO-APPROVE PRD: ${sdId}`);
  console.log('─'.repeat(50));

  // 1. Get SD to check type
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, category')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    return { approved: false, reason: `SD not found: ${sdId}` };
  }

  const sdType = sd.sd_type || sd.category || 'feature';
  console.log(`   SD Type: ${sdType}`);

  // 2. Check if SD type allows auto-approval
  if (!config.allowedSdTypes.includes(sdType.toLowerCase())) {
    return { approved: false, reason: `SD type '${sdType}' not in auto-approve list` };
  }

  // 3. Get PRD
  const prdId = `PRD-${sdId}`;
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', prdId)
    .single();

  if (prdError || !prd) {
    // Try by sd_id
    const { data: prdBySdId } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    if (!prdBySdId) {
      return { approved: false, reason: `PRD not found for SD: ${sdId}` };
    }
    Object.assign(prd, prdBySdId);
  }

  console.log(`   PRD ID: ${prd.id}`);
  console.log(`   Current Status: ${prd.status}`);

  // 4. Already approved?
  if (prd.status === 'approved' || prd.status === 'ready_for_exec') {
    console.log('   ✅ Already approved');
    return { approved: true, reason: 'Already approved', score: 100 };
  }

  // 5. Check required fields
  const skipFields = config.skipFieldsForTypes[sdType.toLowerCase()] || [];
  const fieldsToCheck = config.requiredFields.filter(f => !skipFields.includes(f));

  const missingFields = fieldsToCheck.filter(field => {
    const value = prd[field];
    if (!value) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'string' && value.trim().length === 0) return true;
    if (typeof value === 'string' && value.includes('[TODO:')) return true;
    return false;
  });

  if (missingFields.length > 0) {
    console.log(`   ❌ Missing required fields: ${missingFields.join(', ')}`);
    return { approved: false, reason: `Missing fields: ${missingFields.join(', ')}` };
  }

  // 6. Calculate quality score (simplified for automation)
  let score = 0;
  const weights = {
    executive_summary: 20,
    functional_requirements: 25,
    acceptance_criteria: 20,
    system_architecture: 10,
    implementation_approach: 10,
    risks: 5,
    test_scenarios: 10
  };

  for (const [field, weight] of Object.entries(weights)) {
    const value = prd[field];
    if (value) {
      if (Array.isArray(value) && value.length > 0) {
        score += weight;
      } else if (typeof value === 'string' && value.length > 50) {
        score += weight;
      } else if (typeof value === 'object' && Object.keys(value).length > 0) {
        score += weight;
      }
    }
  }

  console.log(`   Quality Score: ${score}%`);

  // 7. Check threshold
  if (score < config.minimumScore) {
    console.log(`   ❌ Below threshold (${config.minimumScore}%)`);
    return { approved: false, reason: `Score ${score}% < threshold ${config.minimumScore}%`, score };
  }

  // 8. Auto-approve!
  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      status: 'approved',
      updated_at: new Date().toISOString(),
      metadata: {
        ...prd.metadata,
        auto_approved: true,
        auto_approved_at: new Date().toISOString(),
        auto_approved_score: score
      }
    })
    .eq('id', prd.id);

  if (updateError) {
    console.log(`   ❌ Update failed: ${updateError.message}`);
    return { approved: false, reason: `Update failed: ${updateError.message}`, score };
  }

  console.log(`   ✅ AUTO-APPROVED (score: ${score}%)`);
  return { approved: true, reason: 'Auto-approved based on quality score', score };
}

/**
 * Auto-approve all PRDs for an SD's children
 *
 * @param {string} parentSdId - Parent SD ID
 * @returns {Promise<{results: Array, summary: string}>}
 */
export async function autoApproveChildPRDs(parentSdId) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  console.log(`\n🤖 AUTO-APPROVE CHILD PRDs for: ${parentSdId}`);
  console.log('═'.repeat(60));

  // Get all children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type')
    .eq('parent_sd_id', parentSdId);

  if (!children || children.length === 0) {
    return { results: [], summary: 'No children found' };
  }

  const results = [];
  for (const child of children) {
    const result = await autoApprovePRD(child.id);
    results.push({ sd_id: child.id, title: child.title, ...result });
  }

  const approved = results.filter(r => r.approved).length;
  const summary = `Auto-approved ${approved}/${results.length} PRDs`;

  console.log(`\n📊 Summary: ${summary}`);

  return { results, summary };
}

// CLI execution
if (process.argv[1].includes('auto-approve-prd.js')) {
  const sdId = process.argv[2];

  if (!sdId) {
    console.log('Usage: node auto-approve-prd.js <SD-ID>');
    console.log('       node auto-approve-prd.js --children <PARENT-SD-ID>');
    process.exit(1);
  }

  if (sdId === '--children' && process.argv[3]) {
    autoApproveChildPRDs(process.argv[3])
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.results.every(r => r.approved) ? 0 : 1);
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else {
    autoApprovePRD(sdId)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.approved ? 0 : 1);
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  }
}

export default { autoApprovePRD, autoApproveChildPRDs };
