import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
(function loadEnv() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) { dotenv.config({ path: envFile }); return; }
    dir = path.dirname(dir);
  }
})();
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '234928d8-f45b-4998-a1e6-28704e78cf6e';

const { data: sd } = await s.from('strategic_directives_v2').select('id, sd_key, sd_type, current_phase, status, created_at, worktree_path').eq('id', SD_ID).single();
console.log('SD:', JSON.stringify(sd, null, 2));

const { data: handoff } = await s.from('sd_phase_handoffs').select('from_phase, to_phase, status, accepted_at, created_at').eq('sd_id', SD_ID).order('created_at', { ascending: false }).limit(10);
console.log('HANDOFFS:', JSON.stringify(handoff, null, 2));

const { data: sar } = await s.from('sub_agent_execution_results').select('sub_agent_code, verdict, phase, created_at, metadata').eq('sd_id', SD_ID).order('created_at', { ascending: false }).limit(5);
console.log('RECENT_SUBAGENT_ROWS:', JSON.stringify(sar, null, 2));

const { data: app } = await s.from('applications').select('name, local_path').ilike('name', '%EHG_Engineer%');
console.log('APPLICATIONS:', JSON.stringify(app, null, 2));

const { data: existingRetro } = await s.from('retrospectives').select('id, retro_type, retrospective_type, created_at').eq('sd_id', SD_ID).order('created_at', { ascending: false }).limit(5);
console.log('EXISTING_RETROS:', JSON.stringify(existingRetro, null, 2));
