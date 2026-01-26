#!/usr/bin/env node

/**
 * Orchestrator Preflight Check v2.0.0
 *
 * Enhanced version with auto-detection, structured output, and artifact validation.
 *
 * Displays workflow requirements for orchestrator parent SDs and their children
 * before autonomous work begins. This is a process-layer guardrail that surfaces
 * the SD-type validation requirements BEFORE Claude starts working.
 *
 * Usage:
 *   node scripts/orchestrator-preflight.js SD-XXX-001
 *   node scripts/orchestrator-preflight.js SD-XXX-001 --json
 *   node scripts/orchestrator-preflight.js SD-XXX-001 --validate
 *
 * Features (v2.0.0 - SD-LEO-INFRA-FORMALIZE-ORCHESTRATOR-WORKFLOW-001):
 *   - Explicit orchestrator detection via metadata.pattern_type or metadata.is_orchestrator
 *   - Heuristic detection when explicit metadata is absent
 *   - Artifact validation (child SDs exist, parent PRD derivation documented)
 *   - Structured JSON output for machine consumption
 *   - Child status sequencing validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SD Type Validation Profiles (from database trigger logic)
const SD_TYPE_PROFILES = {
  feature: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 85,
    description: 'Full validation (UI, E2E, integration)'
  },
  database: {
    prd_required: true,
    e2e_required: false,
    min_handoffs: 3,
    threshold: 75,
    description: 'Schema-focused, may skip UI-dependent E2E'
  },
  infrastructure: {
    prd_required: true,
    e2e_required: false,
    min_handoffs: 3,
    threshold: 80,
    description: 'Tooling/protocols, reduced code validation'
  },
  security: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 90,
    description: 'Higher bar for security-critical work'
  },
  documentation: {
    prd_required: false,
    e2e_required: false,
    min_handoffs: 2,
    threshold: 60,
    description: 'No code changes, minimal validation'
  },
  orchestrator: {
    prd_required: false,
    e2e_required: false,
    min_handoffs: 2,
    threshold: 70,
    description: 'Coordination layer, user stories in children'
  },
  refactor: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 80,
    description: 'Behavior preservation focus'
  },
  bugfix: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 3,
    threshold: 80,
    description: 'Targeted fix validation'
  },
  performance: {
    prd_required: true,
    e2e_required: true,
    min_handoffs: 4,
    threshold: 85,
    description: 'Measurable impact verification'
  }
};

// Heuristic detection keywords
const ORCHESTRATOR_KEYWORDS = [
  'orchestrator',
  'children',
  'parent prd derived',
  'child sds',
  'multi-phase',
  'coordination',
  'decomposition'
];

/**
 * Detect if SD is an orchestrator using explicit metadata or heuristics
 */
function detectOrchestratorStatus(sd, children) {
  const result = {
    isOrchestrator: false,
    detectionMethod: 'none',
    confidence: 0,
    signals: []
  };

  // Method 1: Explicit metadata declaration (authoritative)
  if (sd.metadata?.pattern_type === 'orchestrator' ||
      sd.metadata?.is_orchestrator === true ||
      sd.metadata?.workflow_formalization === true) {
    result.isOrchestrator = true;
    result.detectionMethod = 'explicit_metadata';
    result.confidence = 100;
    result.signals.push(`metadata.${sd.metadata?.pattern_type ? 'pattern_type' : 'is_orchestrator'} = true`);
    return result;
  }

  // Method 2: Has children in database
  if (children && children.length > 0) {
    result.isOrchestrator = true;
    result.detectionMethod = 'database_children';
    result.confidence = 100;
    result.signals.push(`${children.length} child SD(s) found with parent_sd_id`);
    return result;
  }

  // Method 3: Heuristic detection from content
  const textToSearch = [
    sd.title || '',
    sd.description || '',
    sd.scope || '',
    JSON.stringify(sd.metadata?.related_sds || [])
  ].join(' ').toLowerCase();

  const matchedKeywords = ORCHESTRATOR_KEYWORDS.filter(kw => textToSearch.includes(kw));
  const relatedSdsCount = sd.metadata?.related_sds?.length || 0;

  if (matchedKeywords.length >= 2 || relatedSdsCount >= 2) {
    result.isOrchestrator = true;
    result.detectionMethod = 'heuristic';
    result.confidence = Math.min(matchedKeywords.length * 25 + relatedSdsCount * 20, 80);
    if (matchedKeywords.length > 0) {
      result.signals.push(`Keywords matched: ${matchedKeywords.join(', ')}`);
    }
    if (relatedSdsCount >= 2) {
      result.signals.push(`${relatedSdsCount} related_sds referenced`);
    }
    return result;
  }

  return result;
}

