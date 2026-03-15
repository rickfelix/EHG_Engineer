#!/usr/bin/env node
/**
 * Migrate JSONB-embedded user stories to user_stories table
 * SD: SD-PRD-USER-STORIES-TABLE-ORCH-001
 *
 * Extracts stories from product_requirements_v2 JSONB fields
 * (content.user_stories, metadata.user_stories) and inserts
 * them into the user_stories table.
 *
 * Usage:
 *   node scripts/migrate-jsonb-stories.js --dry-run   # Preview only
 *   node scripts/migrate-jsonb-stories.js              # Execute
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const dryRun = process.argv.includes('--dry-run');

function makeStoryKey(sdId, index) {
  const prefix = (sdId || 'MIG').replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase();
  return `${prefix}:US-${String(index + 1).padStart(3, '0')}`;
}

async function main() {
  console.log(`\nMigrate JSONB Stories → user_stories table`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no changes)' : 'EXECUTE'}\n`);

  // Find PRDs with JSONB-embedded stories
  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, title, content, metadata');

  if (error) { console.error('Query error:', error.message); return; }

  let totalFound = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;

  for (const prd of prds || []) {
    const jsonbStories = prd.content?.user_stories || prd.metadata?.user_stories || prd.content?.stories || [];
    if (!Array.isArray(jsonbStories) || jsonbStories.length === 0) continue;

    // Check if stories already exist in table for this PRD
    const { data: existing } = await supabase
      .from('user_stories')
      .select('id')
      .eq('prd_id', prd.id)
      .limit(1);

    if (existing?.length > 0) {
      console.log(`  SKIP ${prd.title} — stories already in table`);
      totalSkipped += jsonbStories.length;
      continue;
    }

    console.log(`  ${prd.title}: ${jsonbStories.length} stories`);
    totalFound += jsonbStories.length;

    if (dryRun) continue;

    // Transform and insert
    const rows = jsonbStories.map((s, i) => ({
      id: randomUUID(),
      story_key: s.story_key || makeStoryKey(prd.directive_id, i),
      prd_id: prd.id,
      sd_id: prd.directive_id,
      title: s.title || `Story ${i + 1}`,
      user_role: s.user_role || 'System user',
      user_want: s.user_want || s.description || 'to be defined',
      user_benefit: s.user_benefit || s.benefit || 'Improves system functionality',
      story_points: s.story_points || 3,
      priority: s.priority === 'must_have' ? 'critical' : (s.priority || 'critical'),
      status: 'ready',
      acceptance_criteria: Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : [],
      implementation_context: s.implementation_context || s.description || 'Implementation details from JSONB migration',
      given_when_then: Array.isArray(s.given_when_then) ? s.given_when_then : [],
      testing_scenarios: Array.isArray(s.testing_scenarios) ? s.testing_scenarios : [],
      created_by: 'JSONB_MIGRATION'
    }));

    const { error: insertErr } = await supabase.from('user_stories').upsert(rows, { onConflict: 'story_key' });

    if (insertErr) {
      console.log(`    ERROR: ${insertErr.message}`);
    } else {
      totalMigrated += rows.length;
      console.log(`    Migrated ${rows.length} stories`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Found in JSONB: ${totalFound}`);
  console.log(`  Already in table: ${totalSkipped}`);
  console.log(`  Migrated: ${dryRun ? '(dry-run)' : totalMigrated}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
