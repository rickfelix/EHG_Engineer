import fs from 'fs';
const lines = fs.readFileSync('.artifacts/scout-out.json', 'utf8').split(/\r?\n/);
const start = lines.findIndex(l => l.trim() === '{');
const j = JSON.parse(lines.slice(start).join('\n'));

console.log('=== SUBJECT SD ===');
console.log(JSON.stringify(j.subject, null, 1));
console.log('SUBJECT DESC:', j.subject_desc);
console.log('\n=== TASK3 quick_fixes ===');
console.log('err:', j.task3_error, '| total rows fetched:', j.task3_total);
console.log('cols:', (j.task3_columns || []).join(','));
console.log('matchcount:', (j.task3_matches || []).length);
for (const m of (j.task3_matches || [])) {
  console.log(` - [${m.status}] ${m.key} :: ${m.title} :: terms=${m.terms.join('|')} :: ${m.created}`);
}
console.log('\n=== TASK5 sd_backlog_map ===');
console.log('by_uuid:', JSON.stringify(j.task5_by_uuid && { count: j.task5_by_uuid.count, err: j.task5_by_uuid.error }));
console.log('by_sdkey:', JSON.stringify(j.task5_by_sdkey && { count: j.task5_by_sdkey.count, err: j.task5_by_sdkey.error }));
console.log('shape:', JSON.stringify(j.task5_sample_shape, null, 1));
console.log('\n=== TASK2 total ===');
console.log('matches:', (j.task2_matches || []).length, 'of', j.task2_total_completed_since_may);
