import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const { rows } = await c.query(`
  SELECT id, sd_key, title, status, current_phase
  FROM strategic_directives_v2
  WHERE id = 'SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001'
     OR sd_key = 'SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001'
     OR title ILIKE '%eva_vision_documents quality_checked%'
`);
console.log('matches:', rows.length);
rows.forEach(r => console.log('  id=' + r.id, 'sd_key=' + r.sd_key, '[', r.status, '/', r.current_phase, '/', r.type, ']'));
await c.end();
