require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from('user_stories').select('priority,status,story_points').limit(3000);
  const p = {}, st = {}, sp = {};
  data.forEach(r => { p[r.priority]=(p[r.priority]||0)+1; st[r.status]=(st[r.status]||0)+1; sp[r.story_points]=(sp[r.story_points]||0)+1; });
  console.log('priority', p); console.log('status', st); console.log('points', sp);
  const { data: c } = await s.from('user_stories').select('story_key,technical_notes,priority,story_points').eq('prd_id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C').order('story_key');
  c.forEach(r=>console.log(r.story_key, r.priority, r.story_points, r.technical_notes));
  const { data: sd } = await s.from('strategic_directives_v2').select('id,sd_key,title,status').eq('id','3f128d5c-8168-4415-86cc-ab5da4663d11').single();
  console.log('SD:', JSON.stringify(sd));
  const { data: ex } = await s.from('user_stories').select('story_key').eq('prd_id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D');
  console.log('existing D stories:', ex.length, ex.map(e=>e.story_key));
})();
