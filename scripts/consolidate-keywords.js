#!/usr/bin/env node
/**
 * Consolidate Keywords from 3 Sources into Single Source of Truth
 *
 * Sources:
 * 1. lib/keyword-intent-scorer.js (current scorer file)
 * 2. leo_sub_agent_triggers table (database triggers)
 * 3. leo_sub_agents.metadata.trigger_keywords (database metadata)
 *
 * Target: lib/keyword-intent-scorer.js (single source of truth)
 *
 * Run: node scripts/consolidate-keywords.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SCORER_PATH = path.join(__dirname, '../lib/keyword-intent-scorer.js');

// Event-based triggers that should be in primary (system events)
const EVENT_TRIGGERS = new Set([
  'EXEC_IMPLEMENTATION_COMPLETE', 'LEAD_SD_CREATION', 'LEAD_HANDOFF_CREATION',
  'LEAD_APPROVAL', 'PLAN_PRD_GENERATION', 'PLAN_VERIFICATION', 'EXEC_IMPLEMENTATION',
  'EXEC_COMPLETION', 'HANDOFF_CREATED', 'HANDOFF_ACCEPTED', 'PHASE_TRANSITION',
  'RETRO_GENERATED', 'FILE_CREATED', 'VIOLATION_DETECTED', 'DAILY_DOCMON_CHECK',
  'LEAD_APPROVAL_COMPLETE', 'PLAN_VERIFICATION_PASS', 'PLAN_VERIFICATION_COMPLETE',
  'LEAD_REJECTION', 'sub_agent_blocked', 'ci_pipeline_failure', 'quality_gate_critical',
  'test_regression', 'handoff_rejection', 'sub_agent_fail', 'quality_degradation',
  'pattern_recurrence', 'performance_regression'
]);

async function main() {
  console.log('=== KEYWORD CONSOLIDATION ===\n');

  // Step 1: Read current scorer file
  console.log('1. Reading current scorer file...');
  const scorerContent = fs.readFileSync(SCORER_PATH, 'utf-8');
  const match = scorerContent.match(/const AGENT_KEYWORDS = \{[\s\S]*?\n\};/);
  if (!match) {
    throw new Error('Could not find AGENT_KEYWORDS in scorer file');
  }
  const currentKeywords = new Function('return (' + match[0].replace('const AGENT_KEYWORDS = ', '').replace(/;$/, '') + ')')();
  console.log(`   Found ${Object.keys(currentKeywords).length} agents in scorer file`);

  // Step 2: Get triggers from database table
  console.log('2. Reading leo_sub_agent_triggers table...');
  const { data: triggers } = await supabase
    .from('leo_sub_agent_triggers')
    .select('sub_agent_id, trigger_phrase');

  // Step 3: Get metadata keywords from leo_sub_agents
  console.log('3. Reading leo_sub_agents metadata...');
  const { data: agents } = await supabase
    .from('leo_sub_agents')
    .select('id, code, metadata')
    .eq('active', true);

  // Build lookup: code -> { triggersTable, metadataKeywords }
  const dbData = {};
  agents.forEach(a => {
    const agentTriggers = triggers.filter(t => t.sub_agent_id === a.id).map(t => t.trigger_phrase);
    dbData[a.code] = {
      triggersTable: agentTriggers,
      metadataKeywords: a.metadata?.trigger_keywords || {}
    };
  });
  console.log(`   Found ${agents.length} agents in database`);

  // Step 4: Merge keywords for each agent
  console.log('4. Merging keywords...\n');
  const mergedKeywords = {};
  let totalAdded = 0;

  // Get all agent codes from all sources
  const allCodes = new Set([
    ...Object.keys(currentKeywords),
    ...Object.keys(dbData)
  ]);

  for (const code of [...allCodes].sort()) {
    const scorer = currentKeywords[code] || { primary: [], secondary: [], tertiary: [] };
    const db = dbData[code] || { triggersTable: [], metadataKeywords: {} };

    // Collect all existing keywords
    const existingPrimary = new Set(scorer.primary || []);
    const existingSecondary = new Set(scorer.secondary || []);
    const existingTertiary = new Set(scorer.tertiary || []);
    const allExisting = new Set([...existingPrimary, ...existingSecondary, ...existingTertiary]);

    // Collect new keywords from database
    const fromTriggers = db.triggersTable || [];
    const fromMetaPrimary = db.metadataKeywords.primary || [];
    const fromMetaSecondary = db.metadataKeywords.secondary || [];
    const fromMetaTertiary = db.metadataKeywords.tertiary || [];

    // Find truly new keywords
    const newKeywords = [];

    // Add from triggers table (categorize as primary if event, secondary otherwise)
    for (const kw of fromTriggers) {
      if (!allExisting.has(kw)) {
        newKeywords.push(kw);
        if (EVENT_TRIGGERS.has(kw)) {
          existingPrimary.add(kw);
        } else {
          existingSecondary.add(kw);
        }
        allExisting.add(kw);
      }
    }

    // Add from metadata (respect their categorization)
    for (const kw of fromMetaPrimary) {
      if (!allExisting.has(kw)) {
        newKeywords.push(kw);
        existingPrimary.add(kw);
        allExisting.add(kw);
      }
    }
    for (const kw of fromMetaSecondary) {
      if (!allExisting.has(kw)) {
        newKeywords.push(kw);
        existingSecondary.add(kw);
        allExisting.add(kw);
      }
    }
    for (const kw of fromMetaTertiary) {
      if (!allExisting.has(kw)) {
        newKeywords.push(kw);
        existingTertiary.add(kw);
        allExisting.add(kw);
      }
    }

    mergedKeywords[code] = {
      primary: [...existingPrimary].sort(),
      secondary: [...existingSecondary].sort(),
      tertiary: [...existingTertiary].sort()
    };

    if (newKeywords.length > 0) {
      console.log(`   [${code}] +${newKeywords.length} keywords: ${newKeywords.slice(0, 3).join(', ')}${newKeywords.length > 3 ? '...' : ''}`);
      totalAdded += newKeywords.length;
    }
  }

  console.log(`\n   Total new keywords added: ${totalAdded}`);

  // Step 5: Generate new scorer file content
  console.log('\n5. Generating updated scorer file...');

  // Format the keywords object nicely
  let keywordsStr = 'const AGENT_KEYWORDS = {\n';
  const sortedCodes = Object.keys(mergedKeywords).sort();

  for (let i = 0; i < sortedCodes.length; i++) {
    const code = sortedCodes[i];
    const kw = mergedKeywords[code];

    keywordsStr += `  ${code}: {\n`;
    keywordsStr += `    primary: [\n      ${kw.primary.map(k => `'${k.replace(/'/g, "\\'")}'`).join(',\n      ')}\n    ],\n`;
    keywordsStr += `    secondary: [\n      ${kw.secondary.map(k => `'${k.replace(/'/g, "\\'")}'`).join(',\n      ')}\n    ],\n`;
    keywordsStr += `    tertiary: [\n      ${kw.tertiary.map(k => `'${k.replace(/'/g, "\\'")}'`).join(',\n      ')}\n    ]\n`;
    keywordsStr += `  }${i < sortedCodes.length - 1 ? ',' : ''}\n\n`;
  }
  keywordsStr += '};';

  // Replace the AGENT_KEYWORDS block in the file
  const newContent = scorerContent.replace(
    /const AGENT_KEYWORDS = \{[\s\S]*?\n\};/,
    keywordsStr
  );

  // Step 6: Write updated file
  fs.writeFileSync(SCORER_PATH, newContent);
  console.log('   Updated lib/keyword-intent-scorer.js');

  // Step 7: Summary
  console.log('\n=== CONSOLIDATION COMPLETE ===');
  console.log(`Agents processed: ${sortedCodes.length}`);
  console.log(`New keywords added: ${totalAdded}`);
  console.log('Source of truth: lib/keyword-intent-scorer.js');
  console.log('\nNext steps:');
  console.log('1. Run: node scripts/generate-claude-md-from-db.js');
  console.log('2. Verify CLAUDE.md and CLAUDE_CORE.md have consistent keywords');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
