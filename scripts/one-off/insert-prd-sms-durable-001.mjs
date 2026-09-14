#!/usr/bin/env node
/**
 * Inline-mode PRD insertion for SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001, per CLAUDE_PLAN_DIGEST.md's
 * "PRD Creation - Inline Mode" workflow: add-prd-to-database.js printed the generation prompt,
 * Claude Code generated the PRD JSON (scripts/one-off/prd-content-sms-durable-001.json), this
 * script inserts it directly into product_requirements_v2.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001';
const PRD_ID = `PRD-${SD_KEY}`;

const prdContent = JSON.parse(readFileSync(join(__dirname, 'prd-content-sms-durable-001.json'), 'utf8'));

async function main() {
  // strategic_directives_v2.id is a TEXT PK that holds EITHER a UUID or the sd_key depending on
  // the SD (confirmed live: this SD's id is a UUID, distinct from uuid_id/uuid_internal_pk) --
  // product_requirements_v2.sd_id FKs id specifically (prd_sd_fk), never uuid_id/uuid_internal_pk.
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (sdErr) throw sdErr;
  if (!sd) throw new Error(`SD not found: ${SD_KEY}`);

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', PRD_ID)
    .maybeSingle();

  const row = {
    id: PRD_ID,
    directive_id: SD_KEY,
    sd_id: sd.id,
    title: 'SMS Durable Queue Reply-Token Staging',
    status: 'approved',
    category: 'infrastructure',
    priority: 'high',
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
    goal_summary: prdContent.executive_summary,
    phase: 'PLAN',
    created_by: 'LEAD_PLAN_INLINE',
  };

  let result;
  if (existing) {
    result = await supabase.from('product_requirements_v2').update(row).eq('id', PRD_ID).select('id');
  } else {
    result = await supabase.from('product_requirements_v2').insert(row).select('id');
  }
  if (result.error) throw result.error;

  console.log(existing ? 'UPDATED' : 'INSERTED', 'PRD:', PRD_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
