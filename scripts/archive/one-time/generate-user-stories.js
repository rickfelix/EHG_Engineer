#!/usr/bin/env node
/**
 * Unified User Story Generator - Part of SD-REFACTOR-SCRIPTS-001
 * Usage: node scripts/generate-user-stories.js <SD-ID> [--force] [--dry-run]
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const args = process.argv.slice(2);
const sdId = args.find(a => !a.startsWith('--'));
const forceOverwrite = args.includes('--force');
const dryRun = args.includes('--dry-run');

function generateGivenWhenThen(requirement, _sdType) {
  return [
    { scenario: 'Happy path', given: `the system is in a valid state for ${requirement.toLowerCase()}`, when: 'the user performs the required action', then: 'the expected outcome is achieved as specified' },
    { scenario: 'Error handling', given: 'the system encounters an error condition', when: 'the operation is attempted', then: 'an appropriate error message is displayed and the system remains stable' }
  ];
}

function generateStoryFromRequirement(req, sd, index) {
  const storyKey = `${sd.sd_key}:US-${String(index).padStart(3, '0')}`;
  const userRoles = { refactor: 'LEO Protocol developer maintaining the codebase', infrastructure: 'LEO Protocol operator managing system infrastructure', feature: 'product user who needs the functionality', documentation: 'developer who needs documentation', database: 'database administrator managing schema changes' };
  const userRole = userRoles[sd.sd_type] || userRoles.feature;
  const requirementText = typeof req === 'string' ? req : (req.requirement || req.description || String(req));
  const acceptanceCriteria = generateGivenWhenThen(requirementText, sd.sd_type);
  if (req.acceptance_criteria?.length > 0) {
    req.acceptance_criteria.forEach((ac, i) => {
      acceptanceCriteria.push({ scenario: `Requirement criterion ${i + 1}`, given: 'the feature is implemented', when: 'verification is performed', then: typeof ac === 'string' ? ac : ac.criterion });
    });
  }
  return {
    sd_id: sd.id, story_key: storyKey, title: requirementText.substring(0, 100), user_role: userRole,
    user_want: requirementText, user_benefit: `I can ${requirementText.toLowerCase()} efficiently and reliably`,
    acceptance_criteria: acceptanceCriteria, priority: (req.priority || 'high').toString().toLowerCase(), status: 'draft', story_points: (req.priority || '').toUpperCase() === 'CRITICAL' ? 5 : 3,
    implementation_context: { key_files: [], patterns: [], considerations: [`Derived from ${req.id || 'PRD requirement'}`] },
    definition_of_done: ['Code implemented and passing lint', 'Unit tests written and passing', 'Code review completed', 'Documentation updated if needed']
  };
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  USER STORY GENERATOR - Unified Template System');
  console.log('='.repeat(60) + '\n');

  if (!sdId) { console.log('Usage: node scripts/generate-user-stories.js <SD-ID> [--force] [--dry-run]'); process.exit(1); }

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  console.log(`📋 Fetching SD: ${sdId}`);

  let { data: sd, error } = await supabase.from('strategic_directives_v2').select('*').eq('sd_key', sdId).single();
  if (error || !sd) { const result = await supabase.from('strategic_directives_v2').select('*').eq('id', sdId).single(); sd = result.data; error = result.error; }
  if (error || !sd) { console.log(`❌ SD not found: ${sdId}`); process.exit(1); }

  console.log(`✅ Found SD: ${sd.title} (Type: ${sd.sd_type || 'not set'})\n`);
  console.log('📄 Fetching PRD...');

  const { data: prd, error: prdError } = await supabase.from('product_requirements_v2').select('*').eq('directive_id', sd.id).single();
  if (prdError || !prd) { console.log(`❌ PRD not found. Run: node scripts/generate-prd.js ${sdId}`); process.exit(1); }

  console.log(`✅ Found PRD with ${prd.functional_requirements?.length || 0} requirements\n`);

  const { data: existingStories } = await supabase.from('user_stories').select('story_key').eq('sd_id', sd.id);
  if (existingStories?.length > 0 && !forceOverwrite) { console.log(`⚠️  ${existingStories.length} stories exist. Use --force to overwrite`); process.exit(0); }

  const requirements = prd.functional_requirements || [];
  if (requirements.length === 0) { console.log('❌ No functional requirements in PRD'); process.exit(1); }

  console.log(`🔧 Generating ${requirements.length} user stories...\n`);
  const stories = requirements.map((req, idx) => generateStoryFromRequirement(req, sd, idx + 1));

  console.log('📊 Generated Stories:');
  stories.forEach(s => console.log(`   ${s.story_key}: ${s.title.substring(0, 50)}...`));
  console.log('');

  if (dryRun) { console.log('🔍 DRY RUN - Stories not inserted\n'); console.log(JSON.stringify(stories[0], null, 2)); process.exit(0); }

  if (existingStories?.length > 0 && forceOverwrite) {
    const { error: deleteError } = await supabase.from('user_stories').delete().eq('sd_id', sd.id);
    if (deleteError) { console.log(`❌ Delete failed: ${deleteError.message}`); process.exit(1); }
    console.log(`🗑️  Deleted ${existingStories.length} existing stories`);
  }

  const { error: insertError } = await supabase.from('user_stories').insert(stories);
  if (insertError) { console.log(`❌ Insert failed: ${insertError.message}`); process.exit(1); }

  console.log(`✅ Created ${stories.length} user stories\n`);
  console.log('Next: node scripts/handoff.js execute PLAN-TO-EXEC ' + sd.sd_key);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
