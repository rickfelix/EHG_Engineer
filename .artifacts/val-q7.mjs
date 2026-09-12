import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify:false });
const { rows } = await c.query(`
  SELECT id, status, created_at, left(title,95) title FROM quick_fixes
  WHERE title ILIKE '%actor%' OR title ILIKE '%created_by%' OR description ILIKE '%app.actor%'
     OR title ILIKE '%attribut%' ORDER BY created_at DESC LIMIT 15`);
console.log('=== candidate duplicate QFs ==='); rows.forEach(r=>console.log(` ${r.id} | ${r.status} | ${String(r.created_at).slice(0,10)} | ${r.title}`));
await c.end();
