#!/usr/bin/env node

/**
 * Feedback-to-SD Automation Script
 *
 * Converts triaged feedback items into Strategic Directives.
 * Maps feedback types to appropriate SD types and ensures
 * all required fields are populated.
 *
 * Created as part of SD-UAT-WORKFLOW-001 - UAT-to-SD Workflow Process Improvements
 *
 * Usage:
 *   npm run sd:from-feedback
 *   node scripts/sd-from-feedback.js
 *   node scripts/sd-from-feedback.js --parent SD-PARENT-001
 *
 * @module scripts/sd-from-feedback
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import readline from 'readline';
import { pathToFileURL } from 'url';
// SD-LEO-SDKEY-001: Centralized SD key generation
import { generateSDKey } from './modules/sd-key-generator.js';
import { isUntrustedOrigin, sanitizeUserText } from '../lib/factory/content-sanitizer.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

// Feedback type to SD type mapping
const FEEDBACK_TYPE_MAP = {
  issue: 'bugfix',
  enhancement: 'feature'
};

// Priority mapping (feedback P0-P3 to SD priority)
const PRIORITY_MAP = {
  P0: 'critical',
  P1: 'high',
  P2: 'medium',
  P3: 'low'
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    parent: null,
    all: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--parent':
      case '-p':
        parsed.parent = args[++i];
        break;
      case '--all':
      case '-a':
        parsed.all = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

/**
 * Display help message
 */
function showHelp() {
  console.log(`
Feedback-to-SD Automation Script
================================

Converts triaged feedback items into Strategic Directives.

Usage:
  npm run sd:from-feedback [options]
  node scripts/sd-from-feedback.js [options]

Options:
  --parent, -p <sd_key>   Parent SD key for child SDs
  --all, -a               Include all open feedback (not just triaged)
  --help, -h              Show this help

Workflow:
  1. Shows list of triaged/open feedback items
  2. You select items to convert (or 'all')
  3. Script creates SDs with appropriate types:
     - issue → bugfix SD (requires smoke_test_steps)
     - enhancement → feature SD (requires smoke_test_steps)
  4. Links SDs to feedback items in feedback_sd_map

Examples:
  npm run sd:from-feedback
  npm run sd:from-feedback -- --parent SD-ORCH-001
`);
}

/**
 * Create readline interface
 */
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for input
 */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Fetch open feedback items
 */
async function fetchFeedbackItems(includeAll = false) {
  let query = supabase
    .from('feedback')
    // QF-20260727-475: `category` MUST be selected — deriveClaimProvenance() reads its VALUE to
    // decide whether this row's claims are first-hand or relayed. Selecting it is not optional
    // just because a filter elsewhere mentions it; an unselected column reads undefined and the
    // deriver would silently classify every row the same way.
    .select('id, type, title, description, priority, status, source_type, category, created_at')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (includeAll) {
    query = query.not('status', 'in', '(closed,resolved,rejected)');
  } else {
    query = query.in('status', ['open', 'triaged']);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    throw new Error(`Failed to fetch feedback: ${error.message}`);
  }

  return data || [];
}

/**
 * Display feedback items in table format
 */
function displayFeedbackTable(items) {
  console.log('\n' + '─'.repeat(100));
  console.log(`│ ${'#'.padEnd(3)} │ ${'ID'.padEnd(10)} │ ${'Type'.padEnd(12)} │ ${'Priority'.padEnd(8)} │ ${'Status'.padEnd(10)} │ Title`);
  console.log('─'.repeat(100));

  items.forEach((item, index) => {
    const num = (index + 1).toString().padEnd(3);
    const id = (item.id || '-').substring(0, 10).padEnd(10);
    const type = (item.type || '-').padEnd(12);
    const priority = (item.priority || '-').padEnd(8);
    const status = (item.status || '-').padEnd(10);
    const title = (item.title || '-').substring(0, 40);
    console.log(`│ ${num} │ ${id} │ ${type} │ ${priority} │ ${status} │ ${title}`);
  });

  console.log('─'.repeat(100));
  console.log(`Total: ${items.length} item(s)\n`);
}