/**
 * Validate orchestrator artifacts
 */
async function validateArtifacts(sd, children) {
  const issues = [];
  const warnings = [];

  // Check 1: Children exist
  if (!children || children.length === 0) {
    issues.push({
      code: 'NO_CHILDREN',
      message: 'Orchestrator detected but no child SDs found in database',
      fix: 'Create child SDs with parent_sd_id pointing to this SD'
    });
  }

  // Check 2: Parent PRD has derivation mapping (if PRD exists)
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements, metadata')
    .eq('sd_id', sd.sd_key || sd.id)
    .single();

  if (prd) {
    const frText = JSON.stringify(prd.functional_requirements || []);
    const metaText = JSON.stringify(prd.metadata || {});
    const hasDerivationMapping =
      frText.toLowerCase().includes('child') ||
      frText.toLowerCase().includes('traceability') ||
      metaText.includes('derived_from_children') ||
      metaText.includes('child_mapping');

    if (!hasDerivationMapping) {
      warnings.push({
        code: 'NO_DERIVATION_MAPPING',
        message: 'Parent PRD exists but lacks explicit child traceability mapping',
        fix: 'Add a traceability map section linking parent requirements to child SD IDs'
      });
    }
  }

  // Check 3: Children status validation (none should be EXECUTING without orchestrator LEAD approval)
  if (children) {
    const executingWithoutApproval = children.filter(c =>
      c.status === 'active' || c.status === 'in_progress'
    );

    // Only flag if parent is still in draft/pending
    if (executingWithoutApproval.length > 0 &&
        (sd.status === 'draft' || sd.status === 'pending')) {
      warnings.push({
        code: 'CHILD_EXECUTING_BEFORE_ORCHESTRATOR_APPROVAL',
        message: `${executingWithoutApproval.length} child(ren) executing while orchestrator is still ${sd.status}`,
        fix: 'Ensure orchestrator LEAD approval before children enter EXEC phase'
      });
    }
  }

  // Check 4: Protocol doc reference
  // This is advisory - we can't easily check if protocol docs reference this orchestrator
  if (sd.metadata?.pattern_type && !sd.metadata?.protocol_doc_ref) {
    warnings.push({
      code: 'NO_PROTOCOL_DOC_REF',
      message: 'No protocol_doc_ref in metadata',
      fix: 'Consider adding metadata.protocol_doc_ref with location of pattern documentation'
    });
  }

  return { issues, warnings };
}

async function getOrchestrator(sdId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdId)
    .single();

  if (error) {
    const { data: byId, error: byIdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (byIdError) {
      console.error(`Error fetching SD: ${byIdError.message}`);
      return null;
    }
    return byId;
  }
  return data;
}

