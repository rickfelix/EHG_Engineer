#!/usr/bin/env node

/**
 * Triage Gate - Intelligent Work Item Triage for /leo create
 *
 * Wires together the AI LOC estimator and the Unified Work-Item Router
 * so that /leo create can proactively recommend Quick Fix vs full SD
 * before creating anything.
 *
 * @module scripts/modules/triage-gate
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { estimateLOC } from '../../lib/ai-loc-estimator.js';
import { routeWorkItem } from '../../lib/utils/work-item-router.js';

dotenv.config();

/**
 * @typedef {Object} TriageInput
 * @property {string} title - Work item title
 * @property {string} [description] - Work item description
 * @property {string} [type] - SD type (fix, feature, infrastructure, etc.)
 * @property {string} [source] - Entry source: interactive, uat, feedback, learn, plan, child
 */

/**
 * @typedef {Object} TriageResult
 * @property {number} tier - 1, 2, or 3
 * @property {string} tierLabel - 'TIER_1', 'TIER_2', or 'TIER_3'
 * @property {boolean} shouldGate - Whether to present AskUserQuestion gate
 * @property {string} workItemType - 'QUICK_FIX' or 'STRATEGIC_DIRECTIVE'
 * @property {number} estimatedLoc - Estimated lines of code
 * @property {number} confidence - LOC confidence (0-100)
 * @property {string} reasoning - LOC estimation reasoning
 * @property {string|null} escalationReason - Why escalated to Tier 3 (if applicable)
 * @property {Object|null} askUserQuestionPayload - AskUserQuestion payload for Tier 1/2 gates
 * @property {Object} routingDecision - Full routing decision from work-item-router
 */

/**
 * Determine if a source triggers a hard gate (AskUserQuestion).
 *
 * @param {string} source - Entry source
 * @returns {boolean} true if this source should present an interactive gate
 */
export function isHardGateSource(source) {
  switch ((source || '').toLowerCase()) {
    case 'interactive':
      return true;
    case 'uat':
    case 'feedback':
    case 'learn':
      return false; // soft recommendation only
    case 'plan':
    case 'child':
      return false; // exempt
    default:
      return false;
  }
}

/**
 * Lookup architecture plan LOC estimate from EVA.
 *
 * @param {string} archKey - Architecture plan key (e.g., ARCH-SKILL-AB-TEST-001)
 * @returns {Promise<number|null>} Estimated LOC from arch plan, or null
 */
