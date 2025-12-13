import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SECTION_IDS = [269, 295, 311, 312];

// Replacement patterns - order matters!
const replacements = [
  // Replace strategic_directives_v2.uuid_id with strategic_directives_v2.id (most specific first)
  { pattern: /strategic_directives_v2\.uuid_id/g, replacement: 'strategic_directives_v2.id', description: 'strategic_directives_v2.uuid_id → strategic_directives_v2.id' },

  // Replace --sd-uuid with --sd-id in CLI examples
  { pattern: /--sd-uuid/g, replacement: '--sd-id', description: '--sd-uuid → --sd-id' },

  // Replace <SD_UUID> with <SD_ID> in documentation placeholders
  { pattern: /<SD_UUID>/g, replacement: '<SD_ID>', description: '<SD_UUID> → <SD_ID>' },

  // Replace ${SD_UUID} with ${SD_ID} in template variables
  { pattern: /\$\{SD_UUID\}/g, replacement: '${SD_ID}', description: '${SD_UUID} → ${SD_ID}' },

  // Replace sd_uuid column references with sd_id
  { pattern: /\bsd_uuid\b/g, replacement: 'sd_id', description: 'sd_uuid → sd_id' },

  // Replace old table name prds with product_requirements_v2
  { pattern: /\bprds\b/g, replacement: 'product_requirements_v2', description: 'prds → product_requirements_v2' }
];

async function fetchSection(id) {
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .select('id, section_type, title, content')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`❌ Error fetching section ${id}:`, error);
    return null;
  }

  return data;
}

async function updateSection(id, newContent) {
  const { error } = await supabase
    .from('leo_protocol_sections')
    .update({ content: newContent })
    .eq('id', id);

  if (error) {
    console.error(`❌ Error updating section ${id}:`, error);
    return false;
  }

  return true;
}

function applyReplacements(content) {
  let updated = content;
  let changeLog = [];

  for (const { pattern, replacement, description } of replacements) {
    const matches = updated.match(pattern);
    if (matches && matches.length > 0) {
      changeLog.push(`  - ${description}: ${matches.length} occurrence(s)`);
      updated = updated.replace(pattern, replacement);
    }
  }

  return { updated, changeLog };
}

async function main() {
  console.log('🔄 Updating deprecated column references in leo_protocol_sections...\n');
  console.log('Target sections:', SECTION_IDS.join(', '));
  console.log('');

  let totalUpdated = 0;
  let totalChanges = 0;

  for (const id of SECTION_IDS) {
    console.log(`\n📄 Processing section ${id}...`);

    const section = await fetchSection(id);
    if (!section) {
      console.log(`⚠️  Skipping section ${id} (fetch failed)`);
      continue;
    }

    console.log(`   Type: ${section.section_type}`);
    console.log(`   Title: ${section.title}`);
    console.log(`   Original length: ${section.content.length} chars`);

    const { updated, changeLog } = applyReplacements(section.content);

    if (updated === section.content) {
      console.log('   ✅ No changes needed');
      continue;
    }

    console.log('   📝 Changes made:');
    changeLog.forEach(log => console.log(log));
    totalChanges += changeLog.length;

    const success = await updateSection(id, updated);
    if (success) {
      console.log(`   ✅ Updated successfully (new length: ${updated.length} chars)`);
      totalUpdated++;
    } else {
      console.log('   ❌ Update failed');
    }
  }

  console.log('\n\n✅ Update process complete!');
  console.log('\n📊 Summary:');
  console.log(`   Sections processed: ${SECTION_IDS.length}`);
  console.log(`   Sections updated: ${totalUpdated}`);
  console.log(`   Total replacement types applied: ${totalChanges}`);
  console.log('\n📋 Replacements configured:');
  replacements.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.description}`);
  });
}

main().catch(console.error);
