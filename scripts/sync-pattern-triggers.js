#!/usr/bin/env node
/**
 * SYNC PATTERN-SUBAGENT TRIGGERS
 * LEO Protocol v4.3.2 Enhancement
 *
 * Synchronizes issue_patterns with leo_sub_agent_triggers:
 * - Creates triggers for high-occurrence patterns
 * - Updates pattern_subagent_mapping table
 * - Maintains bidirectional tracking
 *
 * Usage:
 *   node scripts/sync-pattern-triggers.js [--dry-run] [--threshold=N]
 *
 * Options:
 *   --dry-run        Show what would be synced without making changes
 *   --threshold=N    Minimum occurrence count to create trigger (default: 3)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Configuration
 */
const CONFIG = {
  DRY_RUN: process.argv.includes('--dry-run'),
  THRESHOLD: parseInt(process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] || '3'),
  MIN_SEVERITY: ['critical', 'high'] // Only create triggers for these severities by default
};

/**
 * Category to sub-agent mapping (canonical source)
 */
const CATEGORY_SUBAGENT_MAPPING = {
  database: ['DATABASE', 'SECURITY'],
  testing: ['TESTING', 'UAT'],
  deployment: ['GITHUB', 'DEPENDENCY'],
  build: ['GITHUB', 'DEPENDENCY'],
  security: ['SECURITY', 'DATABASE'],
  protocol: ['RETRO', 'DOCMON', 'VALIDATION'],
  code_structure: ['VALIDATION', 'DESIGN'],
  performance: ['PERFORMANCE', 'DATABASE'],
  over_engineering: ['VALIDATION', 'DESIGN'],
  api: ['API', 'SECURITY'],
  ui: ['DESIGN', 'UAT'],
  general: ['VALIDATION']
};

/**
 * Extract keywords from pattern issue_summary for trigger phrases
 */
function extractTriggerKeywords(issueSummary, category) {
  const summary = issueSummary.toLowerCase();

  // Category-specific keyword extraction
  const categoryKeywords = {
    database: ['schema', 'migration', 'rls', 'policy', 'query', 'table', 'column', 'constraint'],
    testing: ['test', 'coverage', 'e2e', 'playwright', 'assertion', 'mock'],
    security: ['auth', 'permission', 'token', 'session', 'rls', 'encryption'],
    deployment: ['deploy', 'ci', 'pipeline', 'github', 'action', 'build'],
    build: ['build', 'compile', 'bundle', 'vite', 'output', 'dist'],
    protocol: ['handoff', 'sub-agent', 'phase', 'leo', 'validation'],
    code_structure: ['import', 'component', 'refactor', 'path', 'module'],
    performance: ['slow', 'timeout', 'latency', 'memory', 'cache'],
    api: ['endpoint', 'route', 'request', 'response', 'api'],
    ui: ['component', 'layout', 'style', 'render', 'display']
  };

  const keywords = categoryKeywords[category] || [];
  const found = keywords.filter(kw => summary.includes(kw));

  // Also extract capitalized terms (likely important)
  const capitalTerms = issueSummary.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g) || [];

  return [...new Set([...found, ...capitalTerms.map(t => t.toLowerCase())])].slice(0, 3);
}

/**
 * Get sub-agent ID from code
 */
async function getSubAgentId(code) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('id')
    .eq('code', code)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id;
}

/**
 * Check if trigger already exists
 */
async function triggerExists(subAgentId, phrase, context) {
  const { data, error: _error } = await supabase
    .from('leo_sub_agent_triggers')
    .select('id')
    .eq('sub_agent_id', subAgentId)
    .eq('trigger_phrase', phrase)
    .eq('trigger_context', context)
    .single();

  return data?.id || null;
}

/**
 * Create a new trigger for a pattern
 */
async function createPatternTrigger(pattern, subAgentCode, phrase) {
  const subAgentId = await getSubAgentId(subAgentCode);
  if (!subAgentId) {
    console.log(`     Sub-agent ${subAgentCode} not found`);
    return null;
  }

  // Check if trigger already exists
  const existingId = await triggerExists(subAgentId, phrase, 'pattern');
  if (existingId) {
    console.log(`     Trigger already exists (ID: ${existingId})`);
    return { id: existingId, existing: true };
  }

  if (CONFIG.DRY_RUN) {
    console.log(`     [DRY RUN] Would create trigger: "${phrase}" -> ${subAgentCode}`);
    return { dryRun: true };
  }

  const { data: trigger, error } = await supabase
    .from('leo_sub_agent_triggers')
    .insert({
      sub_agent_id: subAgentId,
      trigger_phrase: phrase,
      trigger_type: 'keyword',
      trigger_context: 'pattern',
      priority: pattern.severity === 'critical' ? 90 : pattern.severity === 'high' ? 70 : 50,
      active: true,
      metadata: {
        source_pattern: pattern.pattern_id,
        category: pattern.category,
        occurrence_count: pattern.occurrence_count,
        created_by: 'sync-pattern-triggers'
      }
    })
    .select()
    .single();

  if (error) {
    console.error(`     Error creating trigger: ${error.message}`);
    return null;
  }

  console.log(`     Created trigger ID: ${trigger.id}`);
  return trigger;
}

/**
 * Update pattern_subagent_mapping
 */
