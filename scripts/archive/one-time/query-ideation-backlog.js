import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function queryIdeationBacklog() {
  console.log('Searching backlog for venture ideation and wizard items...\n');

  const { data, error } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .or('backlog_title.ilike.%ideation%,backlog_title.ilike.%wizard%,backlog_title.ilike.%venture creation%,item_description.ilike.%ideation%,item_description.ilike.%wizard%,extras->>Description_1.ilike.%wizard%,extras->>Description_1.ilike.%ideation%')
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error querying backlog:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No backlog items found matching ideation/wizard criteria.');
    console.log('\nSearching more broadly for venture-related items...\n');

    const { data: ventureData, error: ventureError } = await supabase
      .from('sd_backlog_map')
      .select('*')
      .or('backlog_title.ilike.%venture%,item_description.ilike.%venture%')
      .order('priority', { ascending: false })
      .limit(20);

    if (ventureError) {
      console.error('Error:', ventureError);
      return;
    }

    console.log(`Found ${ventureData?.length || 0} venture-related backlog items:\n`);
    ventureData?.forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.priority}] ${item.backlog_title}`);
      console.log(`   SD: ${item.sd_id || 'None'}`);
      console.log(`   Description: ${item.item_description || 'N/A'}`);
      if (item.extras?.Description_1) {
        console.log(`   Details: ${item.extras.Description_1.substring(0, 150)}...`);
      }
      console.log(`   Status: ${item.completion_status}\n`);
    });
    return;
  }

  console.log(`Found ${data.length} backlog items matching ideation/wizard criteria:\n`);

  data.forEach((item, idx) => {
    console.log(`${idx + 1}. [${item.priority}] ${item.backlog_title}`);
    console.log(`   SD: ${item.sd_id || 'None'}`);
    console.log(`   Description: ${item.item_description || 'N/A'}`);
    if (item.extras?.Description_1) {
      console.log(`   Details: ${item.extras.Description_1}`);
    }
    console.log(`   Status: ${item.completion_status}`);
    console.log(`   Phase: ${item.phase}\n`);
  });
}

queryIdeationBacklog();