/**
 * Generate SD key from feedback
 * SD-LEO-SDKEY-001: Uses centralized SDKeyGenerator for consistent naming
 */
async function generateSdKey(feedback) {
  const type = feedback.type === 'issue' ? 'bugfix' : 'feature';

  // Use centralized SDKeyGenerator for consistent naming across all SD sources
  return generateSDKey({
    source: 'FEEDBACK',
    type,
    title: feedback.title || 'Untitled Feedback'
  });
}

/**
 * Generate default smoke test steps from feedback
 */
export function generateDefaultSmokeTestSteps(feedback) {
  // FR-5 (SD-FDBK-FIX-LIVE-PROMPT-INJECTION-001): untrusted-origin title is quarantine-wrapped
  // before landing in an EXEC agent's smoke_test_steps instruction text.
  const stepTitle = isUntrustedOrigin(feedback) ? sanitizeUserText(feedback.title).content : feedback.title;
  const steps = [
    {
      step_number: 1,
      instruction: `Navigate to the affected area: ${stepTitle}`,
      expected_outcome: 'Page loads without errors'
    },
    {
      step_number: 2,
      instruction: `Verify the ${feedback.type === 'issue' ? 'fix' : 'feature'} works as expected`,
      expected_outcome: `${feedback.type === 'issue' ? 'Error no longer occurs' : 'Feature functions correctly'}`
    }
  ];

  return steps;
}

/**
 * Resolve parent SD
 */
async function resolveParentSd(parentKey) {
  if (!parentKey) return null;

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status')
    .eq('sd_key', parentKey)
    .single();

  if (error || !data) {
    throw new Error(`Parent SD not found: ${parentKey}`);
  }

  return data;
}

/**
 * QF-20260727-475 — categories whose rows are AUTHORED BY AN AGENT relaying something it did not
 * measure first-hand: a worker signal, a sub-agent finding, another role's review.
 *
 * TWO INDEPENDENT WITNESSES, EIGHT HOURS APART. An SD embedded three material claims that were
 * WRONG — a named insertion point that could not see the rows its own ACs staged, a security
 * assertion false on win32 (this fleet IS win32), and an in-flight rule contradicted by live
 * measurement — each stated with the SAME CONFIDENCE as the verified parts. The worker's words:
 * "I ACTED ON ALL FOUR BECAUSE NOTHING IN THE ARTIFACT DISTINGUISHED THEM FROM VERIFIED FACT."
 * Then a sub-agent INFO finding travelled sub-agent -> worker -> coordinator -> worker -> a
 * DURABLE MIGRATION HEADER with no verification at any hop, and was false in all three parts
 * against pg_catalog — the named object did not exist in the database at all.
 */
const RELAYED_CLAIM_CATEGORIES = new Set([
  'harness_backlog', 'coordinator_review', 'coordinator_adam_review', 'fleet_retro',
  'invariant_gauge_finding', 'adam_adherence_drift', 'solomon_adherence_drift',
  'adam_solomon_health', 'adam_self_assessment', 'completion_flag', 'completion_flag_witness',
  'wind_down_survey',
]);

/**
 * Classify how this row's substantive claims were obtained.
 *
 * NEVER returns 'measured'. Nothing available here can prove first-hand measurement, and awarding
 * it would recreate the defect at one remove — a provenance tag that lies is worse than none.
 * Absence of evidence is not evidence of verification, so the floor is 'unverified'.
 *
 * @param {{category?:string, source_type?:string}} feedback
 * @returns {'relayed_unverified'|'unverified'}
 */
export function deriveClaimProvenance(feedback) {
  const category = String((feedback && feedback.category) || '').toLowerCase();
  if (RELAYED_CLAIM_CATEGORIES.has(category)) return 'relayed_unverified';
  if (String((feedback && feedback.source_type) || '').toLowerCase() === 'auto_capture') {
    return 'relayed_unverified';
  }
  return 'unverified';
}

/**
 * The banner an EXEC agent reads before the inherited text.
 *
 * Per-SENTENCE provenance cannot be derived automatically — no reader here knows which clause the
 * author measured. So this marks the ROW and names the four claim types that have actually caused
 * harm (mechanism, insertion point, root cause, proposed fix), telling the consumer which
 * sentences to re-derive. That is the stated acceptance: a worker can tell verified fact from
 * relayed inference and knows what to check before acting.
 */
