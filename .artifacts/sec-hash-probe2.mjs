import { _internal } from '../lib/eva/devils-advocate.js';
const { computeContentHash, buildCritiqueUserPrompt } = _internal;
const H = (P, arch='') => { const b = buildCritiqueUserPrompt({ prdContent:P, archContent:arch, sdContext:{sd_key:'SD-X',title:'T'} }); return { h: computeContentHash({prdText:b.prdText, archText:b.archText, archLoadStatus:'ok', model:'gpt-5.4'}), t:b.truncated }; };
const mkFR = (n, pad) => Array.from({length:n}, (_,i)=>({ id:`FR-${i+1}`, title:`t${i+1}`, description:'x'.repeat(pad) }));

console.log('--- CASE 1: over-budget RISKS section edited beyond its 8000-char budget (overflow path) ---');
const base = { executive_summary:'ES', functional_requirements: mkFR(60,1500), acceptance_criteria:'AC', test_scenarios:'TS', risks:'R'.repeat(9000) };
const edited = { ...base, risks: 'R'.repeat(9000) + ' NEW UNREVIEWED RISK: we will ship without rollback.' };
const a=H(base), b=H(edited);
console.log('base.truncated=',a.t,' edited hash equal:', a.h===b.h);

console.log('\n--- CASE 2: existing FR description extended beyond boundary (FR id set UNCHANGED) ---');
const frs = mkFR(60,1500);
const base2 = { executive_summary:'ES', functional_requirements: frs, acceptance_criteria:'AC', test_scenarios:'TS', risks:'RK' };
const frs2 = JSON.parse(JSON.stringify(frs)); frs2[59].description += 'Z'.repeat(4000); // last FR grows, beyond cut
const ed2 = { ...base2, functional_requirements: frs2 };
const a2=H(base2), b2=H(ed2);
console.log('base.truncated=',a2.t,' edited hash equal:', a2.h===b2.h);

console.log('\n--- CASE 3: ARCH content edited beyond its 64000 cap (arch has NO id marker at all) ---');
const p = { executive_summary:'ES', functional_requirements:[{id:'FR-1',description:'d'}], acceptance_criteria:'AC', test_scenarios:'TS', risks:'RK' };
const archA = 'A'.repeat(70000);
const archB = 'A'.repeat(70000) + ' ENTIRELY NEW UNREVIEWED ARCHITECTURE SECTION';
const a3=H(p,archA), b3=H(p,archB);
console.log('arch truncated=',a3.t.arch.truncated,' edited hash equal:', a3.h===b3.h);

console.log('\n--- CASE 4: does content_hash encode charsTotal / truncation state at all? ---');
console.log('computeContentHash input keys:', Object.keys(JSON.parse(JSON.stringify({prdText:'',archText:'',archLoadStatus:'ok',model:null}))).join(','));
