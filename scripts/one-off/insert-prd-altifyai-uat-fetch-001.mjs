import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001';
const PRD_JSON_PATH = process.argv[2];

async function main() {
  if (!PRD_JSON_PATH) throw new Error('usage: node insert-prd-altifyai-uat-fetch-001.mjs <path-to-prd.json>');
  const prdContent = JSON.parse(readFileSync(PRD_JSON_PATH, 'utf8'));

  const { data: sd, error: sdError } = await supabase.from('strategic_directives_v2').select('id, sd_key').eq('sd_key', SD_KEY).single();
  if (sdError) throw sdError;

  const prdId = `PRD-${SD_KEY}`;
  const { error } = await supabase.from('product_requirements_v2').upsert({
    id: prdId,
    directive_id: SD_KEY,
    sd_id: sd.id,
    title: 'AltifyAI UAT: IMAP Clerk 2FA code fetcher',
    status: 'approved',
    executive_summary: prdContent.executive_summary,
    functional_requirements: prdContent.functional_requirements,
    technical_requirements: prdContent.technical_requirements,
    system_architecture: prdContent.system_architecture,
    test_scenarios: prdContent.test_scenarios,
    acceptance_criteria: prdContent.acceptance_criteria,
    risks: prdContent.risks,
    implementation_approach: prdContent.implementation_approach,
    integration_operationalization: prdContent.integration_operationalization,
    exploration_summary: prdContent.exploration_summary,
  }, { onConflict: 'id' });
  if (error) throw error;
  console.log('OK inserted PRD', prdId, 'for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
