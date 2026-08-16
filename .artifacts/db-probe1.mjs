import { q } from './db-exec.mjs';
const r = await q(`SELECT current_user AS cu, current_database() AS db, version() AS v`);
console.log(JSON.stringify(r, null, 2));
