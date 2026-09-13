import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const {rows} = await c.query(`SELECT finding_category, count(*) FROM venture_quality_findings GROUP BY 1 ORDER BY 2 DESC`);
console.log(JSON.stringify(rows));
const r2 = await c.query(`SELECT count(*) FROM venture_quality_findings WHERE venture_id='50763b6a-1fad-4e1e-b2fc-296a1d66ebf9' AND finding_category IN ('usability','accessibility','journey_coherence')`);
console.log('AltifyAI experience findings:', JSON.stringify(r2.rows));
await c.end();
