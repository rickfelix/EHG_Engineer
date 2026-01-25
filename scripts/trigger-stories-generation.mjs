#!/usr/bin/env node

/**
 * Trigger User Stories Generation for an SD
 *
 * Usage: node scripts/trigger-stories-generation.mjs SD-DOCS-ARCH-002
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node scripts/trigger-stories-generation.mjs <SD-ID>');
    process.exit(1);
  }

  console.log(`\n🚀 Triggering User Stories Generation for ${sdId}\n`);

  try {
    // Get PRD ID - try both tables
    let prd, prdError;
    const { data: prdV2, error: errorV2 } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('sd_id', sdId)
      .single();

    if (prdV2) {
      prd = { prd_id: prdV2.id };
    } else {
      const { data: prdV1, error: errorV1 } = await supabase
        .from('prds')
        .select('prd_id')
        .eq('sd_id', sdId)
        .single();
      prd = prdV1;
      prdError = errorV1;
    }

    if (prdError || !prd) {
      console.error('❌ Error: PRD not found for SD', sdId);
      process.exit(1);
    }

    console.log(`✅ Found PRD: ${prd.prd_id}\n`);

    // Trigger stories generation
    const result = await autoTriggerStories(supabase, sdId, prd.prd_id, {
      skipIfExists: false,
      notifyOnSkip: true,
      logExecution: true
    });

    console.log('\n✅ User Stories Generation Complete!\n');
    console.log('Result:', result);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