async function getChildren(parentId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('parent_sd_id', parentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Error fetching children: ${error.message}`);
    return [];
  }
  return data || [];
}

async function getHandoffCount(sdId) {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id')
    .eq('sd_id', sdId);

  if (error) return 0;
  return data?.length || 0;
}

async function hasPRD(sdId) {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', sdId)
    .single();

  return !error && data;
}

function getProfile(sdType) {
  return SD_TYPE_PROFILES[sdType] || SD_TYPE_PROFILES.feature;
}

function formatStatus(status) {
  const icons = {
    draft: '📝',
    pending: '⏳',
    lead_approved: '✓',
    in_progress: '🔄',
    active: '🔄',
    planning: '📋',
    completed: '✅',
    blocked: '🚫'
  };
  return `${icons[status] || '?'} ${status}`;
}

async function buildStructuredOutput(sd, children, detection, validation) {
  const childDetails = [];

  for (const child of children) {
    const profile = getProfile(child.sd_type);
    const handoffs = await getHandoffCount(child.sd_key || child.id);
    const prdExists = await hasPRD(child.sd_key || child.id);

    childDetails.push({
      id: child.sd_key || child.id,
      title: child.title,
      type: child.sd_type || 'feature',
      status: child.status,
      requirements: {
        prd_required: profile.prd_required,
        prd_exists: prdExists,
        e2e_required: profile.e2e_required,
        min_handoffs: profile.min_handoffs,
        current_handoffs: handoffs,
        gate_threshold: profile.threshold
      }
    });
  }

  return {
    orchestrator: {
      id: sd.sd_key || sd.id,
      title: sd.title,
      type: sd.sd_type || 'orchestrator',
      status: sd.status
    },
    detection: {
      isOrchestrator: detection.isOrchestrator,
      method: detection.detectionMethod,
      confidence: detection.confidence,
      signals: detection.signals
    },
    children: childDetails,
    validation: {
      passed: validation.issues.length === 0,
      issues: validation.issues,
      warnings: validation.warnings
    },
    nextSteps: generateNextSteps(validation, children),
    timestamp: new Date().toISOString()
  };
}

function generateNextSteps(validation, children) {
  const steps = [];

  for (const issue of validation.issues) {
    steps.push({
      action: 'REQUIRED',
      description: issue.message,
      fix: issue.fix
    });
  }

  for (const warning of validation.warnings) {
    steps.push({
      action: 'RECOMMENDED',
      description: warning.message,
      fix: warning.fix
    });
  }

  if (children.length > 0) {
    const incompleteChildren = children.filter(c => c.status !== 'completed');
    if (incompleteChildren.length > 0) {
      steps.push({
        action: 'WORKFLOW',
        description: `${incompleteChildren.length} child SD(s) require completion`,
        fix: 'Run full LEAD→PLAN→EXEC for each child in dependency order'
      });
    }
  }

  return steps;
}

async function printPreflightReport(sd, children, detection, validation) {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  ORCHESTRATOR PREFLIGHT CHECK v2.0.0');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`Parent: ${sd.sd_key || sd.id}`);
  console.log(`Title:  ${sd.title}`);
  console.log(`Type:   ${sd.sd_type || 'orchestrator'}`);
  console.log(`Status: ${formatStatus(sd.status)}`);
  console.log('');

  // Detection info
  console.log('DETECTION:');
  console.log(`  Method: ${detection.detectionMethod}`);
  console.log(`  Confidence: ${detection.confidence}%`);
  if (detection.signals.length > 0) {
    console.log(`  Signals: ${detection.signals.join('; ')}`);
  }
  console.log('');

  console.log(`Children: ${children.length} found`);
  console.log('');
  console.log('CHILD WORKFLOW REQUIREMENTS (per SD type):');
  console.log('─'.repeat(60));

  for (const child of children) {
    const profile = getProfile(child.sd_type);
    const handoffs = await getHandoffCount(child.sd_key || child.id);
    const prdExists = await hasPRD(child.sd_key || child.id);

    console.log('');
    console.log(`${child.sd_key || child.id} (${child.sd_type || 'feature'})`);
    console.log(`  Title: ${child.title.substring(0, 50)}${child.title.length > 50 ? '...' : ''}`);
    console.log(`  Status: ${formatStatus(child.status)}`);
    console.log(`  PRD: ${profile.prd_required ? (prdExists ? '✅ exists' : '❌ REQUIRED') : '⏭️ skip'}`);
    console.log(`  E2E: ${profile.e2e_required ? 'required' : 'skip'}`);
    console.log(`  Handoffs: ${handoffs}/${profile.min_handoffs} min`);
    console.log(`  Gate Threshold: ${profile.threshold}%`);
  }

  // Validation results
  console.log('');
  console.log('═'.repeat(60));
  console.log('  VALIDATION RESULTS');
  console.log('═'.repeat(60));

  if (validation.issues.length > 0) {
    console.log('');
    console.log('❌ BLOCKING ISSUES:');
    for (const issue of validation.issues) {
      console.log(`  [${issue.code}] ${issue.message}`);
      console.log(`    Fix: ${issue.fix}`);
    }
  }

  if (validation.warnings.length > 0) {
    console.log('');
    console.log('⚠️  WARNINGS:');
    for (const warning of validation.warnings) {
      console.log(`  [${warning.code}] ${warning.message}`);
      console.log(`    Fix: ${warning.fix}`);
    }
  }

  if (validation.issues.length === 0 && validation.warnings.length === 0) {
    console.log('');
    console.log('✅ All validations passed');
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  WORKFLOW VERIFICATION REQUIRED');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Each child SD requires INDEPENDENT workflow per its SD type:');
  console.log('');
  console.log('  - LEAD approval (validates THIS child\'s scope)');
  console.log('  - PRD creation (if required by sd_type)');
  console.log('  - Full handoff chain (count varies by sd_type)');
  console.log('  - Implementation merged to main');
  console.log('  - Retrospective created');
  console.log('  - Database status = \'completed\' (trigger validates per sd_type)');
  console.log('');

  const totalCycles = children.length;
  console.log(`Total: ${totalCycles} children × individual LEAD→PLAN→EXEC cycles`);
  console.log('');
  console.log('═'.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const sdId = args.find(a => !a.startsWith('-'));
  const jsonMode = args.includes('--json');
  const validateMode = args.includes('--validate');

  if (!sdId) {
    console.log('Usage: node scripts/orchestrator-preflight.js <SD-ID> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --json      Output structured JSON instead of human-readable report');
    console.log('  --validate  Exit with non-zero code if validation fails');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/orchestrator-preflight.js SD-UAT-PLATFORM-001');
    console.log('  node scripts/orchestrator-preflight.js SD-UAT-PLATFORM-001 --json');
    process.exit(1);
  }

  if (!jsonMode) {
    console.log(`Checking orchestrator status for: ${sdId}`);
  }

  // Fetch parent SD
  const sd = await getOrchestrator(sdId);
  if (!sd) {
    if (jsonMode) {
      console.log(JSON.stringify({ error: `SD not found: ${sdId}` }));
    } else {
      console.error(`SD not found: ${sdId}`);
    }
    process.exit(1);
  }

  // Fetch children
  const children = await getChildren(sd.id);

  // Detect orchestrator status
  const detection = detectOrchestratorStatus(sd, children);

  if (!detection.isOrchestrator) {
    if (jsonMode) {
      console.log(JSON.stringify({
        orchestrator: { id: sd.sd_key || sd.id, title: sd.title },
        detection: detection,
        children: [],
        validation: { passed: true, issues: [], warnings: [] },
        nextSteps: [],
        timestamp: new Date().toISOString()
      }, null, 2));
    } else {
      console.log('');
      console.log(`${sdId} is not an orchestrator`);
      console.log(`Detection method: ${detection.detectionMethod}`);
      console.log('Standard SD workflow applies.');
    }
    process.exit(0);
  }

  // If heuristic detection, warn about confirmation
  if (detection.detectionMethod === 'heuristic' && !jsonMode) {
    console.log('');
    console.log('⚠️  HEURISTIC DETECTION');
    console.log(`   Confidence: ${detection.confidence}%`);
    console.log(`   Signals: ${detection.signals.join('; ')}`);
    console.log('');
    console.log('   To confirm as orchestrator, add to SD metadata:');
    console.log('   { "is_orchestrator": true } or { "pattern_type": "orchestrator" }');
    console.log('');
  }

  // Validate artifacts
  const validation = await validateArtifacts(sd, children);

  // Output
  if (jsonMode) {
    const output = await buildStructuredOutput(sd, children, detection, validation);
    console.log(JSON.stringify(output, null, 2));
  } else {
    await printPreflightReport(sd, children, detection, validation);
    console.log('');
    console.log('PROCEEDING: Full LEAD→PLAN→EXEC workflow for each child.');
    console.log('');
  }

  // Exit code based on validation
  if (validateMode && validation.issues.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Preflight check failed:', err.message);
  process.exit(1);
});
