#!/usr/bin/env node
/**
 * BACKFILL PATTERN SUB-AGENTS
 * LEO Protocol v4.3.2 Enhancement
 *
 * Populates related_sub_agents for patterns that have null values
 * based on their category mapping.
 *
 * Usage: node scripts/backfill-pattern-subagents.js [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — issue_patterns is a growing table
// (RCA pattern history); the null-related_sub_agents scan below is iterated/acted-on per row, so
// a capped read would silently leave patterns past the PostgREST 1000-row boundary un-backfilled.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DRY_RUN = process.argv.includes('--dry-run');

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

async function backfillPatternSubAgents() {
  console.log('\n🔄 BACKFILL PATTERN SUB-AGENTS');
  console.log('═'.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Get patterns with null related_sub_agents
  let patterns;
  try {
    patterns = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('pattern_id, category, related_sub_agents')
      .is('related_sub_agents', null)
      .order('id', { ascending: true }));
  } catch (e) {
    console.error(`❌ Error fetching patterns: ${e.message}`);
    return;
  }

  if (patterns.length === 0) {
    console.log('\n✅ All patterns already have related_sub_agents populated');
    return;
  }

  console.log(`\n📊 Found ${patterns.length} patterns needing backfill\n`);

  let updated = 0;
  let errors = 0;

  for (const pattern of patterns) {
    const subAgents = CATEGORY_SUBAGENT_MAPPING[pattern.category] || ['VALIDATION'];

    console.log(`${pattern.pattern_id} (${pattern.category})`);
    console.log(`   → ${subAgents.join(', ')}`);

    if (DRY_RUN) {
      console.log('   [DRY RUN] Would update');
      updated++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('issue_patterns')
      .update({
        related_sub_agents: subAgents,
        updated_at: new Date().toISOString()
      })
      .eq('pattern_id', pattern.pattern_id);

    if (updateError) {
      console.error(`   ❌ Error: ${updateError.message}`);
      errors++;
    } else {
      console.log('   ✅ Updated');
      updated++;
    }
  }

  // Also update pattern_subagent_mapping table
  console.log('\n📋 Updating pattern_subagent_mapping table...');

  for (const pattern of patterns) {
    const subAgents = CATEGORY_SUBAGENT_MAPPING[pattern.category] || ['VALIDATION'];

    for (const subAgentCode of subAgents) {
      if (DRY_RUN) {
        continue;
      }

      const { error: mappingError } = await supabase
        .from('pattern_subagent_mapping')
        .upsert({
          pattern_id: pattern.pattern_id,
          sub_agent_code: subAgentCode,
          mapping_type: 'category',
          confidence: 0.8
        }, {
          onConflict: 'pattern_id,sub_agent_code'
        });

      if (mappingError) {
        console.error(`   ❌ Mapping error for ${pattern.pattern_id}: ${mappingError.message}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 BACKFILL SUMMARY');
  console.log(`   Patterns updated: ${updated}`);
  console.log(`   Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN - No changes made');
    console.log('   Run without --dry-run to apply updates');
  }
}

backfillPatternSubAgents()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
