import fs from 'fs';
const lines = fs.readFileSync('.artifacts/scout-out.json', 'utf8').split(/\r?\n/);
const j = JSON.parse(lines.slice(lines.findIndex(l => l.trim() === '{')).join('\n'));

// word-boundary re-filter: drop 'canonical'/'anonymous' false hits on 'anon'
const STRONG = /security definer|alter default privileges|\brevoke\w*\b|execute grant|\bgrant execute\b|\banon\b|\banon-|proacl|pg_proc/i;

function strong(txt) {
  return STRONG.test(txt || '');
}

console.log('##### TASK 5: sd_backlog_map #####');
console.log('by_uuid:', JSON.stringify(j.task5_by_uuid && { count: j.task5_by_uuid.count, err: j.task5_by_uuid.error }));
console.log('by_sdkey:', JSON.stringify(j.task5_by_sdkey && { count: j.task5_by_sdkey.count, err: j.task5_by_sdkey.error }));
console.log('table shape:', JSON.stringify(j.task5_sample_shape));

console.log('\n##### TASK 3: quick_fixes STRONG matches #####');
const qf = (j.task3_matches || []).filter(m => strong(m.title + ' ' + m.snip));
console.log('strong:', qf.length, 'of', (j.task3_matches || []).length, 'loose');
for (const m of qf) console.log(` [${m.status}] ${m.key} :: ${m.title.slice(0, 150)}`);

console.log('\n##### TASK 3b: quick_fixes NON-terminal only #####');
const qfOpen = qf.filter(m => !['completed', 'cancelled', 'closed'].includes(m.status));
for (const m of qfOpen) console.log(` [${m.status}] ${m.key} :: ${m.title.slice(0, 200)}`);
console.log('open-strong count:', qfOpen.length);

console.log('\n##### TASK 1: non-completed SDs STRONG #####');
const t1 = (j.task1_matches || []).filter(m => strong(m.title + ' ' + m.desc_snip));
for (const m of t1) console.log(` [${m.status}/${m.phase}] ${m.sd_key} (${m.created}) :: ${m.title.slice(0, 160)}`);
console.log('count:', t1.length, 'of', (j.task1_matches || []).length);

console.log('\n##### TASK 2: completed SDs STRONG (since 2026-05-01) #####');
const t2 = (j.task2_matches || []).filter(m => strong(m.title + ' ' + m.desc_snip));
for (const m of t2) console.log(` [done ${m.done || '?'}] ${m.sd_key} :: ${m.title.slice(0, 160)}`);
console.log('count:', t2.length, 'of', (j.task2_matches || []).length);
