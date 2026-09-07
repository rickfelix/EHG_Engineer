import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { stampConstraintsBlock } = require('../lib/coordinator/dispatch.cjs');
const { tick, buildBroadcastBody } = require('../lib/coordinator/capped-pool-broadcast.cjs');
import fs from 'fs'; import os from 'os'; import path from 'path';

const silent = { warn(){}, error(){}, log(){} };
function stub(metadata) {
  return { from(t){ const c={ select(){return c;}, eq(){return c;}, maybeSingle(){ return Promise.resolve({ data: t==='strategic_directives_v2'?{metadata}:null, error:null }); } }; return c; } };
}

// D) redaction side-effect: caller-authored WORK_ASSIGNMENT prose is silently rewritten
const row = { message_type:'WORK_ASSIGNMENT', payload:{ assigned_sd:'SD-TEST-001' },
  body: 'Step 3: the api_key: see-the-env-file note in the PRD. Also secret: ask the chairman.' };
await stampConstraintsBlock(stub({}), row, silent);
console.log('D) body after stamp:\n   ' + row.body.split('\n')[0]);

// E) payload invention on a payload-less WORK_ASSIGNMENT (resolves via top-level target_sd)
const row2 = { message_type:'WORK_ASSIGNMENT', target_sd:'SD-TEST-002', body:'do the thing' };
await stampConstraintsBlock(stub({}), row2, silent);
console.log('E) payload was', 'undefined ->', JSON.stringify(row2.payload));

// F) tick stamps last_emitted_at even when EVERY dispatch is refused (written=0)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'cpb-'));
const sp = path.join(tmp,'s.json');
fs.writeFileSync(sp, JSON.stringify({ schema_version:1, over_cap_since:new Date(Date.now()-31*60000).toISOString(), last_emitted_at:null, last_cleared_notice_at:null }));
const throwingSb = { from(){ const c={ select(){return c;},eq(){return c;},not(){return c;},is(){return c;},gt(){return c;},gte(){return c;},order(){return c;},limit(){return c;},in(){return c;},maybeSingle(){return Promise.resolve({data:null,error:null});},single(){return Promise.resolve({data:null,error:null});},insert(){ throw new Error('insert refused'); },then(r){return Promise.resolve({data:[],error:null}).then(r);} }; return c; } };
const out = await tick(throwingSb, { repoRoot: tmp, coordinatorId:'c-1', used:41, cap:40, statePath: sp, seats:[{session_id:'s-1'},{session_id:'s-2'}] });
console.log('F) tick outcome =', JSON.stringify(out));
console.log('F) persisted last_emitted_at =', JSON.parse(fs.readFileSync(sp,'utf8')).last_emitted_at, '(6h re-emit window burned with 0 delivered)');

// G) the false all-clear body a git-failure census produces
console.log('G) body sent on unreadable census:', JSON.stringify(buildBroadcastBody({ used:0, cap:40, cleared:true })));
fs.rmSync(tmp,{recursive:true,force:true});
