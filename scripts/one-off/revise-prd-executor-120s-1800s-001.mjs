#!/usr/bin/env node
// SD-LEO-INFRA-EXECUTOR-120S-1800S-001 -- PRD revision after prospective TESTING review
// (evidence f15a4226) found FR-3's core safety claim was FALSE: ERROR and MANUAL_REQUIRED
// are NOT treated identically by subagent-evidence-gate.js. Revised design keeps
// verdict='MANUAL_REQUIRED' unchanged for all 3 discriminated causes -- zero blast radius --
// plus fixes for G2 (stale "0 ERROR rows" claim), G3 (fs.existsSync resolution base), G4
// (unnamed timeout-detection mechanism), G5 (concurrent-write clobber), G6 (inaccurate
// "93->141->82" instability narrative + off-by-one counts), G7/G8 (moot once verdict is
// unchanged; exit-code parity, metadata field placement).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { updatePRDWithLLMContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRD_ID = 'PRD-SD-LEO-INFRA-EXECUTOR-120S-1800S-001';
const SD_UUID = 'b1387e83-cc56-45ce-8ea5-6cf29042a607';
const SD_KEY = 'SD-LEO-INFRA-EXECUTOR-120S-1800S-001';

async function run() {
  const llmContent = JSON.parse(readFileSync(join(__dirname, '../temp/prd-executor-120s-1800s-001-v2.json'), 'utf8'));
  const supabase = createSupabaseServiceClient();
  const result = await updatePRDWithLLMContent(supabase, PRD_ID, SD_UUID, { sd_key: SD_KEY }, llmContent);
  console.log('PRD revised:', result?.id || PRD_ID);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