export function claimProvenanceBanner(provenance) {
  return [
    `> **CLAIM PROVENANCE: ${provenance.toUpperCase().replace(/_/g, '-')}.**`,
    '> The text below was authored from a signal, sub-agent finding, or review — NOT from',
    '> first-hand measurement by this SD. Any **mechanism, insertion point, root cause or',
    '> proposed fix** in it is a LEAD, not a specification: re-derive it against the live',
    '> system before acting. Verified parts and inferred parts are NOT distinguished here.',
    '',
  ].join('\n');
}

/**
 * Create SD from feedback item
 */
async function createSdFromFeedback(feedback, parentId = null) {
  const sdType = FEEDBACK_TYPE_MAP[feedback.type] || 'bugfix';
  const priority = PRIORITY_MAP[feedback.priority] || 'medium';
  // SD-LEO-SDKEY-001: Use centralized async key generator
  // SD-LEO-FIX-CREATION-COLUMN-MAPPING-001: id=human-readable key per schema
  const sdKey = await generateSdKey(feedback);

  // FR-5 (SD-FDBK-FIX-LIVE-PROMPT-INJECTION-001): untrusted-origin feedback text becomes a new
  // SD's description -- read verbatim by a full-authority EXEC agent as its work instructions.
  // Title is intentionally left unwrapped (short, low-risk, and wrapping would corrupt sd_key
  // generation/display, which already ran via generateSdKey() above using the raw title).
  const untrustedOrigin = isUntrustedOrigin(feedback);
  const safeDescription = untrustedOrigin
    ? sanitizeUserText(feedback.description || feedback.title).content
    : (feedback.description || feedback.title);

  // QF-20260727-475: stamp provenance ON THE DESCRIPTION, because the description is what a
  // full-authority EXEC agent reads verbatim as its work instructions (see FR-5 note above).
  // Putting it only in metadata would leave the consumer that actually acts on the text unmarked.
  const claimProvenance = deriveClaimProvenance(feedback);
  const describedBody = `${claimProvenanceBanner(claimProvenance)}\n${safeDescription}`;

  const sdData = {
    id: sdKey,  // Human-readable key (per schema: id=VARCHAR for main identifier)
    sd_key: sdKey,  // Same for backward compatibility
    title: feedback.title,
    description: describedBody,
    rationale: `Created from feedback item. Source: ${feedback.source_type || 'manual'}. Original ID: ${feedback.id}`,
    sd_type: sdType,
    status: 'draft',
    priority: priority,
    category: sdType.charAt(0).toUpperCase() + sdType.slice(1),
    success_criteria: JSON.stringify([`${feedback.title} - verified complete`]),
    target_application: 'EHG_Engineer',
    smoke_test_steps: JSON.stringify(generateDefaultSmokeTestSteps(feedback))
  };

  if (parentId) {
    sdData.parent_sd_id = parentId;
    sdData.metadata = JSON.stringify({
      contract_governed: true,
      contract_parent_chain: [parentId],
      source_feedback_id: feedback.id,
      claim_provenance: claimProvenance
    });
  } else {
    sdData.metadata = JSON.stringify({
      source_feedback_id: feedback.id,
      claim_provenance: claimProvenance
    });
  }

  // Insert SD
  const { data: created, error: createError } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, sd_type')
    .single();

  if (createError) {
    throw new Error(`Failed to create SD: ${createError.message}`);
  }

  // Link feedback to SD via feedback_sd_map (if table exists)
  try {
    await supabase
      .from('feedback_sd_map')
      .insert({
        feedback_id: feedback.id,
        sd_id: created.id
      });
  } catch (_mapError) {
    // Table might not exist, ignore
  }

  // Update feedback status and link SD references (US-001: resolution tracking)
  await supabase
    .from('feedback')
    .update({
      status: 'in_progress',
      strategic_directive_id: created.id,
      resolution_sd_id: created.id
    })
    .eq('id', feedback.id);

  // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-4c — provenance writer.
  // If this feedback row was created by signal-router.cjs (carries metadata.signal_fingerprint),
  // stamp routed_to_sd_key onto every contributing session_coordination row so the
  // sweep's SIGNAL_RESOLVED logic (FR-4d) can fire when this SD reaches completed status.
  try {
    if (feedback.metadata?.signal_fingerprint || feedback.metadata?.logged_via === 'signal-router.cjs') {
      const { data: contributing } = await supabase
        .from('session_coordination')
        .select('id, payload')
        .eq('payload->>routed_to_feedback_id', feedback.id);
      for (const row of contributing || []) {
        const merged = { ...(row.payload || {}), routed_to_sd_key: created.sd_key };
        await supabase
          .from('session_coordination')
          .update({ payload: merged })
          .eq('id', row.id);
      }
      if ((contributing || []).length > 0) {
        console.log(`   📎 Provenance: stamped ${contributing.length} contributing signal(s) with routed_to_sd_key=${created.sd_key}`);
      }
    }
  } catch (_provErr) {
    // Best-effort — failure does not roll back SD creation.
  }

  return created;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log('\n📋 Feedback-to-SD Automation');
  console.log('=' .repeat(50));

  // Resolve parent SD if provided
  let parentSd = null;
  if (args.parent) {
    try {
      parentSd = await resolveParentSd(args.parent);
      console.log(`\n📎 Parent SD: ${parentSd.sd_key} - ${parentSd.title}`);
    } catch (error) {
      console.error(`\n❌ ${error.message}`);
      process.exit(1);
    }
  }

  // Fetch feedback items
  console.log('\n🔍 Fetching feedback items...');
  const items = await fetchFeedbackItems(args.all);

  if (items.length === 0) {
    console.log('\n✅ No feedback items to process.');
    console.log('   Use --all flag to include all open items (not just triaged).');
    process.exit(0);
  }

  // Display items
  displayFeedbackTable(items);

  // Get user selection
  const rl = createReadline();

  console.log('Enter numbers to select (comma-separated), "all" for all, or "q" to quit:');
  const selection = await prompt(rl, '> ');

  if (selection.toLowerCase() === 'q') {
    console.log('\n👋 Cancelled.');
    rl.close();
    process.exit(0);
  }

  // Parse selection
  let selectedIndices = [];
  if (selection.toLowerCase() === 'all') {
    selectedIndices = items.map((_, i) => i);
  } else {
    selectedIndices = selection
      .split(',')
      .map(s => parseInt(s.trim()) - 1)
      .filter(i => i >= 0 && i < items.length);
  }

  if (selectedIndices.length === 0) {
    console.log('\n⚠️  No valid items selected.');
    rl.close();
    process.exit(0);
  }

  const selectedItems = selectedIndices.map(i => items[i]);
  console.log(`\n📝 Creating ${selectedItems.length} SD(s)...`);

  rl.close();

  // Create SDs
  const results = {
    success: [],
    failed: []
  };

  for (const item of selectedItems) {
    try {
      const created = await createSdFromFeedback(item, parentSd?.id);
      results.success.push(created);
      console.log(`   ✅ ${created.sd_key} - ${created.title.substring(0, 40)}`);
    } catch (error) {
      results.failed.push({ item, error: error.message });
      console.log(`   ❌ ${item.title.substring(0, 40)} - ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log(`✅ Created: ${results.success.length}`);
  if (results.failed.length > 0) {
    console.log(`❌ Failed: ${results.failed.length}`);
  }

  if (results.success.length > 0) {
    console.log('\n📝 Next Steps:');
    console.log('   For each created SD, run LEAD-TO-PLAN handoff:');
    results.success.slice(0, 3).forEach(sd => {
      console.log(`   node scripts/handoff.js execute LEAD-TO-PLAN ${sd.sd_key}`);
    });
    if (results.success.length > 3) {
      console.log(`   ... and ${results.success.length - 3} more`);
    }
  }
}

// Self-invoke guard (Windows-safe): without this, importing the module for any
// purpose (e.g. a unit test) unconditionally ran main() as a side effect, which
// then process.exit(1)'d outside a real CLI context. Discovered as a testability
// blocker while adding untrusted-origin regression tests for this exact file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  });
}
