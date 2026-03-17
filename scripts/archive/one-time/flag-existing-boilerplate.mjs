#!/usr/bin/env node
/**
 * FLAG EXISTING BOILERPLATE IN RETROSPECTIVES
 *
 * This script updates existing retrospectives to mark boilerplate content
 * with the is_boilerplate flag, enabling filtering in CLAUDE file generation.
 *
 * Run: node scripts/flag-existing-boilerplate.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Known boilerplate patterns (substring match)
const BOILERPLATE_PATTERNS = [
  'LEO Protocol phases',
  'LEO Protocol followed',
  'Database-first architecture maintained',
  'Sub-agent orchestration provided',
  'Quality gates enforced',
  'Deliverable tracking ensured',
  'Standard LEO Protocol execution',
  'Continue following LEO Protocol best practices',
  'Apply learnings from this implementation',
  'Maintain quality standards established',
  'LEO Protocol phases completed systematically',
  'Handoff documents created with detailed context',
  'Implementation completed within scope',
  'Documentation could be enhanced',
  'Testing coverage could be expanded',
  'Performance benchmarks could be added'
];

function isBoilerplate(text) {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return BOILERPLATE_PATTERNS.some(pattern =>
    normalized.includes(pattern.toLowerCase())
  );
}

function processArray(arr, textField) {
  if (!Array.isArray(arr)) return { processed: arr, changed: false };

  let changed = false;
  const processed = arr.map(item => {
    // Already in object format
    if (typeof item === 'object' && item !== null) {
      const text = item[textField] || item.text || item.description || '';
      const shouldBeBoilerplate = isBoilerplate(text);

      if (item.is_boilerplate !== shouldBeBoilerplate) {
        changed = true;
        return { ...item, is_boilerplate: shouldBeBoilerplate };
      }
      return item;
    }

    // String format - convert to object
    if (typeof item === 'string') {
      const shouldBeBoilerplate = isBoilerplate(item);
      changed = true;
      return {
        [textField]: item,
        is_boilerplate: shouldBeBoilerplate
      };
    }

    return item;
  });

  return { processed, changed };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🔍 Flagging existing boilerplate in retrospectives...');
  if (isDryRun) {
    console.log('   (DRY RUN - no changes will be made)\n');
  }

  // Get all retrospectives
  const { data: retrospectives, error } = await supabase
    .from('retrospectives')
    .select('id, sd_id, key_learnings, what_went_well, action_items, what_needs_improvement');

  if (error) {
    console.error('Error fetching retrospectives:', error.message);
    process.exit(1);
  }

  console.log(`Found ${retrospectives.length} retrospectives to process\n`);

  let totalUpdated = 0;
  let totalBoilerplateFound = 0;

  for (const retro of retrospectives) {
    const updates = {};
    let retroBoilerplate = 0;

    // Process key_learnings
    const learnings = processArray(retro.key_learnings, 'learning');
    if (learnings.changed) {
      updates.key_learnings = learnings.processed;
      retroBoilerplate += learnings.processed.filter(l => l.is_boilerplate).length;
    }

    // Process what_went_well
    const achievements = processArray(retro.what_went_well, 'achievement');
    if (achievements.changed) {
      updates.what_went_well = achievements.processed;
      retroBoilerplate += achievements.processed.filter(a => a.is_boilerplate).length;
    }

    // Process action_items
    const actions = processArray(retro.action_items, 'action');
    if (actions.changed) {
      updates.action_items = actions.processed;
      retroBoilerplate += actions.processed.filter(a => a.is_boilerplate).length;
    }

    // Process what_needs_improvement
    const improvements = processArray(retro.what_needs_improvement, 'improvement');
    if (improvements.changed) {
      updates.what_needs_improvement = improvements.processed;
      retroBoilerplate += improvements.processed.filter(i => i.is_boilerplate).length;
    }

    if (Object.keys(updates).length > 0) {
      totalBoilerplateFound += retroBoilerplate;

      if (isDryRun) {
        console.log(`[DRY] Would update ${retro.sd_id}: ${retroBoilerplate} boilerplate items`);
      } else {
        const { error: updateError } = await supabase
          .from('retrospectives')
          .update(updates)
          .eq('id', retro.id);

        if (updateError) {
          console.error(`Error updating ${retro.sd_id}:`, updateError.message);
        } else {
          console.log(`✅ Updated ${retro.sd_id}: ${retroBoilerplate} boilerplate items flagged`);
          totalUpdated++;
        }
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Retrospectives processed: ${retrospectives.length}`);
  console.log(`Retrospectives ${isDryRun ? 'would be updated' : 'updated'}: ${totalUpdated}`);
  console.log(`Total boilerplate items flagged: ${totalBoilerplateFound}`);

  if (isDryRun) {
    console.log('\nRun without --dry-run to apply changes.');
  }
}

main().catch(console.error);