async function lookupArchPlanLOC(archKey) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !archKey) return null;

  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from('eva_architecture_plans')
      .select('plan_content')
      .eq('plan_key', archKey)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (!data?.plan_content) return null;

    // Look for LOC estimate in plan content
    const content = typeof data.plan_content === 'string'
      ? data.plan_content
      : JSON.stringify(data.plan_content);

    const locMatch = content.match(/estimated[_\s-]*loc[:\s]*(\d+)/i)
      || content.match(/(\d+)\s*(?:lines?\s*of\s*code|LOC)/i);
    return locMatch ? parseInt(locMatch[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Run the triage gate to determine if a work item should be a Quick Fix or full SD.
 *
 * @param {TriageInput} input - Work item details
 * @param {Object} [supabaseClient] - Optional Supabase client for threshold lookup
 * @returns {Promise<TriageResult>}
 */
export async function runTriageGate(input, supabaseClient) {
  const { title = '', description = '', type = 'bug', source = 'interactive' } = input;
  const estimatedLocOverride = input.estimatedLoc;
  const archKey = input.archKey;

  // Exempt sources skip triage entirely
  const lowerSource = (source || '').toLowerCase();
  if (lowerSource === 'plan' || lowerSource === 'child') {
    return {
      tier: 3,
      tierLabel: 'TIER_3',
      shouldGate: false,
      workItemType: 'STRATEGIC_DIRECTIVE',
      estimatedLoc: 0,
      confidence: 0,
      reasoning: `Source "${source}" is exempt from triage`,
      escalationReason: null,
      askUserQuestionPayload: null,
      routingDecision: null,
    };
  }

  // Step 0: Check for --estimated-loc override or --arch-key LOC lookup
  let locOverride = null;
  let overrideReason = null;

  if (typeof estimatedLocOverride === 'number' && estimatedLocOverride > 0) {
    locOverride = estimatedLocOverride;
    overrideReason = `--estimated-loc override: ${estimatedLocOverride}`;
  } else if (archKey) {
    const archLOC = await lookupArchPlanLOC(archKey);
    if (archLOC && archLOC > 75) {
      locOverride = archLOC;
      overrideReason = `arch-plan-override: ${archKey} estimates ${archLOC} LOC`;
    }
  }

  // If override forces Tier 3, short-circuit
  if (locOverride && locOverride > 75) {
    return {
      tier: 3,
      tierLabel: 'TIER_3',
      shouldGate: false,
      workItemType: 'STRATEGIC_DIRECTIVE',
      estimatedLoc: locOverride,
      confidence: 100,
      reasoning: overrideReason,
      escalationReason: overrideReason,
      askUserQuestionPayload: null,
      routingDecision: null,
    };
  }

  // Step 1: Estimate LOC (use override if provided, else heuristic)
  const combinedDescription = [title, description].filter(Boolean).join(' — ');
  const locResult = locOverride
    ? { estimatedLoc: locOverride, confidence: 100, reasoning: overrideReason }
    : estimateLOC({ title, description: combinedDescription, type });

  // Step 2: Route through work-item-router
  const routingDecision = await routeWorkItem(
    {
      estimatedLoc: locResult.estimatedLoc,
      type,
      description: combinedDescription,
      entryPoint: 'triage-gate',
    },
    supabaseClient
  );

  // Step 3: Determine if we should gate
  const shouldGate = routingDecision.tier <= 2 && isHardGateSource(lowerSource);

  // Step 4: Build AskUserQuestion payload for Tier 1/2 interactive gates
  let askUserQuestionPayload = null;
  if (shouldGate) {
    askUserQuestionPayload = buildAskUserQuestionPayload(
      routingDecision,
      locResult,
      title,
      type
    );
  }

  return {
    tier: routingDecision.tier,
    tierLabel: routingDecision.tierLabel,
    shouldGate,
    workItemType: routingDecision.workItemType,
    estimatedLoc: locResult.estimatedLoc,
    confidence: locResult.confidence,
    reasoning: locResult.reasoning,
    escalationReason: routingDecision.escalationReason,
    askUserQuestionPayload,
    routingDecision,
  };
}

/**
 * Build AskUserQuestion payload for Tier 1/2 triage gate.
 */
function buildAskUserQuestionPayload(routingDecision, locResult, _title, _type) {
  const { tier, tier1MaxLoc, tier2MaxLoc } = routingDecision;

  let questionText;
  if (tier === 1) {
    questionText =
      `Triage: estimated ~${locResult.estimatedLoc} LOC (${locResult.confidence}% confidence). ` +
      'This looks like a Quick Fix (Tier 1 — auto-approve, no LEAD review). ' +
      `Max ${tier1MaxLoc} LOC. How would you like to proceed?`;
  } else {
    questionText =
      `Triage: estimated ~${locResult.estimatedLoc} LOC (${locResult.confidence}% confidence). ` +
      'This looks like a Standard Quick Fix (Tier 2 — compliance rubric ≥70 required). ' +
      `Max ${tier2MaxLoc} LOC. How would you like to proceed?`;
  }

  const qfDescription =
    tier === 1
      ? 'Auto-approved quick fix. No LEAD review, no PRD. Fast track.'
      : 'Standard quick fix with compliance rubric (min score 70). No LEAD review.';

  return {
    questions: [
      {
        question: questionText,
        header: 'Work Item',
        multiSelect: false,
        options: [
          {
            label: 'Create Quick Fix (Recommended)',
            description: qfDescription,
          },
          {
            label: 'Create Full SD (Override)',
            description:
              'Full LEAD→PLAN→EXEC workflow. Use if scope is larger than estimated or involves risk.',
          },
        ],
      },
    ],
  };
}

/**
 * Format a human-readable triage summary for CLI/log output.
 *
 * @param {TriageResult} result - Triage result
 * @returns {string} Multi-line summary
 */
export function formatTriageSummary(result) {
  const lines = [];
  lines.push('╔══════════════════════════════════════════════╗');
  lines.push('║           WORK ITEM TRIAGE RESULT            ║');
  lines.push('╚══════════════════════════════════════════════╝');
  lines.push(`  Tier:          ${result.tierLabel} (Tier ${result.tier})`);
  lines.push(`  Work Type:     ${result.workItemType}`);
  lines.push(`  Estimated LOC: ~${result.estimatedLoc}`);
  lines.push(`  Confidence:    ${result.confidence}%`);
  lines.push(`  Reasoning:     ${result.reasoning}`);
  lines.push(`  Should Gate:   ${result.shouldGate ? 'YES' : 'NO'}`);

  if (result.escalationReason) {
    lines.push(`  Escalation:    ${result.escalationReason}`);
  }

  if (result.tier <= 2) {
    lines.push('');
    lines.push('  💡 Recommendation: Use Quick Fix workflow');
    lines.push('     node scripts/create-quick-fix.js --title "<title>" --type <type>');
  }

  return lines.join('\n');
}

// ============================================================================
// CLI Entrypoint
// ============================================================================

function parseCliArgs(args) {
  const parsed = { title: '', type: 'bug', source: 'interactive', outputJson: false, estimatedLoc: null, archKey: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--title':
        parsed.title = args[++i] || '';
        break;
      case '--type':
        parsed.type = args[++i] || 'bug';
        break;
      case '--source':
        parsed.source = args[++i] || 'interactive';
        break;
      case '--estimated-loc':
        parsed.estimatedLoc = parseInt(args[++i], 10) || null;
        break;
      case '--arch-key':
        parsed.archKey = args[++i] || null;
        break;
      case '--output-json':
        parsed.outputJson = true;
        break;
      case '--help':
        console.log(`
Triage Gate - Intelligent Work Item Triage

Usage:
  node scripts/modules/triage-gate.js --title "Fix typo" --type fix --source interactive
  node scripts/modules/triage-gate.js --title "Add SSO" --type feature --estimated-loc 200
  node scripts/modules/triage-gate.js --title "New feature" --arch-key ARCH-SKILL-AB-TEST-001

Options:
  --title <text>         Work item title (required)
  --type <type>          SD type: fix, feature, infrastructure, refactor, etc.
  --source <source>      Entry source: interactive, uat, feedback, learn, plan, child
  --estimated-loc <num>  Override LOC estimate (forces tier 3 if >75)
  --arch-key <key>       Lookup LOC from architecture plan (forces tier 3 if LOC >75)
  --output-json          Output JSON to stdout (human summary to stderr)
  --help                 Show this help
`);
        process.exit(0);
    }
  }

  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const { title, type, source, outputJson, estimatedLoc, archKey } = parseCliArgs(args);

  if (!title) {
    console.error('Error: --title is required');
    process.exit(1);
  }

  const result = await runTriageGate({ title, description: title, type, source, estimatedLoc, archKey });

  if (outputJson) {
    // JSON to stdout, human-readable to stderr
    console.error(formatTriageSummary(result));
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTriageSummary(result));
  }
}

// ESM entry point detection (Windows-compatible)
const isMain = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`);

if (isMain) {
  main().catch((err) => {
    console.error('Triage gate error:', err.message);
    process.exit(1);
  });
}
