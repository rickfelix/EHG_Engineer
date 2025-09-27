#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient  } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkBacklogGaps() {
  console.log('=== Backlog Integrity Check ===\n');

  // 1. Check for SDs without any backlog items
  const { data: allSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, title')
    .limit(100);

  const { data: mappedSDs } = await supabase
    .from('sd_backlog_map')
    .select('sd_id')
    .not('sd_id', 'is', null);

  const mappedSDIds = new Set(mappedSDs?.map(m => m.sd_id) || []);
  const unmappedSDs = allSDs?.filter(sd => !mappedSDIds.has(sd.id)) || [];

  console.log('1. Strategic Directives without Backlog Items:');
  console.log(`   Found: ${unmappedSDs.length} SDs without backlog items`);
  if (unmappedSDs.length > 0) {
    console.log('   Sample unmapped SDs:', unmappedSDs.slice(0, 3).map(sd => sd.title));
  }

  // 2. Check for invalid priorities in backlog
  const { data: invalidPriorities, error: priorityError } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id, backlog_title, priority')
    .not('priority', 'in', '(High,Medium,Low)');

  console.log('\n2. Backlog Items with Invalid Priority:');
  if (priorityError) {
    console.log('   Error:', priorityError.message);
  } else {
    console.log(`   Found: ${invalidPriorities?.length || 0} items with invalid priority`);
    if (invalidPriorities?.length > 0) {
      console.log('   Invalid priorities found:', [...new Set(invalidPriorities.map(i => i.priority))]);
      console.log('   Sample items:', invalidPriorities.slice(0, 3).map(i => ({
        id: i.backlog_id,
        title: i.backlog_title,
        priority: i.priority
      })));
    }
  }

  // 3. Check for missing required fields in backlog
  const { data: missingFields } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id, backlog_title, description_raw, item_description')
    .or('backlog_title.is.null,item_description.is.null');

  console.log('\n3. Backlog Items with Missing Fields:');
  console.log(`   Found: ${missingFields?.length || 0} items with missing title or description`);
  if (missingFields?.length > 0) {
    console.log('   Sample items:', missingFields.slice(0, 3).map(i => ({
      id: i.backlog_id,
      title: i.backlog_title || '(missing)',
      has_description: !!i.item_description
    })));
  }

  // 4. Check for orphaned backlog items (no SD link)
  const { data: orphans } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id, backlog_title, sd_id')
    .is('sd_id', null);

  console.log('\n4. Orphaned Backlog Items (no SD):');
  console.log(`   Found: ${orphans?.length || 0} orphaned items`);
  if (orphans?.length > 0) {
    console.log('   Sample orphans:', orphans.slice(0, 3).map(o => ({
      id: o.backlog_id,
      title: o.backlog_title
    })));
  }

  // 5. Summary statistics
  const { count: totalBacklog } = await supabase
    .from('sd_backlog_map')
    .select('*', { count: 'exact', head: true });

  const { count: totalSDs } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true });

  console.log('\n=== Summary Statistics ===');
  console.log(`Total Strategic Directives: ${totalSDs || 0}`);
  console.log(`Total Backlog Items: ${totalBacklog || 0}`);
  console.log(`SDs without backlog: ${unmappedSDs.length}`);
  console.log(`Invalid priorities: ${invalidPriorities?.length || 0}`);
  console.log(`Missing fields: ${missingFields?.length || 0}`);
  console.log(`Orphaned items: ${orphans?.length || 0}`);

  // Export CSV data for CI
  if (process.env.EXPORT_CSV) {
    import fs from 'fs';
    import path from 'path';
    const outDir = path.join(__dirname, '..', 'ops', 'checks', 'out');

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Export unmapped SDs
    const sdCsv = 'sd_id,title\n' + unmappedSDs.map(sd => `"${sd.id}","${sd.title}"`).join('\n');
    fs.writeFileSync(path.join(outDir, 'gap_unmapped_sds.csv'), sdCsv);

    // Export invalid priorities
    const priorityCsv = 'backlog_id,title,priority\n' +
      (invalidPriorities || []).map(i => `"${i.backlog_id}","${i.backlog_title}","${i.priority}"`).join('\n');
    fs.writeFileSync(path.join(outDir, 'gap_invalid_priorities.csv'), priorityCsv);

    console.log('\nCSV files exported to ops/checks/out/');
  }
}

checkBacklogGaps();