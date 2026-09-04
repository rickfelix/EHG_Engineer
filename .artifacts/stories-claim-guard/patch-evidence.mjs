import fs from 'node:fs';
const f = new URL('./store-evidence.mjs', import.meta.url);
let src = fs.readFileSync(f, 'utf8');
const before = src;
src = src.replace(
  `const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  subAgentCode: 'STORIES',
  supabase,
});`,
  `const { data: sdRow } = await supabase
  .from('strategic_directives_v2')
  .select('target_application')
  .eq('id', SD_UUID)
  .single();

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: sdRow?.target_application,
  fallback: 'EHG_Engineer',
  subAgentCode: 'STORIES',
  supabase,
});
console.log('REPO RESOLUTION:', JSON.stringify(resolution));`
);
if (src === before) { console.error('NO CHANGE'); process.exit(1); }
fs.writeFileSync(f, src, 'utf8');
console.log('patched');
