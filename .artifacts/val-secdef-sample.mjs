import fs from 'fs'; import path from 'path'; import dotenv from 'dotenv'; dotenv.config();
const URL=process.env.SUPABASE_URL, ANON=process.env.SUPABASE_ANON_KEY;
// Find ZERO-ARG SECURITY DEFINER functions defined in migrations dated BEFORE 20260603.
const dir='database/migrations'; const cands=new Map();
for(const f of fs.readdirSync(dir)){
  if(!f.endsWith('.sql'))continue;
  const d=(f.match(/^(\d{8})/)||[])[1]||'00000000';
  const txt=fs.readFileSync(path.join(dir,f),'utf8');
  const re=/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(\s*\)([\s\S]{0,400})/gi;
  let m; while((m=re.exec(txt))!==null){
    if(!/SECURITY\s+DEFINER/i.test(m[2]))continue;
    const prev=cands.get(m[1]);
    if(!prev||d>prev) cands.set(m[1],d);
  }
}
// keep only those whose LATEST definition predates the 20260603 revoke
const targets=[...cands.entries()].filter(([n,d])=>d<'20260603').map(([n])=>n).sort();
console.log(`Zero-arg SECDEF fns whose latest repo definition PREDATES 20260603_03: ${targets.length}`);
let exec=0, revoked=0, amb=0; const execList=[];
for(const fn of targets){
  const r=await fetch(`${URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${ANON}`,'Content-Type':'application/json'},body:'{}'});
  let j={};try{j=await r.json();}catch{}
  const code=j.code||'';
  if(code==='42501'||/permission denied/i.test(j.message||'')){revoked++;}
  else if(code==='PGRST202'||r.status===404){amb++;}
  else {exec++;execList.push(`${fn} (${r.status})`);}
}
console.log(`  anon EXECUTABLE (200-ish): ${exec}`);
console.log(`  anon REVOKED (42501):      ${revoked}`);
console.log(`  ambiguous (PGRST202/404):  ${amb}`);
console.log('  executable list:', execList.join(', ') || '(none)');