async function updateMapping(patternId, subAgentCode, triggerId, mappingType = 'category') {
  if (CONFIG.DRY_RUN) {
    console.log(`     [DRY RUN] Would update mapping: ${patternId} <-> ${subAgentCode}`);
    return { dryRun: true };
  }

  const { data, error } = await supabase
    .from('pattern_subagent_mapping')
    .upsert({
      pattern_id: patternId,
      sub_agent_code: subAgentCode,
      mapping_type: mappingType,
      trigger_id: triggerId,
      confidence: triggerId ? 1.0 : 0.8
    }, {
      onConflict: 'pattern_id,sub_agent_code'
    })
    .select()
    .single();

  if (error) {
    console.error(`     Error updating mapping: ${error.message}`);
    return null;
  }

  return data;
}

/**
 * Sync patterns to triggers
 */
async function syncPatternTriggers() {
  console.log('\n PATTERN-TRIGGER SYNC');
  console.log('═'.repeat(60));
  console.log(`Mode: ${CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Occurrence threshold: ${CONFIG.THRESHOLD}`);
  console.log(`Severity filter: ${CONFIG.MIN_SEVERITY.join(', ')}`);

  // Get eligible patterns
  const { data: patterns, error } = await supabase
    .from('issue_patterns')
    .select('*')
    .eq('status', 'active')
    .in('severity', CONFIG.MIN_SEVERITY)
    .gte('occurrence_count', CONFIG.THRESHOLD)
    .order('occurrence_count', { ascending: false });

  if (error) {
    console.error(`Error fetching patterns: ${error.message}`);
    return;
  }

  if (!patterns || patterns.length === 0) {
    console.log('\n No patterns meet the criteria for trigger creation');
    return;
  }

  console.log(`\n Found ${patterns.length} eligible patterns\n`);

  const stats = {
    processed: 0,
    triggersCreated: 0,
    triggersExisted: 0,
    mappingsUpdated: 0,
    errors: 0
  };

  for (const pattern of patterns) {
    console.log(`\n${pattern.pattern_id} (${pattern.category}/${pattern.severity})`);
    console.log(`   "${pattern.issue_summary.substring(0, 60)}..."`);
    console.log(`   Occurrences: ${pattern.occurrence_count}`);

    // Get sub-agents for this category
    const subAgents = CATEGORY_SUBAGENT_MAPPING[pattern.category] || ['VALIDATION'];
    const keywords = extractTriggerKeywords(pattern.issue_summary, pattern.category);

    console.log(`   Sub-agents: ${subAgents.join(', ')}`);
    console.log(`   Keywords: ${keywords.join(', ') || '(none)'}`);

    // Create trigger for primary sub-agent with first keyword
    const primarySubAgent = subAgents[0];
    const triggerPhrase = keywords.length > 0
      ? `${pattern.category} ${keywords[0]} pattern`
      : `${pattern.category} ${pattern.pattern_id}`;

    const trigger = await createPatternTrigger(pattern, primarySubAgent, triggerPhrase);

    if (trigger) {
      if (trigger.existing) {
        stats.triggersExisted++;
      } else if (!trigger.dryRun) {
        stats.triggersCreated++;
      }

      // Update mapping
      const triggerId = trigger.id || null;
      for (const subAgentCode of subAgents) {
        const mapping = await updateMapping(pattern.pattern_id, subAgentCode, triggerId);
        if (mapping && !mapping.dryRun) {
          stats.mappingsUpdated++;
        }
      }
    } else {
      stats.errors++;
    }

    stats.processed++;
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(' SYNC SUMMARY');
  console.log('─'.repeat(60));
  console.log(`   Patterns processed: ${stats.processed}`);
  console.log(`   Triggers created: ${stats.triggersCreated}`);
  console.log(`   Triggers existed: ${stats.triggersExisted}`);
  console.log(`   Mappings updated: ${stats.mappingsUpdated}`);
  console.log(`   Errors: ${stats.errors}`);

  if (CONFIG.DRY_RUN) {
    console.log('\n This was a DRY RUN - no changes were made');
    console.log('   Run without --dry-run to apply changes');
  }

  return stats;
}

/**
 * Verify sub-agents exist
 */
async function verifySubAgents() {
  console.log('\n Verifying sub-agents...');

  const allCodes = [...new Set(Object.values(CATEGORY_SUBAGENT_MAPPING).flat())];

  const { data: subAgents, error } = await supabase
    .from('leo_sub_agents')
    .select('code')
    .in('code', allCodes);

  if (error) {
    console.error(`Error fetching sub-agents: ${error.message}`);
    return false;
  }

  const foundCodes = new Set(subAgents?.map(s => s.code) || []);
  const missing = allCodes.filter(c => !foundCodes.has(c));

  if (missing.length > 0) {
    console.log(` Missing sub-agents: ${missing.join(', ')}`);
    console.log('   Some triggers may not be created');
  } else {
    console.log(` All ${allCodes.length} sub-agents found`);
  }

  return true;
}

/**
 * Check if pattern_subagent_mapping table exists
 */
async function checkMappingTable() {
  const { data: _data, error } = await supabase
    .from('pattern_subagent_mapping')
    .select('id')
    .limit(1);

  if (error && error.code === '42P01') { // Table doesn't exist
    console.log('\n pattern_subagent_mapping table not found');
    console.log('   Run migration first: database/migrations/20251128_issue_patterns_enhancement.sql');
    return false;
  }

  return true;
}

/**
 * Main
 */
async function main() {
  // Pre-flight checks
  const tableExists = await checkMappingTable();
  if (!tableExists) {
    process.exit(1);
  }

  await verifySubAgents();

  // Run sync
  const stats = await syncPatternTriggers();

  process.exit(stats?.errors > 0 ? 1 : 0);
}

main().catch(error => {
  console.error(' Fatal error:', error);
  process.exit(1);
});
