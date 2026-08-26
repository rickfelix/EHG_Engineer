#!/usr/bin/env node
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { autoTriggerStories } from '../modules/auto-trigger-stories.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B';
const PRD_ID = 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B';

async function run() {
  const supabase = createSupabaseServiceClient();
  const result = await autoTriggerStories(supabase, SD_KEY, PRD_ID);
  console.log('RESULT:', JSON.stringify(result, null, 2));
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
